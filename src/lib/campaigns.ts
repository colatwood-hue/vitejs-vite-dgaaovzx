/**
 * Campaign delivery.
 *
 * Safety model
 *  - Test sends go only to explicit test addresses; subject is prefixed [TEST].
 *  - Broadcasts require: current approval, CASL sender info, explicit typed
 *    confirmation, and (for real providers) ALLOW_BROADCASTS=true.
 *  - One live broadcast per issue (unique idempotency key + status check).
 *  - Each recipient has one send_events row (unique campaign+email), and the
 *    provider receives a stable Idempotency-Key, so retries and overlapping
 *    cron runs cannot double-send.
 *  - Suppression is re-checked immediately before each send.
 */
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, ideas, issues, sendEvents, suppressions } from "@/db/schema";
import { getEmailProvider, EmailSendError } from "./email";
import { fromAddress, renderIssueEmail } from "./email/templates";
import { env } from "./env";
import { ensureIssueNumber, isApprovalCurrent } from "./issues";
import { getSettings, senderComplianceGaps } from "./settings";
import { eligibleRecipients, manageLinks } from "./subscribers";
import { randomToken } from "./crypto";

export const MAX_ATTEMPTS = 3;
export const BROADCAST_CONFIRM_WORD = "SEND";

type Recipient = { email: string; manageToken: string | null; id: string | null };

async function buildMessage(issueId: string, recipient: Recipient, isTest: boolean) {
  const settings = await getSettings();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  const links = recipient.manageToken
    ? manageLinks(recipient.manageToken)
    : { unsubscribeUrl: `${env.appUrl()}/preferences`, oneClickUrl: "", preferencesUrl: `${env.appUrl()}/preferences` };
  const { html, text } = renderIssueEmail(issue, settings, links, { appUrl: env.appUrl(), isTest });
  const headers: Record<string, string> = {};
  if (links.oneClickUrl) {
    headers["List-Unsubscribe"] = `<${links.oneClickUrl}>${settings.contactEmail ? `, <mailto:${settings.contactEmail}?subject=unsubscribe>` : ""}`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return {
    to: recipient.email,
    from: fromAddress(settings),
    replyTo: settings.replyToEmail || settings.contactEmail || undefined,
    subject: (isTest ? "[TEST] " : "") + (issue.subject || issue.title),
    html,
    text,
    headers,
    tags: { issue: issue.slug.slice(0, 60) },
  };
}

/* ----------------------------------------------------------------- tests */

export async function sendTestEmail(issueId: string, recipients: Recipient[]) {
  if (!recipients.length) throw new Error("Add at least one test recipient.");
  const settings = await getSettings();
  if (!settings.senderEmail) throw new Error("Set a sender email in Settings before sending a test.");
  const provider = getEmailProvider();
  const problem = provider.configurationProblem();
  if (problem) throw new Error(problem);
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue) throw new Error("Issue not found");

  const [campaign] = await db
    .insert(campaigns)
    .values({
      issueId,
      kind: "test",
      status: "sending",
      provider: provider.name,
      idempotencyKey: `test:${issueId}:${randomToken(8)}`,
      subject: `[TEST] ${issue.subject || issue.title}`,
      previewText: issue.previewText,
      recipientCount: recipients.length,
      startedAt: new Date(),
    })
    .returning();
  await db
    .insert(sendEvents)
    .values(recipients.map((r) => ({ campaignId: campaign.id, subscriberId: r.id, email: r.email.toLowerCase() })))
    .onConflictDoNothing();
  return processCampaign(campaign.id);
}

/* ------------------------------------------------------------ broadcasts */

export type BroadcastRequest = {
  issueId: string;
  userId: string;
  confirmation: string;
  scheduledFor?: Date | null;
  segmentTags?: string[];
};

