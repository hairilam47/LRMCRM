/**
 * Seed: Kopi Lima Group — 3 stores, 30 members with 90 days of POS history,
 * leads, a B2B pipeline, automation rules. Run: npm run db:seed
 * History is generated through the REAL ingestion pipeline so ledgers,
 * rollups, stamps and tiers are internally consistent, not faked.
 */
import { getDb, schema } from "./index";
import { hashPassword } from "@/lib/auth";
import { ingestPosTransaction } from "@/modules/pos/ingest";
import { captureLead } from "@/modules/crm/scoring";
import { eq, sql } from "drizzle-orm";

const {
  organizations, users, stores, catalogItems,
  loyaltyPrograms, loyaltyTiers, loyaltyMembers, stampCards,
  vouchers, contacts, accounts, pipelines, pipelineStages, deals,
  automationRules, posTransactions, referrals, prepaidPacks,
} = schema;

const rand = mulberry32(20260722);
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

async function main() {
  const db = await getDb();

  const [existing] = await db.select().from(organizations).limit(1);
  if (existing) {
    console.log("Already seeded — delete .pglite/ to reseed.");
    return;
  }

  console.log("Seeding Kopi Lima Group…");

  const [org] = await db.insert(organizations).values({ name: "Kopi Lima Group", slug: "kopi-lima" }).returning();

  const userRows = await db.insert(users).values([
    { orgId: org.id, email: "admin@kopilima.my", name: "Lam", role: "admin", passwordHash: hashPassword("demo1234"), isRoutable: false },
    { orgId: org.id, email: "farah@kopilima.my", name: "Farah Iskandar", role: "sales", passwordHash: hashPassword("demo1234"), isRoutable: true },
    { orgId: org.id, email: "daniel@kopilima.my", name: "Daniel Wong", role: "sales", passwordHash: hashPassword("demo1234"), isRoutable: true },
    { orgId: org.id, email: "mei@kopilima.my", name: "Mei Ling", role: "marketing", passwordHash: hashPassword("demo1234"), isRoutable: false },
    { orgId: org.id, email: "aiman@kopilima.my", name: "Aiman Rosli", role: "store_ops", passwordHash: hashPassword("demo1234"), isRoutable: false },
  ]).returning();
  const farah = userRows.find((u) => u.email === "farah@kopilima.my")!;
  const daniel = userRows.find((u) => u.email === "daniel@kopilima.my")!;

  const storeRows = await db.insert(stores).values([
    { orgId: org.id, name: "Kopi Lima · Bangsar", code: "KL-BGS", city: "Kuala Lumpur" },
    { orgId: org.id, name: "Kopi Lima · TTDI", code: "KL-TTDI", city: "Kuala Lumpur" },
    { orgId: org.id, name: "Kopi Lima · Melaka Raya", code: "KL-MLK", city: "Melaka" },
  ]).returning();

  const menu = [
    { sku: "BEV-012", name: "Gula Melaka Latte", category: "coffee", priceSen: 1400, emoji: "☕" },
    { sku: "BEV-001", name: "Kopi O Kosong", category: "coffee", priceSen: 600, emoji: "☕" },
    { sku: "BEV-020", name: "Iced Pandan Matcha", category: "coffee", priceSen: 1600, emoji: "🍵" },
    { sku: "PST-004", name: "Kaya Croissant", category: "pastry", priceSen: 950, emoji: "🥐" },
    { sku: "PST-010", name: "Pandan Butter Bun", category: "pastry", priceSen: 700, emoji: "🥯" },
    { sku: "BWL-001", name: "Signature Laksa Bowl", category: "bowl", priceSen: 1800, emoji: "🍜" },
    { sku: "BWL-003", name: "Nasi Lemak Bowl", category: "bowl", priceSen: 1650, emoji: "🍛" },
    { sku: "DST-002", name: "Cendol Cup", category: "dessert", priceSen: 850, emoji: "🍧" },
  ];
  await db.insert(catalogItems).values(menu.map((m) => ({ orgId: org.id, ...m })));

  const [program] = await db.insert(loyaltyPrograms).values({
    orgId: org.id, name: "Kopi Lima Rewards",
    earnRatePerRm: 10, cashbackBps: 300, pointValueSen: 10,
  }).returning();

  const tierRows = await db.insert(loyaltyTiers).values([
    { programId: program.id, name: "Bronze", position: 1, minAnnualSpendSen: 0, multiplierPct: 100, perks: ["Birthday RM5 voucher"] },
    { programId: program.id, name: "Silver", position: 2, minAnnualSpendSen: 35_000, multiplierPct: 120, perks: ["Birthday RM5 voucher", "Free size upgrade"] },
    { programId: program.id, name: "Gold", position: 3, minAnnualSpendSen: 80_000, multiplierPct: 150, perks: ["Birthday RM10 voucher", "Free size upgrade", "Priority queue"] },
  ]).returning();
  const bronze = tierRows.find((t) => t.name === "Bronze")!;

  await db.insert(stampCards).values({
    programId: program.id, name: "Signature Bowls", qualifyingCategory: "bowl",
    goal: 8, rewardLabel: "Free Signature Bowl",
  });

  await db.insert(vouchers).values([
    { orgId: org.id, name: "Free Croissant with any Coffee", kind: "free_item", valueSen: 0, minSpendSen: 1000, skuRestrictions: ["PST-004"], validDays: 7 },
    { orgId: org.id, name: "RM 5 Win-Back", kind: "fixed", valueSen: 500, minSpendSen: 1500, validDays: 7 },
  ]);

  await db.insert(prepaidPacks).values([
    { orgId: org.id, name: "10-Coffee Pack", itemCategory: "coffee", quantity: 10, priceSen: 11_000 },
    { orgId: org.id, name: "5-Bowl Lunch Pack", itemCategory: "bowl", quantity: 5, priceSen: 7_500 },
  ]);

  await db.insert(automationRules).values([
    {
      orgId: org.id, name: "Post-visit thank you", trigger: "pos.completed",
      condition: {}, action: { channel: "sms", delayMinutes: 15, template: "Thanks for visiting, {name}! You earned {points} pts ({points_value}). Balance: {balance} pts." },
    },
    {
      orgId: org.id, name: "Coffee → Pastry cross-sell", trigger: "pos.completed",
      condition: { boughtCategory: "coffee", neverCategory: "pastry" },
      action: { voucherName: "Free Croissant with any Coffee", template: "A free croissant is waiting with your next coffee, {name}!" },
    },
    {
      orgId: org.id, name: "30-day win-back", trigger: "member.lapsed",
      condition: { lapsedDays: 30 },
      action: { voucherName: "RM 5 Win-Back", template: "We miss you! RM 5 off your next visit — in your wallet, valid 7 days." },
    },
  ]);

  /* ---- Members: contacts + loyalty enrolment ---- */
  const firstNames = ["Nurul", "Jason", "Priya", "Wan", "Ahmad", "Mei", "Siti", "Kavitha", "Daniel", "Aisyah", "Hafiz", "Grace", "Farid", "Li Wei", "Zara", "Ramesh", "Alia", "Marcus", "Intan", "Kelvin", "Sofea", "Arjun", "Nadia", "Ben", "Hana", "Vikram", "Emily", "Syafiq", "Chloe", "Iqbal"];
  const lastNames = ["Aisyah", "Tan", "Krishnan", "Maisarah", "Rahman", "Chen", "Aminah", "Pillai", "Lee", "Zainal", "Osman", "Lim", "Kamal", "Ong", "Hashim", "Nair", "Bakar", "Yap", "Salleh", "Choo", "Idris", "Menon", "Halim", "Foo", "Yusof", "Rao", "Teh", "Azman", "Goh", "Shah"];

  const memberRows: { id: string; phone: string; name: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const name = `${firstNames[i]} ${lastNames[i]}`;
    const phone = `+6012${String(3000000 + i * 1111).padStart(7, "0")}`;
    const email = `${firstNames[i].toLowerCase().replace(" ", "")}.${lastNames[i].toLowerCase().replace(" ", "")}@gmail.com`;
    const [contact] = await db.insert(contacts).values({ orgId: org.id, name, email, phone }).returning();
    const [member] = await db.insert(loyaltyMembers).values({
      orgId: org.id, programId: program.id, contactId: contact.id,
      tierId: bronze.id, qrToken: `LYA-${(1000 + i).toString(16).toUpperCase()}-${i}`,
      joinedAt: new Date(Date.now() - int(60, 400) * 24 * 3600 * 1000),
    }).returning();
    memberRows.push({ id: member.id, phone, name });
  }

  // one referral pair for the demo
  await db.insert(referrals).values({
    orgId: org.id, referrerMemberId: memberRows[0].id, refereeMemberId: memberRows[1].id,
    code: "NURUL-INVITE", rewardStatus: "granted",
  });

  /* ---- 90 days of POS history via the REAL pipeline ---- */
  console.log("Generating POS history through the real ingestion pipeline…");
  let txCount = 0;
  for (let m = 0; m < memberRows.length; m++) {
    // heavier customers earlier in the list -> natural tier spread
    const visits = m < 4 ? int(28, 40) : m < 12 ? int(10, 20) : int(2, 8);
    for (let v = 0; v < visits; v++) {
      const items: { sku: string; name: string; category: string; qty: number; unit_price_sen: number }[] = [];
      const it1 = pick(menu);
      items.push({ sku: it1.sku, name: it1.name, category: it1.category, qty: int(1, 2), unit_price_sen: it1.priceSen });
      if (rand() > 0.45) {
        const it2 = pick(menu.filter((x) => x.sku !== it1.sku));
        items.push({ sku: it2.sku, name: it2.name, category: it2.category, qty: 1, unit_price_sen: it2.priceSen });
      }
      const net = items.reduce((s, li) => s + li.qty * li.unit_price_sen, 0);
      const tax = Math.round(net * 0.06);
      const res = await ingestPosTransaction({
        store_code: pick(storeRows).code,
        external_ref: `SEED-${String(txCount + 1).padStart(5, "0")}`,
        identifier: { kind: "phone", value: memberRows[m].phone },
        payment_method: pick(["card", "ewallet", "cash", "qr_pay"]),
        gross_sen: net + tax, tax_sen: tax,
        line_items: items,
      });
      txCount++;
      if (!res.matched) throw new Error("seed identifier resolution failed");
    }
  }
  // backdate transaction + last-visit timestamps so lapse/win-back has targets
  const allTx = await db.select().from(posTransactions);
  for (const t of allTx) {
    const daysAgo = int(0, 90);
    const when = new Date(Date.now() - daysAgo * 24 * 3600 * 1000 - int(0, 86_400_000));
    await db.update(posTransactions).set({ occurredAt: when, createdAt: when }).where(eq(posTransactions.id, t.id));
  }
  // recompute last_visit_at from backdated data; leave ~5 members lapsed >30d
  const members = await db.select().from(loyaltyMembers);
  for (let i = 0; i < members.length; i++) {
    const [latest] = await db.select({ mx: sql<Date>`max(${posTransactions.occurredAt})` })
      .from(posTransactions).where(eq(posTransactions.memberId, members[i].id));
    let lastVisit = latest?.mx ? new Date(latest.mx) : null;
    if (i >= 25 && lastVisit) lastVisit = new Date(Date.now() - int(35, 70) * 24 * 3600 * 1000);
    await db.update(loyaltyMembers).set({ lastVisitAt: lastVisit }).where(eq(loyaltyMembers.id, members[i].id));
  }

  /* ---- A few unmatched guest transactions ---- */
  for (let g = 0; g < 4; g++) {
    const it = pick(menu);
    const net = it.priceSen * int(1, 2);
    const tax = Math.round(net * 0.06);
    await ingestPosTransaction({
      store_code: pick(storeRows).code,
      external_ref: `SEED-G${g + 1}`,
      identifier: { kind: "none", value: "" },
      payment_method: "cash",
      gross_sen: net + tax, tax_sen: tax,
      line_items: [{ sku: it.sku, name: it.name, category: it.category, qty: 1, unit_price_sen: net }],
    });
  }

  /* ---- B2B: accounts, pipeline, deals ---- */
  const [cateringPipeline] = await db.insert(pipelines).values({ orgId: org.id, name: "Corporate Catering" }).returning();
  const stageDefs = [
    { name: "Discovery", position: 1, gateRequirements: [{ key: "metrics", label: "Metrics captured", required: true }, { key: "champion", label: "Champion identified", required: true }] },
    { name: "Qualified", position: 2, gateRequirements: [{ key: "economic_buyer", label: "Economic buyer met", required: true }] },
    { name: "Proposal", position: 3, gateRequirements: [{ key: "decision_criteria", label: "Decision criteria documented", required: true }] },
    { name: "Negotiation", position: 4, gateRequirements: [] },
    { name: "Closed-won", position: 5, gateRequirements: [], isWon: 1 },
  ];
  const stageRows = await db.insert(pipelineStages).values(
    stageDefs.map((s) => ({ pipelineId: cateringPipeline.id, ...s }))
  ).returning();

  const b2b = [
    { acc: "Maybank Towers Facilities", deal: "Daily coffee bar — HQ L32", amount: 4_800_000, stage: "Proposal", staleDays: 9, owner: farah },
    { acc: "Axiata Digital", deal: "Weekly team breakfast program", amount: 2_600_000, stage: "Qualified", staleDays: 2, owner: daniel },
    { acc: "Sunway University", deal: "Campus café licensing", amount: 9_600_000, stage: "Discovery", staleDays: 4, owner: farah },
    { acc: "PETRONAS Leadership Centre", deal: "Event catering retainer", amount: 5_400_000, stage: "Negotiation", staleDays: 1, owner: daniel },
    { acc: "Melaka Tourism Board", deal: "Heritage trail F&B partner", amount: 3_200_000, stage: "Closed-won", staleDays: 0, owner: farah },
    { acc: "Grab Malaysia", deal: "Office pantry subscription", amount: 2_100_000, stage: "Discovery", staleDays: 12, owner: daniel },
    { acc: "RHB Corporate Services", deal: "Branch café refresh program", amount: 3_800_000, stage: "Closed-won", staleDays: 0, owner: daniel },
    { acc: "IOI Properties Group", deal: "Mall kiosk franchise rollout", amount: 6_200_000, stage: "Closed-won", staleDays: 0, owner: farah },
  ];
  for (const d of b2b) {
    const [acc] = await db.insert(accounts).values({ orgId: org.id, name: d.acc, industry: "Corporate" }).returning();
    const stage = stageRows.find((s) => s.name === d.stage)!;
    await db.insert(deals).values({
      orgId: org.id, pipelineId: cateringPipeline.id, stageId: stage.id, accountId: acc.id,
      name: d.deal, amountSen: d.amount, ownerId: d.owner.id,
      stageEnteredAt: new Date(Date.now() - d.staleDays * 24 * 3600 * 1000),
    });
  }

  /* ---- Inbound leads through the real scoring engine ---- */
  const leadSeeds = [
    { name: "Sarah Voon", email: "sarah.voon@sunrisemall.my", company: "Sunrise Mall Holdings Bhd", title: "VP Operations", behaviors: ["pricing_page", "demo_request"] },
    { name: "Imran Hakim", email: "imran@tealive-partner.my", company: "Bubble Tea Retail Sdn Bhd", title: "Franchise Manager", behaviors: ["whitepaper"] },
    { name: "Jessica Ling", email: "jl@klccdining.com", company: "KLCC Dining Group", title: "Chief Marketing Officer", behaviors: ["pricing_page", "demo_request"] },
    { name: "Tommy Ng", email: "tommy@indiecafe.my", company: "Indie Cafe", title: "Owner", behaviors: ["whitepaper"] },
    { name: "Aina Zulkifli", email: "aina@rhbcorp.my", company: "RHB Corporation Berhad", title: "Director, Employee Experience", behaviors: ["demo_request"] },
    { name: "Marcus Yeo", email: "myeo@fnbventures.sg", company: "F&B Ventures Enterprise", title: "CEO", behaviors: ["pricing_page"] },
  ];
  for (const l of leadSeeds) {
    await captureLead({ orgId: org.id, source: "webform", ...l });
  }

  console.log(`Seed complete: ${txCount + 4} POS transactions, 30 members, 6 leads, ${b2b.length} deals.`);
  console.log("Login: admin@kopilima.my / demo1234");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
