import {
  pgTable, uuid, text, timestamp, integer, boolean, jsonb, pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./core";
import { contacts } from "./crm";

export const pointsReason = pgEnum("points_reason", ["earn", "redeem", "expire", "adjust", "referral", "tier_bonus"]);
export const walletReason = pgEnum("wallet_reason", ["reload", "bonus", "spend", "refund", "cashback", "adjust"]);
export const voucherStatus = pgEnum("voucher_status", ["issued", "redeemed", "expired", "revoked"]);

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  /** points earned per RM 1 net spend (before tier multiplier) */
  earnRatePerRm: integer("earn_rate_per_rm").notNull().default(10),
  /** cashback into wallet, basis points of net (300 = 3%) */
  cashbackBps: integer("cashback_bps").notNull().default(0),
  /** 1 point redemption value in sen (10 pts = RM1 -> pointValueSen = 10) */
  pointValueSen: integer("point_value_sen").notNull().default(10),
  active: boolean("active").notNull().default(true),
});

export const loyaltyTiers = pgTable("loyalty_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").notNull().references(() => loyaltyPrograms.id),
  name: text("name").notNull(), // Bronze | Silver | Gold
  position: integer("position").notNull(),
  minAnnualSpendSen: integer("min_annual_spend_sen").notNull().default(0),
  /** points multiplier in percent (150 = ×1.5) */
  multiplierPct: integer("multiplier_pct").notNull().default(100),
  perks: jsonb("perks").$type<string[]>().default([]),
});

export const loyaltyMembers = pgTable("loyalty_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  programId: uuid("program_id").notNull().references(() => loyaltyPrograms.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  tierId: uuid("tier_id").references(() => loyaltyTiers.id),
  qrToken: text("qr_token").notNull().unique(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  /* ---- derived rollup caches; ledgers stay source of truth ---- */
  ltvSen: integer("ltv_sen").notNull().default(0),
  annualSpendSen: integer("annual_spend_sen").notNull().default(0),
  totalVisits: integer("total_visits").notNull().default(0),
  aovSen: integer("aov_sen").notNull().default(0),
  lastVisitAt: timestamp("last_visit_at"),
});

/** Append-only. Balance = SUM(delta). Never mutate rows. */
export const pointsLedger = pgTable("points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => loyaltyMembers.id),
  delta: integer("delta").notNull(),
  reason: pointsReason("reason").notNull(),
  note: text("note"),
  posTransactionId: uuid("pos_transaction_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Append-only stored-value + cashback ledger, in sen. */
export const walletLedger = pgTable("wallet_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => loyaltyMembers.id),
  deltaSen: integer("delta_sen").notNull(),
  reason: walletReason("reason").notNull(),
  note: text("note"),
  posTransactionId: uuid("pos_transaction_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stampCards = pgTable("stamp_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id").notNull().references(() => loyaltyPrograms.id),
  name: text("name").notNull(), // "Signature Bowls"
  qualifyingCategory: text("qualifying_category").notNull(), // catalog category
  goal: integer("goal").notNull(), // buy 8
  rewardLabel: text("reward_label").notNull(), // "Free Signature Bowl"
  active: boolean("active").notNull().default(true),
});

export const stampProgress = pgTable("stamp_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  stampCardId: uuid("stamp_card_id").notNull().references(() => stampCards.id),
  memberId: uuid("member_id").notNull().references(() => loyaltyMembers.id),
  count: integer("count").notNull().default(0),
  completedCycles: integer("completed_cycles").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // fixed | percent | free_item
  valueSen: integer("value_sen").notNull().default(0), // fixed amount or percent (as int)
  minSpendSen: integer("min_spend_sen").notNull().default(0),
  skuRestrictions: jsonb("sku_restrictions").$type<string[]>().default([]),
  validDays: integer("valid_days").notNull().default(7),
});

export const voucherIssuances = pgTable("voucher_issuances", {
  id: uuid("id").primaryKey().defaultRandom(),
  voucherId: uuid("voucher_id").notNull().references(() => vouchers.id),
  memberId: uuid("member_id").notNull().references(() => loyaltyMembers.id),
  status: voucherStatus("status").notNull().default("issued"),
  sourceNote: text("source_note"), // "cross-sell trigger", "win-back sweep"
  expiresAt: timestamp("expires_at").notNull(),
  redeemedTxId: uuid("redeemed_tx_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const prepaidPacks = pgTable("prepaid_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(), // "10 Coffees"
  itemCategory: text("item_category").notNull(),
  quantity: integer("quantity").notNull(),
  priceSen: integer("price_sen").notNull(),
});

export const prepaidPackPurchases = pgTable("prepaid_pack_purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: uuid("pack_id").notNull().references(() => prepaidPacks.id),
  memberId: uuid("member_id").notNull().references(() => loyaltyMembers.id),
  remaining: integer("remaining").notNull(), // item decrement ledger
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  referrerMemberId: uuid("referrer_member_id").notNull().references(() => loyaltyMembers.id),
  refereeMemberId: uuid("referee_member_id").references(() => loyaltyMembers.id),
  code: text("code").notNull().unique(),
  rewardStatus: text("reward_status").notNull().default("pending"), // pending | granted
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
