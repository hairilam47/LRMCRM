import {
  pgTable, uuid, text, timestamp, integer, jsonb, pgEnum,
} from "drizzle-orm/pg-core";
import { organizations, stores } from "./core";
import { loyaltyMembers } from "./loyalty";

export const identifierKind = pgEnum("identifier_kind", ["phone", "qr", "email", "card_hash", "none"]);

export const posTransactions = pgTable("pos_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  memberId: uuid("member_id").references(() => loyaltyMembers.id), // null => guest
  guestProfileId: uuid("guest_profile_id"),
  externalRef: text("external_ref").notNull(), // POS-side receipt no.
  identifierUsed: identifierKind("identifier_used").notNull().default("none"),
  grossSen: integer("gross_sen").notNull(),
  netSen: integer("net_sen").notNull(), // excl. tax/tip — loyalty math runs on this
  taxSen: integer("tax_sen").notNull().default(0),
  paymentMethod: text("payment_method").notNull().default("card"),
  rawPayload: jsonb("raw_payload"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posLineItems = pgTable("pos_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull().references(() => posTransactions.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  qty: integer("qty").notNull(),
  unitPriceSen: integer("unit_price_sen").notNull(),
});

/** Unmatched in-store customers, merged into contacts on later registration */
export const guestProfiles = pgTable("guest_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  hint: text("hint"), // partial card hash etc.
  mergedContactId: uuid("merged_contact_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ------------------------- Marketing / Messaging ------------------------- */

export const outboxStatus = pgEnum("outbox_status", ["queued", "sent_mock", "failed"]);

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(), // pos.completed | member.lapsed | lead.captured
  /** e.g. { boughtCategory: "coffee", neverCategory: "pastry" } or { lapsedDays: 30 } */
  condition: jsonb("condition").$type<Record<string, unknown>>().default({}),
  /** e.g. { type: "send", channel: "sms", template: "..." } or { type: "issue_voucher", voucherName: "..." } */
  action: jsonb("action").$type<Record<string, unknown>>().default({}),
  active: integer("active").notNull().default(1),
});

/**
 * The prototype's entire mailing subsystem — and the Phase-2 seam.
 * Production swaps the consumer: outbox row -> Redis queue -> ESP dispatcher.
 * Table shape stays identical.
 */
export const messageOutbox = pgTable("message_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  memberId: uuid("member_id"),
  leadId: uuid("lead_id"),
  channel: text("channel").notNull(), // sms | push | email
  subject: text("subject"),
  body: text("body").notNull(),
  ruleName: text("rule_name"),
  status: outboxStatus("status").notNull().default("queued"),
  scheduledFor: timestamp("scheduled_for"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
