"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Users,
  CalendarRange,
  BarChart3,
  Settings,
} from "lucide-react";

import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/my-work", label: "My Work", icon: ListChecks },
  { href: "/team", label: "Team", icon: Users },
  { href: "/planning", label: "Planning", icon: CalendarRange },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// A Detailer's job is working their own assigned rooms — Planning,
// Reports, Projects, Team and Settings are management/oversight screens
// that don't apply to them (and several 403 outright if a detailer somehow
// lands there). Everyone else keeps the full nav. Mirrors the equivalent
// route-level redirect in app/(app)/layout.tsx, which is the real
// enforcement — this just keeps a detailer from seeing links to pages
// they'd immediately bounce from. See docs/ARCHITECTURE.md.
const DETAILER_HIDDEN_HREFS = new Set(["/projects", "/team", "/planning", "/reports", "/settings"]);

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isDetailer = user?.role === "detailer";
  const items = isDetailer
    ? NAV_ITEMS.filter((item) => !DETAILER_HIDDEN_HREFS.has(item.href))
    : NAV_ITEMS;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight">DetailFlow</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
