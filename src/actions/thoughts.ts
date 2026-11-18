"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { audioAssets, ideaThoughts, ideas, pillars, thoughtPillars, thoughts, thoughtSourceEnum, type ThoughtAnalysis } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { analyzeThought } from "@/lib/ai/editorial";
import { transcribeThought } from "@/lib/transcription";
import { markOnboarding } from "@/lib/settings";
import type { FormState } from "./public";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const parseTags = (s: string) =>
  [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

const captureSchema = z.object({
  sourceType: z.enum(thoughtSourceEnum.enumValues).default("note"),
  title: z.string().trim().max(200).optional().default(""),
  content: z.string().max(100_000).optional().default(""),
  sourceUrl: z.union([z.literal(""), z.url().max(2000)]).optional().default(""),
  tags: z.string().max(500).optional().default(""),
  privacy: z.enum(["private", "sensitive", "shareable"]).default("private"),
});

export type CaptureState = (FormState & { id?: string; transcription?: string | null; transcriptionNote?: string }) | null;

export async function captureThoughtAction(_prev: CaptureState, form: FormData): Promise<CaptureState> {
  await requireUser();
  const parsed = captureSchema.safeParse({
    sourceType: form.get("sourceType") || undefined,
    title: form.get("title") ?? "",
    content: form.get("content") ?? "",
    sourceUrl: form.get("sourceUrl") ?? "",
    tags: form.get("tags") ?? "",
    privacy: form.get("privacy") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  const audio = form.get("audio");
  const hasAudio = audio instanceof File && audio.size > 0;
  if (!hasAudio && !d.content.trim() && !d.sourceUrl) return { ok: false, message: "Write something, add a link, or record a voice note." };

  let audioAssetId: string | null = null;
  if (hasAudio) {
    if (audio.size > MAX_AUDIO_BYTES) return { ok: false, message: "Audio is larger than 25 MB. Try a shorter recording." };
    const mime = audio.type || "audio/webm";
    if (!mime.startsWith("audio/") && mime !== "video/webm" && mime !== "video/mp4") return { ok: false, message: "That file isn't an audio file." };
    const duration = Number(form.get("durationSeconds") ?? "") || null;
    const [asset] = await db
      .insert(audioAssets)
      .values({
        mimeType: mime,
        sizeBytes: audio.size,
        durationSeconds: duration ? Math.round(duration) : null,
        originalFilename: audio.name?.slice(0, 200) || null,
        data: Buffer.from(await audio.arrayBuffer()),
      })
      .returning({ id: audioAssets.id });
    audioAssetId = asset.id;
  }

  const sourceType = hasAudio && (d.sourceType === "note" || !d.sourceType) ? (form.get("recorded") === "1" ? "voice" : "audio_upload") : d.sourceType;
  const [t] = await db
    .insert(thoughts)
    .values({
      sourceType,
      title: d.title || null,
      originalContent: d.content,
      sourceUrl: d.sourceUrl || null,
      audioAssetId,
      transcriptionStatus: audioAssetId ? "pending" : "not_needed",
      tags: parseTags(d.tags),
      privacy: d.privacy,
    })
    .returning({ id: thoughts.id });

  await markOnboarding("firstThought");
  let transcription: string | null = null;
  let transcriptionNote: string | undefined;
  if (audioAssetId) {
    const r = await transcribeThought(t.id);
    if (r.ok) transcription = r.text;
    else transcriptionNote = r.error;
  }
  revalidatePath("/studio/inbox");
  revalidatePath("/studio");
  return {
    ok: true,
    id: t.id,
    transcription,
    transcriptionNote,
    message: audioAssetId ? (transcription ? "Saved and transcribed." : "Saved. The recording is kept safely; transcription didn't run.") : "Captured.",
  };
}

export async function transcribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const r = await transcribeThought(String(form.get("id")));
  revalidatePath(`/studio/inbox/${form.get("id")}`);
  return r.ok ? { ok: true, message: "Transcribed." } : { ok: false, message: r.error };
}

export async function analyzeThoughtAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    await analyzeThought(String(form.get("id")));
    revalidatePath(`/studio/inbox/${form.get("id")}`);
    return { ok: true, message: "Analysis added. Edit anything that's off." };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function saveAnalysisAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("id"));
  const lines = (k: string) => String(form.get(k) ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const analysis: ThoughtAnalysis = {
    centralIdea: String(form.get("centralIdea") ?? ""),
    underlyingBelief: String(form.get("underlyingBelief") ?? ""),
    potentialContradiction: String(form.get("potentialContradiction") ?? ""),
    personalRelevance: String(form.get("personalRelevance") ?? ""),
    editorialAngle: String(form.get("editorialAngle") ?? ""),
    relatedIdeas: lines("relatedIdeas"),
    questionsToExplore: lines("questionsToExplore"),
    suggestedPillars: lines("suggestedPillars"),
    editedByFounder: true,
  };
  await db.update(thoughts).set({ aiAnalysis: analysis }).where(eq(thoughts.id, id));
  revalidatePath(`/studio/inbox/${id}`);
  return { ok: true, message: "Saved." };
}

export async function updateThoughtAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("id"));
  const privacy = String(form.get("privacy"));
  const status = String(form.get("status"));
  await db
    .update(thoughts)
    .set({
      title: String(form.get("title") ?? "").trim() || null,
      tags: parseTags(String(form.get("tags") ?? "")),
      privacy: (["private", "sensitive", "shareable"].includes(privacy) ? privacy : "private") as "private",
      status: (["new", "reviewed", "used", "archived"].includes(status) ? status : "new") as "new",
      transcription: form.has("transcription") ? String(form.get("transcription")) || null : undefined,
    })
    .where(eq(thoughts.id, id));
  const pillarIds = form.getAll("pillars").map(Number).filter(Boolean);
  await db.delete(thoughtPillars).where(eq(thoughtPillars.thoughtId, id));
  if (pillarIds.length) await db.insert(thoughtPillars).values(pillarIds.map((pillarId) => ({ thoughtId: id, pillarId })));
  revalidatePath(`/studio/inbox/${id}`);
  revalidatePath("/studio/inbox");
  return { ok: true, message: "Saved." };
}

