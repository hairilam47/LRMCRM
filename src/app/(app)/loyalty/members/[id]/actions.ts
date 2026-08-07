"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { topUpWallet, purchasePack } from "@/modules/loyalty/wallet";
import { adjustPoints, adjustWallet } from "@/modules/loyalty/engine";
import { writeAudit } from "@/modules/audit/log";

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

/**
 * WhatsApp marketing opt-in — the gate blast campaigns check (see
 * src/modules/blast/audience.ts). Toggled from the member detail page;
 * also flipped automatically by the inbound webhook on a STOP/UNSUBSCRIBE
 * reply (src/app/api/whatsapp/webhook/route.ts).
 */
export async function setWaConsentAction(memberId: string, consent: boolean) {
  const user = await requireUser();
  const db = await getDb();
  const [member] = await db.select().from(schema.loyaltyMembers).where(eq(schema.loyaltyMembers.id, memberId));
  if (!member) throw new Error("Member not found");
  await db.update(schema.contacts).set({ waConsent: consent, waConsentAt: new Date() }).where(eq(schema.contacts.id, member.contactId));
  await writeAudit(db, {
    orgId: member.orgId, actorId: user.id, action: "contact.wa_consent", entityType: "member", entityId: memberId,
    detail: { consent },
  });
  revalidatePath(`/loyalty/members/${memberId}`);
}
