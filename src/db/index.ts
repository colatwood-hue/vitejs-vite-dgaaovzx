import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __dashSql?: postgres.Sql; __dashDb?: DB };

function connect(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    prepare: !/pgbouncer=true|-pooler\./.test(url),
    onnotice: () => {},
  });
  globalForDb.__dashSql = client;
  return drizzle(client, { schema });
}

/** Lazily-initialised shared connection (survives Next.js dev hot reloads). */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    globalForDb.__dashDb ??= connect();
    const value = Reflect.get(globalForDb.__dashDb, prop);
    return typeof value === "function" ? value.bind(globalForDb.__dashDb) : value;
  },
});

export async function closeDb() {
  await globalForDb.__dashSql?.end({ timeout: 5 });
  globalForDb.__dashSql = undefined;
  globalForDb.__dashDb = undefined;
}

export { schema };
