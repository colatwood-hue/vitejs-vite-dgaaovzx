"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, issues, readerFeedback, repurposedContent } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  approveIssue,
  createIssue,
  publishToWeb,
  restoreRevision,
  revokeApproval,
  saveIssue,
  snapshot,
  unpublish,
} from "@/lib/issues";
import { cancelCampaign, createBroadcast, processCampaign, sendTestEmail } from "@/lib/campaigns";
import { normalizeEmail, testRecipients } from "@/lib/subscribers";
import { markOnboarding } from "@/lib/settings";
import { rateLimit } from "@/lib/rate-limit";
import { createImageAsset } from "@/lib/assets";
import type { FormState } from "./public";

function refresh(id: string) {
  revalidatePath(`/studio/issues/${id}`);
  revalidatePath("/studio/issues");
  revalidatePath("/studio");
}

export async function createIssueAction(form: FormData) {
  await requireUser();
  const issue = await createIssue({ title: String(form.get("title") ?? "") });
  redirect(`/studio/issues/${issue.id}`);
}

const saveSchema = z.object({
  id: z.uuid(),
  title: z.string().max(300),
  subtitle: z.string().max(500),
  bodyMd: z.string().max(200_000),
  recommendationMd: z.string().max(20_000),
  closingMd: z.string().max(20_000),
  subject: z.string().max(200),
  previewText: z.string().max(300),
  slug: z.string().max(100).optional(),
  number: z.number().int().positive().nullable().optional(),
  primaryPillarId: z.number().int().nullable().optional(),
  secondaryThemes: z.array(z.string().max(40)).max(10).optional(),
  mode: z.enum(["autosave", "manual"]),
  note: z.string().max(200).optional(),
});

export type SaveResult = { ok: boolean; message?: string; savedAt?: string; approvalRevoked?: boolean; readingMinutes?: number; status?: string; slug?: string };

/** Called directly from the editor (autosave and explicit "save version"). */
export async function saveIssueAction(input: z.input<typeof saveSchema>): Promise<SaveResult> {
  await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message };
  const { id, mode, note, ...data } = parsed.data;
  try {
    const { issue, approvalRevoked } = await saveIssue(id, data, { source: mode, note });
    if (mode === "manual") {
      // Explicit save always snapshots, even without changes since the last autosave.
      await snapshot(issue, "manual", note || "Saved version");
      refresh(id);
    }
    return { ok: true, savedAt: new Date().toISOString(), approvalRevoked, readingMinutes: issue.readingMinutes, status: issue.status, slug: issue.slug };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, message: /issues_number_unique|unique/.test(msg) ? "That issue number or slug is already used." : msg };
  }
}

export async function approveAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("id"));
  try {
    await approveIssue(id);
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  refresh(id);
  return { ok: true, message: "Approved. This exact version can now be published or sent." };
}

export async function revokeApprovalAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  await revokeApproval(id);
  refresh(id);
}

