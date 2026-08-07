import {
  pgTable, uuid, text, integer, timestamp, jsonb, pgEnum,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./core";

export const blastStatus = pgEnum("blast_status", ["draft", "sending", "completed", "failed"]);

/**
 * One row per WhatsApp blast campaign. Individual recipient sends are fanned
 * out into message_outbox rows (channel = "whatsapp", campaignId = this row's
 * id) — this table just tracks the campaign-level intent and aggregate
 * progress. The actual send logic lives in src/modules/blast/.
 */
export const blastCampaigns = pgTable("blast_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  segment: text("segment").notNull(), // "all" | "gold" | "silver" | "bronze" | "lapsed_30"
  body: text("body").notNull(), // may contain {{name}} / {{tier}} / {{points}} merge fields
  mediaUrl: text("media_url"),
  status: blastStatus("status").notNull().default("draft"),
  audienceSize: integer("audience_size").notNull().default(0), // consenting members matched at send time
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  // OpenWA send-bulk batchIds this campaign was split across (>100 recipients -> multiple batches)
  providerBatchIds: jsonb("provider_batch_ids").$type<string[]>().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
});
