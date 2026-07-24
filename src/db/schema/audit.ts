import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

/**
 * Single unified trail for actions that need a "who did this and why" answer.
 * Deliberately generic (action/entityType/entityId/detail) rather than one
 * table per feature, so new audited actions don't need schema migrations.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  actorId: uuid("actor_id").references(() => users.id), // nullable: system-initiated actions
  action: text("action").notNull(), // "points.adjust" | "wallet.adjust" | "voucher.campaign" | "voucher.edit" | "user.role_change" | "user.create"
  entityType: text("entity_type").notNull(), // "member" | "voucher" | "user"
  entityId: uuid("entity_id"),
  detail: jsonb("detail").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** One row per org — small runtime-configurable settings (currently just the ESP provider choice). */
export const orgSettings = pgTable("org_settings", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id),
  espProvider: text("esp_provider").notNull().default("mock"), // "mock" | "console"
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
