"use server";
import { revalidatePath } from "next/cache";
import { toggleGate, moveDeal, createDeal, addDealNote } from "@/modules/crm/deals";
import { getDb, schema } from "@/db";

export async function toggleGateAction(dealId: string, key: string, value: boolean) {
  await toggleGate(dealId, key, value);
  revalidatePath("/crm/deals");
}

export async function moveDealAction(dealId: string, direction: "forward" | "back") {
  const result = await moveDeal(dealId, direction);
  revalidatePath("/crm/deals");
  revalidatePath("/crm/dashboard");
  return result;
}

export async function createDealAction(pipelineId: string, accountId: string, name: string, amountRm: number) {
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const deal = await createDeal({ orgId: org.id, pipelineId, accountId, name, amountSen: Math.round(amountRm * 100) });
  revalidatePath("/crm/deals");
  revalidatePath("/crm/dashboard");
  return deal;
}

export async function addNoteAction(dealId: string, note: string) {
  await addDealNote(dealId, note);
  revalidatePath("/crm/deals");
}
