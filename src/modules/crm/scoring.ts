import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { leads, leadScoreEvents, users, activities, messageOutbox } = schema;

export type LeadCaptureInput = {
  orgId: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  source?: string;
  behaviors?: string[]; // "pricing_page" | "demo_request" | "whitepaper"
};

/* Spec §4 Phase 2 scoring model */
const FIT_RULES: { test: (i: LeadCaptureInput) => boolean; reason: string; delta: number }[] = [
  { test: (i) => /chief|ceo|cfo|coo|cto|cmo|vp|vice president|director/i.test(i.title ?? ""), reason: "C-suite / VP title", delta: 25 },
  { test: (i) => /group|holdings|berhad|bhd|sdn bhd|corporation|enterprise/i.test(i.company ?? ""), reason: "Enterprise company signal", delta: 20 },
  { test: (i) => /f&b|food|cafe|restaurant|retail|hospitality/i.test(i.company ?? ""), reason: "Preferred industry match", delta: 5 },
];
const INTENT_RULES: Record<string, { reason: string; delta: number }> = {
  pricing_page: { reason: "Pricing page visit", delta: 15 },
  demo_request: { reason: "Product demo request", delta: 30 },
  whitepaper: { reason: "Whitepaper download", delta: 5 },
};

export const SQL_THRESHOLD = 70;

export async function captureLead(input: LeadCaptureInput) {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    // §4 Phase 1: dedup by email
    const [existing] = await tx.select().from(leads)
      .where(and(eq(leads.orgId, input.orgId), eq(leads.email, input.email.toLowerCase())));
    if (existing) {
      return { lead: existing, deduped: true as const, routed: null };
    }

    const [lead] = await tx.insert(leads).values({
      orgId: input.orgId,
      name: input.name,
      email: input.email.toLowerCase(),
      company: input.company,
      title: input.title,
      source: input.source ?? "webform",
    }).returning();

    let fit = 0, intent = 0;
    for (const rule of FIT_RULES) {
      if (rule.test(input)) {
        fit += rule.delta;
        await tx.insert(leadScoreEvents).values({ leadId: lead.id, kind: "fit", reason: rule.reason, delta: rule.delta });
      }
    }
    for (const b of input.behaviors ?? []) {
      const r = INTENT_RULES[b];
      if (r) {
        intent += r.delta;
        await tx.insert(leadScoreEvents).values({ leadId: lead.id, kind: "intent", reason: r.reason, delta: r.delta });
      }
    }
    fit = Math.min(fit, 50);
    intent = Math.min(intent, 50);
    const total = fit + intent;

    let routed: { owner: string; sla: string } | null = null;
    if (total >= SQL_THRESHOLD) {
      // round-robin: routable user with the fewest open SLA tasks
      const reps = await tx.select({
        user: users,
        open: sql<number>`(select count(*) from ${activities} a where a.assignee_id = ${users.id} and a.type = 'task' and a.due_at > now())`,
      }).from(users)
        .where(and(eq(users.orgId, input.orgId), eq(users.isRoutable, true)))
        .orderBy(asc(sql`2`));
      const rep = reps[0]?.user;
      const due = new Date(Date.now() + 15 * 60_000);
      if (rep) {
        await tx.insert(activities).values({
          orgId: input.orgId, entityType: "lead", entityId: lead.id, type: "task",
          title: `Contact ${input.name} — 15-minute SLA`,
          body: `Inbound SQL (score ${total}). Source: ${input.source ?? "webform"}.`,
          assigneeId: rep.id, dueAt: due,
        });
        routed = { owner: rep.name, sla: due.toISOString() };
      }
      await tx.update(leads).set({ fitScore: fit, intentScore: intent, status: "sql", ownerId: rep?.id }).where(eq(leads.id, lead.id));
    } else {
      // MQL -> nurture enrollment via outbox
      await tx.insert(messageOutbox).values({
        orgId: input.orgId, leadId: lead.id, channel: "email",
        subject: "Welcome — here's how Kopi Lima grows repeat visits",
        body: `Hi ${input.name}, thanks for your interest. Nurture sequence step 1 of 4.`,
        ruleName: "MQL nurture enrollment",
      });
      await tx.update(leads).set({ fitScore: fit, intentScore: intent, status: "mql" }).where(eq(leads.id, lead.id));
    }

    const [fresh] = await tx.select().from(leads).where(eq(leads.id, lead.id));
    return { lead: fresh, deduped: false as const, routed };
  });
}
