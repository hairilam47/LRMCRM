import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { pointsBalance, walletBalanceSen, memberLedgers } from "@/modules/loyalty/engine";
import { memberReferralInfo } from "@/modules/loyalty/wallet";
import { rm, dt, timeAgo } from "@/lib/format";
import { TierAvatar, TierChip } from "@/components/tier-avatar";
import { WalletActions } from "./wallet-actions";
import { AdjustBalance } from "./adjust-balance";

export const dynamic = "force-dynamic";
const { loyaltyMembers, loyaltyTiers, contacts, stampCards, stampProgress, voucherIssuances, vouchers, prepaidPacks, prepaidPackPurchases } = schema;

export default async function MemberDetail({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["admin", "marketing", "store_ops"]);
  const { id } = await params;
  const { tab = "points" } = await searchParams;
  const db = await getDb();

  const [row] = await db.select({ member: loyaltyMembers, contact: contacts, tier: loyaltyTiers.name })
    .from(loyaltyMembers)
    .innerJoin(contacts, eq(loyaltyMembers.contactId, contacts.id))
    .leftJoin(loyaltyTiers, eq(loyaltyMembers.tierId, loyaltyTiers.id))
    .where(eq(loyaltyMembers.id, id));
  if (!row) notFound();

  const [points, wallet, ledgers, stamps, activeVouchers, packs, memberPacks, referralInfo] = await Promise.all([
    pointsBalance(db, id),
    walletBalanceSen(db, id),
    memberLedgers(db, id),
    db.select({ card: stampCards, prog: stampProgress })
      .from(stampProgress)
      .innerJoin(stampCards, eq(stampProgress.stampCardId, stampCards.id))
      .where(eq(stampProgress.memberId, id)),
    db.select({ iss: voucherIssuances, v: vouchers })
      .from(voucherIssuances)
      .innerJoin(vouchers, eq(voucherIssuances.voucherId, vouchers.id))
      .where(and(eq(voucherIssuances.memberId, id), eq(voucherIssuances.status, "issued")))
      .orderBy(desc(voucherIssuances.createdAt)).limit(6),
    db.select().from(prepaidPacks).where(eq(prepaidPacks.orgId, row.member.orgId)),
    db.select({ purchase: prepaidPackPurchases, pack: prepaidPacks })
      .from(prepaidPackPurchases)
      .innerJoin(prepaidPacks, eq(prepaidPackPurchases.packId, prepaidPacks.id))
      .where(eq(prepaidPackPurchases.memberId, id))
      .orderBy(desc(prepaidPackPurchases.purchasedAt)),
    memberReferralInfo(db, id),
  ]);

  // running balance for the points ledger (rows come newest-first)
  const ptRows = ledgers.points as (typeof schema.pointsLedger.$inferSelect)[];
  let running = points;
  const pointRowsWithBal = ptRows.map((r) => { const bal = running; running -= r.delta; return { ...r, bal }; });
  const wlRows = ledgers.wallet as (typeof schema.walletLedger.$inferSelect)[];
  let wRunning = wallet;
  const walletRowsWithBal = wlRows.map((r) => { const bal = wRunning; wRunning -= r.deltaSen; return { ...r, bal }; });

  const m = row.member;

  return (
    <div>
      <div className="text-[12px] font-semibold text-ink-faint mb-4">
        <Link href="/loyalty/members" className="hover:text-ink">Loyalty / Members</Link> / <b className="text-ink">{row.contact.name}</b>
      </div>

      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <TierAvatar name={row.contact.name} tier={row.tier} size={58} />
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">{row.contact.name} <TierChip tier={row.tier} /></h1>
          <div className="text-[13px] text-ink-faint mt-0.5">
            {row.contact.phone} · {row.contact.email} · QR <span className="font-data text-[12px]">{m.qrToken}</span>
          </div>
        </div>
        <div className="ml-auto">
          <AdjustBalance memberId={id} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3.5 mb-4 max-lg:grid-cols-2">
        <Stat label="Lifetime value" value={rm(m.ltvSen)} />
        <Stat label="Total visits" value={String(m.totalVisits)} />
        <Stat label="Avg order value" value={rm(m.aovSen)} />
        <Stat label="Last visit" value={timeAgo(m.lastVisitAt)} />
      </div>

      <div className="grid grid-cols-[1.55fr_1fr] gap-4 items-start max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">
            Activity ledger
            <span className="flex gap-1 normal-case tracking-normal">
              <Tab id={id} tab="points" current={tab} label="Points" />
              <Tab id={id} tab="wallet" current={tab} label="Wallet" />
            </span>
          </div>
          <div>
            {tab === "points" && pointRowsWithBal.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto] gap-3.5 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px]">
                <div>
                  <b className="font-semibold block capitalize">{r.reason.replace("_", " ")}</b>
                  <span className="text-[11px] text-ink-faint">{dt(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</span>
                </div>
                <span className={`font-data font-semibold ${r.delta >= 0 ? "text-success" : "text-danger"}`}>
                  {r.delta >= 0 ? "+" : ""}{r.delta.toLocaleString()}
                </span>
                <span className="font-data text-[11px] text-ink-faint min-w-[80px] text-right">bal {r.bal.toLocaleString()}</span>
              </div>
            ))}
            {tab === "wallet" && walletRowsWithBal.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto] gap-3.5 items-center px-4 py-2.5 border-b border-line-soft last:border-0 text-[13px]">
                <div>
                  <b className="font-semibold block capitalize">{r.reason}</b>
                  <span className="text-[11px] text-ink-faint">{dt(r.createdAt)}{r.note ? ` · ${r.note}` : ""}</span>
                </div>
                <span className={`font-data font-semibold ${r.deltaSen >= 0 ? "text-success" : "text-danger"}`}>
                  {r.deltaSen >= 0 ? "+" : "−"}{rm(Math.abs(r.deltaSen))}
                </span>
                <span className="font-data text-[11px] text-ink-faint min-w-[86px] text-right">bal {rm(r.bal)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-panel-dark text-white rounded-xl p-4.5 relative overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(120deg,#1CB0FF,#40FF99)" }} />
            <div className="font-bold text-[10px] uppercase tracking-[0.6px] text-[#9a9a9a] pt-1">Stored value wallet</div>
            <div className="font-display font-extrabold text-[30px] mt-1.5">{rm(wallet)}</div>
            <div className="flex justify-between mt-4 pt-3 border-t border-[#3a3a3a] text-[12px] font-semibold text-[#cfcfcf]">
              <div>Points<b className="font-data block text-white mt-0.5">{points.toLocaleString()} pts ≈ {rm(points * 10)}</b></div>
              <div className="text-right">Tier<b className="font-data block text-white mt-0.5">{row.tier}</b></div>
            </div>
          </div>

          <WalletActions memberId={id} packs={packs.map((p) => ({ id: p.id, name: p.name, priceSen: p.priceSen, quantity: p.quantity, itemCategory: p.itemCategory }))} />

          {memberPacks.length > 0 && (
            <div className="card">
              <div className="card-title">Prepaid packs</div>
              <div className="p-4 flex flex-col gap-2.5">
                {memberPacks.map(({ purchase, pack }) => (
                  <div key={purchase.id} className="flex items-center justify-between text-[13px]">
                    <div>
                      <b className="font-semibold block">{pack.name}</b>
                      <span className="text-[11px] text-ink-faint">purchased {timeAgo(purchase.purchasedAt)}</span>
                    </div>
                    <span className="font-data font-semibold">{purchase.remaining} / {pack.quantity} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {referralInfo.code && (
            <div className="card">
              <div className="card-title">Referral</div>
              <div className="p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-faint">Share code</span>
                  <span className="font-data font-bold text-[13px] bg-surface-muted px-2.5 py-1 rounded-md">{referralInfo.code}</span>
                </div>
                <div className="text-[12px] text-ink-faint">
                  {referralInfo.referred.length === 0
                    ? "No referrals yet."
                    : `${referralInfo.referred.length} friend${referralInfo.referred.length === 1 ? "" : "s"} joined: ${referralInfo.referred.map((r: any) => r.name).join(", ")}`}
                </div>
              </div>
            </div>
          )}

          {stamps.map(({ card, prog }) => (
            <div key={card.id} className="card">
              <div className="card-title">Stamp card — {card.name}</div>
              <div className="p-4">
                <div className="flex justify-between text-[12px] font-semibold text-ink-soft mb-3">
                  <span>Buy {card.goal}, get the next free</span>
                  <b className="font-data">{prog.count} / {card.goal}{prog.completedCycles > 0 ? ` · ${prog.completedCycles} completed` : ""}</b>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${card.goal + 1}, 1fr)` }}>
                  {Array.from({ length: card.goal }).map((_, i) => (
                    <div key={i} className={`aspect-square rounded-full flex items-center justify-center text-[11px] font-bold ${i < prog.count ? "text-white" : "border-2 border-dashed border-line text-ink-faint"}`}
                      style={i < prog.count ? { background: "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" } : undefined}>
                      {i < prog.count ? "✓" : i + 1}
                    </div>
                  ))}
                  <div className="aspect-square rounded-full border-2 border-dashed flex items-center justify-center text-[12px]" style={{ borderColor: "var(--color-tier-gold)" }}>🎁</div>
                </div>
              </div>
            </div>
          ))}

          <div className="card">
            <div className="card-title">Active vouchers <span className="font-data normal-case">{activeVouchers.length}</span></div>
            <div className="p-4 pt-2.5 flex flex-col gap-2.5">
              {activeVouchers.length === 0 && <div className="text-[12px] text-ink-faint py-2">No active vouchers. Issue one from a campaign or stamp completion.</div>}
              {activeVouchers.map(({ iss, v }) => (
                <div key={iss.id} className="grid grid-cols-[1fr_auto] items-center border border-dashed border-line rounded-[10px] px-3.5 py-2.5">
                  <div>
                    <b className="font-bold text-[13px] block">{v.name}</b>
                    <span className="text-[11px] text-ink-faint">{iss.sourceNote}{v.minSpendSen > 0 ? ` · min spend ${rm(v.minSpendSen)}` : ""}</span>
                  </div>
                  <span className="font-data text-[10px] font-semibold text-warn text-right">exp {dt(iss.expiresAt).split(",")[0]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="font-bold text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="font-display font-extrabold text-[22px] mt-1">{value}</div>
    </div>
  );
}
function Tab({ id, tab, current, label }: { id: string; tab: string; current: string; label: string }) {
  const on = tab === current;
  return (
    <Link href={`/loyalty/members/${id}?tab=${tab}`}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${on ? "bg-panel-dark text-white" : "text-ink-faint hover:text-ink"}`}>
      {label}
    </Link>
  );
}
