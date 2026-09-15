"use client";

import * as React from "react";

import { ApiError } from "@/lib/api-client";
import type { TimeEntry } from "@/types";

import { timeEntriesApi } from "./api";

interface TimeTrackingContextValue {
  /** The current user's running automatic stage-clock, across every room —
   * there can be at most one (enforced by a DB constraint on the backend,
   * which is also what makes "one active task per detailer" hold). Null
   * while nothing is running. Read-only: it starts and stops itself as a
   * side effect of the Start / On Hold / Next Stage / Submit IFA / Submit
   * IFC review actions (see features/rooms/RoomActions.tsx) — there's no
   * more manual start/stop control, so this context exists purely to poll
   * and display it (the header's chip, "running elsewhere" messaging). */
  activeEntry: TimeEntry | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const TimeTrackingContext = React.createContext<TimeTrackingContextValue | undefined>(undefined);

// Background safety net — catches a timer started/stopped elsewhere
// (another tab, another device). Any start/stop this tab performs updates
// state immediately via start()/stop() below, so this interval only matters
// when it wasn't this tab that changed things.
const POLL_INTERVAL_MS = 30_000;

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const [activeEntry, setActiveEntry] = React.useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const entry = await timeEntriesApi.getActive();
      setActiveEntry(entry);
    } catch (err) {
      // A 401 here just means the session ended — AppLayout's redirect
      // handles that; don't let a failed background poll clear a timer
      // that's still genuinely running.
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Only setInterval/setTimeout registrations happen directly in the
    // effect body; refresh() itself (which setStates) only ever runs from
    // inside one of their callbacks, the same "external system" pattern the
    // polling interval below uses — including the very first fetch, fired
    // on the next tick rather than called inline here.
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh]);

  const value = React.useMemo(
    () => ({ activeEntry, isLoading, refresh }),
    [activeEntry, isLoading, refresh]
  );

  return <TimeTrackingContext.Provider value={value}>{children}</TimeTrackingContext.Provider>;
}

export function useTimeTracking() {
  const ctx = React.useContext(TimeTrackingContext);
  if (!ctx) throw new Error("useTimeTracking must be used within a TimeTrackingProvider");
  return ctx;
}