export async function createIdeaFromThoughtAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const [t] = await db.select().from(thoughts).where(eq(thoughts.id, id));
  if (!t) throw new Error("Not found");
  const a = t.aiAnalysis;
  const source = t.originalContent || t.transcription || "";
  const workingTitle = t.title || source.split(/[.!?\n]/)[0].slice(0, 90) || "Untitled idea";
  const tp = await db.select({ pillarId: thoughtPillars.pillarId }).from(thoughtPillars).where(eq(thoughtPillars.thoughtId, id));
  let pillarId = tp[0]?.pillarId ?? null;
  if (!pillarId && a?.suggestedPillars?.[0]) {
    const [p] = await db.select().from(pillars).where(eq(pillars.slug, a.suggestedPillars[0]));
    pillarId = p?.id ?? null;
  }
  const [idea] = await db
    .insert(ideas)
    .values({
      workingTitle,
      primaryPillarId: pillarId,
      stage: "exploring",
      questions: a?.questionsToExplore?.length ? a.questionsToExplore.map((q) => `- ${q}`).join("\n") : "",
      notes: a ? `AI read of the original note (interpretation, not Col's words):\n- Central idea: ${a.centralIdea}\n- Possible angle: ${a.editorialAngle}` : "",
    })
    .returning({ id: ideas.id });
  await db.insert(ideaThoughts).values({ ideaId: idea.id, thoughtId: id });
  await db.update(thoughts).set({ status: "used" }).where(eq(thoughts.id, id));
  revalidatePath("/studio/ideas");
  redirect(`/studio/ideas/${idea.id}`);
}

export async function linkThoughtToIdeaAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const thoughtId = String(form.get("id"));
  const ideaId = String(form.get("ideaId"));
  if (!ideaId) return { ok: false, message: "Choose an idea." };
  await db.insert(ideaThoughts).values({ ideaId, thoughtId }).onConflictDoNothing();
  await db.update(thoughts).set({ status: "used" }).where(and(eq(thoughts.id, thoughtId), inArray(thoughts.status, ["new", "reviewed"])));
  revalidatePath(`/studio/inbox/${thoughtId}`);
  revalidatePath(`/studio/ideas/${ideaId}`);
  return { ok: true, message: "Linked." };
}
