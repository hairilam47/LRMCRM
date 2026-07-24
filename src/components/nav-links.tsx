"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDashboard, IconFunnel, IconBuilding, IconUser, IconKanban,
  IconUsers, IconSliders, IconTicket, IconTerminal, IconReceipt, IconSend,
} from "./icons";

type NavItem = { href: string; label: string; roles?: string[]; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { workspace: "crm" | "loyalty"; label?: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    workspace: "crm",
    items: [{ href: "/crm/dashboard", label: "Dashboard", icon: IconDashboard }],
  },
  {
    workspace: "crm",
    label: "CRM",
    items: [
      { href: "/crm/leads", label: "Leads", icon: IconFunnel },
      { href: "/crm/accounts", label: "Accounts", icon: IconBuilding },
      { href: "/crm/contacts", label: "Contacts", icon: IconUser },
      { href: "/crm/deals", label: "Deals", icon: IconKanban },
    ],
  },
  {
    workspace: "loyalty",
    items: [{ href: "/loyalty/dashboard", label: "Dashboard", icon: IconDashboard }],
  },
  {
    workspace: "loyalty",
    label: "Loyalty",
    items: [
      { href: "/loyalty/members", label: "Members", roles: ["admin", "marketing", "store_ops"], icon: IconUsers },
      { href: "/loyalty/programs", label: "Programs", roles: ["admin", "marketing"], icon: IconSliders },
      { href: "/loyalty/vouchers", label: "Vouchers", roles: ["admin", "marketing"], icon: IconTicket },
    ],
  },
  {
    workspace: "loyalty",
    label: "POS",
    items: [
      { href: "/loyalty/pos/simulator", label: "Simulator", roles: ["admin", "store_ops"], icon: IconTerminal },
      { href: "/loyalty/pos/transactions", label: "Transactions", roles: ["admin", "store_ops"], icon: IconReceipt },
    ],
  },
  {
    workspace: "loyalty",
    label: "Marketing",
    items: [{ href: "/loyalty/marketing/outbox", label: "Outbox", roles: ["admin", "marketing"], icon: IconSend }],
  },
];

/** Matches each page's own requireRole() call exactly — keep in sync. */
export function NavLinks({ role, collapsed, workspace }: { role: string; collapsed: boolean; workspace: "crm" | "loyalty" }) {
  const pathname = usePathname();
  const allowed = (roles?: string[]) => !roles || role === "admin" || roles.includes(role);

  return (
    <>
      {groups.filter((g) => g.workspace === workspace).map((g, i) => {
        const items = g.items.filter((it) => allowed(it.roles));
        if (items.length === 0) return null;
        return (
          <div key={i} className="flex flex-col gap-0.5">
            {g.label && !collapsed && (
              <div className="font-bold text-[10px] tracking-[1px] uppercase text-[#6d6d6d] px-2.5 mb-1">{g.label}</div>
            )}
            {g.label && collapsed && <div className="h-px bg-panel-line mx-2 my-1.5" />}
            {items.map((it) => {
              const active = pathname.startsWith(it.href);
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={collapsed ? it.label : undefined}
                  className={`nav-item ${active ? "active" : ""} ${collapsed ? "justify-center px-0 rail" : ""}`}
                >
                  <Icon className={active ? "text-brand-b" : "text-[#8a8a8a]"} />
                  {!collapsed && it.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
