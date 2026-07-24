import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { UsersManager } from "./users-manager";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  await requireRole(["admin"]);
  const db = await getDb();
  const users = await db.select().from(schema.users).orderBy(schema.users.createdAt);

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-1">Users</h1>
      <p className="text-[13px] text-ink-faint mb-5">Manage roles and create new accounts. All changes are recorded in the audit log.</p>
      <UsersManager
        users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isRoutable: u.isRoutable }))}
      />
    </div>
  );
}
