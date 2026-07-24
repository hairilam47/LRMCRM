/**
 * Applies pending migrations to a real Postgres database (Neon, etc).
 * The PGlite path auto-migrates inside getDb() already — this script
 * covers the DATABASE_URL path, which intentionally does NOT auto-migrate
 * on every request (you don't want a serverless function racing itself to
 * run schema migrations). Run this once per deploy, before seeding.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("No DATABASE_URL set — skipping (local dev uses PGlite, which auto-migrates).");
    return;
  }
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");

  const client = postgres(url, { max: 1 }); // single connection for migrations
  const db = drizzle(client);
  console.log("Applying migrations to", new URL(url).host, "…");
  await migrate(db, { migrationsFolder: "src/db/migrations" });
  console.log("Migrations applied.");
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
