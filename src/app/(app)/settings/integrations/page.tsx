import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { ProviderSwitch } from "./provider-switch";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireRole(["admin"]);
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  const [settings] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, org.id));

  return (
    <div>
      <h1 className="font-display font-bold text-2xl mb-1">Integrations</h1>
      <p className="text-[13px] text-ink-faint mb-5">Outbound messaging provider for the Marketing outbox.</p>

      <div className="card max-w-lg">
        <div className="card-title">ESP provider</div>
        <div className="p-4">
          <ProviderSwitch current={settings?.espProvider ?? "mock"} />
          <div className="mt-4 pt-4 border-t border-line-soft text-[12px] text-ink-faint leading-relaxed">
            <b className="text-ink-soft block mb-1">No real provider is connected in this environment.</b>
            A production integration (Twilio, Resend, SNS, etc.) implements the <code className="font-data bg-surface-muted px-1 py-0.5 rounded">EspProvider</code> interface
            in <code className="font-data bg-surface-muted px-1 py-0.5 rounded">src/modules/automation/providers.ts</code> — nothing else in the codebase changes.
            A documented Twilio stub is already in that file, including the exact environment variables it would need
            (<code className="font-data bg-surface-muted px-1 py-0.5 rounded">TWILIO_ACCOUNT_SID</code>, <code className="font-data bg-surface-muted px-1 py-0.5 rounded">TWILIO_AUTH_TOKEN</code>, <code className="font-data bg-surface-muted px-1 py-0.5 rounded">TWILIO_FROM_NUMBER</code>).
          </div>
        </div>
      </div>
    </div>
  );
}
