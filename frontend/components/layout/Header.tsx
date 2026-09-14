"use client";

import Link from "next/link";
import { LogOut, Square, Timer } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { useTimeTracking } from "@/features/time-entries/TimeTrackingContext";
import { formatElapsed, useElapsedSeconds } from "@/lib/time";
import { ROLE_LABELS } from "@/lib/status";

function RunningTimerChip() {
  const { activeEntry, stop } = useTimeTracking();
  const [isStopping, setIsStopping] = React.useState(false);
  const elapsed = useElapsedSeconds(activeEntry?.started_at ?? null);

  if (!activeEntry) return null;

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await stop();
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 py-1.5 pl-3 pr-1.5 text-sm">
      <Timer className="h-4 w-4 text-primary" />
      <Link href={`/rooms/${activeEntry.room_id}`} className="font-medium hover:underline">
        {activeEntry.room_name ?? "Room"}
      </Link>
      <span className="tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleStop}
        disabled={isStopping}
        title="Stop timer"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </Button>
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
      <div>
        <RunningTimerChip />
      </div>
      {user && (
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium">{user.full_name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => logout()} title="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}
    </header>
  );
}
