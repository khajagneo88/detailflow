"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, LogOut, Timer } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { notificationsApi } from "@/features/notifications/api";
import { useTimeTracking } from "@/features/time-entries/TimeTrackingContext";
import { ApiError } from "@/lib/api-client";
import { formatElapsed, formatRelativeTime, useElapsedSeconds } from "@/lib/time";
import { ROLE_LABELS } from "@/lib/status";
import type { Notification } from "@/types";

/** Read-only display of the current user's automatic stage-clock — there's
 * no manual timer to stop anymore (see TimeTrackingContext): it stops
 * itself the moment the detailer puts the room on hold, submits it for
 * review, or moves it to the next stage. This chip just shows where that
 * clock is currently running. */
function RunningTimerChip() {
  const { activeEntry } = useTimeTracking();
  const elapsed = useElapsedSeconds(activeEntry?.started_at ?? null);

  if (!activeEntry) return null;

  return (
    <Link
      href={`/rooms/${activeEntry.room_id}`}
      className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm hover:bg-primary/10"
      title="Time is being tracked automatically for this room"
    >
      <Timer className="h-4 w-4 text-primary" />
      <span className="font-medium">{activeEntry.room_name ?? "Room"}</span>
      <span className="tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
    </Link>
  );
}

// Same background-poll interval TimeTrackingContext uses for its own
// safety-net refresh (see that file) — nothing here needs to feel
// real-time, just not stale for more than about half a minute.
const NOTIFICATION_POLL_INTERVAL_MS = 30_000;

/** Bell icon + unread badge in the header, with a click-to-open panel
 * listing recent notifications (see app/api/routes/notifications.py). Kept
 * self-contained (its own polling, no context/provider) since the header is
 * the only place this appears — same reasoning RunningTimerChip above
 * doesn't need one either, just backed by an API poll instead of the
 * TimeTrackingContext it reads from. */
function NotificationBell() {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [unreadCount, setUnreadCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [markingId, setMarkingId] = React.useState<number | null>(null);
  const [markingAll, setMarkingAll] = React.useState(false);

  const refreshUnreadCount = React.useCallback(async () => {
    try {
      const { count } = await notificationsApi.unreadCount();
      setUnreadCount(count);
    } catch (err) {
      // Best-effort, same as the Team page's presence poll — a failed
      // background check just leaves the badge at its last-known count.
      if (!(err instanceof ApiError)) throw err;
    }
  }, []);

  React.useEffect(() => {
    // Mirrors TimeTrackingContext: only the timer registrations happen
    // directly in the effect body, with the first fetch deferred to the
    // next tick rather than called inline here.
    const initial = setTimeout(refreshUnreadCount, 0);
    const interval = setInterval(refreshUnreadCount, NOTIFICATION_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refreshUnreadCount]);

  const loadList = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setNotifications(await notificationsApi.list());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  function toggleOpen() {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      if (willOpen) loadList();
      return willOpen;
    });
  }

  // Close on outside click or Escape — same behaviour as the hand-rolled
  // Dialog (components/ui/dialog.tsx), reimplemented here since this is an
  // anchored dropdown, not a centered modal.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleClick(notification: Notification) {
    if (notification.read_at === null) {
      setMarkingId(notification.id);
      try {
        const updated = await notificationsApi.markRead(notification.id);
        setNotifications((prev) => prev?.map((n) => (n.id === updated.id ? updated : n)) ?? null);
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to mark as read.");
      } finally {
        setMarkingId(null);
      }
    }
    setOpen(false);
    if (notification.room) router.push(`/rooms/${notification.room.id}`);
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      setNotifications(
        (prev) => prev?.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })) ?? null
      );
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to mark all as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button variant="ghost" size="icon" onClick={toggleOpen} title="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" disabled={markingAll} onClick={handleMarkAllRead}>
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            )}
            {error && <p className="px-3 py-3 text-sm text-danger">{error}</p>}
            {!isLoading && !error && notifications?.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            )}
            {!isLoading &&
              notifications?.map((notification) => {
                const isUnread = notification.read_at === null;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    disabled={markingId === notification.id}
                    onClick={() => handleClick(notification)}
                    className={`flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-muted ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className={`text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>
                        {notification.title}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{notification.body}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(notification.created_at)}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
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
          <NotificationBell />
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
