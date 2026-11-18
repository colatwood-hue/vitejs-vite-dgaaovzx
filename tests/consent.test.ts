import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consentRecords, subscribers, suppressions } from "@/db/schema";
import {
  addSubscriberManually,
  confirmSubscription,
  eligibleRecipients,
  handleBounceOrComplaint,
  importSubscribersCsv,
  parseCsv,
  signup,
  SIGNUP_CONSENT_TEXT,
  unsubscribe,
  updatePreferences,
  exportSubscribersCsv,
} from "@/lib/subscribers";
import { simulatedOutbox } from "@/lib/email/simulated";
import { updateSettings } from "@/lib/settings";

function lastConfirmToken(to: string) {
  const mail = [...simulatedOutbox()].reverse().find((m) => m.message.to === to);
  const match = mail?.message.text.match(/token=([A-Za-z0-9_%-]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

beforeAll(async () => {
  await updateSettings({ senderEmail: "letters@thedash.test", senderName: "Col", mailingAddress: "1 Main St, Toronto ON", doubleOptIn: true });
});

describe("double opt-in signup", () => {
  it("keeps the subscriber pending until confirmed and records consent evidence", async () => {
    const outcome = await signup({ email: " Reader@Example.com", consentText: SIGNUP_CONSENT_TEXT, ip: "203.0.113.5", userAgent: "UA" });
    expect(outcome).toBe("confirmation_sent");
    const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, "reader@example.com"));
    expect(sub.status).toBe("pending");
    expect(await eligibleRecipients()).toHaveLength(0);

    const token = lastConfirmToken("reader@example.com");
    expect(token).toBeTruthy();
    expect(await confirmSubscription("wrong-token")).toBeNull();
    const confirmed = await confirmSubscription(token!, { ip: "203.0.113.5" });
    expect(confirmed?.status).toBe("active");
    // Token is single-use
    expect(await confirmSubscription(token!)).toBeNull();

    const records = await db.select().from(consentRecords).where(eq(consentRecords.subscriberId, sub.id));
    expect(records.map((r) => r.action).sort()).toEqual(["confirmed", "requested"]);
    expect(records.find((r) => r.action === "requested")?.evidence).toContain(SIGNUP_CONSENT_TEXT);
    expect(await eligibleRecipients()).toHaveLength(1);
  });

  it("does not reveal whether an address is already subscribed (same no-op outcome)", async () => {
    expect(await signup({ email: "reader@example.com", consentText: SIGNUP_CONSENT_TEXT })).toBe("already_subscribed");
  });

  it("rejects invalid email addresses", async () => {
    await expect(signup({ email: "not-an-email", consentText: SIGNUP_CONSENT_TEXT })).rejects.toThrow();
  });
});

describe("unsubscribe & suppression", () => {
  it("unsubscribes immediately, suppresses, and records withdrawal", async () => {
    const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, "reader@example.com"));
    await unsubscribe(sub.id, "link");
    const [after] = await db.select().from(subscribers).where(eq(subscribers.id, sub.id));
    expect(after.status).toBe("unsubscribed");
    expect(after.unsubscribedAt).toBeInstanceOf(Date);
    const [sup] = await db.select().from(suppressions).where(eq(suppressions.email, "reader@example.com"));
    expect(sup.reason).toBe("unsubscribed");
    expect(await eligibleRecipients()).toHaveLength(0);
  });

  it("refuses to manually re-add a suppressed address", async () => {
    const r = await addSubscriberManually({
      email: "reader@example.com",
      consentType: "express",
      consentDate: new Date(),
      evidence: "They told me in person they want it",
    });
    expect(r.ok).toBe(false);
  });

  it("allows the person to re-subscribe themselves via double opt-in", async () => {
    await signup({ email: "reader@example.com", consentText: SIGNUP_CONSENT_TEXT });
    expect(await eligibleRecipients()).toHaveLength(0); // still pending
    await confirmSubscription(lastConfirmToken("reader@example.com")!);
    expect(await eligibleRecipients()).toHaveLength(1);
    expect(await db.select().from(suppressions).where(eq(suppressions.email, "reader@example.com"))).toHaveLength(0);
  });

  it("turning off every email type in preferences unsubscribes", async () => {
    const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, "reader@example.com"));
    await updatePreferences(sub.id, { newsletter: false, occasionalUpdates: false });
    const [after] = await db.select().from(subscribers).where(eq(subscribers.id, sub.id));
    expect(after.status).toBe("unsubscribed");
  });

  it("bounces and complaints suppress the address", async () => {
    await addSubscriberManually({ email: "bouncy@example.com", consentType: "express", consentDate: new Date(), evidence: "Signed paper form at event" });
    await handleBounceOrComplaint("bouncy@example.com", "bounced", "hard bounce");
    const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, "bouncy@example.com"));
    expect(sub.status).toBe("bounced");
    expect((await eligibleRecipients()).find((r) => r.email === "bouncy@example.com")).toBeUndefined();
  });
});

describe("manual add and CSV import", () => {
  it("requires evidence and rejects expired implied consent", async () => {
    await expect(
      addSubscriberManually({ email: "a@example.com", consentType: "express", consentDate: new Date(), evidence: "" }),
    ).rejects.toThrow();
    const old = new Date();
    old.setFullYear(old.getFullYear() - 3);
    const r = await addSubscriberManually({ email: "old@example.com", consentType: "implied", consentDate: old, evidence: "Business client in 2023" });
    expect(r.ok).toBe(false);
  });

  it("implied consent gets a two-year expiry", async () => {
    const r = await addSubscriberManually({ email: "client@example.com", consentType: "implied", consentDate: new Date(), evidence: "Purchased consulting this month" });
    expect(r.ok && r.subscriber.consentExpiresAt).toBeInstanceOf(Date);
  });

  it("requires attestation and validates every row", async () => {
    const csv = [
      "email,name,consent_type,consent_date,consent_evidence,tags",
      "one@example.com,One,express,2026-01-10,Signed up at book club; asked to be added,friends;toronto",
      '"two@example.com","Two, Jr.",express,2026-02-01,"Replied ""yes please"" to my email",',
      "bad-email,Bad,express,2026-01-01,whatever whatever,",
      "three@example.com,Three,express,2026-01-01,,",
    ].join("\n");
    await expect(importSubscribersCsv(csv, false)).rejects.toThrow(/consented/);
    const report = await importSubscribersCsv(csv, true);
    expect(report.added).toBe(2);
    expect(report.skipped.map((s) => s.row)).toEqual([4, 5]);
    const [two] = await db.select().from(subscribers).where(eq(subscribers.email, "two@example.com"));
    expect(two.name).toBe("Two, Jr.");
    const segment = await eligibleRecipients(["toronto"]);
    expect(segment.map((s) => s.email)).toEqual(["one@example.com"]);
  });

  it("parses quoted CSV and exports without leaking structure", async () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3')).toEqual([["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
    const out = await exportSubscribersCsv();
    expect(out.split("\n")[0]).toContain("consent_evidence");
    expect(out).toContain('"Replied ""yes please"" to my email"');
  });
});
