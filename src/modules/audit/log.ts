import { desc, eq } from "drizzle-orm";
import { schema } from "@/db";

const { auditLog, users } = schema;

export async function writeAudit(
  db: any,
  opts: { orgId: string; actorId?: string | null; action: string; entityType: string; entityId?: string | null; detail?: Record<string, unknown> }
) {
  await db.insert(auditLog).values({
    orgId: opts.orgId,
    actorId: opts.actorId ?? null,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId ?? null,
    detail: opts.detail ?? {},
  });
}

export async function listAuditLog(db: any, orgId: string, limit = 100) {
  return db.select({ log: auditLog, actorName: users.name })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
