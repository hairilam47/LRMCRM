import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  // Only used by `drizzle-kit migrate` against a real Postgres (Neon, etc).
  // Local dev on PGlite doesn't need this — PGlite auto-migrates itself.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
