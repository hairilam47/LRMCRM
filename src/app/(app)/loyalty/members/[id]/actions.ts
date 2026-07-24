"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { topUpWallet, purchasePack } from "@/modules/loyalty/wallet";
import { adjustPoints, adjustWallet } from "@/modules/loyalty/engine";

export async function topUpAction(memberId: string, amountRm: number) {
  await topUpWallet(memberId, Math.round(amountRm * 100));
  revalidatePath(`/loyalty/members/${memberId}`);
}

export async function purchasePackAction(memberId: string, packId: string) {
  await purchasePack(memberId, packId);
  revalidatePath(`/loyalty/members/${memberId}`);
}

export async function adjustPointsAction(memberId: string, delta: number, reason: string) {
  const user = await requireUser();
  const db = await getDb();
  await adjustPoints(db, memberId, delta, reason, user.id);
  revalidatePath(`/loyalty/members/${memberId}`);
}

export async function adjustWalletAction(memberId: string, deltaRm: number, reason: string) {
  const user = await requireUser();
  const db = await getDb();
  await adjustWallet(db, memberId, Math.round(deltaRm * 100), reason, user.id);
  revalidatePath(`/loyalty/members/${memberId}`);
}
