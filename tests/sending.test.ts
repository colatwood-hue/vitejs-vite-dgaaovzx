import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, issues, sendEvents, suppressions, users } from "@/db/schema";
import { createUser } from "@/lib/auth";
import {
  BROADCAST_CONFIRM_WORD,
  broadcastPreflight,
  cancelCampaign,
  createBroadcast,
  dispatchDueCampaigns,
  processCampaign,
  sendTestEmail,
} from "@/lib/campaigns";
import { setEmailProviderForTests, EmailSendError, type EmailMessage, type EmailProvider } from "@/lib/email";
import { approveIssue, createIssue, isApprovalCurrent, publishToWeb, saveIssue } from "@/lib/issues";
import { updateSettings } from "@/lib/settings";
import { addSubscriberManually } from "@/lib/subscribers";
import { verifySvixSignature } from "@/lib/email/resend";
import { createHmac } from "node:crypto";

class FakeProvider implements EmailProvider {
  name = "fake";
  capabilities = { realDelivery: true, webhooks: true, clickTracking: false, openTracking: false };
  sent: { msg: EmailMessage; key: string }[] = [];
  failFor = new Map<string, number>(); // email -> remaining transient failures
  permanentFail = new Set<string>();
  configurationProblem() {
    return null;
  }
  async send(msg: EmailMessage, key: string) {
    if (this.permanentFail.has(msg.to)) throw new EmailSendError("invalid recipient", false, 422);
    const n = this.failFor.get(msg.to) ?? 0;
    if (n > 0) {
      this.failFor.set(msg.to, n - 1);
      throw new EmailSendError("rate limited", true, 429);
    }
    // Emulate provider-side idempotency
    const prior = this.sent.find((s) => s.key === key);
    if (prior) return { providerMessageId: `id-${key}`, simulated: false };
    this.sent.push({ msg, key });
    return { providerMessageId: `id-${key}`, simulated: false };
  }
}

const body = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
let userId: string;

beforeAll(async () => {
  await updateSettings({
    senderEmail: "letters@thedash.test",
    senderName: "Col from The Dash",
    mailingAddress: "1 Main St, Toronto ON M5V 1A1",
    contactEmail: "col@thedash.test",
  });
  const existing = await db.select().from(users).limit(1);
  userId = existing[0]?.id ?? (await createUser("owner@thedash.test", "owner-password-123")).id;
  for (const email of ["r1@example.com", "r2@example.com", "r3@example.com"]) {
    await addSubscriberManually({ email, consentType: "express", consentDate: new Date(), evidence: "Signed up on the website form" });
  }
});

afterEach(() => {
  process.env.ALLOW_BROADCASTS = "false";
  setEmailProviderForTests(null);
});

async function makeApprovedIssue(title: string) {
  const issue = await createIssue({ title, bodyMd: body });
  await saveIssue(issue.id, { title, subtitle: "", bodyMd: body, recommendationMd: "", closingMd: "What would you do?", subject: title, previewText: "preview" }, null);
  return approveIssue(issue.id);
}

describe("approval", () => {
  it("editing content after approval revokes it", async () => {
    const i = await makeApprovedIssue("Approval check");
    expect(isApprovalCurrent(i)).toBe(true);
    const { issue, approvalRevoked } = await saveIssue(i.id, { ...i, bodyMd: i.bodyMd + " more" }, { source: "manual" });
    expect(approvalRevoked).toBe(true);
    expect(issue.status).toBe("draft");
    expect(isApprovalCurrent(issue)).toBe(false);
    await expect(publishToWeb(i.id)).rejects.toThrow(/Approve/);
  });

  it("publishing assigns sequential issue numbers", async () => {
    const a = await makeApprovedIssue("First published");
    const b = await makeApprovedIssue("Second published");
    const pa = await publishToWeb(a.id);
    const pb = await publishToWeb(b.id);
    expect(pb.number).toBe((pa.number ?? 0) + 1);
    expect(pa.publishedAt).toBeInstanceOf(Date);
  });
});

