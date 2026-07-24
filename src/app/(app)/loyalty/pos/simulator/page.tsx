import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Simulator } from "./simulator";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  await requireRole(["admin", "store_ops"]);
  const db = await getDb();
  const stores = await db.select().from(schema.stores);
  const catalog = await db.select().from(schema.catalogItems).where(eq(schema.catalogItems.active, true));

  return (
    <div>
      <div className="text-[12px] font-semibold text-ink-faint mb-1.5">POS / <b className="text-ink">Simulator</b></div>
      <h1 className="font-display font-bold text-2xl mb-1">POS Simulator</h1>
      <p className="text-[13px] text-ink-faint mb-5">
        Builds a basket and fires the real webhook — <code className="font-data text-[11px] bg-surface-muted px-1.5 py-0.5 rounded">POST /api/pos/webhook</code> — exactly as Toast, Square or a custom POS would.
      </p>
      <Simulator
        stores={stores.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
        catalog={catalog.map((c) => ({ sku: c.sku, name: c.name, category: c.category, priceSen: c.priceSen, emoji: c.emoji ?? "•" }))}
      />
    </div>
  );
}
