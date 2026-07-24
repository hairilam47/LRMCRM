"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeRoleAction, toggleRoutableAction, createUserAction } from "./actions";

type UserRow = { id: string; name: string; email: string; role: string; isRoutable: boolean };
const ROLES = ["admin", "sales", "marketing", "store_ops"];

export function UsersManager({ users }: { users: UserRow[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function changeRole(userId: string, role: string) {
    startTransition(async () => { await changeRoleAction(userId, role); router.refresh(); });
  }
  function toggleRoutable(userId: string, routable: boolean) {
    startTransition(async () => { await toggleRoutableAction(userId, routable); router.refresh(); });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card">
        <div className="card-title">All users</div>
        <div>
          <div className="grid grid-cols-[1.3fr_1.3fr_150px_130px] gap-3 items-center px-4 py-2 border-b border-line-soft text-[10px] font-bold uppercase tracking-wide text-ink-faint max-lg:hidden">
            <span>Name</span><span>Email</span><span>Role</span><span>Routable (sales SLA)</span>
          </div>
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1.3fr_1.3fr_150px_130px] gap-3 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px] max-lg:grid-cols-[1fr_auto]">
              <b className="font-semibold">{u.name}</b>
              <span className="text-[12px] text-ink-faint truncate max-lg:hidden">{u.email}</span>
              <select
                value={u.role}
                disabled={pending}
                onChange={(e) => changeRole(u.id, e.target.value)}
                className="h-8 px-2 text-[12px] border border-line rounded-md bg-surface max-lg:hidden"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-ink-soft max-lg:hidden">
                <input type="checkbox" checked={u.isRoutable} disabled={pending} onChange={(e) => toggleRoutable(u.id, e.target.checked)} className="accent-primary" />
                routable
              </label>
            </div>
          ))}
        </div>
      </div>

      <CreateUserForm />
    </div>
  );
}

function CreateUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const router = useRouter();

  function submit() {
    if (!name.trim() || !email.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await createUserAction(name.trim(), email.trim(), role);
      setResult(res);
      setName(""); setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div className="card-title">Create user</div>
      <div className="p-4 flex flex-col gap-3.5 max-w-md">
        <div className="field"><label>Full name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button className="btn-primary self-start" disabled={pending} onClick={submit}>{pending ? "Creating…" : "Create user"}</button>

        {result && (
          <div className="text-[12px] font-semibold bg-warn-soft text-warn rounded-md px-3 py-2.5 flex flex-col gap-1">
            <span>{result.name} created. One-time password (shown once — copy it now):</span>
            <span className="font-data text-[14px] bg-surface px-2 py-1 rounded border border-line select-all">{result.tempPassword}</span>
          </div>
        )}
      </div>
    </div>
  );
}
