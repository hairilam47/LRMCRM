import { requireUser } from "@/lib/auth";

/**
 * Auth gate only — no visual chrome here. The hub page (/) and each
 * workspace layout (crm/loyalty) build their own header/sidebar, so a
 * single-workspace user never sees double chrome on their way in.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
