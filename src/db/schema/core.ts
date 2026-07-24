import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "sales", "marketing", "store_ops"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRole("role").notNull().default("sales"),
  passwordHash: text("password_hash").notNull(),
  // round-robin cursor support for lead routing
  isRoutable: boolean("is_routable").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  code: text("code").notNull(), // external POS location id
  city: text("city"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Menu / SKU catalog — powers the POS simulator and stamp-card qualification */
export const catalogItems = pgTable("catalog_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // coffee | pastry | bowl | ...
  priceSen: integer("price_sen").notNull(), // all money as integer sen
  emoji: text("emoji"),
  active: boolean("active").notNull().default(true),
});
