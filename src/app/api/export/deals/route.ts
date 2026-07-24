import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

const { deals, accounts, pipelineStages, users } = schema;

export async function GET() {
  await requireRole(["admin", "sales"]);
  const db = await getDb();
  const rows = await db.select({
    deal: deals, accountName: accounts.name, stageName: pipelineStages.name,
    isWon: pipelineStages.isWon, ownerName: users.name,
  })
    .from(deals)
    .leftJoin(accounts, eq(deals.accountId, accounts.id))
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .leftJoin(users, eq(deals.ownerId, users.id))
    .orderBy(desc(deals.amountSen));

  const csv = toCsv(
    ["Deal", "Account", "Stage", "Won", "Amount (RM)", "Owner", "Days in stage", "Created"],
    rows.map(({ deal, accountName, stageName, isWon, ownerName }) => [
      deal.name, accountName ?? "", stageName,
      isWon === 1 ? "yes" : "no",
      (deal.amountSen / 100).toFixed(2),
      ownerName ?? "",
      Math.floor((Date.now() - new Date(deal.stageEnteredAt).getTime()) / 86_400_000),
      new Date(deal.createdAt).toISOString().slice(0, 10),
    ])
  );
  return csvResponse(`loya-deals-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
