import { and, desc, eq, gt, isNotNull, lt, lte, max, ne } from "drizzle-orm";
import { db } from "@/db";
import { ideas, issueRevisions, issues, pillars } from "@/db/schema";
import { sha256 } from "./crypto";
import { readingMinutes, slugify } from "./markdown";

export type Issue = typeof issues.$inferSelect;

export type IssueContent = Pick<Issue, "title" | "subtitle" | "bodyMd" | "recommendationMd" | "closingMd" | "subject" | "previewText">;

/** Hash of everything a reader sees. Approval is bound to this hash. */
export function contentHash(i: IssueContent): string {
  return sha256(JSON.stringify([i.title, i.subtitle, i.bodyMd, i.recommendationMd, i.closingMd, i.subject, i.previewText]));
}

export function isApprovalCurrent(i: Issue): boolean {
  return !!i.approvedAt && !!i.approvedHash && i.approvedHash === contentHash(i);
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? root : `${root}-${n + 1}`;
    const [hit] = await db
      .select({ id: issues.id })
      .from(issues)
      .where(excludeId ? and(eq(issues.slug, candidate), ne(issues.id, excludeId)) : eq(issues.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function createIssue(input: { title: string; ideaId?: string | null; bodyMd?: string; primaryPillarId?: number | null }) {
  const title = input.title.trim() || "Untitled letter";
  const [row] = await db
    .insert(issues)
    .values({
      title,
      slug: await uniqueSlug(title),
      ideaId: input.ideaId ?? null,
      primaryPillarId: input.primaryPillarId ?? null,
      bodyMd: input.bodyMd ?? "",
      subject: title,
      readingMinutes: readingMinutes(input.bodyMd ?? ""),
    })
    .returning();
  return row;
}

export async function createIssueFromIdea(ideaId: string) {
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId));
  if (!idea) throw new Error("Idea not found");
  const [existing] = await db.select().from(issues).where(eq(issues.ideaId, ideaId)).limit(1);
  if (existing) return existing;
  const issue = await createIssue({ title: idea.workingTitle, ideaId, primaryPillarId: idea.primaryPillarId });
  if (["captured", "exploring", "ready_to_draft"].includes(idea.stage)) {
    await db.update(ideas).set({ stage: "drafting" }).where(eq(ideas.id, ideaId));
  }
  return issue;
}

export type SaveIssueInput = IssueContent & {
  number?: number | null;
  slug?: string;
  primaryPillarId?: number | null;
  secondaryThemes?: string[];
};

/**
 * Save editor content. Any change to reader-visible content after approval
 * revokes the approval, so a broadcast can never send unapproved text.
 */
export async function saveIssue(id: string, input: SaveIssueInput, revision: { source: string; note?: string } | null) {
  const [current] = await db.select().from(issues).where(eq(issues.id, id));
  if (!current) throw new Error("Issue not found");
  const next = { ...current, ...input };
  const changed = contentHash(next) !== contentHash(current);
  const patch: Partial<Issue> = {
    title: input.title,
    subtitle: input.subtitle,
    bodyMd: input.bodyMd,
    recommendationMd: input.recommendationMd,
    closingMd: input.closingMd,
    subject: input.subject,
    previewText: input.previewText,
    readingMinutes: readingMinutes(input.bodyMd, input.recommendationMd, input.closingMd),
  };
  if (input.primaryPillarId !== undefined) patch.primaryPillarId = input.primaryPillarId;
  if (input.secondaryThemes) patch.secondaryThemes = input.secondaryThemes;
  if (input.number !== undefined) patch.number = input.number;
  if (input.slug && input.slug !== current.slug) patch.slug = await uniqueSlug(input.slug, id);
  if (changed && current.approvedAt && current.status === "approved") {
    patch.status = "draft";
    patch.approvedAt = null;
    patch.approvedHash = null;
  }
  const [saved] = await db.update(issues).set(patch).where(eq(issues.id, id)).returning();

  if (revision && changed) {
    // Autosaves are throttled to one revision per 10 minutes; explicit saves always snapshot.
    let shouldSnapshot = true;
    if (revision.source === "autosave") {
      const [last] = await db
        .select({ createdAt: issueRevisions.createdAt })
        .from(issueRevisions)
        .where(eq(issueRevisions.issueId, id))
        .orderBy(desc(issueRevisions.createdAt))
        .limit(1);
      shouldSnapshot = !last || Date.now() - last.createdAt.getTime() > 10 * 60_000;
    }
    if (shouldSnapshot) await snapshot(saved, revision.source, revision.note);
  }
  return { issue: saved, approvalRevoked: changed && current.status === "approved" };
}

export async function snapshot(issue: Issue, source: string, note = "") {
  await db.insert(issueRevisions).values({
    issueId: issue.id,
    source,
    note,
    title: issue.title,
    bodyMd: issue.bodyMd,
    recommendationMd: issue.recommendationMd,
    closingMd: issue.closingMd,
    subject: issue.subject,
    previewText: issue.previewText,
  });
}

export async function restoreRevision(issueId: string, revisionId: string) {
  const [rev] = await db
    .select()
    .from(issueRevisions)
    .where(and(eq(issueRevisions.id, revisionId), eq(issueRevisions.issueId, issueId)));
  if (!rev) throw new Error("Revision not found");
  const [current] = await db.select().from(issues).where(eq(issues.id, issueId));
  await snapshot(current, "manual", "Before restoring an earlier version");
  return saveIssue(
    issueId,
    {
      title: rev.title,
      subtitle: current.subtitle,
      bodyMd: rev.bodyMd,
      recommendationMd: rev.recommendationMd,
      closingMd: rev.closingMd,
      subject: rev.subject,
      previewText: rev.previewText,
    },
    { source: "restore", note: `Restored version from ${rev.createdAt.toISOString()}` },
  );
}

const PLACEHOLDER = /\[COL:[^\]]*\]/gi;

