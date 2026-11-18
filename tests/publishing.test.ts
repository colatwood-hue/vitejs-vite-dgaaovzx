import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { issues } from "@/db/schema";
import { adjacentIssues, approveIssue, createIssue, publishedIssueBySlug, publishedIssues, publishToWeb, restoreRevision, saveIssue } from "@/lib/issues";
import { diffLines } from "@/lib/diff";
import { renderMarkdown, readingMinutes, slugify } from "@/lib/markdown";
import { issueRevisions } from "@/db/schema";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

async function published(title: string, at: Date) {
  const i = await createIssue({ title, bodyMd: words(200) });
  await approveIssue(i.id);
  await publishToWeb(i.id);
  await db.update(issues).set({ publishedAt: at }).where(eq(issues.id, i.id));
  return i;
}

describe("public archive queries", () => {
  it("lists only published issues, newest first, with prev/next navigation", async () => {
    await createIssue({ title: "Unpublished draft" });
    const a = await published("Alpha", new Date("2026-01-01"));
    const b = await published("Beta", new Date("2026-02-01"));
    const c = await published("Gamma", new Date("2026-03-01"));
    const list = await publishedIssues();
    expect(list.map((x) => x.title)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(await publishedIssueBySlug("unpublished-draft")).toBeNull();
    const adj = await adjacentIssues(new Date("2026-02-01"));
    expect(adj.prev?.slug).toBe(a.slug);
    expect(adj.next?.slug).toBe(c.slug);
    expect(b.slug).toBe("beta");
  });

  it("future-dated issues stay hidden until their time", async () => {
    await published("Future", new Date(Date.now() + 86400_000));
    expect((await publishedIssues()).find((x) => x.title === "Future")).toBeUndefined();
  });
});

describe("revisions", () => {
  it("snapshots on manual save and can restore an earlier version", async () => {
    const i = await createIssue({ title: "History" });
    const base = { title: "History", subtitle: "", recommendationMd: "", closingMd: "", subject: "", previewText: "" };
    await saveIssue(i.id, { ...base, bodyMd: "First version" }, { source: "manual" });
    await saveIssue(i.id, { ...base, bodyMd: "Second version" }, { source: "manual" });
    const revs = await db.select().from(issueRevisions).where(eq(issueRevisions.issueId, i.id));
    const first = revs.find((r) => r.bodyMd === "First version")!;
    await restoreRevision(i.id, first.id);
    const [after] = await db.select().from(issues).where(eq(issues.id, i.id));
    expect(after.bodyMd).toBe("First version");
  });

  it("throttles autosave snapshots", async () => {
    const i = await createIssue({ title: "Autosave" });
    const base = { title: "Autosave", subtitle: "", recommendationMd: "", closingMd: "", subject: "", previewText: "" };
    for (let n = 0; n < 5; n++) await saveIssue(i.id, { ...base, bodyMd: `v${n}` }, { source: "autosave" });
    const revs = await db.select().from(issueRevisions).where(eq(issueRevisions.issueId, i.id));
    expect(revs.length).toBe(1);
  });
});

describe("markdown & helpers", () => {
  it("sanitises HTML and unsafe links", () => {
    const html = renderMarkdown('Hi <script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)> [ok](https://a.com)');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).toContain('href="https://a.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("computes reading time and slugs", () => {
    expect(readingMinutes(words(460))).toBe(2);
    expect(readingMinutes("")).toBe(1);
    expect(slugify("Ships Weren’t Built to Stay in the Harbour")).toBe("ships-werent-built-to-stay-in-the-harbour");
  });

  it("diffs lines", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd").map((d) => d.type)).toEqual(["same", "del", "same", "add"]);
  });
});

describe("placeholder guard", () => {
  it("refuses approval while [COL: …] placeholders remain", async () => {
    const i = await createIssue({ title: "Holes", bodyMd: "Intro. [COL: describe the morning you quit] Outro." });
    await expect(approveIssue(i.id)).rejects.toThrow(/placeholder/);
    const base = { title: "Holes", subtitle: "", recommendationMd: "", closingMd: "", subject: "s", previewText: "p" };
    await saveIssue(i.id, { ...base, bodyMd: "Intro. It was raining. Outro." }, null);
    await expect(approveIssue(i.id)).resolves.toBeTruthy();
  });
});
