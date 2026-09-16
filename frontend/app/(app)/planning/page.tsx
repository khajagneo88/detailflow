"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthContext";
import { planningApi } from "@/features/planning/api";
import { TaskPickerDialog } from "@/features/planning/TaskPickerDialog";
import { settingsApi } from "@/features/settings/api";
import { usersApi } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import {
  categorizeBatchStatus,
  categorizeRoomStage,
  PLAN_CATEGORY_LEGEND_ORDER,
  PLAN_CATEGORY_STYLES,
  weekCompletionRing,
  weekCompletionTooltip,
} from "@/lib/plan-colors";
import { canManage } from "@/lib/roles";
import { addWeeks, formatDayHeading, formatWeekRange, isPastWeek, weekStartOf, weekdayDates } from "@/lib/week";
import type { EligibleTasks, PlanEntry, User, Weekday } from "@/types";

const PLANNABLE_ROLES = new Set(["detailer", "nester"]);

function entryLabel(entry: PlanEntry): { primary: string; secondary: string } {
  if (entry.room) {
    return {
      primary: entry.room.name,
      secondary: [entry.room.project_name, entry.room.apartment_name].filter(Boolean).join(" · "),
    };
  }
  if (entry.batch) {
    return { primary: `Batch ${entry.batch.batch_number}`, secondary: entry.batch.project_name ?? "" };
  }
  return { primary: "Unknown task", secondary: "" };
}

/** One task chip in a detailer/day cell — colour-coded by category (see
 * lib/plan-colors.ts), draggable to another cell for management roles (see
 * the "Drag vs dropdown" note on PlanningPage below), with a remove
 * control and, once the viewed week is fully over, a green/red completion
 * ring showing whether the task actually finished during that week (see
 * lib/plan-colors.ts::weekCompletionRing — replaces the old per-day
 * worked/not-worked dot; docs/ARCHITECTURE.md). */
function PlanEntryChip({
  entry,
  canEdit,
  isDragging,
  weekStart,
  weekEnd,
  anchorWeekday,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  entry: PlanEntry;
  canEdit: boolean;
  isDragging: boolean;
  weekStart: string;
  weekEnd: string;
  anchorWeekday: Weekday;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  const category = entry.room
    ? categorizeRoomStage(entry.room.workflow_stage.key)
    : entry.batch
      ? categorizeBatchStatus(entry.batch.status)
      : "new_project";
  const style = PLAN_CATEGORY_STYLES[category];
  const { primary, secondary } = entryLabel(entry);

  const ring = weekCompletionRing(entry.task_completed_at, weekStart, weekEnd, anchorWeekday);
  const completionTitle = weekCompletionTooltip(entry.task_completed_at, weekStart, weekEnd, anchorWeekday);
  const ringClass =
    ring === "success" ? "ring-2 ring-success" : ring === "danger" ? "ring-2 ring-danger" : "";

  const tooltipParts = [primary, secondary, entry.note, completionTitle].filter(Boolean);

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        if (!canEdit) return;
        e.dataTransfer.setData("text/plain", String(entry.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={tooltipParts.join(" — ")}
      className={`group relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity ${style.chipClass} ${ringClass} ${
        isDragging ? "opacity-40" : ""
      } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium leading-tight">{primary}</span>
        {secondary && <span className="truncate text-[10px] opacity-75 leading-tight">{secondary}</span>}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-full opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Remove ${primary}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Legend explaining the 5 (+1) task-category colours — mirrors this app's
 * other small legend patterns (e.g. the past-week note the old Planning
 * page showed, §19.3). */
function ColorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {PLAN_CATEGORY_LEGEND_ORDER.map((category) => {
        const style = PLAN_CATEGORY_STYLES[category];
        return (
          <span key={category} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${style.dotClass}`} aria-hidden />
            {style.label}
          </span>
        );
      })}
    </div>
  );
}

