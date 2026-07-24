"use server";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { changeUserRole, toggleRoutable, createUser } from "@/modules/settings/users";

export async function changeRoleAction(userId: string, role: string) {
  const admin = await requireRole(["admin"]);
  await changeUserRole(userId, role, admin.id);
  revalidatePath("/settings/users");
}

export async function toggleRoutableAction(userId: string, routable: boolean) {
  const admin = await requireRole(["admin"]);
  await toggleRoutable(userId, routable, admin.id);
  revalidatePath("/settings/users");
}

export async function createUserAction(name: string, email: string, role: string) {
  const admin = await requireRole(["admin"]);
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const result = await createUser({ orgId: org.id, name, email, role }, admin.id);
  revalidatePath("/settings/users");
  return { name: result.user.name, email: result.user.email, tempPassword: result.tempPassword };
}