export async function broadcastPreflight(issueId: string, segmentTags: string[] = []) {
  const settings = await getSettings();
  const provider = getEmailProvider();
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  const problems: string[] = [];
  if (!issue) problems.push("Issue not found.");
  else if (!isApprovalCurrent(issue)) problems.push("The current version has not been approved.");
  problems.push(...senderComplianceGaps(settings));
  const cfg = provider.configurationProblem();
  if (cfg) problems.push(cfg);
  if (provider.capabilities.realDelivery && !env.allowBroadcasts()) {
    problems.push("Real broadcasts are switched off. Set ALLOW_BROADCASTS=true in the environment when you're ready.");
  }
  const active = await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.issueId, issueId), eq(campaigns.kind, "broadcast"), sql`${campaigns.status} <> 'cancelled'`));
  if (active.length) problems.push("This issue already has a broadcast. Cancel it first if it hasn't started.");
  const tests = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.issueId, issueId), eq(campaigns.kind, "test"), inArray(campaigns.status, ["sent", "partially_failed"])))
    .limit(1);
  if (!tests.length) problems.push("Send yourself a test email first.");
  const recipients = await eligibleRecipients(segmentTags);
  if (!recipients.length) problems.push("No eligible, consented subscribers match this audience.");
  return { problems, recipientCount: recipients.length, simulated: !provider.capabilities.realDelivery, provider: provider.name };
}

export async function createBroadcast(req: BroadcastRequest) {
  const segmentTags = req.segmentTags ?? [];
  const pre = await broadcastPreflight(req.issueId, segmentTags);
  if (pre.problems.length) throw new Error(pre.problems.join(" "));
  const expected = `${BROADCAST_CONFIRM_WORD} ${pre.recipientCount}`;
  if (req.confirmation.trim() !== expected) {
    throw new Error(`Type "${expected}" exactly to confirm sending to ${pre.recipientCount} subscribers.`);
  }
  const [issue] = await db.select().from(issues).where(eq(issues.id, req.issueId));
  await ensureIssueNumber(issue.id);
  const priorCancelled = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.issueId, issue.id), eq(campaigns.kind, "broadcast")));
  const scheduledFor = req.scheduledFor && req.scheduledFor > new Date() ? req.scheduledFor : new Date();

  const [campaign] = await db
    .insert(campaigns)
    .values({
      issueId: issue.id,
      kind: "broadcast",
      status: "scheduled",
      provider: pre.provider,
      idempotencyKey: `broadcast:${issue.id}:${priorCancelled.length + 1}`,
      segmentTags,
      subject: issue.subject || issue.title,
      previewText: issue.previewText,
      scheduledFor,
      confirmedAt: new Date(),
      confirmedBy: req.userId,
      confirmationNote: `Confirmed "${expected}" (${pre.simulated ? "simulated provider" : pre.provider})`,
      recipientCount: pre.recipientCount,
    })
    .returning();

  await db
    .update(issues)
    .set({ status: issue.status === "published" ? "published" : "scheduled" })
    .where(eq(issues.id, issue.id));
  if (issue.ideaId) await db.update(ideas).set({ stage: "scheduled" }).where(eq(ideas.id, issue.ideaId));
  return campaign;
}

export async function cancelCampaign(campaignId: string) {
  const [c] = await db
    .update(campaigns)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "scheduled")))
    .returning();
  if (!c) throw new Error("Only campaigns that haven't started can be cancelled.");
  const [issue] = await db.select().from(issues).where(eq(issues.id, c.issueId));
  if (issue?.status === "scheduled") await db.update(issues).set({ status: "approved" }).where(eq(issues.id, issue.id));
  return c;
}

/* ------------------------------------------------------------ processing */

/** Acquire a short lock so two workers never process the same campaign. */
async function lockCampaign(id: string, seconds = 120) {
  const until = new Date(Date.now() + seconds * 1000);
  const [row] = await db
    .update(campaigns)
    .set({ lockedUntil: until })
    .where(and(eq(campaigns.id, id), or(isNull(campaigns.lockedUntil), lt(campaigns.lockedUntil, new Date()))))
    .returning();
  return row ?? null;
}

export type CampaignRunResult = { status?: string; skipped?: string; summary?: Record<string, number> };