export default function PlanningPage() {
  const { user } = useAuth();
  const canEdit = canManage(user?.role);

  // Which day the grid's week starts on is an admin-configurable workspace
  // setting (AppSettings.planning_week_start_day — see Settings), not a
  // hardcoded constant, so the actual weekStart/days below only get
  // computed once it's loaded (null = "don't know yet, don't guess").
  const [anchorWeekday, setAnchorWeekday] = React.useState<Weekday | null>(null);
  const [weekStart, setWeekStart] = React.useState<string | null>(null);
  const days = React.useMemo(() => (weekStart ? weekdayDates(weekStart) : []), [weekStart]);
  // Last displayed day of the viewed week — the grid only ever shows 5
  // business days (lib/week.ts::weekdayDates), so "the week" a task was
  // assigned to means that 5-day range, not the full 7-day calendar week.
  // Passed to every chip so the completion ring judges against the same
  // range the grid itself is currently showing, rather than recomputing it
  // per entry.
  const weekEnd = days[4];
  const weekIsOver = weekStart && anchorWeekday ? isPastWeek(weekStart, anchorWeekday) : false;

  const [users, setUsers] = React.useState<User[] | null>(null);
  const [entries, setEntries] = React.useState<PlanEntry[] | null>(null);
  const [eligibleTasks, setEligibleTasks] = React.useState<EligibleTasks | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    settingsApi
      .get()
      .then((settings) => {
        setAnchorWeekday(settings.planning_week_start_day);
        setWeekStart(weekStartOf(settings.planning_week_start_day));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load settings."));
  }, []);

  const [pickerFor, setPickerFor] = React.useState<{ userId: number; date: string } | null>(null);
  const [draggingId, setDraggingId] = React.useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = React.useState<string | null>(null);

  // Rows = every detailer or nester — the two roles that actually do
  // plannable work (early modelling/IFA/IFC rooms, and BOM/nesting batches
  // respectively, per docs/ARCHITECTURE.md §21). Deliberately excludes
  // team_leader/manager/admin/project_manager, same filter the old Planning
  // page already applied to detailers, extended to include nester.
  const rows = React.useMemo(
    () => (users ?? []).filter((u) => PLANNABLE_ROLES.has(u.role)),
    [users]
  );

  React.useEffect(() => {
    usersApi
      .list()
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users."));
    planningApi
      .eligibleTasks()
      .then(setEligibleTasks)
      .catch(() => setEligibleTasks({ rooms: [], batches: [] }));
  }, []);

  React.useEffect(() => {
    if (days.length === 0) return; // settings haven't loaded yet — nothing to fetch
    planningApi
      .listEntries(days[0], days[4])
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the plan."));
  }, [days]);

  const entriesByCell = React.useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const entry of entries ?? []) {
      const key = `${entry.user_id}-${entry.date}`;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [entries]);

  function upsertEntry(entry: PlanEntry) {
    setEntries((prev) => {
      if (!prev) return [entry];
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
  }

  function removeEntryFromState(id: number) {
    setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null);
  }

  async function handleRemove(entry: PlanEntry) {
    setError(null);
    try {
      await planningApi.deleteEntry(entry.id);
      removeEntryFromState(entry.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove task.");
    }
  }

  // Drag-and-drop vs. dropdown-only: the product ask treats the dropdown
  // picker as sufficient on its own ("maybe like a drop down menu"), with
  // real drag-and-drop called out explicitly as a nice-to-have to add only
  // if it's cheap. This is plain native HTML5 drag-and-drop (draggable +
  // onDragStart/onDragOver/onDrop) — no new dependency, no drag library —
  // moving a chip to a different cell just PATCHes the entry's user_id/date,
  // the same call a "move" menu action would have made. Kept deliberately
  // simple: no cross-cell reordering-by-position, no touch-drag fallback
  // (touch devices still have remove + re-add via the picker, which was
  // always the accepted baseline).
  async function handleDrop(targetUserId: number, targetDate: string) {
    setDragOverKey(null);
    if (draggingId === null) return;
    const entry = (entries ?? []).find((e) => e.id === draggingId);
    setDraggingId(null);
    if (!entry) return;
    if (entry.user_id === targetUserId && entry.date === targetDate) return; // dropped on itself

    setError(null);
    try {
      const updated = await planningApi.updateEntry(entry.id, {
        user_id: targetUserId,
        date: targetDate,
      });
      upsertEntry(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to move task.");
    }
  }

  const picker = pickerFor
    ? {
        detailer: rows.find((r) => r.id === pickerFor.userId),
        date: pickerFor.date,
      }
    : null;
  const plannedRoomIdsForPickerDate = new Set(
    pickerFor
      ? (entries ?? []).filter((e) => e.date === pickerFor.date && e.room_id).map((e) => e.room_id as number)
      : []
  );
  const plannedBatchIdsForPickerDate = new Set(
    pickerFor
      ? (entries ?? []).filter((e) => e.date === pickerFor.date && e.batch_id).map((e) => e.batch_id as number)
      : []
  );

  if (!weekStart || !anchorWeekday) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Planning</h1>
        <p className="text-sm text-muted-foreground">
          Day-by-day planning for every detailer and nester — assign specific rooms or batches to
          each person for each day of the week. Assigning a room here also makes it that
          detailer&apos;s real assignment.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeekStart((w) => (w ? addWeeks(w, -1) : w))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-48 text-center text-sm font-medium">{formatWeekRange(weekStart)}</span>
          <Button size="sm" variant="outline" onClick={() => setWeekStart((w) => (w ? addWeeks(w, 1) : w))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekStartOf(anchorWeekday))}>
            This week
          </Button>
        </div>
        <ColorLegend />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Week of {formatWeekRange(weekStart)}
          </CardTitle>
          {weekIsOver && (
            <p className="text-xs text-muted-foreground">
              This week is over — a{" "}
              <span className="font-medium text-success">green ring</span> means a task was
              completed during this week; a{" "}
              <span className="font-medium text-danger">red ring</span> means it wasn&apos;t
              (never completed, or finished later than this week).
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!users || !entries ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No detailer or nester accounts yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Detailer</TableHead>
                  {days.map((day) => (
                    <TableHead key={day} className="min-w-48">
                      {formatDayHeading(day)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((person) => (
                  <TableRow key={person.id} className="align-top hover:bg-transparent">
                    <TableCell className="whitespace-nowrap align-top text-sm font-medium">
                      {person.full_name}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {person.role === "nester" ? "(Nester)" : ""}
                      </span>
                    </TableCell>
                    {days.map((day) => {
                      const cellKey = `${person.id}-${day}`;
                      const cellEntries = entriesByCell.get(cellKey) ?? [];
                      const isDragOver = dragOverKey === cellKey;
                      return (
                        <TableCell
                          key={cellKey}
                          className={`align-top ${isDragOver ? "bg-primary/5" : ""}`}
                          onDragOver={(e) => {
                            if (!canEdit || draggingId === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (dragOverKey !== cellKey) setDragOverKey(cellKey);
                          }}
                          onDragLeave={() => {
                            setDragOverKey((prev) => (prev === cellKey ? null : prev));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            void handleDrop(person.id, day);
                          }}
                        >
                          <div className="flex flex-col gap-1">
                            {cellEntries.map((entry) => (
                              <PlanEntryChip
                                key={entry.id}
                                entry={entry}
                                canEdit={canEdit}
                                isDragging={draggingId === entry.id}
                                weekStart={weekStart}
                                weekEnd={weekEnd}
                                anchorWeekday={anchorWeekday}
                                onDragStart={() => setDraggingId(entry.id)}
                                onDragEnd={() => {
                                  setDraggingId(null);
                                  setDragOverKey(null);
                                }}
                                onRemove={() => void handleRemove(entry)}
                              />
                            ))}
                            {cellEntries.length === 0 && !canEdit && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => setPickerFor({ userId: person.id, date: day })}
                                className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                              >
                                <Plus className="h-3 w-3" />
                                Add task
                              </button>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {picker?.detailer && (
        <TaskPickerDialog
          detailer={picker.detailer}
          date={picker.date}
          eligibleTasks={eligibleTasks}
          plannedRoomIds={plannedRoomIdsForPickerDate}
          plannedBatchIds={plannedBatchIdsForPickerDate}
          onClose={() => setPickerFor(null)}
          onCreated={(entry) => upsertEntry(entry)}
        />
      )}
    </div>
  );
}
