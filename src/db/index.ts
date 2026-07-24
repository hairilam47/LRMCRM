/**
 * Dual-driver database client.
 * - DATABASE_URL set   -> postgres-js against Neon/any Postgres (deploys)
 * - DATABASE_URL unset -> embedded PGlite in .pglite/ (zero-setup local dev)
 * Both expose the same drizzle API, transactions included.
 */
import * as schema from "./schema";

type DB = ReturnType<typeof buildPg> | Awaited<ReturnType<typeof buildPglite>>;

function buildPg(url: string) {
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  const postgres = require("postgres") as typeof import("postgres");
  const client = postgres(url, { max: 5 });
  return drizzle(client, { schema });
}

async function buildPglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const path = await import("node:path");
  const client = new PGlite(path.join(process.cwd(), ".pglite"));
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  return db;
}

const g = globalThis as unknown as { __loyaDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!g.__loyaDb) {
    g.__loyaDb = process.env.DATABASE_URL
      ? Promise.resolve(buildPg(process.env.DATABASE_URL))
      : buildPglite();
  }
  return g.__loyaDb;
}

export { schema };
