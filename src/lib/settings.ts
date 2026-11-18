import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publicationSettings } from "@/db/schema";

export type PublicationSettings = typeof publicationSettings.$inferSelect;

export async function getSettings(): Promise<PublicationSettings> {
  const [row] = await db.select().from(publicationSettings).where(eq(publicationSettings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db.insert(publicationSettings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(publicationSettings).where(eq(publicationSettings.id, 1));
  return again;
}

export async function updateSettings(patch: Partial<Omit<PublicationSettings, "id" | "updatedAt">>) {
  await getSettings();
  await db.update(publicationSettings).set(patch).where(eq(publicationSettings.id, 1));
}

export async function markOnboarding(step: string, done = true) {
  const s = await getSettings();
  await updateSettings({ onboarding: { ...s.onboarding, [step]: done } });
}

/** Problems that would make a commercial email non-compliant (CASL identification requirements). */
export function senderComplianceGaps(s: PublicationSettings): string[] {
  const gaps: string[] = [];
  if (!s.senderName.trim()) gaps.push("Sender name is missing.");
  if (!s.senderEmail.trim()) gaps.push("Sender email is missing.");
  if (!s.mailingAddress.trim()) gaps.push("Physical mailing address is missing (required by CASL).");
  if (!s.contactEmail.trim() && !s.replyToEmail.trim()) gaps.push("A contact or reply-to email is missing.");
  return gaps;
}
