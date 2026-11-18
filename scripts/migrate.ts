import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, closeDb } from "../src/db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
