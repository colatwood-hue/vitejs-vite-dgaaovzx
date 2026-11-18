import { asc } from "drizzle-orm";
import { db } from "@/db";
import { pillars } from "@/db/schema";

export const PILLAR_SEED = [
  { slug: "art-of-becoming", name: "The Art of Becoming", description: "Identity, ambition, courage, discipline, possibility, and human potential.", sortOrder: 1 },
  { slug: "lessons-from-building", name: "Lessons from Building", description: "Entrepreneurship, risk, responsibility, leadership, decisions, and lessons from creating things in the real world.", sortOrder: 2 },
  { slug: "human-experience", name: "The Human Experience", description: "Love, relationships, friendship, loss, belonging, forgiveness, and connection.", sortOrder: 3 },
  { slug: "ideas-worth-wrestling", name: "Ideas Worth Wrestling With", description: "Books, philosophy, faith, conversations, opposing perspectives, questions, and evolving beliefs.", sortOrder: 4 },
  { slug: "life-between", name: "The Life Between", description: "Adventure, gratitude, meaningful experiences, curiosity, and learning to appreciate the present.", sortOrder: 5 },
];

export async function allPillars() {
  return db.select().from(pillars).orderBy(asc(pillars.sortOrder));
}
