/**
 * AI Editorial Partner orchestration.
 *
 * Stage flow: understand → interview (≤3 questions/round) → angles → draft → critique → finalize.
 * Every call is stateless: the full context is rebuilt from the database, with
 * Col's own words labelled separately from AI output. Thoughts marked
 * "sensitive" are never sent to the AI provider.
 */
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiMessages, aiSessions, ideaThoughts, ideas, issues, pillars, thoughts, type ThoughtAnalysis } from "@/db/schema";
import { createIssueFromIdea, saveIssue, snapshot } from "@/lib/issues";
import { getSettings } from "@/lib/settings";
import { plainText, structured } from "./client";
import { REPURPOSE_FORMATS, STAGE_INSTRUCTIONS } from "./prompts";

export const MAX_INTERVIEW_ROUNDS = 3;

/* ---------------------------------------------------------------- schemas */

const AnalysisSchema = z.object({
  centralIdea: z.string(),
  underlyingBelief: z.string(),
  potentialContradiction: z.string(),
  personalRelevance: z.string(),
  editorialAngle: z.string(),
  relatedIdeas: z.array(z.string()),
  questionsToExplore: z.array(z.string()),
  suggestedPillars: z.array(z.string()),
});

const UnderstandSchema = z.object({
  whatHeIsSaying: z.string(),
  whyItMatters: z.string(),
  whatMakesItInteresting: z.string(),
  tension: z.string(),
  supportingExperience: z.array(z.string()),
  missing: z.array(z.string()),
  assumptionsToChallenge: z.array(z.string()),
});

const InterviewSchema = z.object({
  questions: z.array(z.object({ question: z.string(), why: z.string() })),
  readyForAngles: z.boolean(),
  readinessNote: z.string(),
});

export const AngleSchema = z.object({
  title: z.string(),
  thesis: z.string(),
  readerRelevance: z.string(),
  potentialOpening: z.string(),
  supportingStory: z.string(),
  strongestCounterargument: z.string(),
  closingReflection: z.string(),
});
const AnglesSchema = z.object({ angles: z.array(AngleSchema) });

const DraftSchema = z.object({
  title: z.string(),
  bodyMarkdown: z.string(),
  recommendationMarkdown: z.string(),
  closingMarkdown: z.string(),
  placeholders: z.array(z.string()),
  aiInterpretations: z.array(z.string()),
});

const Score = z.object({ score: z.number(), reason: z.string() });
const CritiqueSchema = z.object({
  scores: z.object({
    authenticity: Score,
    clarity: Score,
    originality: Score,
    specificity: Score,
    emotionalResonance: Score,
    logicalConsistency: Score,
    readerValue: Score,
  }),
  unsupportedClaims: z.array(z.string()),
  repetition: z.array(z.string()),
  genericLanguage: z.array(z.string()),
  suggestions: z.array(z.object({ passage: z.string(), suggestion: z.string() })),
  overall: z.string(),
});

const FinalSchema = z.object({
  finalBody: z.string(),
  recommendation: z.string(),
  closing: z.string(),
  subjectLines: z.array(z.string()),
  previewText: z.string(),
  suggestedPillar: z.string(),
  socialExcerpts: z.array(z.string()),
  followUpIdeas: z.array(z.string()),
});

export type Angle = z.infer<typeof AngleSchema>;
export type Critique = z.infer<typeof CritiqueSchema>;
export type FinalPackage = z.infer<typeof FinalSchema>;

/* --------------------------------------------------------------- thoughts */