export async function publishWebAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("id"));
  try {
    const i = await publishToWeb(id);
    await markOnboarding("published");
    refresh(id);
    revalidatePath("/", "layout");
    return { ok: true, message: `Live at /issues/${i.slug}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function unpublishAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  await unpublish(id);
  refresh(id);
  revalidatePath("/", "layout");
}

export async function sendTestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await rateLimit(`test-send:${user.id}`, 20, 3600))) return { ok: false, message: "Too many test sends this hour." };
  const id = String(form.get("id"));
  try {
    const extra = String(form.get("emails") ?? "")
      .split(/[,\s]+/)
      .filter(Boolean)
      .slice(0, 5)
      .map((e) => ({ email: normalizeEmail(e), manageToken: null, id: null }));
    const saved = form.get("includeTestList") === "on" ? await testRecipients() : [];
    const all = [...saved.map((r) => ({ email: r.email, manageToken: r.manageToken, id: r.id })), ...extra];
    const unique = [...new Map(all.map((r) => [r.email, r])).values()];
    if (!unique.length) return { ok: false, message: "Enter an email address or mark a subscriber as a test recipient." };
    const result = await sendTestEmail(id, unique);
    await markOnboarding("testEmail");
    refresh(id);
    const simulated = (result.summary?.simulated ?? 0) > 0;
    if (result.status === "sent") {
      return { ok: true, message: simulated ? `Simulated test to ${unique.length} address(es). Nothing was delivered (no email provider configured).` : `Test sent to ${unique.map((u) => u.email).join(", ")}.` };
    }
    return { ok: false, message: `Test send ${result.status}. Check the send log below.` };
  } catch (err) {
    return { ok: false, message: err instanceof z.ZodError ? "One of those email addresses isn't valid." : (err as Error).message };
  }
}

export async function broadcastAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = String(form.get("id"));
  const when = String(form.get("scheduledFor") ?? "");
  const tags = String(form.get("segmentTags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  try {
    const scheduledFor = when ? new Date(when) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return { ok: false, message: "Invalid schedule time." };
    const c = await createBroadcast({ issueId: id, userId: user.id, confirmation: String(form.get("confirmation") ?? ""), scheduledFor, segmentTags: tags });
    let message = `Scheduled for ${c.scheduledFor?.toLocaleString("en-CA")}.`;
    if (!c.scheduledFor || c.scheduledFor <= new Date()) {
      const r = await processCampaign(c.id);
      message = r.status === "sent" ? `Sent to ${c.recipientCount} subscriber(s).` : `Sending started (${r.status ?? r.skipped}). Remaining recipients will be processed by the scheduler.`;
    }
    refresh(id);
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function cancelCampaignAction(form: FormData) {
  await requireUser();
  const c = await cancelCampaign(String(form.get("campaignId")));
  refresh(c.issueId);
}

export async function retryCampaignAction(form: FormData) {
  await requireUser();
  const id = String(form.get("campaignId"));
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (c && c.status === "sending") await processCampaign(id);
  if (c) refresh(c.issueId);
}

export async function restoreRevisionAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  await restoreRevision(id, String(form.get("revisionId")));
  refresh(id);
  redirect(`/studio/issues/${id}`);
}

export async function deleteIssueAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const [i] = await db.select().from(issues).where(eq(issues.id, id));
  const sent = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.issueId, id), eq(campaigns.kind, "broadcast"), inArray(campaigns.status, ["sending", "sent", "partially_failed", "scheduled"])));
  if (!i || i.publishedAt || sent.length) throw new Error("Published or sent issues can't be deleted.");
  await db.delete(issues).where(eq(issues.id, id));
  revalidatePath("/studio/issues");
  redirect("/studio/issues");
}

export async function uploadImageAction(form: FormData): Promise<{ ok: boolean; markdown?: string; message?: string }> {
  await requireUser();
  const file = form.get("file");
  const key = String(form.get("key") ?? "");
  const alt = String(form.get("alt") ?? "").replace(/[[\]]/g, "").slice(0, 200);
  try {
    const src = key ? { key } : file instanceof File && file.size ? { file } : null;
    if (!src) return { ok: false, message: "No file." };
    const id = await createImageAsset(String(form.get("id")), src, alt);
    return { ok: true, markdown: `![${alt}](/api/assets/${id})` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* ------------------------------------------------- repurposing & feedback */

export async function saveRepurposedAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("rid") ?? "");
  const issueId = String(form.get("issueId"));
  const content = String(form.get("content") ?? "");
  if (id) await db.update(repurposedContent).set({ content }).where(eq(repurposedContent.id, id));
  else await db.insert(repurposedContent).values({ issueId, kind: String(form.get("kind") ?? "note"), content, generatedBy: "manual" });
  revalidatePath(`/studio/issues/${issueId}`);
  return { ok: true, message: "Saved." };
}

export async function deleteRepurposedAction(form: FormData) {
  await requireUser();
  await db.delete(repurposedContent).where(eq(repurposedContent.id, String(form.get("rid"))));
  revalidatePath(`/studio/issues/${form.get("issueId")}`);
}

export async function addFeedbackAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const content = String(form.get("content") ?? "").trim();
  if (!content) return { ok: false, message: "Write something first." };
  const issueId = String(form.get("issueId") ?? "") || null;
  await db.insert(readerFeedback).values({
    issueId,
    kind: String(form.get("kind") ?? "response").slice(0, 30),
    fromName: String(form.get("fromName") ?? "").slice(0, 120),
    content: content.slice(0, 10_000),
    followUp: form.get("followUp") === "on",
  });
  revalidatePath("/studio/analytics");
  if (issueId) revalidatePath(`/studio/issues/${issueId}`);
  return { ok: true, message: "Logged." };
}

export async function toggleFeedbackFollowUpAction(form: FormData) {
  await requireUser();
  const id = String(form.get("fid"));
  const [f] = await db.select().from(readerFeedback).where(eq(readerFeedback.id, id));
  if (f) await db.update(readerFeedback).set({ followUp: !f.followUp }).where(eq(readerFeedback.id, id));
  revalidatePath("/studio/analytics");
}
