import "dotenv/config";
import { afterAll, beforeAll, vi } from "vitest";

// Tests run against a dedicated database; never the development one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://dash:dash@localhost:5432/thedash_test";
process.env.EMAIL_PROVIDER = "console";
process.env.ALLOW_BROADCASTS = "false";
process.env.APP_URL = "https://thedash.test";
(process.env as Record<string, string>).NODE_ENV = "test";

// next/headers & next/navigation are only usable inside a request; stub them.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.execute(sql`
    truncate users, sessions, rate_limits, pillars, audio_assets, thoughts, thought_pillars, ideas,
      idea_thoughts, idea_links, ai_sessions, ai_messages, issues, issue_revisions, issue_assets,
      subscribers, consent_records, subscriber_preferences, suppressions, campaigns, send_events,
      engagement_events, reader_feedback, repurposed_content, page_views, publication_settings,
      integration_status restart identity cascade
  `);
});

afterAll(async () => {
  const { closeDb } = await import("@/db");
  await closeDb();
});