export async function analyzeThought(thoughtId: string): Promise<ThoughtAnalysis> {
  const [t] = await db.select().from(thoughts).where(eq(thoughts.id, thoughtId));
  if (!t) throw new Error("Thought not found");
  if (t.privacy === "sensitive") throw new Error("This thought is marked sensitive and won't be sent to the AI provider.");
  const settings = await getSettings();
  const existing = await db
    .select({ title: ideas.workingTitle })
    .from(ideas)
    .where(ne(ideas.stage, "published"))
    .orderBy(desc(ideas.updatedAt))
    .limit(60);
  const material = [
    `## Captured thought (Col's own words, source: ${t.sourceType})`,
    t.title ? `Title: ${t.title}` : "",
    t.originalContent ? t.originalContent : "",
    t.transcription ? `\nTranscribed voice note:\n${t.transcription}` : "",
    t.sourceUrl ? `\nLink: ${t.sourceUrl}` : "",
    `\n## Existing idea titles\n${existing.map((e) => `- ${e.title}`).join("\n") || "(none)"}`,
  ].join("\n");
  const { data } = await structured({
    schema: AnalysisSchema,
    instruction: STAGE_INSTRUCTIONS.analyzeThought,
    material,
    voiceGuidelines: settings.voiceGuidelines,
    effort: "low",
  });
  const analysis: ThoughtAnalysis = { ...data, editedByFounder: false };
  await db.update(thoughts).set({ aiAnalysis: analysis, aiAnalyzedAt: new Date(), status: t.status === "new" ? "reviewed" : t.status }).where(eq(thoughts.id, t.id));
  return analysis;
}

/* ------------------------------------------------------------ AI sessions */

export async function getOrCreateSession(ideaId: string) {
  const [s] = await db.select().from(aiSessions).where(eq(aiSessions.ideaId, ideaId)).orderBy(desc(aiSessions.createdAt)).limit(1);
  if (s) return s;
  const [created] = await db.insert(aiSessions).values({ ideaId }).returning();
  return created;
}

export async function sessionMessages(sessionId: string) {
  return db.select().from(aiMessages).where(eq(aiMessages.sessionId, sessionId)).orderBy(asc(aiMessages.createdAt));
}

async function addMessage(sessionId: string, role: "founder" | "assistant" | "system_note", kind: string, content: string, data?: unknown, model?: string) {
  const [m] = await db.insert(aiMessages).values({ sessionId, role, kind, content, data: data ?? null, model: model ?? null }).returning();
  return m;
}

export async function recordFounderAnswer(sessionId: string, content: string) {
  if (!content.trim()) throw new Error("Answer is empty.");
  return addMessage(sessionId, "founder", "answer", content.trim());
}

