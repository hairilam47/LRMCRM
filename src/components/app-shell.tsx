"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { NavLinks } from "./nav-links";
import { IconChevronLeft, IconLogout } from "./icons";

const STORAGE_KEY = "loya:sidebar-collapsed";

export function AppShell({
  role, userName, workspace, workspaceLabel, canSwitch, children, onLogout,
}: {
  role: string; userName: string; workspace: "crm" | "loyalty"; workspaceLabel: string;
  canSwitch: boolean; children: React.ReactNode; onLogout: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const sidebarWidth = collapsed ? 68 : 216;
  const workspaceAccent = workspace === "crm" ? "linear-gradient(180deg,#4480FF,#115DFC,#0550ED)" : "linear-gradient(120deg,#1CB0FF,#40FF99)";

  return (
    <div
      className="grid min-h-screen"
      style={{ gridTemplateColumns: `${sidebarWidth}px 1fr`, transition: hydrated ? "grid-template-columns 0.2s ease" : undefined }}
    >
      <aside className="bg-panel-dark text-[#cfcfcf] py-5 flex flex-col gap-5 sticky top-0 h-screen overflow-y-auto overflow-x-hidden" style={{ paddingInline: collapsed ? 10 : 12 }}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} px-0`}>
          {canSwitch ? (
            <Link href="/" className="flex items-center gap-2 px-2 min-w-0" title={collapsed ? "Back to hub" : undefined}>
              <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-brand-a to-brand-b flex items-center justify-center font-display font-extrabold text-[13px] text-[#161616]">
                L
              </div>
              {!collapsed && <b className="font-display text-[15px] text-[#f2f2f2] whitespace-nowrap">LOYA</b>}
            </Link>
          ) : (
            <div className="flex items-center gap-2 px-2 min-w-0">
              <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-brand-a to-brand-b flex items-center justify-center font-display font-extrabold text-[13px] text-[#161616]">
                L
              </div>
              {!collapsed && <b className="font-display text-[15px] text-[#f2f2f2] whitespace-nowrap">LOYA</b>}
            </div>
          )}
          {!collapsed && (
            <button
              onClick={toggle}
              aria-label="Collapse sidebar"
              className="w-6 h-6 rounded-md flex items-center justify-center text-[#8a8a8a] hover:text-white hover:bg-[#2a2a2a] shrink-0"
            >
              <IconChevronLeft />
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="px-2 -mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: workspaceAccent }} />
            <span className="text-[11px] font-semibold text-[#9a9a9a] uppercase tracking-wide truncate">{workspaceLabel}</span>
            {canSwitch && (
              <span className="ml-auto flex items-center gap-2 shrink-0">
                <Link href="/settings/users" className="text-[10px] font-semibold text-[#7a7a7a] hover:text-white">Settings</Link>
                <Link href="/" className="text-[10px] font-semibold text-[#7a7a7a] hover:text-white">Switch</Link>
              </span>
            )}
          </div>
        )}

        {collapsed && (
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            className="mx-auto w-8 h-8 rounded-md flex items-center justify-center text-[#8a8a8a] hover:text-white hover:bg-[#2a2a2a] -mt-2"
          >
            <IconChevronLeft className="rotate-180" />
          </button>
        )}

        <div className="flex flex-col gap-5 flex-1">
          <NavLinks role={role} collapsed={collapsed} workspace={workspace} />
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {!collapsed && (
            <div className="p-2.5 border border-panel-line rounded-[10px] text-[11px] text-[#9a9a9a]">
              <b className="block text-[12px] text-[#e8e8e8] mb-0.5">Kopi Lima Group</b>
              Signed in as {userName} · {role}
            </div>
          )}
          <form action={onLogout}>
            <button
              type="submit"
              title={collapsed ? "Sign out" : undefined}
              className={`nav-item w-full text-left cursor-pointer bg-transparent border-0 ${collapsed ? "justify-center px-0 rail" : ""}`}
            >
              <IconLogout className="text-[#8a8a8a]" />
              {!collapsed && "Sign out"}
            </button>
          </form>
        </div>
      </aside>
      <main className="px-8 py-6 pb-16 w-full min-w-0">{children}</main>
    </div>
  );
}
