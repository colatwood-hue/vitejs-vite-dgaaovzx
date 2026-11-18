/**
 * Create the studio owner from a terminal:
 *   npm run admin:create -- --email col@example.com --name "Col Atwood"
 * The password is read from ADMIN_PASSWORD or prompted (hidden).
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { closeDb } from "../src/db";
import { createUser, hasAnyUser } from "../src/lib/auth";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function promptHidden(q: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  rlAny._writeToOutput = (s: string) => {
    if (s.includes(q)) rlAny.output.write(s);
  };
  const answer = await rl.question(q);
  rl.close();
  stdout.write("\n");
  return answer;
}

async function main() {
  if ((await hasAnyUser()) && !process.argv.includes("--force-additional")) {
    console.error("A studio owner already exists. (Pass --force-additional to add another account.)");
    process.exit(1);
  }
  const email = arg("email");
  if (!email) throw new Error("Pass --email you@example.com");
  const password = process.env.ADMIN_PASSWORD || (await promptHidden("Password (12+ characters): "));
  const user = await createUser(email, password, arg("name") ?? "");
  console.log(`Created ${user.email}. Sign in at /studio/login.`);
  await closeDb();
}

main().catch(async (e) => {
  console.error((e as Error).message);
  await closeDb();
  process.exit(1);
});