/** Builds the context block. Col's words and AI output are always labelled. */
async function buildContext(sessionId: string, opts: { includeDraft?: boolean } = {}) {
  const [session] = await db.select().from(aiSessions).where(eq(aiSessions.id, sessionId));
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, session.ideaId));
  const [pillar] = idea.primaryPillarId ? await db.select().from(pillars).where(eq(pillars.id, idea.primaryPillarId)) : [];
  const linked = await db
    .select({ t: thoughts })
    .from(ideaThoughts)
    .innerJoin(thoughts, eq(thoughts.id, ideaThoughts.thoughtId))
    .where(and(eq(ideaThoughts.ideaId, idea.id), ne(thoughts.privacy, "sensitive")));
  const msgs = await sessionMessages(sessionId);

  const parts: string[] = [];
  parts.push(`# Idea: ${idea.workingTitle}`);
  if (pillar) parts.push(`Primary pillar: ${pillar.name}`);
  const fields: [string, string][] = [
    ["Central thesis (Col's working note)", idea.thesis],
    ["Supporting stories (Col)", idea.supportingStories],
    ["Personal experiences (Col)", idea.personalExperiences],
    ["Questions (Col)", idea.questions],
    ["References (Col)", idea.references],
    ["Audience relevance (Col)", idea.audienceRelevance],
    ["Notes (Col)", idea.notes],
  ];
  for (const [label, value] of fields) if (value.trim()) parts.push(`## ${label}\n${value.trim()}`);
  if (linked.length) {
    parts.push(`## Raw notes Col captured (his own words)`);
    for (const { t } of linked) {
      parts.push(`### ${t.sourceType}${t.title ? `: ${t.title}` : ""} (${t.createdAt.toISOString().slice(0, 10)})\n${[t.originalContent, t.transcription ? `[voice transcript] ${t.transcription}` : "", t.sourceUrl ?? ""].filter(Boolean).join("\n")}`);
    }
  }
  if (!fields.some(([, v]) => v.trim()) && !linked.length) {
    parts.push("(Col has only given a working title so far. There is no personal material yet.)");
  }

  const interview = msgs.filter((m) => m.kind === "questions" || m.kind === "answer");
  if (interview.length) {
    parts.push(`## Interview so far`);
    for (const m of interview) {
      if (m.kind === "questions") {
        const qs = (m.data as z.infer<typeof InterviewSchema>)?.questions ?? [];
        parts.push(`AI asked:\n${qs.map((q, i) => `${i + 1}. ${q.question}`).join("\n")}`);
      } else parts.push(`COL ANSWERED (his own words):\n${m.content}`);
    }
  }
  if (session.selectedAngle) parts.push(`## Selected angle (chosen/edited by Col)\n${JSON.stringify(session.selectedAngle, null, 2)}`);

  if (opts.includeDraft && session.issueId) {
    const [issue] = await db.select().from(issues).where(eq(issues.id, session.issueId));
    if (issue) {
      parts.push(`## Current draft in the editor (may include Col's manual edits)\nTitle: ${issue.title}\n\n${issue.bodyMd}`);
      if (issue.recommendationMd) parts.push(`Recommendation:\n${issue.recommendationMd}`);
      if (issue.closingMd) parts.push(`Closing:\n${issue.closingMd}`);
    }
  }
  const lastCritique = [...msgs].reverse().find((m) => m.kind === "critique");
  if (opts.includeDraft && lastCritique) parts.push(`## Latest critique (AI)\n${lastCritique.content}`);
  const notes = msgs.filter((m) => m.role === "founder" && m.kind === "note");
  if (notes.length) parts.push(`## Direction from Col\n${notes.map((n) => `- ${n.content}`).join("\n")}`);

  return { session, idea, material: parts.join("\n\n") };
}

export async function runUnderstand(sessionId: string) {
  const { material } = await buildContext(sessionId);
  const s = await getSettings();
  const { data, model } = await structured({ schema: UnderstandSchema, instruction: STAGE_INSTRUCTIONS.understand, material, voiceGuidelines: s.voiceGuidelines, effort: "medium" });
  const content = [
    `**My read (interpretation):** ${data.whatHeIsSaying}`,
    `**Why it matters:** ${data.whyItMatters}`,
    `**What makes it interesting:** ${data.whatMakesItInteresting}`,
    `**The tension:** ${data.tension}`,
    data.supportingExperience.length ? `**Experiences you've already mentioned:**\n${data.supportingExperience.map((x) => `- ${x}`).join("\n")}` : `**Experiences you've already mentioned:** none yet`,
    `**What's missing:**\n${data.missing.map((x) => `- ${x}`).join("\n")}`,
    `**Assumptions worth challenging:**\n${data.assumptionsToChallenge.map((x) => `- ${x}`).join("\n")}`,
  ].join("\n\n");
  await addMessage(sessionId, "assistant", "analysis", content, data, model);
  await db.update(aiSessions).set({ stage: "interview" }).where(eq(aiSessions.id, sessionId));
  return data;
}

export async function runInterview(sessionId: string) {
  const { session, material } = await buildContext(sessionId);
  if (session.interviewRounds >= MAX_INTERVIEW_ROUNDS) {
    throw new Error(`That's ${MAX_INTERVIEW_ROUNDS} rounds of questions. Time to move on to angles. You can always add notes.`);
  }
  const s = await getSettings();
  const { data, model } = await structured({ schema: InterviewSchema, instruction: STAGE_INSTRUCTIONS.interview, material, voiceGuidelines: s.voiceGuidelines, effort: "medium" });
  data.questions = data.questions.slice(0, 3);
  const content = data.questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n") + `\n\n_${data.readinessNote}_`;
  await addMessage(sessionId, "assistant", "questions", content, data, model);
  await db.update(aiSessions).set({ stage: "interview", interviewRounds: session.interviewRounds + 1 }).where(eq(aiSessions.id, sessionId));
  return data;
}

