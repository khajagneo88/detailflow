"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/features/auth/AuthContext";
import { TimeTrackingProvider } from "@/features/time-entries/TimeTrackingContext";

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

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

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