describe("test sends", () => {
  it("only go to the given test recipients and are marked as tests", async () => {
    const fake = new FakeProvider();
    setEmailProviderForTests(fake);
    const i = await makeApprovedIssue("Test send issue");
    const res = await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    expect(res.status).toBe("sent");
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].msg.to).toBe("me@thedash.test");
    expect(fake.sent[0].msg.subject.startsWith("[TEST]")).toBe(true);
    expect(fake.sent[0].msg.html).toContain("Test send");
  });

  it("the simulated provider records sends as simulated, never as sent", async () => {
    const i = await makeApprovedIssue("Simulated issue");
    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    const [c] = await db.select().from(campaigns).where(eq(campaigns.issueId, i.id));
    const evs = await db.select().from(sendEvents).where(eq(sendEvents.campaignId, c.id));
    expect(evs.map((e) => e.status)).toEqual(["simulated"]);
  });
});

describe("broadcast safety", () => {
  it("refuses without a test send, without ALLOW_BROADCASTS, or with the wrong confirmation", async () => {
    const fake = new FakeProvider();
    setEmailProviderForTests(fake);
    const i = await makeApprovedIssue("Safety issue");
    let pre = await broadcastPreflight(i.id);
    expect(pre.problems.join(" ")).toMatch(/test email/);
    expect(pre.problems.join(" ")).toMatch(/ALLOW_BROADCASTS/);

    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    process.env.ALLOW_BROADCASTS = "true";
    pre = await broadcastPreflight(i.id);
    expect(pre.problems).toEqual([]);
    await expect(createBroadcast({ issueId: i.id, userId, confirmation: "send" })).rejects.toThrow(/Type/);
    expect(fake.sent.filter((s) => !s.msg.subject.startsWith("[TEST]"))).toHaveLength(0);
  });

  it("refuses when sender identification (CASL) is incomplete", async () => {
    setEmailProviderForTests(new FakeProvider());
    process.env.ALLOW_BROADCASTS = "true";
    await updateSettings({ mailingAddress: "" });
    const i = await makeApprovedIssue("CASL issue");
    const pre = await broadcastPreflight(i.id);
    expect(pre.problems.join(" ")).toMatch(/mailing address/);
    await updateSettings({ mailingAddress: "1 Main St, Toronto ON M5V 1A1" });
  });

  it("sends exactly once per recipient, with unsubscribe headers, and blocks a second broadcast", async () => {
    const fake = new FakeProvider();
    setEmailProviderForTests(fake);
    process.env.ALLOW_BROADCASTS = "true";
    const i = await makeApprovedIssue("Real broadcast");
    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    const pre = await broadcastPreflight(i.id);
    const campaign = await createBroadcast({ issueId: i.id, userId, confirmation: `${BROADCAST_CONFIRM_WORD} ${pre.recipientCount}` });

    // Two overlapping workers + a cron run
    await Promise.all([processCampaign(campaign.id), processCampaign(campaign.id)]);
    await dispatchDueCampaigns();

    const broadcastSends = fake.sent.filter((s) => !s.msg.subject.startsWith("[TEST]"));
    const recipients = broadcastSends.map((s) => s.msg.to).sort();
    expect(recipients).toEqual([...new Set(recipients)]);
    expect(recipients.length).toBe(pre.recipientCount);
    const sample = broadcastSends[0].msg;
    expect(sample.headers?.["List-Unsubscribe"]).toContain("/api/unsubscribe?token=");
    expect(sample.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sample.html).toContain("1 Main St, Toronto");
    expect(sample.text).toContain("Unsubscribe:");

    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
    expect(c.status).toBe("sent");
    const [iss] = await db.select().from(issues).where(eq(issues.id, i.id));
    expect(iss.status).toBe("sent");
    expect(iss.number).toBeGreaterThan(0);

    const again = await broadcastPreflight(i.id);
    expect(again.problems.join(" ")).toMatch(/already has a broadcast/);
  });

  it("retries transient failures, gives up on permanent ones, and honours late suppressions", async () => {
    const fake = new FakeProvider();
    setEmailProviderForTests(fake);
    process.env.ALLOW_BROADCASTS = "true";
    const i = await makeApprovedIssue("Retry broadcast");
    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    const pre = await broadcastPreflight(i.id);
    const campaign = await createBroadcast({
      issueId: i.id,
      userId,
      confirmation: `SEND ${pre.recipientCount}`,
      scheduledFor: new Date(Date.now() + 60_000),
    });
    // Not due yet
    expect(await processCampaign(campaign.id)).toEqual({ skipped: "not_due" });
    await db.update(campaigns).set({ scheduledFor: new Date(Date.now() - 1000) }).where(eq(campaigns.id, campaign.id));

    fake.failFor.set("r1@example.com", 1);
    fake.permanentFail.add("r2@example.com");
    const first = await processCampaign(campaign.id);
    expect(first.status).toBe("sending"); // r1 will be retried
    const second = await processCampaign(campaign.id);
    expect(second.status).toBe("partially_failed");
    const evs = await db.select().from(sendEvents).where(eq(sendEvents.campaignId, campaign.id));
    expect(evs.find((e) => e.email === "r1@example.com")?.status).toBe("sent");
    expect(evs.find((e) => e.email === "r2@example.com")?.status).toBe("failed");
  });

  it("cancels a scheduled broadcast before it starts", async () => {
    setEmailProviderForTests(new FakeProvider());
    process.env.ALLOW_BROADCASTS = "true";
    const i = await makeApprovedIssue("Cancel me");
    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    const pre = await broadcastPreflight(i.id);
    const c = await createBroadcast({ issueId: i.id, userId, confirmation: `SEND ${pre.recipientCount}`, scheduledFor: new Date(Date.now() + 3600_000) });
    await cancelCampaign(c.id);
    expect((await processCampaign(c.id)).skipped).toBe("cancelled");
    // A new broadcast can be created after cancelling
    expect((await broadcastPreflight(i.id)).problems).toEqual([]);
  });

  it("skips recipients suppressed after the campaign started", async () => {
    const fake = new FakeProvider();
    setEmailProviderForTests(fake);
    process.env.ALLOW_BROADCASTS = "true";
    const i = await makeApprovedIssue("Suppress late");
    await sendTestEmail(i.id, [{ email: "me@thedash.test", manageToken: null, id: null }]);
    const pre = await broadcastPreflight(i.id);
    const c = await createBroadcast({ issueId: i.id, userId, confirmation: `SEND ${pre.recipientCount}` });
    // Materialise recipients without sending by exhausting the time budget.
    await processCampaign(c.id, { timeBudgetMs: -1 });
    await db.insert(suppressions).values({ email: "r3@example.com", reason: "unsubscribed" }).onConflictDoNothing();
    await processCampaign(c.id);
    const evs = await db.select().from(sendEvents).where(eq(sendEvents.campaignId, c.id));
    expect(evs.find((e) => e.email === "r3@example.com")?.status).toBe("skipped");
  });
});

describe("webhook signatures", () => {
  it("accepts valid Svix signatures and rejects tampering or stale timestamps", () => {
    const secretBytes = Buffer.from("super-secret-key-material-123456");
    const secret = "whsec_" + secretBytes.toString("base64");
    const payload = JSON.stringify({ type: "email.bounced", data: { email_id: "x" } });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac("sha256", secretBytes).update(`msg_1.${ts}.${payload}`).digest("base64");
    const headers = new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,${sig}` });
    expect(() => verifySvixSignature(payload, headers, secret)).not.toThrow();
    expect(() => verifySvixSignature(payload + " ", headers, secret)).toThrow(/Invalid/);
    expect(() => verifySvixSignature(payload, headers, secret, Date.now() + 3600_000)).toThrow(/tolerance/);
    expect(() => verifySvixSignature(payload, headers, "")).toThrow();
  });
});
