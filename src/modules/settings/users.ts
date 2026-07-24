import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/db";
import { hashPassword } from "@/lib/auth";
import { writeAudit } from "@/modules/audit/log";

const { users } = schema;

export async function changeUserRole(userId: string, newRole: string, actorId: string) {
  const db = await getDb();
  const [before] = await db.select().from(users).where(eq(users.id, userId));
  if (!before) throw new Error("User not found");
  await db.update(users).set({ role: newRole as any }).where(eq(users.id, userId));
  await writeAudit(db, {
    orgId: before.orgId, actorId, action: "user.role_change", entityType: "user", entityId: userId,
    detail: { userName: before.name, fromRole: before.role, toRole: newRole },
  });
}

export async function toggleRoutable(userId: string, routable: boolean, actorId: string) {
  const db = await getDb();
  const [before] = await db.select().from(users).where(eq(users.id, userId));
  if (!before) throw new Error("User not found");
  await db.update(users).set({ isRoutable: routable }).where(eq(users.id, userId));
  await writeAudit(db, {
    orgId: before.orgId, actorId, action: "user.routable_change", entityType: "user", entityId: userId,
    detail: { userName: before.name, routable },
  });
}

function genPassword(): string {
  // readable-ish random password for a one-time admin hand-off
  return randomBytes(6).toString("base64url");
}

export async function createUser(input: { orgId: string; name: string; email: string; role: string }, actorId: string) {
  const db = await getDb();
  const tempPassword = genPassword();
  const [user] = await db.insert(users).values({
    orgId: input.orgId, name: input.name, email: input.email.toLowerCase(),
    role: input.role as any, passwordHash: hashPassword(tempPassword),
    isRoutable: input.role === "sales",
  }).returning();
  await writeAudit(db, {
    orgId: input.orgId, actorId, action: "user.create", entityType: "user", entityId: user.id,
    detail: { userName: input.name, email: input.email, role: input.role },
  });
  return { user, tempPassword };
}
