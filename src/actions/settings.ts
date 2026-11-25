"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSettings, markOnboarding, updateSettings } from "@/lib/settings";
import { getEmailProvider } from "@/lib/email";
import { fromAddress } from "@/lib/email/templates";
import { plainText } from "@/lib/ai/client";
import { recordIntegration } from "@/lib/integrations";
import type { FormState } from "./public";

const str = (max: number) => z.string().max(max).transform((s) => s.trim());

const sections = {
  publication: z.object({
    name: str(80).pipe(z.string().min(1)),
    tagline: str(200),
    description: str(600),
    parentBrand: str(80),
    authorName: str(80).pipe(z.string().min(1)),
    authorBioShort: str(800),
    aboutMd: str(20_000),
  }),
  sender: z.object({
    senderName: str(80),
    senderEmail: z.union([z.literal(""), z.email()]),
    replyToEmail: z.union([z.literal(""), z.email()]),
    contactEmail: z.union([z.literal(""), z.email()]),
    mailingAddress: str(400),
  }),
  signup: z.object({
    doubleOptIn: z.string().optional().transform((v) => v === "on"),
    signupEnabled: z.string().optional().transform((v) => v === "on"),
    privacyPolicyMd: str(50_000),
    privacyReviewed: z.string().optional().transform((v) => v === "on"),
  }),
  voice: z.object({ voiceGuidelines: str(20_000) }),
  rhythm: z.object({ cadenceDays: z.coerce.number().int().min(3, "At least 3 days.").max(90, "At most 90 days.") }),
};

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const section = String(form.get("section")) as keyof typeof sections;
  const schema = sections[section];
  if (!schema) return { ok: false, message: "Unknown section." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` };
  await updateSettings(parsed.data);
  if (section === "publication") await markOnboarding("publication");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function testEmailProviderAction(): Promise<FormState> {
  await requireUser();
  const s = await getSettings();
  const to = s.contactEmail || s.replyToEmail;
  if (!s.senderEmail || !to) return { ok: false, message: "Set a sender email and a contact email first." };
  try {
    const p = getEmailProvider();
    const problem = p.configurationProblem();
    if (problem) throw new Error(problem);
    const r = await p.send(
      { to, from: fromAddress(s), subject: "The Dash: email connection test", text: "If you can read this, email delivery is working.", html: "<p>If you can read this, email delivery is working.</p>" },
      `conn-test:${Date.now()}`,
    );
    if (r.simulated) {
      return { ok: true, message: "Simulated provider: recorded but not delivered. Configure Resend to send real email." };
    }
    await recordIntegration("email", "ok", `Test delivered to provider (${r.providerMessageId})`);
    revalidatePath("/studio/settings");
    return { ok: true, message: `Accepted by ${p.name}. Check ${to}.` };
  } catch (err) {
    await recordIntegration("email", "failed", (err as Error).message);
    revalidatePath("/studio/settings");
    return { ok: false, message: (err as Error).message };
  }
}

export async function testAiAction(): Promise<FormState> {
  await requireUser();
  try {
    const r = await plainText({ instruction: "Reply with the single word: ready", material: "Connection check.", effort: "low" });
    await recordIntegration("ai", "ok", `Connected (${r.model})`);
    revalidatePath("/studio/settings");
    return { ok: true, message: `Connected: ${r.model} replied "${r.text.slice(0, 40)}".` };
  } catch (err) {
    await recordIntegration("ai", "failed", (err as Error).message);
    revalidatePath("/studio/settings");
    return { ok: false, message: (err as Error).message };
  }
}
