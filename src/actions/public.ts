"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { SIGNUP_CONSENT_TEXT, findByManageToken, signup, unsubscribe, updatePreferences } from "@/lib/subscribers";
import { db } from "@/db";
import { pageViews } from "@/db/schema";

export type FormState = { ok: boolean; message: string } | null;

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

const signupSchema = z.object({
  email: z.string().min(3).max(254),
  name: z.string().max(120).optional().default(""),
  consent: z.literal("yes", { error: "Please tick the box to confirm you'd like to receive the letter." }),
  website: z.string().max(0).optional(), // honeypot
  source: z.string().max(200).optional(),
});

export async function subscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    if (form.get("website")) return { ok: true, message: "Check your inbox to confirm your subscription." };
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const ip = await clientIp();
  const ua = (await headers()).get("user-agent");
  if (!(await rateLimit(`signup:ip:${ip}`, 8, 3600)) || !(await rateLimit(`signup:email:${parsed.data.email.toLowerCase()}`, 3, 3600))) {
    return { ok: false, message: "Too many attempts. Please try again in a little while." };
  }
  try {
    const outcome = await signup({
      email: parsed.data.email,
      name: parsed.data.name,
      consentText: SIGNUP_CONSENT_TEXT,
      ip,
      userAgent: ua,
      sourcePath: parsed.data.source,
    });
    await db.insert(pageViews).values({ path: parsed.data.source ?? "/", kind: "subscribe_submit" });
    switch (outcome) {
      case "signup_disabled":
        return { ok: false, message: "Signups are paused right now. Please check back soon." };
      case "subscribed":
        return { ok: true, message: "You're in. The next letter will find you." };
      default:
        // Same message for new and existing addresses: no account enumeration.
        return { ok: true, message: "Almost there. Check your inbox for a confirmation link." };
    }
  } catch (err) {
    if (err instanceof z.ZodError) return { ok: false, message: "Please enter a valid email address." };
    console.error("[subscribe]", err);
    return { ok: false, message: "Something went wrong on our side. Please try again." };
  }
}

export async function unsubscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const sub = await findByManageToken(token);
  if (!sub) return { ok: false, message: "This link isn't valid. Reply to any letter and Col will remove you by hand." };
  await unsubscribe(sub.id, "link");
  return { ok: true, message: "You've been unsubscribed. You won't receive any more letters." };
}

export async function preferencesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const sub = await findByManageToken(token);
  if (!sub) return { ok: false, message: "This link isn't valid." };
  if (!(await rateLimit(`prefs:${sub.id}`, 20, 3600))) return { ok: false, message: "Too many changes. Try again later." };
  const newsletter = form.get("newsletter") === "on";
  const occasionalUpdates = form.get("occasionalUpdates") === "on";
  await updatePreferences(sub.id, { newsletter, occasionalUpdates, name: String(form.get("name") ?? "").trim() });
  return {
    ok: true,
    message: newsletter || occasionalUpdates ? "Preferences saved." : "Saved. You've been unsubscribed from everything.",
  };
}
