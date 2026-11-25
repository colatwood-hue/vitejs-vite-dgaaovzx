/**
 * One-command local beta: `npm run beta`
 *
 *  1. Creates .env (if missing) with safe local defaults and fresh secrets.
 *     No API keys: email is SIMULATED, AI and transcription are off.
 *  2. Checks the database is reachable (docker compose, or your own Postgres).
 *  3. Applies migrations and seeds pillars + the 12 launch concepts.
 *  4. Prints where to go next.
 *
 * Safe to run repeatedly: it never deletes data and never overwrites .env.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import postgres from "postgres";

const ENV = ".env";
const DEFAULT_DB = "postgres://dash:dash@localhost:5433/thedash";

function words(n: number) {
  const list = ["harbour", "lantern", "maple", "river", "summit", "ember", "cedar", "compass", "meadow", "anchor", "north", "letter"];
  return Array.from({ length: n }, () => list[randomBytes(1)[0] % list.length]).join("-") + "-" + randomBytes(2).toString("hex");
}

function ensureEnv() {
  if (existsSync(ENV)) {
    console.log("✓ Using your existing .env (not modified).");
    return;
  }
  let text = readFileSync(".env.example", "utf8");
  const set = (key: string, value: string) => {
    text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  };
  set("DATABASE_URL", DEFAULT_DB);
  set("APP_URL", "http://localhost:3000");
  set("AUTH_SECRET", randomBytes(32).toString("hex"));
  set("SETUP_TOKEN", words(3));
  set("EMAIL_PROVIDER", "console");
  set("ALLOW_BROADCASTS", "false");
  set("STORAGE_PROVIDER", "db");
  set("CRON_SECRET", randomBytes(16).toString("hex"));
  writeFileSync(ENV, text, { mode: 0o600 });
  console.log("✓ Created .env for the local beta (simulated email, no API keys).");
}

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(ENV, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

async function waitForDb(url: string) {
  for (let i = 0; i < 20; i++) {
    const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
    try {
      await sql`select 1`;
      await sql.end();
      return true;
    } catch {
      await sql.end({ timeout: 1 }).catch(() => {});
      if (i === 0) process.stdout.write("… waiting for the database");
      else process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return false;
}

async function main() {
  ensureEnv();
  const env = readEnv();
  const url = env.DATABASE_URL || DEFAULT_DB;

  if (!(await waitForDb(url))) {
    console.error(`\n✗ Can't reach the database at ${url.replace(/:[^:@/]+@/, ":•••@")}.`);
    console.error("  Start it with:  docker compose up -d");
    console.error("  (or point DATABASE_URL in .env at your own Postgres) and run `npm run beta` again.");
    process.exit(1);
  }
  console.log("\n✓ Database reachable.");

  execSync("npm run --silent db:migrate", { stdio: "inherit" });
  execSync("npm run --silent db:seed", { stdio: "inherit" });

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  await sql.end();

  const base = env.APP_URL || "http://localhost:3000";
  console.log("\n────────────────────────────────────────────────────────");
  console.log(" The Dash: local beta is ready");
  console.log("────────────────────────────────────────────────────────");
  console.log(" Email:          SIMULATED (recorded, never delivered)");
  console.log(" AI partner:     off (add ANTHROPIC_API_KEY to .env to turn on)");
  console.log(" Transcription:  off (voice notes are saved, not transcribed)");
  if (n === 0) {
    console.log(`\n Next: open ${base}/studio/setup`);
    console.log(` Setup token:    ${env.SETUP_TOKEN}`);
  } else {
    console.log(`\n Studio:  ${base}/studio`);
  }
  console.log(` Public site:    ${base}`);
  console.log("────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
