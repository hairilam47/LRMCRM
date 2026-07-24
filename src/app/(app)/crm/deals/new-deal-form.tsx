"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealAction } from "./actions";

export function NewDealForm({ pipelineId, accounts }: { pipelineId: string; accounts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!name.trim() || !accountId || !amount) return;
    startTransition(async () => {
      await createDealAction(pipelineId, accountId, name.trim(), Number(amount));
      setOpen(false); setName(""); setAmount("");
      router.refresh();
    });
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}>+ New deal</button>;
  }

  return (
    <div className="card p-4 flex flex-col gap-3 w-full sm:w-auto sm:min-w-[420px]">
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label>Deal name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office pantry retainer" /></div>
        <div className="field">
          <label>Account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Amount (RM)</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="48000" /></div>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Creating…" : "Create deal"}</button>
      </div>
    </div>
  );
}
