import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

const { deals, pipelineStages, activities, pipelines } = schema;

export async function createDeal(input: {
  orgId: string; pipelineId: string; accountId: string; name: string; amountSen: number;
}) {
  const db = await getDb();
  const firstStage = await db.select().from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, input.pipelineId))
    .orderBy(pipelineStages.position).limit(1);
  if (firstStage.length === 0) throw new Error("Pipeline has no stages");
  const [deal] = await db.insert(deals).values({
    orgId: input.orgId, pipelineId: input.pipelineId, stageId: firstStage[0].id,
    accountId: input.accountId, name: input.name, amountSen: input.amountSen,
  }).returning();
  return deal;
}

export async function addDealNote(dealId: string, note: string) {
  if (!note.trim()) throw new Error("Note cannot be empty");
  const db = await getDb();
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error("Deal not found");
  await db.insert(activities).values({
    orgId: deal.orgId, entityType: "deal", entityId: dealId, type: "note", title: note.trim(),
  });
}

export async function toggleGate(dealId: string, key: string, value: boolean) {
  const db = await getDb();
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error("Deal not found");
  const gateState = { ...(deal.gateState ?? {}), [key]: value };
  await db.update(deals).set({ gateState }).where(eq(deals.id, dealId));
  return gateState;
}

/**
 * Stage-gate enforcement (spec §3.3): a deal cannot advance while required
 * gates on its CURRENT stage are unchecked. Moving back is always allowed.
 */
export async function moveDeal(dealId: string, direction: "forward" | "back") {
  const db = await getDb();
  return db.transaction(async (tx: any) => {
    const [deal] = await tx.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) throw new Error("Deal not found");
    const stages = await tx.select().from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, deal.pipelineId))
      .orderBy(pipelineStages.position);
    const idx = stages.findIndex((s: any) => s.id === deal.stageId);
    const current = stages[idx];

    if (direction === "forward") {
      const missing = (current.gateRequirements ?? [])
        .filter((g: any) => g.required && !(deal.gateState ?? {})[g.key])
        .map((g: any) => g.label);
      if (missing.length > 0) {
        return { moved: false as const, blocked: missing, stage: current.name };
      }
      const next = stages[idx + 1];
      if (!next) return { moved: false as const, blocked: [], stage: current.name };
      await tx.update(deals)
        .set({ stageId: next.id, stageEnteredAt: new Date() })
        .where(eq(deals.id, dealId));
      await tx.insert(activities).values({
        orgId: deal.orgId, entityType: "deal", entityId: deal.id, type: "stage_move",
        title: `Stage: ${current.name} → ${next.name}`,
      });
      return { moved: true as const, stage: next.name, won: next.isWon === 1 };
    }

    const prev = stages[idx - 1];
    if (!prev) return { moved: false as const, blocked: [], stage: current.name };
    await tx.update(deals)
      .set({ stageId: prev.id, stageEnteredAt: new Date() })
      .where(eq(deals.id, dealId));
    await tx.insert(activities).values({
      orgId: deal.orgId, entityType: "deal", entityId: deal.id, type: "stage_move",
      title: `Stage: ${current.name} → ${prev.name} (moved back)`,
    });
    return { moved: true as const, stage: prev.name, won: false };
  });
}
