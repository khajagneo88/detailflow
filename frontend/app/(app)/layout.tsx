"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/features/auth/AuthContext";
import { TimeTrackingProvider } from "@/features/time-entries/TimeTrackingContext";

// Mirrors components/layout/Sidebar.tsx's DETAILER_HIDDEN_HREFS — a
// Detailer landing on one of these directly (a stale bookmark, a pasted
// link) gets bounced to Dashboard rather than shown a page whose backend
// calls would mostly 403 anyway. This is convenience only, not the real
// security boundary — every API call independently enforces its own role
// check server-side (see docs/ARCHITECTURE.md §2).
const DETAILER_RESTRICTED_PREFIXES = ["/projects", "/team", "/planning", "/reports", "/settings"];

/**
 * Route-group layout for every authenticated screen. Auth is enforced
 * client-side here by redirecting unauthenticated visitors to /login; the
 * real security boundary is the backend (every API call independently
 * requires a valid session — see docs/ARCHITECTURE.md §2). This guard exists
 * purely so the UI doesn't flash protected content before that's known.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  React.useEffect(() => {
    if (!user || user.role !== "detailer") return;
    if (DETAILER_RESTRICTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      router.replace("/dashboard");
    }
  }, [user, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return null; // redirect effect above is in flight
  }

  return (
    <TimeTrackingProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-x-hidden p-6">{children}</main>
        </div>
      </div>
    </TimeTrackingProvider>
  );
}
