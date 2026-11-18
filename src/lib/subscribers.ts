/**
 * Subscriber management with CASL-aware consent recording.
 *
 * Principles
 *  - Every status change that touches consent writes a consent_records row.
 *  - Suppressed addresses (unsubscribed / bounced / complained) are never emailed.
 *  - Public endpoints return the same response whether or not an address exists.
 *  - Imports require an explicit attestation and per-row consent evidence.
 */
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { consentRecords, subscriberPreferences, subscribers, suppressions } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { getEmailProvider } from "./email";
import { fromAddress, renderConfirmEmail } from "./email/templates";
import { getSettings } from "./settings";

export type Subscriber = typeof subscribers.$inferSelect;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." })).pipe(z.string().max(254));

export function normalizeEmail(email: string): string {
  return emailSchema.parse(email);
}

export const SIGNUP_CONSENT_TEXT =
  "I'd like to receive The Dash, a personal email newsletter from Col Atwood. I can unsubscribe at any time.";

export function manageLinks(token: string) {
  const base = env.appUrl();
  return {
    unsubscribeUrl: `${base}/unsubscribe?token=${encodeURIComponent(token)}`,
    oneClickUrl: `${base}/api/unsubscribe?token=${encodeURIComponent(token)}`,
    preferencesUrl: `${base}/preferences?token=${encodeURIComponent(token)}`,
  };
}

async function isSuppressed(email: string) {
  const [row] = await db.select().from(suppressions).where(eq(suppressions.email, email)).limit(1);
  return row ?? null;
}

export async function addSuppression(email: string, reason: string, detail = "") {
  await db
    .insert(suppressions)
    .values({ email: email.toLowerCase(), reason, detail })
    .onConflictDoUpdate({ target: suppressions.email, set: { reason, detail } });
}

type SignupInput = {
  email: string;
  name?: string;
  consentText: string;
  ip?: string | null;
  userAgent?: string | null;
  sourcePath?: string;
};

export type SignupOutcome = "confirmation_sent" | "subscribed" | "already_subscribed" | "signup_disabled";

/**
 * Public signup. Express consent is captured via the form's consent statement.
 * With double opt-in (default) the subscriber stays `pending` until they click
 * the emailed link.
 */
export async function signup(input: SignupInput): Promise<SignupOutcome> {
  const settings = await getSettings();
  if (!settings.signupEnabled) return "signup_disabled";
  const email = normalizeEmail(input.email);
  const name = (input.name ?? "").trim().slice(0, 120);
  const evidence = `Web form${input.sourcePath ? ` at ${input.sourcePath}` : ""}. Statement shown: "${input.consentText}"`;

  let [sub] = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);
  if (sub?.status === "active") return "already_subscribed";

  const confirmToken = randomToken(24);
  const now = new Date();
  const doubleOptIn = settings.doubleOptIn;

  if (!sub) {
    [sub] = await db
      .insert(subscribers)
      .values({
        email,
        name,
        status: doubleOptIn ? "pending" : "active",
        consentSource: "web_form",
        consentType: "express",
        consentAt: now,
        consentEvidence: evidence,
        confirmTokenHash: doubleOptIn ? sha256(confirmToken) : null,
        confirmSentAt: doubleOptIn ? now : null,
        confirmedAt: doubleOptIn ? null : now,
        manageToken: randomToken(24),
      })
      .onConflictDoNothing()
      .returning();
    if (!sub) return "already_subscribed"; // concurrent duplicate
    await db.insert(subscriberPreferences).values({ subscriberId: sub.id }).onConflictDoNothing();
  } else {
    // Re-subscribing (previously pending / unsubscribed / bounced / complained).
    // A fresh explicit request is new express consent; with double opt-in it
    // must still be confirmed before we send anything.
    [sub] = await db
      .update(subscribers)
      .set({
        name: name || sub.name,
        status: doubleOptIn ? "pending" : "active",
        consentSource: "web_form",
        consentType: "express",
        consentAt: now,
        consentEvidence: evidence,
        consentExpiresAt: null,
        confirmTokenHash: doubleOptIn ? sha256(confirmToken) : null,
        confirmSentAt: doubleOptIn ? now : sub.confirmSentAt,
        confirmedAt: doubleOptIn ? null : now,
        unsubscribedAt: doubleOptIn ? sub.unsubscribedAt : null,
      })
      .where(eq(subscribers.id, sub.id))
      .returning();
    await db.insert(subscriberPreferences).values({ subscriberId: sub.id }).onConflictDoNothing();
  }

  await db.insert(consentRecords).values({
    subscriberId: sub.id,
    action: doubleOptIn ? "requested" : "granted",
    consentType: "express",
    source: "web_form",
    evidence,
    ipAddress: input.ip ?? null,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
  });

  if (!doubleOptIn) {
    await db.delete(suppressions).where(eq(suppressions.email, email));
    return "subscribed";
  }

  const confirmUrl = `${env.appUrl()}/subscribe/confirm?token=${encodeURIComponent(confirmToken)}`;
  const mail = renderConfirmEmail(settings, confirmUrl);
  if (settings.senderEmail) {
    await getEmailProvider().send(
      { to: email, from: fromAddress(settings), replyTo: settings.replyToEmail || undefined, ...mail },
      `confirm:${sub.id}:${sha256(confirmToken).slice(0, 16)}`,
    );
  } else {
    console.warn("[subscribe] Sender email not configured; confirmation email not sent.");
  }
  return "confirmation_sent";
}

