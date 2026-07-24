"use client";
import { useState, useTransition } from "react";
import { topUpAction, purchasePackAction } from "./actions";

const rm = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;

export function WalletActions({
  memberId, packs,
}: { memberId: string; packs: { id: string; name: string; priceSen: number; quantity: number; itemCategory: string }[] }) {
  const [amount, setAmount] = useState("50");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function topUp() {
    const rmVal = Number(amount);
    if (!rmVal || rmVal <= 0) return;
    setMsg(null);
    startTransition(async () => {
      await topUpAction(memberId, rmVal);
      setMsg(rmVal >= 50 ? `Topped up ${rm(rmVal * 100)} + 10% bonus` : `Topped up ${rm(rmVal * 100)}`);
    });
  }

  function buyPack(packId: string) {
    setMsg(null);
    startTransition(async () => {
      await purchasePackAction(memberId, packId);
      setMsg("Pack purchased");
    });
  }

  return (
    <div className="card">
      <div className="card-title">Wallet &amp; packs</div>
      <div className="p-4 flex flex-col gap-3.5">
        <div className="flex gap-2 items-end">
          <div className="field flex-1">
            <label>Top up (RM)</label>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className="btn-primary h-[38px]" disabled={pending} onClick={topUp}>Top up</button>
        </div>
        <p className="text-[11px] text-ink-faint -mt-2">RM 50+ earns a 10% reload bonus, automatically.</p>

        {packs.length > 0 && (
          <div className="border-t border-line-soft pt-3 flex flex-col gap-2">
            {packs.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[13px]">
                <div>
                  <b className="font-semibold block">{p.name}</b>
                  <span className="text-[11px] text-ink-faint">{p.quantity}× {p.itemCategory} · {rm(p.priceSen)}</span>
                </div>
                <button className="btn-ghost h-7 px-2.5 text-[11px]" disabled={pending} onClick={() => buyPack(p.id)}>Buy</button>
              </div>
            ))}
          </div>
        )}
        {msg && <div className="text-[12px] font-semibold text-success">{msg}</div>}
      </div>
    </div>
  );
}
