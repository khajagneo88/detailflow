/**
 * Small shared helpers for displaying timer/duration data — used by the
 * header's running-timer indicator, the room detail Time card, and the
 * Reports hours column, so "how do we format a duration" has one answer.
 */
import * as React from "react";

function computeElapsedSeconds(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

/** Ticks once a second while a timer with this start time is running. */
export function useElapsedSeconds(startedAt: string | null): number {
  // Resetting the displayed value when startedAt changes happens during
  // render (React's recommended pattern for "adjust state on prop change")
  // rather than in the effect below — the effect's only job is subscribing
  // to the tick, which is the external-system callback that's allowed to
  // setState.
  const [prevStartedAt, setPrevStartedAt] = React.useState(startedAt);
  const [elapsed, setElapsed] = React.useState(() => computeElapsedSeconds(startedAt));
  if (startedAt !== prevStartedAt) {
    setPrevStartedAt(startedAt);
    setElapsed(computeElapsedSeconds(startedAt));
  }

  React.useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setElapsed(computeElapsedSeconds(startedAt)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

/** "1:04:32" once past an hour, "04:32" under. */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/** "3m ago" / "5h ago" / "2d ago", falling back to a plain date once it's
 * further back than that reads usefully — used by the notification
 * dropdown (features/notifications). */
export function formatRelativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}