export async function confirmSubscription(token: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  if (!token) return null;
  const [sub] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.confirmTokenHash, sha256(token)), eq(subscribers.status, "pending")))
    .limit(1);
  if (!sub) return null;
  // Links expire after 7 days.
  if (sub.confirmSentAt && Date.now() - sub.confirmSentAt.getTime() > 7 * 86400_000) return null;
  const now = new Date();
  const [updated] = await db
    .update(subscribers)
    .set({ status: "active", confirmedAt: now, confirmTokenHash: null, unsubscribedAt: null })
    .where(eq(subscribers.id, sub.id))
    .returning();
  await db.delete(suppressions).where(eq(suppressions.email, sub.email));
  await db.insert(consentRecords).values({
    subscriberId: sub.id,
    action: "confirmed",
    consentType: "express",
    source: "double_opt_in",
    evidence: "Clicked the confirmation link sent to this address.",
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return updated;
}

export async function findByManageToken(token: string) {
  if (!token) return null;
  const [sub] = await db.select().from(subscribers).where(eq(subscribers.manageToken, token)).limit(1);
  return sub ?? null;
}

export async function unsubscribe(
  subscriberId: string,
  source: "link" | "one_click" | "preferences" | "admin" | "reply",
  detail = "",
) {
  const [sub] = await db.select().from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
  if (!sub) return null;
  if (sub.status !== "unsubscribed") {
    await db
      .update(subscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date(), confirmTokenHash: null })
      .where(eq(subscribers.id, sub.id));
    await db.insert(consentRecords).values({
      subscriberId: sub.id,
      action: "withdrawn",
      consentType: sub.consentType,
      source: `unsubscribe_${source}`,
      evidence: detail || "Unsubscribe request processed immediately.",
    });
  }
  await addSuppression(sub.email, "unsubscribed", source);
  return sub;
}

export async function getPreferences(subscriberId: string) {
  const [p] = await db.select().from(subscriberPreferences).where(eq(subscriberPreferences.subscriberId, subscriberId));
  return p ?? { subscriberId, newsletter: true, occasionalUpdates: false, updatedAt: new Date() };
}

export async function updatePreferences(subscriberId: string, prefs: { newsletter: boolean; occasionalUpdates: boolean; name?: string }) {
  await db
    .insert(subscriberPreferences)
    .values({ subscriberId, newsletter: prefs.newsletter, occasionalUpdates: prefs.occasionalUpdates })
    .onConflictDoUpdate({
      target: subscriberPreferences.subscriberId,
      set: { newsletter: prefs.newsletter, occasionalUpdates: prefs.occasionalUpdates },
    });
  if (prefs.name !== undefined) {
    await db.update(subscribers).set({ name: prefs.name.slice(0, 120) }).where(eq(subscribers.id, subscriberId));
  }
  if (!prefs.newsletter && !prefs.occasionalUpdates) {
    await unsubscribe(subscriberId, "preferences", "Turned off all email types in preferences.");
  }
}

/* ------------------------------------------------------------ admin flows */

export const manualAddSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(120).default(""),
  consentType: z.enum(["express", "implied"]),
  consentDate: z.coerce.date(),
  evidence: z.string().trim().min(10, "Describe how and when this person gave consent (at least 10 characters)."),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  isTestRecipient: z.boolean().default(false),
});

/** Implied consent under CASL generally lasts two years from the qualifying relationship. */
export function impliedConsentExpiry(consentDate: Date) {
  const d = new Date(consentDate);
  d.setFullYear(d.getFullYear() + 2);
  return d;
}

export async function addSubscriberManually(raw: z.input<typeof manualAddSchema>, source: "manual" | "import" = "manual") {
  const input = manualAddSchema.parse(raw);
  const suppressed = await isSuppressed(input.email);
  if (suppressed && !input.isTestRecipient) {
    return { ok: false as const, reason: `Address is suppressed (${suppressed.reason}). They must re-subscribe themselves.` };
  }
  const expires = input.consentType === "implied" ? impliedConsentExpiry(input.consentDate) : null;
  if (expires && expires < new Date()) {
    return { ok: false as const, reason: "Implied consent from that date has expired (older than two years)." };
  }
  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, input.email)).limit(1);
  if (existing) return { ok: false as const, reason: "Already in the list." };

  const [sub] = await db
    .insert(subscribers)
    .values({
      email: input.email,
      name: input.name,
      status: "active",
      consentSource: source,
      consentType: input.consentType,
      consentAt: input.consentDate,
      consentEvidence: input.evidence,
      consentExpiresAt: expires,
      confirmedAt: new Date(),
      manageToken: randomToken(24),
      tags: input.tags,
      isTestRecipient: input.isTestRecipient,
    })
    .returning();
  await db.insert(subscriberPreferences).values({ subscriberId: sub.id }).onConflictDoNothing();
  await db.insert(consentRecords).values({
    subscriberId: sub.id,
    action: source === "import" ? "imported" : "granted",
    consentType: input.consentType,
    source,
    evidence: input.evidence,
  });
  return { ok: true as const, subscriber: sub };
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type ImportReport = { added: number; skipped: { row: number; email: string; reason: string }[] };

