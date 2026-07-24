"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/modules/audit/log";

export async function setProviderAction(provider: "mock" | "console") {
  const admin = await requireRole(["admin"]);
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);

  const [existing] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, org.id));
  if (existing) {
    await db.update(schema.orgSettings).set({ espProvider: provider, updatedAt: new Date() }).where(eq(schema.orgSettings.orgId, org.id));
  } else {
    await db.insert(schema.orgSettings).values({ orgId: org.id, espProvider: provider });
  }

  await writeAudit(db, {
    orgId: org.id, actorId: admin.id, action: "settings.esp_provider", entityType: "org", entityId: org.id,
    detail: { provider },
  });
  revalidatePath("/settings/integrations");
}
