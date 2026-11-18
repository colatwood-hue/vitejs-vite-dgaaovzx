"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { subscribers, suppressions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addSubscriberManually, addSuppression, importSubscribersCsv, unsubscribe } from "@/lib/subscribers";
import type { FormState } from "./public";

export async function addSubscriberAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    const r = await addSubscriberManually({
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      consentType: String(form.get("consentType")) === "implied" ? "implied" : "express",
      consentDate: String(form.get("consentDate") || new Date().toISOString().slice(0, 10)) as unknown as Date,
      evidence: String(form.get("evidence") ?? ""),
      tags: String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      isTestRecipient: form.get("isTestRecipient") === "on",
    });
    revalidatePath("/studio/subscribers");
    return r.ok ? { ok: true, message: `Added ${r.subscriber.email}.` } : { ok: false, message: r.reason };
  } catch (err) {
    return { ok: false, message: err instanceof z.ZodError ? err.issues[0].message : (err as Error).message };
  }
}

export async function importCsvAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file." };
  if (file.size > 2 * 1024 * 1024) return { ok: false, message: "CSV must be under 2 MB." };
  try {
    const report = await importSubscribersCsv(await file.text(), form.get("attest") === "on");
    revalidatePath("/studio/subscribers");
    const skipped = report.skipped.slice(0, 8).map((s) => `row ${s.row} (${s.email || "blank"}): ${s.reason}`).join("; ");
    return { ok: report.added > 0 || report.skipped.length === 0, message: `Imported ${report.added}. Skipped ${report.skipped.length}${skipped ? `: ${skipped}` : ""}${report.skipped.length > 8 ? "…" : ""}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function adminUnsubscribeAction(form: FormData) {
  await requireUser();
  await unsubscribe(String(form.get("id")), "admin", String(form.get("reason") || "Removed by the publisher on request."));
  revalidatePath("/studio/subscribers");
}

export async function toggleTestRecipientAction(form: FormData) {
  await requireUser();
  const id = String(form.get("id"));
  const [s] = await db.select().from(subscribers).where(eq(subscribers.id, id));
  if (s) await db.update(subscribers).set({ isTestRecipient: !s.isTestRecipient }).where(eq(subscribers.id, id));
  revalidatePath("/studio/subscribers");
}

export async function updateTagsAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const tags = String(form.get("tags") ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  await db.update(subscribers).set({ tags }).where(eq(subscribers.id, String(form.get("id"))));
  revalidatePath("/studio/subscribers");
  return { ok: true, message: "Saved." };
}

export async function suppressAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    const email = z.email().parse(String(form.get("email") ?? "").trim().toLowerCase());
    await addSuppression(email, "manual", String(form.get("detail") ?? "Added manually"));
    const [s] = await db.select().from(subscribers).where(eq(subscribers.email, email));
    if (s && s.status !== "unsubscribed") await unsubscribe(s.id, "admin", "Added to suppression list");
    revalidatePath("/studio/subscribers");
    return { ok: true, message: `${email} will never be emailed.` };
  } catch {
    return { ok: false, message: "Enter a valid email." };
  }
}

export async function removeSuppressionAction(form: FormData) {
  await requireUser();
  // Only manual suppressions can be lifted by the publisher; unsubscribes/complaints require the person to re-subscribe.
  const email = String(form.get("email"));
  const [row] = await db.select().from(suppressions).where(eq(suppressions.email, email));
  if (row?.reason === "manual") await db.delete(suppressions).where(eq(suppressions.email, email));
  revalidatePath("/studio/subscribers");
}
