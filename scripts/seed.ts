/**
 * Idempotent seed: editorial pillars, default publication settings, and the
 * twelve launch concepts. Seeds NO subscribers and NO engagement data.
 * Concepts are titles only; no personal stories are invented.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../src/db";
import { aiMessages, aiSessions, ideas, pillars, publicationSettings } from "../src/db/schema";
import { PILLAR_SEED } from "../src/lib/pillars";

const CONCEPTS: [string, string, string][] = [
  ["001", "Someday Is a Dangerous Place to Put Your Happiness", "life-between"],
  ["002", "The Person You Could Have Been", "art-of-becoming"],
  ["003", "Ships Weren’t Built to Stay in the Harbour", "art-of-becoming"],
  ["004", "The Architect of Things Unseen", "lessons-from-building"],
  ["005", "You Don’t Have to Have It Figured Out", "art-of-becoming"],
  ["006", "The Weight of Wanting More", "ideas-worth-wrestling"],
  ["007", "What Would Tomorrow’s You Want?", "art-of-becoming"],
  ["008", "The Bigger the Dragon", "lessons-from-building"],
  ["009", "Who Are We Becoming Together?", "human-experience"],
  ["010", "What If Success Isn’t the Destination?", "ideas-worth-wrestling"],
  ["011", "The Things That Don’t Go According to Plan", "lessons-from-building"],
  ["012", "A Life Worth Remembering", "life-between"],
];

async function main() {
  for (const p of PILLAR_SEED) {
    await db.insert(pillars).values(p).onConflictDoUpdate({ target: pillars.slug, set: { name: p.name, description: p.description, sortOrder: p.sortOrder } });
  }
  const pillarRows = await db.select().from(pillars);
  const pid = (slug: string) => pillarRows.find((p) => p.slug === slug)?.id ?? null;

  await db
    .insert(publicationSettings)
    .values({
      id: 1,
      description: "Thoughts on building, becoming, and making something meaningful of the life we’re given. A personal letter from Col.",
    })
    .onConflictDoNothing();

  for (const [num, title, pillar] of CONCEPTS) {
    const [existing] = await db.select({ id: ideas.id }).from(ideas).where(eq(ideas.conceptNumber, num));
    if (existing) continue;
    await db.insert(ideas).values({
      conceptNumber: num,
      workingTitle: title,
      primaryPillarId: pid(pillar),
      stage: num === "001" ? "exploring" : "captured",
      notes: "Launch concept from the original editorial plan. Title only: no personal material captured yet. The pillar is a suggestion.",
    });
  }

  // Issue 001 opens ready for an AI-assisted interview.
  const [first] = await db.select().from(ideas).where(eq(ideas.conceptNumber, "001"));
  const [session] = await db.select().from(aiSessions).where(eq(aiSessions.ideaId, first.id));
  if (!session) {
    const [s] = await db.insert(aiSessions).values({ ideaId: first.id, stage: "interview" }).returning();
    await db.insert(aiMessages).values({
      sessionId: s.id,
      role: "system_note",
      kind: "note",
      content:
        "This is a concept, not an article. There's no personal material yet, so start with the interview: the AI will ask up to three questions at a time about your real experiences. Answer by typing or by voice.",
    });
  }

  console.log(`Seeded ${PILLAR_SEED.length} pillars and ${CONCEPTS.length} concepts.`);
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