export async function processCampaign(campaignId: string, opts: { timeBudgetMs?: number } = {}): Promise<CampaignRunResult> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? 45_000);
  const campaign = await lockCampaign(campaignId);
  if (!campaign) return { skipped: "locked" };
  try {
    if (campaign.status === "cancelled" || campaign.status === "sent") return { skipped: campaign.status };
    if (campaign.status === "scheduled") {
      if (campaign.scheduledFor && campaign.scheduledFor > new Date()) return { skipped: "not_due" };
      // Recipients are resolved at send time so last-minute unsubscribes are honoured.
      const recipients = await eligibleRecipients(campaign.segmentTags);
      if (recipients.length) {
        await db
          .insert(sendEvents)
          .values(recipients.map((r) => ({ campaignId, subscriberId: r.id, email: r.email })))
          .onConflictDoNothing();
      }
      await db
        .update(campaigns)
        .set({ status: "sending", startedAt: new Date(), recipientCount: recipients.length })
        .where(eq(campaigns.id, campaignId));
    }

    const provider = getEmailProvider();
    const pending = await db
      .select({ ev: sendEvents, manageToken: sql<string | null>`(select manage_token from subscribers s where s.id = ${sendEvents.subscriberId})` })
      .from(sendEvents)
      .where(
        and(
          eq(sendEvents.campaignId, campaignId),
          or(eq(sendEvents.status, "queued"), and(eq(sendEvents.status, "failed"), lt(sendEvents.attempts, MAX_ATTEMPTS))),
        ),
      );

    for (const { ev, manageToken } of pending) {
      if (Date.now() > deadline) break;
      if (campaign.kind === "broadcast") {
        const [sup] = await db.select().from(suppressions).where(eq(suppressions.email, ev.email)).limit(1);
        if (sup) {
          await db.update(sendEvents).set({ status: "skipped", lastError: `Suppressed: ${sup.reason}` }).where(eq(sendEvents.id, ev.id));
          continue;
        }
      }
      try {
        const msg = await buildMessage(campaign.issueId, { email: ev.email, manageToken, id: ev.subscriberId }, campaign.kind === "test");
        const result = await provider.send(msg, `${campaign.idempotencyKey}:${ev.email}`);
        await db
          .update(sendEvents)
          .set({
            status: result.simulated ? "simulated" : "sent",
            providerMessageId: result.providerMessageId,
            attempts: ev.attempts + 1,
            sentAt: new Date(),
            lastError: null,
          })
          .where(eq(sendEvents.id, ev.id));
      } catch (err) {
        const retryable = err instanceof EmailSendError ? err.retryable : true;
        await db
          .update(sendEvents)
          .set({
            status: "failed",
            attempts: retryable ? ev.attempts + 1 : MAX_ATTEMPTS,
            lastError: (err as Error).message.slice(0, 500),
          })
          .where(eq(sendEvents.id, ev.id));
      }
    }

    return await finalizeIfDone(campaignId);
  } finally {
    await db.update(campaigns).set({ lockedUntil: null }).where(eq(campaigns.id, campaignId));
  }
}

async function finalizeIfDone(campaignId: string): Promise<CampaignRunResult> {
  const counts = await db
    .select({ status: sendEvents.status, attempts: sendEvents.attempts, n: sql<number>`count(*)::int` })
    .from(sendEvents)
    .where(eq(sendEvents.campaignId, campaignId))
    .groupBy(sendEvents.status, sendEvents.attempts);
  const remaining = counts.filter((c) => c.status === "queued" || (c.status === "failed" && c.attempts < MAX_ATTEMPTS));
  const summary = Object.fromEntries(
    Object.entries(
      counts.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + c.n), acc), {}),
    ),
  );
  if (remaining.length) return { status: "sending", summary };
  const failed = summary.failed ?? 0;
  const delivered = (summary.sent ?? 0) + (summary.simulated ?? 0) + (summary.delivered ?? 0);
  const status = failed === 0 ? "sent" : delivered > 0 ? "partially_failed" : "failed";
  const [c] = await db
    .update(campaigns)
    .set({ status, completedAt: new Date(), lastError: failed ? `${failed} recipient(s) failed after ${MAX_ATTEMPTS} attempts` : null })
    .where(eq(campaigns.id, campaignId))
    .returning();
  if (c.kind === "broadcast" && delivered > 0) {
    const [issue] = await db.select().from(issues).where(eq(issues.id, c.issueId));
    if (issue && issue.status !== "published") await db.update(issues).set({ status: "sent" }).where(eq(issues.id, issue.id));
  }
  return { status, summary };
}

/** Called by the cron endpoint: process due scheduled campaigns and resume in-flight ones. */
export async function dispatchDueCampaigns() {
  const due = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      or(
        and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledFor, new Date())),
        eq(campaigns.status, "sending"),
      ),
    )
    .orderBy(campaigns.scheduledFor);
  const results = [];
  for (const c of due) results.push({ id: c.id, ...(await processCampaign(c.id)) });
  return results;
}

export async function campaignsForIssue(issueId: string) {
  return db.select().from(campaigns).where(eq(campaigns.issueId, issueId)).orderBy(desc(campaigns.createdAt));
}