/** AI drafts mark missing personal material as [COL: …]. These must be filled before approval. */
export function unfilledPlaceholders(i: Pick<Issue, "title" | "subtitle" | "bodyMd" | "recommendationMd" | "closingMd" | "subject" | "previewText">): string[] {
  return [i.title, i.subtitle, i.bodyMd, i.recommendationMd, i.closingMd, i.subject, i.previewText].flatMap((t) => t.match(PLACEHOLDER) ?? []);
}

export function publishChecklist(i: Issue, opts: { senderGaps: string[]; testSent: boolean }) {
  return [
    { key: "title", label: "Title written", ok: i.title.trim().length > 0 && i.title !== "Untitled letter" },
    { key: "body", label: "Main essay has at least 150 words", ok: i.bodyMd.trim().split(/\s+/).length >= 150 },
    { key: "subject", label: "Subject line set", ok: i.subject.trim().length > 0 },
    { key: "preview", label: "Preview text set", ok: i.previewText.trim().length > 0 },
    { key: "placeholders", label: "No unfilled [COL: …] placeholders", ok: unfilledPlaceholders(i).length === 0 },
    { key: "closing", label: "Closing reflection or question", ok: i.closingMd.trim().length > 0, optional: true },
    { key: "sender", label: "Sender identity & mailing address (CASL)", ok: opts.senderGaps.length === 0 },
    { key: "test", label: "Test email sent and reviewed", ok: opts.testSent },
    { key: "approved", label: "Final version approved", ok: isApprovalCurrent(i) },
  ];
}

