"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/features/auth/AuthContext";
import { planningApi } from "@/features/planning/api";
import { projectsApi } from "@/features/projects/api";
import { reportsApi } from "@/features/reports/api";
import { usersApi } from "@/features/users/api";
import { ApiError } from "@/lib/api-client";
import { canManage } from "@/lib/roles";
import { formatHours, minutesToHours } from "@/lib/time";
import { addWeeks, formatWeekRange, isPastWeek, mondayOf } from "@/lib/week";
import type { ProjectListItem, User, WeeklyLoggedTimeItem, WeeklyPlanEntry } from "@/types";

function loggedTimeKey(userId: number, projectId: number): string {
  return `${userId}-${projectId}`;
}

/** One detailer's plan for the selected week: a chip per project they're
 * planned on (with a remove control for managers), plus the form that adds
 * another one. Kept as its own component so each row's "add" form has its
 * own uncontrolled state without the whole page re-rendering on every
 * keystroke. */
function DetailerPlanRow({
  detailer,
  entries,
  projects,
  weekStart,
  canEdit,
  isPast,
  loggedMinutesByKey,
  onAdd,
  onRemove,
}: {
  detailer: User;
  entries: WeeklyPlanEntry[];
  projects: ProjectListItem[];
  weekStart: string;
  canEdit: boolean;
  isPast: boolean;
  loggedMinutesByKey: Map<string, number>;
  onAdd: (entry: WeeklyPlanEntry) => void;
  onRemove: (id: number) => void;
}) {
  const [projectId, setProjectId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<number | null>(null);

  const plannedProjectIds = new Set(entries.map((e) => e.project_id));
  const availableProjects = projects.filter((p) => !plannedProjectIds.has(p.id));

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const entry = await planningApi.createWeekly({
        project_id: Number(projectId),
        user_id: detailer.id,
        week_start: weekStart,
        note: note || null,
      });
      onAdd(entry);
      setProjectId("");
      setNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add to plan.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(id: number) {
    setRemovingId(id);
    try {
      await planningApi.deleteWeekly(id);
      onRemove(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <p className="w-40 shrink-0 text-sm font-medium">{detailer.full_name}</p>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        {entries.length === 0 && !canEdit && (
          <span className="text-sm text-muted-foreground">Nothing planned this week.</span>
        )}
        {entries.map((entry) => {
          const loggedMinutes = loggedMinutesByKey.get(loggedTimeKey(detailer.id, entry.project_id));
          const worked = loggedMinutes !== undefined;
          const variant = !isPast ? "info" : worked ? "success" : "danger";
          const statusLabel = !isPast
            ? entry.note ?? undefined
            : worked
              ? `Logged ${formatHours(minutesToHours(loggedMinutes))} that week${entry.note ? ` · ${entry.note}` : ""}`
              : `Nothing logged that week${entry.note ? ` · ${entry.note}` : ""}`;
          return (
            <Badge key={entry.id} variant={variant} title={statusLabel}>
              {entry.project_name}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  disabled={removingId === entry.id}
                  className="ml-0.5 rounded-full hover:text-danger"
                  aria-label={`Remove ${entry.project_name} from ${detailer.full_name}'s plan`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}

        {canEdit && availableProjects.length > 0 && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-1.5">
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 w-44"
            >
              <option value="">+ Plan project…</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {projectId && (
              <>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="h-8 w-40"
                />
                <Button type="submit" size="sm" variant="outline" disabled={isSubmitting}>
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </>
            )}
          </form>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function PlanningPage() {
  const { user } = useAuth();
  const canEdit = canManage(user?.role);

  const [weekStart, setWeekStart] = React.useState(() => mondayOf());
  const [entries, setEntries] = React.useState<WeeklyPlanEntry[] | null>(null);
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [users, setUsers] = React.useState<User[] | null>(null);
  const [loggedTime, setLoggedTime] = React.useState<WeeklyLoggedTimeItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const isPast = isPastWeek(weekStart);

  React.useEffect(() => {
    Promise.all([projectsApi.list(), usersApi.list()])
      .then(([p, u]) => {
        setProjects(p.filter((proj) => !proj.is_archived));
        setUsers(u);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, []);

  React.useEffect(() => {
    planningApi
      .listWeekly(weekStart)
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load the plan."));
  }, [weekStart]);

  // Only a past week has anything to judge — the current or a future
  // week's items stay neutral (§19), so there's no point fetching logged
  // time for those. Skipping the fetch (rather than clearing state) for a
  // non-past week is deliberate too: that setState-in-the-effect-body
  // pattern is exactly what react-hooks/set-state-in-effect flags (see
  // §13.4) — and it's unnecessary here anyway, since stale logged-time
  // data is simply never read while isPast is false (both usages below
  // are gated on it).
  React.useEffect(() => {
    if (!isPastWeek(weekStart)) return;
    reportsApi
      .timeLogged(weekStart)
      .then(setLoggedTime)
      .catch(() => setLoggedTime([]));
  }, [weekStart]);

  const detailers = users?.filter((u) => u.role === "detailer") ?? [];
  const loggedMinutesByKey = new Map(
    loggedTime.map((item) => [loggedTimeKey(item.user_id, item.project_id), item.logged_minutes])
  );

  const entriesByDetailer = new Map<number, WeeklyPlanEntry[]>();
  for (const entry of entries ?? []) {
    const list = entriesByDetailer.get(entry.user_id) ?? [];
    list.push(entry);
    entriesByDetailer.set(entry.user_id, list);
  }

  function handleAdd(entry: WeeklyPlanEntry) {
    setEntries((prev) => (prev ? [...prev, entry] : [entry]));
  }

  function handleRemove(id: number) {
    setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Planning</h1>
        <p className="text-sm text-muted-foreground">
          A rough weekly plan of who&apos;s on what project — not a substitute for room-level
          assignment, just enough to sketch out the week ahead. Planning someone onto a project
          also assigns them to it.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="w-48 text-center text-sm font-medium">{formatWeekRange(weekStart)}</span>
        <Button size="sm" variant="outline" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setWeekStart(mondayOf())}>
          This week
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Week of {formatWeekRange(weekStart)}
          </CardTitle>
          {isPast && (
            <p className="text-xs text-muted-foreground">
              Past week — green means they logged time on it that week, red means nothing was
              logged.
            </p>
          )}
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {!projects || !users || !entries ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : detailers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No detailer accounts yet.</p>
          ) : (
            detailers.map((detailer) => (
              <DetailerPlanRow
                key={`${detailer.id}-${weekStart}`}
                detailer={detailer}
                entries={entriesByDetailer.get(detailer.id) ?? []}
                projects={projects}
                weekStart={weekStart}
                canEdit={canEdit}
                isPast={isPast}
                loggedMinutesByKey={loggedMinutesByKey}
                onAdd={handleAdd}
                onRemove={handleRemove}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