/**
 * CSV import. Required columns: email, consent_type (express|implied),
 * consent_date (YYYY-MM-DD), consent_evidence. Optional: name, tags (semicolon-separated).
 * The caller must attest that consent exists; rows without evidence are rejected.
 */
export async function importSubscribersCsv(csv: string, attestation: boolean): Promise<ImportReport> {
  if (!attestation) throw new Error("You must confirm that every person in this file consented to receive the newsletter.");
  const rows = parseCsv(csv);
  if (rows.length < 2) return { added: 0, skipped: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const required of ["email", "consent_type", "consent_date", "consent_evidence"]) {
    if (col(required) === -1) throw new Error(`CSV is missing the required "${required}" column.`);
  }
  const report: ImportReport = { added: 0, skipped: [] };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? "").trim() : "");
    const email = get("email");
    try {
      const result = await addSubscriberManually(
        {
          email,
          name: get("name"),
          consentType: get("consent_type").toLowerCase() as "express" | "implied",
          consentDate: get("consent_date") as unknown as Date,
          evidence: get("consent_evidence"),
          tags: get("tags") ? get("tags").split(";").map((t) => t.trim()).filter(Boolean) : [],
        },
        "import",
      );
      if (result.ok) report.added++;
      else report.skipped.push({ row: i + 1, email, reason: result.reason });
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") : (err as Error).message;
      report.skipped.push({ row: i + 1, email, reason: msg });
    }
  }
  return report;
}

function csvCell(v: unknown) {
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(";") : String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportSubscribersCsv(): Promise<string> {
  const rows = await db.select().from(subscribers).orderBy(desc(subscribers.signupAt));
  const header = [
    "email", "name", "status", "consent_type", "consent_source", "consent_at", "consent_evidence",
    "consent_expires_at", "signup_at", "confirmed_at", "unsubscribed_at", "tags",
  ];
  const lines = rows.map((s) =>
    [
      s.email, s.name, s.status, s.consentType, s.consentSource, s.consentAt, s.consentEvidence,
      s.consentExpiresAt, s.signupAt, s.confirmedAt, s.unsubscribedAt, s.tags,
    ].map(csvCell).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * The only function that decides who receives a broadcast.
 * Active + newsletter preference on + not suppressed + consent not expired
 * (+ matches any of the segment tags, when given).
 */
export async function eligibleRecipients(segmentTags: string[] = []) {
  const now = new Date();
  const conditions = [
    eq(subscribers.status, "active"),
    eq(subscriberPreferences.newsletter, true),
    isNull(suppressions.email),
    or(isNull(subscribers.consentExpiresAt), gt(subscribers.consentExpiresAt, now)),
  ];
  if (segmentTags.length) {
    conditions.push(sql`${subscribers.tags} && ${sql`ARRAY[${sql.join(segmentTags.map((t) => sql`${t}`), sql`, `)}]::text[]`}`);
  }
  return db
    .select({ id: subscribers.id, email: subscribers.email, name: subscribers.name, manageToken: subscribers.manageToken })
    .from(subscribers)
    .innerJoin(subscriberPreferences, eq(subscriberPreferences.subscriberId, subscribers.id))
    .leftJoin(suppressions, eq(suppressions.email, subscribers.email))
    .where(and(...conditions));
}

export async function testRecipients() {
  return db
    .select({ id: subscribers.id, email: subscribers.email, name: subscribers.name, manageToken: subscribers.manageToken })
    .from(subscribers)
    .where(eq(subscribers.isTestRecipient, true));
}

export async function handleBounceOrComplaint(email: string, kind: "bounced" | "complained", detail: string) {
  const normalized = email.toLowerCase();
  await addSuppression(normalized, kind, detail);
  const [sub] = await db.select().from(subscribers).where(eq(subscribers.email, normalized)).limit(1);
  if (sub && sub.status !== kind) {
    await db.update(subscribers).set({ status: kind }).where(eq(subscribers.id, sub.id));
    if (kind === "complained") {
      await db.insert(consentRecords).values({
        subscriberId: sub.id,
        action: "withdrawn",
        consentType: sub.consentType,
        source: "spam_complaint",
        evidence: detail || "Recipient marked a message as spam.",
      });
    }
  }
}

export async function subscribersByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(subscribers).where(inArray(subscribers.id, ids));
}
