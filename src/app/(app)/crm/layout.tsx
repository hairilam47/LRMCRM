import { redirect } from "next/navigation";
import { requireRole, logout } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["admin", "sales"]);
  const canSwitch = user.role === "admin"; // only multi-workspace roles get a way back to the hub

  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <AppShell role={user.role} userName={user.name} workspace="crm" workspaceLabel="CRM Workspace" canSwitch={canSwitch} onLogout={doLogout}>
      {children}
    </AppShell>
  );
}
