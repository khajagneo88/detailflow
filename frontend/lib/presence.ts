import type { User } from "@/types";

export type PresenceStatus = "working" | "idle" | "offline";

/** How stale User.last_seen_at can be before someone counts as offline.
 * The heartbeat that sets it fires on every authenticated request but the
 * server only actually writes it once a minute (app/api/deps.py), and the
 * frontend's own background poll runs every 30s (TimeTrackingContext) — 90s
 * tolerates one missed poll without flickering someone to grey while
 * they're still clearly at their desk. See docs/ARCHITECTURE.md §17. */
const ONLINE_THRESHOLD_MS = 90_000;

/** green ("working"): online and has a room timer running right now.
 * red ("idle"): online but nothing currently running.
 * grey ("offline"): deactivated, never seen, or last seen too long ago. */
export function presenceStatus(user: User, hasActiveTimer: boolean): PresenceStatus {
  if (!user.is_active || !user.last_seen_at) return "offline";
  const lastSeenMs = new Date(user.last_seen_at).getTime();
  if (Date.now() - lastSeenMs > ONLINE_THRESHOLD_MS) return "offline";
  return hasActiveTimer ? "working" : "idle";
}

export const PRESENCE_META: Record<PresenceStatus, { label: string; dotClassName: string }> = {
  working: { label: "Working on a job right now", dotClassName: "bg-success" },
  idle: { label: "Online, nothing in progress", dotClassName: "bg-danger" },
  offline: { label: "Offline", dotClassName: "bg-muted-foreground/50" },
};
