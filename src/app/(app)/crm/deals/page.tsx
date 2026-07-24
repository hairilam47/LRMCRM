import { eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { DealBoard } from "./board";
import { NewDealForm } from "./new-deal-form";

export const dynamic = "force-dynamic";
const { pipelines, pipelineStages, deals, accounts, activities } = schema;

export default async function DealsPage() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();

  const [pipeline] = await db.select().from(pipelines).limit(1);
  const [stages, dealRows, accountRows] = await Promise.all([
    pipeline
      ? db.select().from(pipelineStages).where(eq(pipelineStages.pipelineId, pipeline.id)).orderBy(pipelineStages.position)
      : Promise.resolve([]),
    pipeline
      ? db.select({ deal: deals, accountName: accounts.name })
          .from(deals).leftJoin(accounts, eq(deals.accountId, accounts.id))
          .where(eq(deals.pipelineId, pipeline.id))
      : Promise.resolve([]),
    db.select().from(accounts).orderBy(accounts.name),
  ]);

  const dealIds = dealRows.map((d) => d.deal.id);
  const activityRows = dealIds.length > 0
    ? await db.select().from(activities)
        .where(inArray(activities.entityId, dealIds))
        .orderBy(desc(activities.createdAt))
    : [];
  const activitiesByDeal = new Map<string, { title: string; createdAt: string }[]>();
  for (const a of activityRows) {
    if (a.entityType !== "deal") continue;
    const list = activitiesByDeal.get(a.entityId) ?? [];
    list.push({ title: a.title, createdAt: a.createdAt.toISOString() });
    activitiesByDeal.set(a.entityId, list);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">{pipeline?.name ?? "Deals"}</h1>
          <div className="text-[13px] text-ink-faint mt-0.5">
            Deals can&apos;t advance past a stage until its required gates are checked. Stale = stalled &gt; 7 days in stage.
          </div>
        </div>
        {pipeline && (
          <div className="flex gap-2 items-start">
            <a href="/api/export/deals" className="btn-ghost">⬇ Export CSV</a>
            <NewDealForm pipelineId={pipeline.id} accounts={accountRows.map((a) => ({ id: a.id, name: a.name }))} />
          </div>
        )}
      </div>
      <DealBoard
        stages={stages.map((s) => ({
          id: s.id, name: s.name, position: s.position, isWon: s.isWon === 1,
          gateRequirements: (s.gateRequirements ?? []) as { key: string; label: string; required: boolean }[],
        }))}
        deals={dealRows.map(({ deal, accountName }) => ({
          id: deal.id, name: deal.name, accountName: accountName ?? "—",
          amountSen: deal.amountSen, stageId: deal.stageId,
          stageEnteredAt: deal.stageEnteredAt.toISOString(),
          gateState: (deal.gateState ?? {}) as Record<string, boolean>,
          activity: activitiesByDeal.get(deal.id) ?? [],
        }))}
      />
    </div>
  );
}
