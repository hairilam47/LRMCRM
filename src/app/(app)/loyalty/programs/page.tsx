import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { rm } from "@/lib/format";

export const dynamic = "force-dynamic";
const { loyaltyPrograms, loyaltyTiers, stampCards, prepaidPacks } = schema;

export default async function ProgramsPage() {
  await requireRole(["admin", "marketing"]);
  const db = await getDb();

  const [program] = await db.select().from(loyaltyPrograms).limit(1);
  const [tiers, stamps, packs] = await Promise.all([
    db.select().from(loyaltyTiers).where(eq(loyaltyTiers.programId, program.id)).orderBy(loyaltyTiers.position),
    db.select().from(stampCards).where(eq(stampCards.programId, program.id)),
    db.select().from(prepaidPacks).where(eq(prepaidPacks.orgId, program.orgId)),
  ]);

  async function updateProgram(formData: FormData) {
    "use server";
    const db2 = await getDb();
    await db2.update(loyaltyPrograms).set({
      earnRatePerRm: Number(formData.get("earnRate")),
      cashbackBps: Number(formData.get("cashbackBps")),
      pointValueSen: Number(formData.get("pointValue")),
    }).where(eq(loyaltyPrograms.id, program.id));
    revalidatePath("/loyalty/programs");
  }

  async function updateTier(formData: FormData) {
    "use server";
    const id = String(formData.get("tierId"));
    const db2 = await getDb();
    await db2.update(loyaltyTiers).set({
      minAnnualSpendSen: Number(formData.get("minSpend")) * 100,
      multiplierPct: Number(formData.get("multiplier")),
    }).where(eq(loyaltyTiers.id, id));
    revalidatePath("/loyalty/programs");
  }

  async function createStampCard(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const db2 = await getDb();
    await db2.insert(stampCards).values({
      programId: program.id, name,
      qualifyingCategory: String(formData.get("category") ?? "").trim(),
      goal: Number(formData.get("goal") ?? 8),
      rewardLabel: String(formData.get("rewardLabel") ?? "").trim() || `Free after ${formData.get("goal")}`,
    });
    revalidatePath("/loyalty/programs");
  }

  async function toggleStampCard(formData: FormData) {
    "use server";
    const id = String(formData.get("cardId"));
    const active = formData.get("active") === "true";
    const db2 = await getDb();
    await db2.update(stampCards).set({ active: !active }).where(eq(stampCards.id, id));
    revalidatePath("/loyalty/programs");
  }

  async function createPack(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const db2 = await getDb();
    await db2.insert(prepaidPacks).values({
      orgId: program.orgId, name,
      itemCategory: String(formData.get("category") ?? "").trim(),
      quantity: Number(formData.get("quantity") ?? 10),
      priceSen: Math.round(Number(formData.get("price") ?? 0) * 100),
    });
    revalidatePath("/loyalty/programs");
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-bold text-2xl">{program.name}</h1>
        <div className="text-[13px] text-ink-faint mt-0.5">Program configuration — changes apply to the next transaction, ledgers are never rewritten</div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4 max-lg:grid-cols-1">
        <div className="card">
          <div className="card-title">Earn rules</div>
          <form action={updateProgram} className="p-4 flex flex-col gap-3.5">
            <div className="field"><label>Points per RM 1 (net spend)</label><input name="earnRate" type="number" defaultValue={program.earnRatePerRm} /></div>
            <div className="field"><label>Cashback (basis points, 300 = 3%)</label><input name="cashbackBps" type="number" defaultValue={program.cashbackBps} /></div>
            <div className="field"><label>Point value in sen (redemption)</label><input name="pointValue" type="number" defaultValue={program.pointValueSen} /></div>
            <button className="btn-primary self-start" type="submit">Save earn rules</button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Stamp cards</div>
          <div className="p-4 flex flex-col gap-3">
            {stamps.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-[13px] border-b border-line-soft last:border-0 pb-3 last:pb-0">
                <div>
                  <b className="font-semibold block">{s.name}</b>
                  <span className="text-[11px] text-ink-faint">Buy {s.goal} · category &ldquo;{s.qualifyingCategory}&rdquo; → {s.rewardLabel}</span>
                </div>
                <form action={toggleStampCard}>
                  <input type="hidden" name="cardId" value={s.id} />
                  <input type="hidden" name="active" value={String(s.active)} />
                  <button type="submit" className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full ${s.active ? "bg-success-soft text-success" : "bg-surface-muted text-ink-faint"}`}>
                    {s.active ? "active" : "inactive"}
                  </button>
                </form>
              </div>
            ))}
            <form action={createStampCard} className="border-t border-line-soft pt-3 flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="field"><label>Name</label><input name="name" required placeholder="e.g. Latte Lovers" /></div>
                <div className="field"><label>Qualifying category</label><input name="category" required placeholder="coffee" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="field"><label>Goal (buy N)</label><input name="goal" type="number" defaultValue={8} /></div>
                <div className="field"><label>Reward label</label><input name="rewardLabel" placeholder="Free item" /></div>
              </div>
              <button className="btn-ghost self-start text-[12px] h-8" type="submit">+ Add stamp card</button>
            </form>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-title">Tiers</div>
        <div className="p-4 grid grid-cols-3 gap-3.5 max-lg:grid-cols-1">
          {tiers.map((t) => (
            <form key={t.id} action={updateTier} className="border border-line rounded-xl p-3.5 flex flex-col gap-2.5">
              <input type="hidden" name="tierId" value={t.id} />
              <b className="font-display font-bold text-[15px]">{t.name}</b>
              <div className="field"><label>Min annual spend (RM)</label><input name="minSpend" type="number" defaultValue={t.minAnnualSpendSen / 100} /></div>
              <div className="field"><label>Multiplier (% — 150 = ×1.5)</label><input name="multiplier" type="number" defaultValue={t.multiplierPct} /></div>
              <button className="btn-ghost text-[12px] h-8" type="submit">Save {t.name}</button>
            </form>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Prepaid packs</div>
        <div className="p-4 flex flex-col gap-2.5">
          {packs.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-[13px] border-b border-line-soft last:border-0 pb-2.5 last:pb-0">
              <div>
                <b className="font-semibold block">{p.name}</b>
                <span className="text-[11px] text-ink-faint">{p.quantity}× {p.itemCategory}</span>
              </div>
              <span className="font-data font-semibold">{rm(p.priceSen)}</span>
            </div>
          ))}
          <form action={createPack} className="border-t border-line-soft pt-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="field"><label>Name</label><input name="name" required placeholder="e.g. 10-Coffee Pack" /></div>
              <div className="field"><label>Category</label><input name="category" required placeholder="coffee" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="field"><label>Quantity</label><input name="quantity" type="number" defaultValue={10} /></div>
              <div className="field"><label>Price (RM)</label><input name="price" type="number" defaultValue={100} /></div>
            </div>
            <button className="btn-ghost self-start text-[12px] h-8" type="submit">+ Add prepaid pack</button>
          </form>
        </div>
      </div>
    </div>
  );
}
