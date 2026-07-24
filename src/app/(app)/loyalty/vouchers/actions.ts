"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { runVoucherCampaign, type CampaignSegment } from "@/modules/loyalty/wallet";
import { writeAudit } from "@/modules/audit/log";

export async function runCampaignAction(voucherId: string, segment: CampaignSegment) {
  const user = await requireUser();
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const result = await runVoucherCampaign(org.id, voucherId, segment, user.id);
  revalidatePath("/loyalty/vouchers");
  return result;
}

export async function editVoucherFormAction(formData: FormData) {
  const user = await requireUser();
  const voucherId = String(formData.get("voucherId"));
  const kind = String(formData.get("kind") ?? "fixed");
  const valueSen = Number(formData.get("value") ?? 0) * (kind === "percent" ? 1 : 100);
  const minSpendSen = Number(formData.get("minSpend") ?? 0) * 100;
  const validDays = Number(formData.get("validDays") ?? 7);

  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const [before] = await db.select().from(schema.vouchers).where(eq(schema.vouchers.id, voucherId));
  await db.update(schema.vouchers).set({ valueSen, minSpendSen, validDays }).where(eq(schema.vouchers.id, voucherId));

  await writeAudit(db, {
    orgId: org.id, actorId: user.id, action: "voucher.edit", entityType: "voucher", entityId: voucherId,
    detail: { voucherName: before?.name, before: { valueSen: before?.valueSen, minSpendSen: before?.minSpendSen, validDays: before?.validDays }, after: { valueSen, minSpendSen, validDays } },
  });
  revalidatePath("/loyalty/vouchers");
}