export async function approveIssue(id: string) {
  const [i] = await db.select().from(issues).where(eq(issues.id, id));
  if (!i) throw new Error("Issue not found");
  const holes = unfilledPlaceholders(i);
  if (holes.length) throw new Error(`Fill or remove ${holes.length} placeholder(s) first, e.g. ${holes[0]}`);
  await snapshot(i, "manual", "Approved version");
  const [row] = await db
    .update(issues)
    .set({ status: i.status === "draft" ? "approved" : i.status, approvedAt: new Date(), approvedHash: contentHash(i) })
    .where(eq(issues.id, id))
    .returning();
  return row;
}

export async function revokeApproval(id: string) {
  await db
    .update(issues)
    .set({ status: "draft", approvedAt: null, approvedHash: null })
    .where(and(eq(issues.id, id), eq(issues.status, "approved")));
}

async function nextIssueNumber(): Promise<number> {
  const [r] = await db.select({ n: max(issues.number) }).from(issues);
  return (r?.n ?? 0) + 1;
}

/** Make the issue live on the public site. Requires a current approval. */
export async function publishToWeb(id: string) {
  const [i] = await db.select().from(issues).where(eq(issues.id, id));
  if (!i) throw new Error("Issue not found");
  if (!isApprovalCurrent(i)) throw new Error("Approve the final version before publishing.");
  const [row] = await db
    .update(issues)
    .set({ status: "published", publishedAt: i.publishedAt ?? new Date(), number: i.number ?? (await nextIssueNumber()) })
    .where(eq(issues.id, id))
    .returning();
  if (row.ideaId) await db.update(ideas).set({ stage: "published" }).where(eq(ideas.id, row.ideaId));
  return row;
}

export async function unpublish(id: string) {
  await db.update(issues).set({ publishedAt: null, status: "approved" }).where(eq(issues.id, id));
}

export async function ensureIssueNumber(id: string) {
  const [i] = await db.select().from(issues).where(eq(issues.id, id));
  if (i.number) return i.number;
  const n = await nextIssueNumber();
  await db.update(issues).set({ number: n }).where(eq(issues.id, id));
  return n;
}

/* --------------------------------------------------------- public queries */

export async function publishedIssues(opts: { pillarSlug?: string; limit?: number } = {}) {
  const where = [isNotNull(issues.publishedAt), lte(issues.publishedAt, new Date())];
  if (opts.pillarSlug) where.push(eq(pillars.slug, opts.pillarSlug));
  const q = db
    .select({
      id: issues.id,
      number: issues.number,
      slug: issues.slug,
      title: issues.title,
      subtitle: issues.subtitle,
      bodyMd: issues.bodyMd,
      previewText: issues.previewText,
      publishedAt: issues.publishedAt,
      readingMinutes: issues.readingMinutes,
      pillarName: pillars.name,
      pillarSlug: pillars.slug,
    })
    .from(issues)
    .leftJoin(pillars, eq(pillars.id, issues.primaryPillarId))
    .where(and(...where))
    .orderBy(desc(issues.publishedAt));
  return opts.limit ? q.limit(opts.limit) : q;
}

export async function publishedIssueBySlug(slug: string) {
  const [row] = await db
    .select({ issue: issues, pillarName: pillars.name, pillarSlug: pillars.slug })
    .from(issues)
    .leftJoin(pillars, eq(pillars.id, issues.primaryPillarId))
    .where(and(eq(issues.slug, slug), isNotNull(issues.publishedAt), lte(issues.publishedAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function adjacentIssues(publishedAt: Date) {
  const [prev] = await db
    .select({ slug: issues.slug, title: issues.title })
    .from(issues)
    .where(and(isNotNull(issues.publishedAt), lt(issues.publishedAt, publishedAt)))
    .orderBy(desc(issues.publishedAt))
    .limit(1);
  const [next] = await db
    .select({ slug: issues.slug, title: issues.title })
    .from(issues)
    .where(and(isNotNull(issues.publishedAt), gt(issues.publishedAt, publishedAt), lte(issues.publishedAt, new Date())))
    .orderBy(issues.publishedAt)
    .limit(1);
  return { prev: prev ?? null, next: next ?? null };
}