export async function runAngles(sessionId: string) {
  const { material } = await buildContext(sessionId);
  const s = await getSettings();
  const { data, model } = await structured({ schema: AnglesSchema, instruction: STAGE_INSTRUCTIONS.angles, material, voiceGuidelines: s.voiceGuidelines, effort: "high" });
  data.angles = data.angles.slice(0, 3);
  await addMessage(sessionId, "assistant", "angles", data.angles.map((a, i) => `${i + 1}. ${a.title}: ${a.thesis}`).join("\n"), data, model);
  await db.update(aiSessions).set({ stage: "angles" }).where(eq(aiSessions.id, sessionId));
  return data;
}

export async function selectAngle(sessionId: string, angle: Angle) {
  const parsed = AngleSchema.parse(angle);
  await db.update(aiSessions).set({ selectedAngle: parsed, stage: "draft" }).where(eq(aiSessions.id, sessionId));
  await addMessage(sessionId, "founder", "angle_selected", `Selected angle: ${parsed.title}`, parsed);
}

export async function runDraft(sessionId: string) {
  const { session, idea, material } = await buildContext(sessionId);
  if (!session.selectedAngle) throw new Error("Choose (or write) an angle first.");
  const s = await getSettings();
  const { data, model } = await structured({ schema: DraftSchema, instruction: STAGE_INSTRUCTIONS.draft, material, voiceGuidelines: s.voiceGuidelines, effort: "high" });

  const issue = session.issueId
    ? (await db.select().from(issues).where(eq(issues.id, session.issueId)))[0]
    : await createIssueFromIdea(idea.id);
  if (issue.bodyMd.trim()) await snapshot(issue, "manual", "Before AI draft");
  await saveIssue(
    issue.id,
    {
      title: data.title || issue.title,
      subtitle: issue.subtitle,
      bodyMd: data.bodyMarkdown,
      recommendationMd: data.recommendationMarkdown,
      closingMd: data.closingMarkdown,
      subject: issue.subject || data.title,
      previewText: issue.previewText,
    },
    { source: "ai_draft", note: "AI first draft" },
  );
  const note = [
    `Draft written to the issue editor (${data.bodyMarkdown.split(/\s+/).length} words).`,
    data.placeholders.length ? `**Placeholders for you to fill:**\n${data.placeholders.map((p) => `- ${p}`).join("\n")}` : "",
    data.aiInterpretations.length ? `**Where I interpreted rather than quoted you. Please check:**\n${data.aiInterpretations.map((p) => `- ${p}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  await addMessage(sessionId, "assistant", "draft", note, data, model);
  await db.update(aiSessions).set({ stage: "critique", issueId: issue.id }).where(eq(aiSessions.id, sessionId));
  if (["captured", "exploring", "ready_to_draft"].includes(idea.stage)) await db.update(ideas).set({ stage: "drafting" }).where(eq(ideas.id, idea.id));
  return { issueId: issue.id, ...data };
}

export async function runCritique(sessionId: string) {
  const { session, idea, material } = await buildContext(sessionId, { includeDraft: true });
  if (!session.issueId) throw new Error("There's no draft to critique yet.");
  const s = await getSettings();
  const { data, model } = await structured({ schema: CritiqueSchema, instruction: STAGE_INSTRUCTIONS.critique, material, voiceGuidelines: s.voiceGuidelines, effort: "high" });
  const sc = data.scores;
  const content = [
    `**Overall:** ${data.overall}`,
    Object.entries(sc).map(([k, v]) => `- ${k}: ${v.score}/5. ${v.reason}`).join("\n"),
    data.unsupportedClaims.length ? `**Unsupported claims:**\n${data.unsupportedClaims.map((x) => `- ${x}`).join("\n")}` : "",
    data.genericLanguage.length ? `**Generic language:**\n${data.genericLanguage.map((x) => `- "${x}"`).join("\n")}` : "",
    data.repetition.length ? `**Repetition:**\n${data.repetition.map((x) => `- ${x}`).join("\n")}` : "",
    `**Suggestions:**\n${data.suggestions.map((x) => `- _${x.passage}_: ${x.suggestion}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");
  await addMessage(sessionId, "assistant", "critique", content, data, model);
  await db.update(aiSessions).set({ stage: "finalize" }).where(eq(aiSessions.id, sessionId));
  if (idea.stage === "drafting") await db.update(ideas).set({ stage: "editing" }).where(eq(ideas.id, idea.id));
  return data;
}

/** Produces a proposed final version. It is NOT applied until Col applies it, and never approved automatically. */
export async function runFinalize(sessionId: string) {
  const { session, material } = await buildContext(sessionId, { includeDraft: true });
  if (!session.issueId) throw new Error("There's no draft to finalize yet.");
  const s = await getSettings();
  const { data, model } = await structured({ schema: FinalSchema, instruction: STAGE_INSTRUCTIONS.finalize, material, voiceGuidelines: s.voiceGuidelines, effort: "high" });
  data.subjectLines = data.subjectLines.slice(0, 3);
  await addMessage(sessionId, "assistant", "final", "Proposed final version ready. Review, then apply it to the editor.", data, model);
  return data;
}

export async function applyFinal(sessionId: string, messageId: string, subjectIndex: number) {
  const [session] = await db.select().from(aiSessions).where(eq(aiSessions.id, sessionId));
  const [msg] = await db.select().from(aiMessages).where(and(eq(aiMessages.id, messageId), eq(aiMessages.sessionId, sessionId)));
  if (!session?.issueId || !msg || msg.kind !== "final") throw new Error("Final proposal not found.");
  const data = FinalSchema.parse(msg.data);
  const [issue] = await db.select().from(issues).where(eq(issues.id, session.issueId));
  const [pillar] = data.suggestedPillar ? await db.select().from(pillars).where(eq(pillars.slug, data.suggestedPillar)) : [];
  await saveIssue(
    issue.id,
    {
      title: issue.title,
      subtitle: issue.subtitle,
      bodyMd: data.finalBody,
      recommendationMd: data.recommendation,
      closingMd: data.closing,
      subject: data.subjectLines[subjectIndex] ?? data.subjectLines[0] ?? issue.subject,
      previewText: data.previewText,
      primaryPillarId: issue.primaryPillarId ?? pillar?.id ?? null,
    },
    { source: "ai_final", note: "AI final proposal applied" },
  );
  await db.update(aiSessions).set({ stage: "done" }).where(eq(aiSessions.id, sessionId));
  await addMessage(sessionId, "system_note", "note", "Final proposal applied to the editor. Review it and approve when you're happy.");
  return issue.id;
}

export async function repurposeIssue(issueId: string, format: string) {
  const instruction = REPURPOSE_FORMATS[format];
  if (!instruction) throw new Error("Unknown format");
  const [issue] = await db.select().from(issues).where(eq(issues.id, issueId));
  if (!issue) throw new Error("Issue not found");
  const s = await getSettings();
  const material = `## The letter: "${issue.title}"\n\n${issue.bodyMd}\n\n${issue.recommendationMd ? `Recommendation:\n${issue.recommendationMd}\n\n` : ""}${issue.closingMd ? `Closing:\n${issue.closingMd}` : ""}`;
  return plainText({ instruction: `${STAGE_INSTRUCTIONS.repurpose}\n\nFormat: ${instruction}`, material, voiceGuidelines: s.voiceGuidelines, effort: "low" });
}
