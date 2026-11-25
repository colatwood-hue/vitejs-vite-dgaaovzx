"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { aiMessages, aiSessions, ideaThoughts, repurposedContent, thoughts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  AngleSchema,
  applyFinal,
  getOrCreateSession,
  recordFounderAnswer,
  repurposeIssue,
  runAngles,
  runCritique,
  runDraft,
  runFinalize,
  runInterview,
  runUnderstand,
  selectAngle,
} from "@/lib/ai/editorial";
import { transcribeThought } from "@/lib/transcription";
import { audioAssetFromForm } from "@/lib/assets";
import { markOnboarding } from "@/lib/settings";
import type { FormState } from "./public";

async function sessionFor(form: FormData) {
  const ideaId = String(form.get("ideaId"));
  const session = await getOrCreateSession(ideaId);
  return { ideaId, session };
}

function done(ideaId: string, message: string, issueId?: string | null): FormState {
  revalidatePath(`/studio/ideas/${ideaId}`);
  if (issueId) revalidatePath(`/studio/issues/${issueId}`);
  return { ok: true, message };
}

function fail(err: unknown): FormState {
  return { ok: false, message: (err as Error).message || "Something went wrong." };
}

export async function aiStageAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const stage = String(form.get("stage"));
  try {
    const { ideaId, session } = await sessionFor(form);
    switch (stage) {
      case "understand":
        await runUnderstand(session.id);
        return done(ideaId, "Here's my read.");
      case "interview":
        await runInterview(session.id);
        return done(ideaId, "A few questions for you.");
      case "angles":
        await runAngles(session.id);
        return done(ideaId, "Some angles to consider.");
      case "draft": {
        const r = await runDraft(session.id);
        await markOnboarding("firstIssue");
        return done(ideaId, "First draft is in the editor.", r.issueId);
      }
      case "critique":
        await runCritique(session.id);
        return done(ideaId, "Critique ready.");
      case "finalize":
        await runFinalize(session.id);
        return done(ideaId, "Final proposal ready for review.");
      default:
        return { ok: false, message: "Unknown stage." };
    }
  } catch (err) {
    return fail(err);
  }
}

export async function answerAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    const { ideaId, session } = await sessionFor(form);
    let text = String(form.get("answer") ?? "").trim();
    const audioAssetId = await audioAssetFromForm(form);
    if (audioAssetId) {
      // Preserve the spoken answer as an original thought linked to this idea.
      const [t] = await db
        .insert(thoughts)
        .values({ sourceType: "voice", title: "Interview answer", originalContent: text, audioAssetId, transcriptionStatus: "pending", status: "used" })
        .returning({ id: thoughts.id });
      await db.insert(ideaThoughts).values({ ideaId, thoughtId: t.id }).onConflictDoNothing();
      const r = await transcribeThought(t.id);
      if (!r.ok) {
        revalidatePath(`/studio/ideas/${ideaId}`);
        return { ok: false, message: `Your recording is saved in the inbox, but transcription failed: ${r.error}. Type your answer instead, or transcribe later.` };
      }
      text = [text, r.text].filter(Boolean).join("\n\n");
    }
    if (!text) return { ok: false, message: "Write or record an answer." };
    await recordFounderAnswer(session.id, text);
    return done(ideaId, "Answer saved.");
  } catch (err) {
    return fail(err);
  }
}

export async function directionAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const { ideaId, session } = await sessionFor(form);
  const note = String(form.get("note") ?? "").trim();
  if (!note) return { ok: false, message: "Write a note first." };
  await db.insert(aiMessages).values({ sessionId: session.id, role: "founder", kind: "note", content: note });
  return done(ideaId, "Noted. The AI will take this into account.");
}

export async function selectAngleAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    const { ideaId, session } = await sessionFor(form);
    const angle = AngleSchema.parse({
      title: String(form.get("title") ?? ""),
      thesis: String(form.get("thesis") ?? ""),
      readerRelevance: String(form.get("readerRelevance") ?? ""),
      potentialOpening: String(form.get("potentialOpening") ?? ""),
      supportingStory: String(form.get("supportingStory") ?? ""),
      strongestCounterargument: String(form.get("strongestCounterargument") ?? ""),
      closingReflection: String(form.get("closingReflection") ?? ""),
    });
    if (!angle.thesis.trim()) return { ok: false, message: "An angle needs at least a thesis." };
    await selectAngle(session.id, angle);
    return done(ideaId, `Angle selected: ${angle.title || "untitled"}.`);
  } catch (err) {
    return fail(err);
  }
}

export async function setAiStageAction(form: FormData) {
  await requireUser();
  const { ideaId, session } = await sessionFor(form);
  const stage = String(form.get("stage")) as "interview";
  await db.update(aiSessions).set({ stage }).where(eq(aiSessions.id, session.id));
  revalidatePath(`/studio/ideas/${ideaId}`);
}

export async function applyFinalAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    const { ideaId, session } = await sessionFor(form);
    const issueId = await applyFinal(session.id, String(form.get("messageId")), Number(form.get("subjectIndex") ?? 0));
    return done(ideaId, "Applied to the editor. Review it there, then approve.", issueId);
  } catch (err) {
    return fail(err);
  }
}

export async function repurposeAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const issueId = String(form.get("issueId"));
  const kind = String(form.get("kind"));
  try {
    const { text } = await repurposeIssue(issueId, kind);
    await db.insert(repurposedContent).values({ issueId, kind, content: text, generatedBy: "ai" });
    revalidatePath(`/studio/issues/${issueId}`);
    return { ok: true, message: "Draft created below. Edit freely. Nothing is posted anywhere." };
  } catch (err) {
    return fail(err);
  }
}
