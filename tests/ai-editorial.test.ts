/**
 * AI orchestration rules, with the model mocked (no API calls, no cost).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const calls: { instruction: string; material: string }[] = [];
let nextResponse: unknown = {};

vi.mock("@/lib/ai/client", () => ({
  aiConfigured: () => true,
  structured: async (opts: { instruction: string; material: string }) => {
    calls.push({ instruction: opts.instruction, material: opts.material });
    return { data: structuredClone(nextResponse), model: "mock-model" };
  },
  plainText: async (opts: { instruction: string; material: string }) => {
    calls.push(opts);
    return { text: "A faithful LinkedIn reflection.", model: "mock-model" };
  },
}));

const { db } = await import("@/db");
const { ideaThoughts, ideas, issueRevisions, issues, thoughts, aiMessages } = await import("@/db/schema");
const ed = await import("@/lib/ai/editorial");

let ideaId: string;

beforeEach(() => {
  calls.length = 0;
});

describe("thought analysis", () => {
  it("stores analysis separately and never touches the original", async () => {
    const [t] = await db.insert(thoughts).values({ originalContent: "My exact words about someday.", sourceType: "note" }).returning();
    nextResponse = {
      centralIdea: "c", underlyingBelief: "b", potentialContradiction: "x", personalRelevance: "p",
      editorialAngle: "a", relatedIdeas: [], questionsToExplore: ["q1"], suggestedPillars: ["life-between"],
    };
    await ed.analyzeThought(t.id);
    const [after] = await db.select().from(thoughts).where(eq(thoughts.id, t.id));
    expect(after.originalContent).toBe("My exact words about someday.");
    expect(after.aiAnalysis?.centralIdea).toBe("c");
    expect(calls[0].material).toContain("Col's own words");
  });

  it("refuses to send sensitive thoughts to the AI", async () => {
    const [t] = await db.insert(thoughts).values({ originalContent: "private grief", privacy: "sensitive" }).returning();
    await expect(ed.analyzeThought(t.id)).rejects.toThrow(/sensitive/);
    expect(calls).toHaveLength(0);
  });
});

describe("editorial workflow", () => {
  it("sets up an idea with notes (one sensitive)", async () => {
    const [idea] = await db.insert(ideas).values({ workingTitle: "Someday", personalExperiences: "I cancelled a trip in 2024." }).returning();
    ideaId = idea.id;
    const [open] = await db.insert(thoughts).values({ originalContent: "OPEN NOTE CONTENT" }).returning();
    const [secret] = await db.insert(thoughts).values({ originalContent: "SECRET NOTE CONTENT", privacy: "sensitive" }).returning();
    await db.insert(ideaThoughts).values([{ ideaId, thoughtId: open.id }, { ideaId, thoughtId: secret.id }]);
  });

  it("excludes sensitive notes and labels Col's words vs AI output", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    nextResponse = { questions: [1, 2, 3, 4].map((n) => ({ question: `Q${n}?`, why: "w" })), readyForAngles: false, readinessNote: "more" };
    const r = await ed.runInterview(s.id);
    expect(r.questions).toHaveLength(3); // capped at three per round
    await ed.recordFounderAnswer(s.id, "It was raining and I stayed home.");
    nextResponse = { questions: [{ question: "Q5?", why: "w" }], readyForAngles: true, readinessNote: "ok" };
    await ed.runInterview(s.id);
    const material = calls.at(-1)!.material;
    expect(material).toContain("OPEN NOTE CONTENT");
    expect(material).not.toContain("SECRET NOTE CONTENT");
    expect(material).toContain("COL ANSWERED (his own words):\nIt was raining and I stayed home.");
    expect(material).toContain("AI asked:");
  });

  it("caps interviews at three rounds", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    nextResponse = { questions: [], readyForAngles: true, readinessNote: "" };
    await ed.runInterview(s.id);
    await expect(ed.runInterview(s.id)).rejects.toThrow(/rounds/);
  });

  it("requires an angle, then drafts into the editor without approving", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    nextResponse = { title: "Someday", bodyMarkdown: "Draft body. [COL: the trip]", recommendationMarkdown: "", closingMarkdown: "What are you postponing?", placeholders: ["[COL: the trip]"], aiInterpretations: [] };
    await expect(ed.runDraft(s.id)).rejects.toThrow(/angle/);
    await ed.selectAngle(s.id, { title: "T", thesis: "Th", readerRelevance: "", potentialOpening: "", supportingStory: "", strongestCounterargument: "", closingReflection: "" });
    const r = await ed.runDraft(s.id);
    const [issue] = await db.select().from(issues).where(eq(issues.id, r.issueId));
    expect(issue.bodyMd).toContain("Draft body.");
    expect(issue.status).toBe("draft");
    expect(issue.approvedAt).toBeNull();
    const revs = await db.select().from(issueRevisions).where(eq(issueRevisions.issueId, issue.id));
    expect(revs.some((x) => x.source === "ai_draft")).toBe(true);
  });

  it("critiques the CURRENT editor text, including manual edits", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    await db.update(issues).set({ bodyMd: "MANUALLY EDITED BODY" }).where(eq(issues.id, s.issueId!));
    const score = { score: 3, reason: "r" };
    nextResponse = {
      scores: { authenticity: score, clarity: score, originality: score, specificity: score, emotionalResonance: score, logicalConsistency: score, readerValue: score },
      unsupportedClaims: [], repetition: [], genericLanguage: ["level up"], suggestions: [{ passage: "p", suggestion: "s" }], overall: "o",
    };
    await ed.runCritique(s.id);
    expect(calls.at(-1)!.material).toContain("MANUALLY EDITED BODY");
  });

  it("final proposal is not applied until chosen, and applying never approves", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    nextResponse = { finalBody: "FINAL BODY", recommendation: "", closing: "c", subjectLines: ["A", "B", "C"], previewText: "pv", suggestedPillar: "", socialExcerpts: [], followUpIdeas: [] };
    await ed.runFinalize(s.id);
    let [issue] = await db.select().from(issues).where(eq(issues.id, s.issueId!));
    expect(issue.bodyMd).toBe("MANUALLY EDITED BODY");
    const [msg] = (await db.select().from(aiMessages).where(eq(aiMessages.sessionId, s.id))).filter((m) => m.kind === "final");
    await ed.applyFinal(s.id, msg.id, 1);
    [issue] = await db.select().from(issues).where(eq(issues.id, s.issueId!));
    expect(issue.bodyMd).toBe("FINAL BODY");
    expect(issue.subject).toBe("B");
    expect(issue.approvedAt).toBeNull();
  });

  it("repurposing sends only the issue text", async () => {
    const s = await ed.getOrCreateSession(ideaId);
    const r = await ed.repurposeIssue(s.issueId!, "linkedin");
    expect(r.text).toContain("LinkedIn");
    expect(calls.at(-1)!.material).toContain("FINAL BODY");
    await expect(ed.repurposeIssue(s.issueId!, "tiktok-dance")).rejects.toThrow();
  });
});
