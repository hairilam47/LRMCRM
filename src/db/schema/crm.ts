import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

export const leadStatus = pgEnum("lead_status", ["new", "mql", "sql", "converted", "lost"]);
export const activityType = pgEnum("activity_type", ["note", "call", "email", "task", "stage_move", "system"]);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  domain: text("domain"),
  industry: text("industry"),
  employeeBand: text("employee_band"), // "1-10" | "11-50" | ...
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  accountId: uuid("account_id").references(() => accounts.id), // nullable: B2C loyalty contacts
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  /**
   * Explicit WhatsApp marketing opt-in. Defaults false — a contact must
   * actively consent before a blast campaign can target them. See
   * src/modules/blast/audience.ts, which filters on this column.
   */
  waConsent: boolean("wa_consent").notNull().default(false),
  waConsentAt: timestamp("wa_consent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  accountId: uuid("account_id").references(() => accounts.id),
  name: text("name").notNull(),
  email: text("email"),
  company: text("company"),
  title: text("title"),
  source: text("source"), // webform | referral | event
  status: leadStatus("status").notNull().default("new"),
  fitScore: integer("fit_score").notNull().default(0),
  intentScore: integer("intent_score").notNull().default(0),
  ownerId: uuid("owner_id").references(() => users.id),
  firstOutreachAt: timestamp("first_outreach_at"), // speed-to-lead
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Append-only log of every scoring input applied to a lead */
export const leadScoreEvents = pgTable("lead_score_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id),
  kind: text("kind").notNull(), // fit | intent
  reason: text("reason").notNull(), // "C-suite title", "Pricing page visit"
  delta: integer("delta").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  /** MEDDPICC-ready gate checklist: [{ key, label, required }] */
  gateRequirements: jsonb("gate_requirements").$type<{ key: string; label: string; required: boolean }[]>().default([]),
  isWon: integer("is_won").notNull().default(0), // 0 | 1
});

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id),
  stageId: uuid("stage_id").notNull().references(() => pipelineStages.id),
  accountId: uuid("account_id").references(() => accounts.id),
  name: text("name").notNull(),
  amountSen: integer("amount_sen").notNull().default(0),
  currency: text("currency").notNull().default("MYR"),
  ownerId: uuid("owner_id").references(() => users.id),
  gateState: jsonb("gate_state").$type<Record<string, boolean>>().default({}),
  stageEnteredAt: timestamp("stage_entered_at").defaultNow().notNull(), // stale-deal detection
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Polymorphic activity timeline (leads, deals, accounts, contacts) */
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  entityType: text("entity_type").notNull(), // lead | deal | account | contact
  entityId: uuid("entity_id").notNull(),
  type: activityType("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  dueAt: timestamp("due_at"), // SLA tasks
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
