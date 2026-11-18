"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ideaLinks, ideaStageEnum, ideaThoughts, ideas } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { createIssueFromIdea } from "@/lib/issues";
import type { FormState } from "./public";

export async function createIdeaAction(form: FormData) {
  await requireUser();
  const title = String(form.get("workingTitle") ?? "").trim();
  if (!title) return;
  const pillar = Number(form.get("primaryPillarId")) || null;
  const [idea] = await db.insert(ideas).values({ workingTitle: title.slice(0, 200), primaryPillarId: pillar }).returning({ id: ideas.id });
  revalidatePath("/studio/ideas");
  redirect(`/studio/ideas/${idea.id}`);
}

const ideaSchema = z.object({
  id: z.uuid(),
  workingTitle: z.string().trim().min(1).max(200),
  thesis: z.string().max(5000),
  primaryPillarId: z.coerce.number().int().optional().transform((n) => n || null),
  stage: z.enum(ideaStageEnum.enumValues),
  supportingStories: z.string().max(20000),
  personalExperiences: z.string().max(20000),
  questions: z.string().max(20000),
  references: z.string().max(20000),
  audienceRelevance: z.string().max(5000),
  notes: z.string().max(20000),
  targetDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).transform((s) => s || null),
});

export async function updateIdeaAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = ideaSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const { id, ...rest } = parsed.data;
  await db.update(ideas).set(rest).where(eq(ideas.id, id));
  revalidatePath(`/studio/ideas/${id}`);
  revalidatePath("/studio/ideas");
  return { ok: true, message: "Saved." };
}

export async function setStageAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const stage = z.enum(ideaStageEnum.enumValues).parse(form.get("stage"));
  await db.update(ideas).set({ stage }).where(eq(ideas.id, id));
  revalidatePath("/studio/ideas");
  revalidatePath(`/studio/ideas/${id}`);
}

export async function archiveIdeaAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const reopen = form.get("reopen") === "1";
  await db.update(ideas).set({ archivedAt: reopen ? null : new Date(), mergedIntoId: reopen ? null : undefined }).where(eq(ideas.id, id));
  revalidatePath("/studio/ideas");
  revalidatePath(`/studio/ideas/${id}`);
}

export async function connectIdeasAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const a = String(form.get("id"));
  const b = String(form.get("relatedId"));
  if (!b || a === b) return { ok: false, message: "Choose a different idea." };
  await db.insert(ideaLinks).values([{ ideaId: a, relatedIdeaId: b }, { ideaId: b, relatedIdeaId: a }]).onConflictDoNothing();
  revalidatePath(`/studio/ideas/${a}`);
  return { ok: true, message: "Connected." };
}

export async function disconnectIdeasAction(form: FormData) {
  await requireUser();
  const a = String(form.get("id"));
  const b = String(form.get("relatedId"));
  await db.delete(ideaLinks).where(or(and(eq(ideaLinks.ideaId, a), eq(ideaLinks.relatedIdeaId, b)), and(eq(ideaLinks.ideaId, b), eq(ideaLinks.relatedIdeaId, a))));
  revalidatePath(`/studio/ideas/${a}`);
}

/** Merge `id` INTO `targetId`: notes are appended, raw notes re-linked, source archived (reversible). */
export async function mergeIdeaAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const id = String(form.get("id"));
  const targetId = String(form.get("targetId"));
  if (!targetId || id === targetId) return { ok: false, message: "Choose a different idea to merge into." };
  const [src] = await db.select().from(ideas).where(eq(ideas.id, id));
  const [dst] = await db.select().from(ideas).where(eq(ideas.id, targetId));
  if (!src || !dst) return { ok: false, message: "Idea not found." };
  const join = (a: string, b: string) => (b.trim() ? `${a}${a.trim() ? "\n\n" : ""}— from “${src.workingTitle}” —\n${b}` : a);
  await db
    .update(ideas)
    .set({
      thesis: join(dst.thesis, src.thesis),
      supportingStories: join(dst.supportingStories, src.supportingStories),
      personalExperiences: join(dst.personalExperiences, src.personalExperiences),
      questions: join(dst.questions, src.questions),
      references: join(dst.references, src.references),
      audienceRelevance: join(dst.audienceRelevance, src.audienceRelevance),
      notes: join(dst.notes, src.notes),
    })
    .where(eq(ideas.id, targetId));
  const links = await db.select().from(ideaThoughts).where(eq(ideaThoughts.ideaId, id));
  if (links.length) await db.insert(ideaThoughts).values(links.map((l) => ({ ideaId: targetId, thoughtId: l.thoughtId }))).onConflictDoNothing();
  await db.update(ideas).set({ archivedAt: new Date(), mergedIntoId: targetId }).where(eq(ideas.id, id));
  await db.insert(ideaLinks).values([{ ideaId: id, relatedIdeaId: targetId }, { ideaId: targetId, relatedIdeaId: id }]).onConflictDoNothing();
  revalidatePath("/studio/ideas");
  redirect(`/studio/ideas/${targetId}`);
}

export async function startIssueAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const issue = await createIssueFromIdea(id);
  revalidatePath("/studio/issues");
  redirect(`/studio/issues/${issue.id}`);
}

export async function unlinkThoughtAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  await db.delete(ideaThoughts).where(and(eq(ideaThoughts.ideaId, id), eq(ideaThoughts.thoughtId, String(form.get("thoughtId")))));
  revalidatePath(`/studio/ideas/${id}`);
}
