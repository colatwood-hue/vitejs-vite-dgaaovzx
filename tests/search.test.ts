import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { ideas, issues, thoughts } from "@/db/schema";
import { relatedIdeas, safeSnippet, searchStudio } from "@/lib/search";

let ambitionIdea: string;

beforeAll(async () => {
  await db.insert(thoughts).values([
    { title: "Harbour", originalContent: "Ships were never built to stay in the harbour. Courage means leaving.", tags: ["courage"] },
    { originalContent: "", transcription: "On the drive home I kept thinking about my grandfather's workshop.", sourceType: "voice" },
    { originalContent: "Groceries: eggs, bread", privacy: "private" },
  ]);
  const [a] = await db
    .insert(ideas)
    .values({ workingTitle: "The Weight of Wanting More", thesis: "Ambition can quietly steal the present.", notes: "Contentment versus striving." })
    .returning();
  ambitionIdea = a.id;
  await db.insert(ideas).values([
    { workingTitle: "Who Are We Becoming Together?", thesis: "Friendship shapes identity." },
    { workingTitle: "Archived ambition piece", thesis: "Ambition ambition ambition", archivedAt: new Date() },
  ]);
  await db.insert(issues).values({ title: "Someday", slug: "someday-search", bodyMd: "I keep postponing happiness until someday arrives." });
});

describe("studio search", () => {
  it("finds stemmed matches across thoughts, ideas and issues with highlighted snippets", async () => {
    const hits = await searchStudio("ship courage");
    expect(hits[0].kind).toBe("thought");
    expect(hits[0].snippet).toContain("<mark>");
    expect((await searchStudio("postponed")).map((h) => h.kind)).toContain("issue"); // stemming: postponed ≈ postponing
    expect((await searchStudio("grandfather")).map((h) => h.kind)).toEqual(["thought"]); // transcripts are searchable
  });

  it("supports quoted phrases and exclusion (web-search syntax)", async () => {
    expect((await searchStudio('"stay in the harbour"')).length).toBe(1);
    const hits = await searchStudio("ambition -archived");
    expect(hits.map((h) => h.title)).toContain("The Weight of Wanting More");
  });

  it("falls back to substring match for partial words", async () => {
    expect((await searchStudio("grandfa")).length).toBe(1);
  });

  it("returns nothing for an empty query and never breaks on odd input", async () => {
    expect(await searchStudio("   ")).toEqual([]);
    await expect(searchStudio("'); drop table ideas; --")).resolves.toBeInstanceOf(Array);
    await expect(searchStudio("100%_\\")).resolves.toBeInstanceOf(Array);
  });

  it("escapes snippet HTML except highlight marks", () => {
    expect(safeSnippet("<script>x</script> <mark>hit</mark>")).toBe("&lt;script&gt;x&lt;/script&gt; <mark>hit</mark>");
  });
});

describe("related ideas", () => {
  it("suggests ideas sharing vocabulary, skipping archived and excluded ones", async () => {
    const related = await relatedIdeas("Lately my ambition feels like it is stealing the present moment from me.");
    expect(related[0]?.id).toBe(ambitionIdea);
    expect(related.find((r) => r.title.startsWith("Archived"))).toBeUndefined();
    expect(await relatedIdeas("ambition present", { excludeIds: [ambitionIdea] })).toHaveLength(0);
    expect(await relatedIdeas("")).toEqual([]);
    expect(await relatedIdeas("the and of")).toEqual([]); // stop-words only
  });
});
