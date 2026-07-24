"use client";
import { useState, useTransition } from "react";
import { lookupMember } from "./actions";

type Store = { id: string; name: string; code: string };
type Item = { sku: string; name: string; category: string; priceSen: number; emoji: string };
type MemberHit = { name: string; tier: string; visits: number; points: number } | null;

const rm = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;

export function Simulator({ stores, catalog }: { stores: Store[]; catalog: Item[] }) {
  const [storeCode, setStoreCode] = useState(stores[0]?.code ?? "");
  const [idKind, setIdKind] = useState("phone");
  const [idValue, setIdValue] = useState("+6012 3000000");
  const [member, setMember] = useState<MemberHit>(null);
  const [looked, setLooked] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({ "BEV-012": 2, "PST-004": 1 });
  const [result, setResult] = useState<any>(null);
  const [firing, setFiring] = useState(false);
  const [, startTransition] = useTransition();

  const lines = catalog.filter((c) => (qty[c.sku] ?? 0) > 0);
  const netSen = lines.reduce((s, c) => s + c.priceSen * (qty[c.sku] ?? 0), 0);
  const taxSen = Math.round(netSen * 0.06);
  const grossSen = netSen + taxSen;

  function bump(sku: string, d: number) {
    setQty((q) => ({ ...q, [sku]: Math.max(0, (q[sku] ?? 0) + d) }));
  }

  function doLookup() {
    setLooked(false);
    startTransition(async () => {
      setMember(await lookupMember(idKind, idValue));
      setLooked(true);
    });
  }

  async function fire() {
    if (netSen === 0) return;
    setFiring(true);
    setResult(null);
    const payload = {
      store_code: storeCode,
      external_ref: `SIM-${Date.now().toString(36).toUpperCase()}`,
      identifier: { kind: idKind === "none" ? "none" : idKind, value: idKind === "none" ? "" : idValue },
      payment_method: "card",
      gross_sen: grossSen,
      tax_sen: taxSen,
      line_items: lines.map((c) => ({
        sku: c.sku, name: c.name, category: c.category,
        qty: qty[c.sku], unit_price_sen: c.priceSen,
      })),
    };
    try {
      const res = await fetch("/api/pos/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setResult(await res.json());
    } finally {
      setFiring(false);
    }
  }

  const storeName = stores.find((s) => s.code === storeCode)?.name ?? "";

  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-5 items-start max-lg:grid-cols-1">
      {/* ---------- Builder ---------- */}
      <div className="card">
        <div className="card-title">Build transaction</div>
        <div className="p-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3.5">
            <div className="field">
              <label>Store</label>
              <select value={storeCode} onChange={(e) => setStoreCode(e.target.value)}>
                {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Identify customer by</label>
              <select value={idKind} onChange={(e) => { setIdKind(e.target.value); setMember(null); setLooked(false); }}>
                <option value="phone">Phone number</option>
                <option value="qr">Loyalty QR</option>
                <option value="email">Email</option>
                <option value="none">No match (guest)</option>
              </select>
            </div>
          </div>

          {idKind !== "none" && (
            <div className="flex gap-2 items-end">
              <div className="field flex-1">
                <label>{idKind === "phone" ? "Phone number" : idKind === "qr" ? "QR token" : "Email"}</label>
                <input value={idValue} onChange={(e) => { setIdValue(e.target.value); setLooked(false); }} onBlur={doLookup} />
              </div>
              <button className="btn-ghost" onClick={doLookup} type="button">Look up</button>
            </div>
          )}

          {member && (
            <div className="flex items-center gap-2.5 bg-surface-muted rounded-[9px] px-3 py-2 text-[12px] font-semibold text-ink-soft">
              <div className={`avatar ring-${member.tier.toLowerCase()}`} style={{ width: 26, height: 26, fontSize: 10 }}>
                {member.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              Matched: <b className="text-ink">{member.name}</b> · {member.visits} visits · bal {member.points.toLocaleString()} pts
              <span className="ml-auto font-bold text-[10px] uppercase px-2 py-0.5 rounded-full bg-[#FBF3DC] text-[#8A6A0C]">● {member.tier}</span>
            </div>
          )}
          {looked && !member && idKind !== "none" && (
            <div className="text-[12px] font-semibold text-warn bg-warn-soft rounded-[9px] px-3 py-2">
              No member matched — transaction will be recorded as a guest profile.
            </div>
          )}

          <div>
            <div className="font-bold text-[11px] uppercase tracking-wide text-ink-faint mb-2">Basket</div>
            {catalog.map((c) => (
              <div key={c.sku} className="grid grid-cols-[44px_1fr_96px_76px] gap-3 items-center py-2 border-b border-line-soft last:border-0">
                <div className="w-11 h-11 rounded-[9px] bg-surface-muted flex items-center justify-center text-[19px]">{c.emoji}</div>
                <div>
                  <b className="font-semibold text-[13px] block">{c.name}</b>
                  <span className="font-data text-[11px] text-ink-faint">{rm(c.priceSen)} · {c.sku} · {c.category}</span>
                </div>
                <div className="stepper">
                  <button type="button" onClick={() => bump(c.sku, -1)} aria-label={`Remove ${c.name}`}>−</button>
                  <span className="qty">{qty[c.sku] ?? 0}</span>
                  <button type="button" onClick={() => bump(c.sku, 1)} aria-label={`Add ${c.name}`}>+</button>
                </div>
                <div className="font-data font-semibold text-[13px] text-right">
                  {(qty[c.sku] ?? 0) > 0 ? rm(c.priceSen * qty[c.sku]) : <span className="text-ink-ghost">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5 bg-surface-muted rounded-b-xl">
          <div className="font-display font-black text-[22px]">
            <sup className="font-data text-[12px] font-bold">RM</sup> {(grossSen / 100).toFixed(2)}
            <sub className="font-data text-[10px] font-semibold text-[#5F5D6B] ml-1.5">incl. SST {rm(taxSen)}</sub>
          </div>
          <button className="btn-primary w-[190px] h-[38px]" onClick={fire} disabled={firing || netSen === 0}>
            {firing ? "Firing…" : "⚡ Fire webhook"}
          </button>
        </div>
      </div>

      {/* ---------- Receipt ---------- */}
      <div className="flex flex-col gap-4">
        {firing && (
          <div className="card p-8 flex justify-center">
            <div className="loading-wave"><div className="loading-bar" /><div className="loading-bar" /><div className="loading-bar" /><div className="loading-bar" /></div>
          </div>
        )}

        {!firing && !result && (
          <div className="card p-8 text-center text-[13px] text-ink-faint">
            Build a basket and fire the webhook.<br />The receipt prints here.
          </div>
        )}

        {result && result.error && (
          <div className="card p-5 text-[13px] text-danger font-semibold">Webhook error: {result.error}</div>
        )}

        {result && !result.error && (
          <>
            <div className="receipt receipt-print" key={result.transactionId}>
              <div className="text-center mb-3.5">
                <b className="font-display font-extrabold text-[15px] tracking-wide block text-panel-dark">{storeName.toUpperCase()}</b>
                <span className="text-[10px] text-[#8a8a8a]">
                  {result.externalRef} · webhook 200 OK · {result.latencyMs} ms
                </span>
              </div>
              {lines.map((c) => (
                <div key={c.sku} className="flex justify-between py-[2.5px]">
                  <span>{qty[c.sku]}× {c.name.toUpperCase()}</span><span>{(c.priceSen * qty[c.sku] / 100).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between py-[2.5px]"><span>SST 6%</span><span>{(taxSen / 100).toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-[#111] border-t border-dashed border-[#C9C9C4] mt-1.5 pt-2 text-[13px]">
                <span>TOTAL (RM)</span><span>{(grossSen / 100).toFixed(2)}</span>
              </div>

              {result.matched && result.rewards && (
                <>
                  <hr className="border-0 border-t border-dashed border-[#C9C9C4] my-3" />
                  <div className="font-semibold text-[#111] tracking-[1.5px] text-[10px] uppercase text-center mb-2">· Rewards computed ·</div>
                  <div className="flex justify-between py-[2.5px]">
                    <span>MEMBER</span><span>{result.member.name.toUpperCase()} · {result.member.tier.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between py-[2.5px]">
                    <span>POINTS EARNED <span className="text-[#9a9a9a] text-[10px]">×{(result.rewards.tierMultiplierPct / 100).toFixed(1)}</span></span>
                    <span className="text-success font-semibold">+{result.rewards.pointsEarned}</span>
                  </div>
                  {result.rewards.cashbackSen > 0 && (
                    <div className="flex justify-between py-[2.5px]"><span>CASHBACK 3%</span><span className="text-success font-semibold">+{rm(result.rewards.cashbackSen)}</span></div>
                  )}
                  {result.rewards.stamps.map((s: any) => (
                    <div key={s.cardName} className="flex justify-between py-[2.5px]">
                      <span>STAMP · {s.cardName.toUpperCase()}</span>
                      <span className={s.added > 0 ? "text-success font-semibold" : "text-[#9a9a9a] text-[10px]"}>
                        {s.added > 0 ? `+${s.added} → ${s.count}/${s.goal}${s.completed ? " · REWARD!" : ""}` : "no qualifying item"}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between py-[2.5px]"><span>NEW POINTS BALANCE</span><span>{result.rewards.newPointsBalance.toLocaleString()}</span></div>
                  <div className="flex justify-between py-[2.5px]"><span>WALLET BALANCE</span><span>{rm(result.rewards.walletBalanceSen)}</span></div>
                  <div className="flex justify-between py-[2.5px]">
                    <span>TIER</span>
                    <span className={result.rewards.tier.changed ? "text-success font-semibold" : ""}>
                      {result.rewards.tier.name.toUpperCase()}{result.rewards.tier.changed ? " · UPGRADED!" : " · retained"}
                    </span>
                  </div>
                </>
              )}
              {!result.matched && (
                <>
                  <hr className="border-0 border-t border-dashed border-[#C9C9C4] my-3" />
                  <div className="text-center text-[10px] text-[#9a9a9a]">UNMATCHED · GUEST PROFILE CREATED<br />rewards on registration — identity resolution seam</div>
                </>
              )}
              <div className="mx-auto mt-3.5 w-fit px-3.5 py-1 border-2 rounded-md font-sans font-bold text-[11px] tracking-[2px] uppercase -rotate-3 opacity-90"
                style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}>
                Ledger written
              </div>
            </div>

            {result.automations?.length > 0 && (
              <div className="card">
                <div className="card-title">Automations evaluated</div>
                <div className="p-4 pt-3 flex flex-col gap-2.5">
                  {result.automations.map((a: any, i: number) => (
                    <div key={i} className="flex gap-2.5 items-start text-[12px]">
                      <div className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5 ${a.fired ? "bg-success-soft text-success" : "bg-surface-muted text-ink-faint"}`}>
                        {a.fired ? "✓" : "–"}
                      </div>
                      <div>
                        <b className="font-semibold block">{a.rule}</b>
                        <span className="text-[11px] text-ink-faint">{a.detail}</span>
                      </div>
                      {a.channel && <span className="ml-auto font-data text-[10px] font-semibold text-ink-faint bg-surface-muted px-2 py-0.5 rounded-full shrink-0 uppercase">{a.channel}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
