"use server";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { runWinbackSweep } from "@/modules/automation/engine";
import { dispatchOutbox } from "@/modules/automation/dispatch";

export async function sweepAction() {
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const result = await runWinbackSweep(db, org.id);
  revalidatePath("/loyalty/marketing/outbox");
  return result;
}

export async function dispatchAction() {
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const result = await dispatchOutbox(org.id);
  revalidatePath("/loyalty/marketing/outbox");
  return result;
}
