"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { projectsApi } from "@/features/projects/api";
import { reportsApi, type StageSummaryItem } from "@/features/reports/api";
import { workflowStagesApi } from "@/features/rooms/api";
import { ApiError } from "@/lib/api-client";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  ROOM_WORKFLOW_STATUS_LABELS,
  ROOM_WORKFLOW_STATUS_VARIANTS,
  formatDate,
} from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import type { ProjectListItem, Room, RoomWorkflowStatus, TimeSummaryReport, WorkflowStage } from "@/types";

// The Gantt bars deliberately use only 3 colors, not one per workflow_status
// (5-7 values) — validated with the dataviz skill's palette checker. The
// full status set, and even a red/blue/green 3-way split, fail adjacent-pair
// colorblind separation (red vs green is the classic deuteranopia collision).
// This is an "emphasis" palette instead: attention in the accent red, active
// work in primary blue, and complete de-emphasized to gray (it needs no
// urgency color at all) — that combination passes cleanly. The exact status
// is never hue-only regardless: it's always in the bar's tooltip and in the
// Badge-labeled table below. See docs/ARCHITECTURE.md §12.
type GanttBucket = "attention" | "active" | "complete";

function bucketFor(status: RoomWorkflowStatus): GanttBucket {
  if (status === "blocked" || status === "changes_required") return "attention";
  if (status === "complete") return "complete";
  return "active";
}

const BUCKET_BAR_CLASS: Record<GanttBucket, string> = {
  attention: "bg-danger",
  active: "bg-primary",
  complete: "bg-slate-400",
};

const BUCKET_LEGEND: [GanttBucket, string][] = [
  ["active", "Active / not started / waiting on review"],
  ["attention", "Blocked / changes required"],
  ["complete", "Complete"],
];

function StatTile({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </CardContent>
    </Card>
  );
}

function StageBreakdownChart({ data }: { data: StageSummaryItem[] }) {
  const max = Math.max(1, ...data.map((d) => d.room_count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">
          Rooms by stage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {data.map((d) => (
          <div key={d.stage_key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-xs text-muted-foreground" title={d.stage_name}>
              {d.stage_name}
            </span>
            <div
              className="group relative flex h-5 flex-1 items-center"
              title={`${d.room_count} room${d.room_count === 1 ? "" : "s"} in ${d.stage_name}`}
            >
              <div
                className="h-5 min-w-[3px] rounded-r-[4px] bg-primary transition-[filter] group-hover:brightness-110"
                style={{ width: `${(d.room_count / max) * 100}%` }}
              />
              <span className="ml-2 text-xs font-medium tabular-nums text-foreground">
                {d.room_count}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function GanttTimeline({ rooms }: { rooms: Room[] }) {
  const bars = React.useMemo(() => {
    return rooms.map((room) => {
      const start = new Date(room.created_at).getTime();
      const end = room.due_date
        ? new Date(room.due_date).getTime()
        : start + 14 * DAY_MS;
      return { room, start: Math.min(start, end), end: Math.max(start, end) };
    });
  }, [rooms]);

  if (bars.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No rooms match the current filters.</p>
        </CardContent>
      </Card>
    );
  }

  const rangeMin = Math.min(...bars.map((b) => b.start));
  const rangeMaxRaw = Math.max(...bars.map((b) => b.end));
  const rangeMax = rangeMaxRaw > rangeMin ? rangeMaxRaw : rangeMin + DAY_MS;
  const span = rangeMax - rangeMin;

  // Month tick marks along the top of the chart area.
  const ticks: { pct: number; label: string }[] = [];
  const cursor = new Date(rangeMin);
  cursor.setDate(1);
  while (cursor.getTime() <= rangeMax) {
    const pct = ((cursor.getTime() - rangeMin) / span) * 100;
    if (pct >= 0 && pct <= 100) {
      ticks.push({
        pct,
        label: cursor.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative ml-40 h-5 border-b border-border">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute -top-0.5 border-l border-border pl-1 text-[11px] text-muted-foreground"
              style={{ left: `${t.pct}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {bars.map(({ room, start, end }) => {
            const left = ((start - rangeMin) / span) * 100;
            const width = Math.max(((end - start) / span) * 100, 1.5);
            const bucket = bucketFor(room.workflow_status);
            return (
              <div key={room.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-xs" title={room.name}>
                  {room.name}
                  <span className="text-muted-foreground"> · {room.project_name}</span>
                </span>
                <div className="relative h-5 flex-1">
                  <div
                    className={`absolute h-5 rounded-[4px] ${BUCKET_BAR_CLASS[bucket]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${room.name} — ${room.workflow_stage.name} — ${ROOM_WORKFLOW_STATUS_LABELS[room.workflow_status]} — due ${formatDate(room.due_date)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="ml-40 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {BUCKET_LEGEND.map(([bucket, label]) => (
            <span key={bucket} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${BUCKET_BAR_CLASS[bucket]}`} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [projectId, setProjectId] = React.useState<string>("");
  const [stageKey, setStageKey] = React.useState<string>("");

  const [stageSummary, setStageSummary] = React.useState<StageSummaryItem[] | null>(null);
  const [timelineRooms, setTimelineRooms] = React.useState<Room[] | null>(null);
  const [attention, setAttention] = React.useState<{
    rooms_needing_attention: number;
    open_rfis: number;
    open_blockers: number;
  } | null>(null);
  const [timeSummary, setTimeSummary] = React.useState<TimeSummaryReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([projectsApi.list(), workflowStagesApi.list()])
      .then(([p, s]) => {
        setProjects(p);
        setStages(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, []);

  React.useEffect(() => {
    Promise.all([
      reportsApi.stageSummary(projectId || undefined),
      reportsApi.rooms(projectId || undefined, stageKey || undefined),
      reportsApi.attentionSummary(projectId || undefined),
      reportsApi.timeSummary(projectId || undefined),
    ])
      .then(([summary, rooms, kpis, hours]) => {
        setStageSummary(summary);
        setTimelineRooms(rooms);
        setAttention(kpis);
        setTimeSummary(hours);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reports."));
  }, [projectId, stageKey]);

  // Keyed by room id so the rooms table can look up logged hours without a
  // per-row request — time-summary is fetched once per project filter, same
  // as the other report widgets.
  const hoursByRoomId = React.useMemo(() => {
    const map = new Map<number, number>();
    timeSummary?.rooms.forEach((r) => map.set(r.room_id, r.logged_hours));
    return map;
  }, [timeSummary]);

  if (error) return <p className="text-sm text-danger">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Where every project and room actually stands right now.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-project">Project</Label>
          <Select
            id="report-project"
            className="w-56"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-stage">Stage</Label>
          <Select
            id="report-stage"
            className="w-56"
            value={stageKey}
            onChange={(e) => setStageKey(e.target.value)}
          >
            <option value="">Every stage</option>
            {stages?.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!stageSummary || !timelineRooms || !attention || !timeSummary ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Rooms needing attention" value={attention.rooms_needing_attention} />
            <StatTile label="Open RFIs" value={attention.open_rfis} />
            <StatTile label="Open blockers" value={attention.open_blockers} />
            <StatTile
              label="Hours logged"
              value={`${timeSummary.total_logged_hours.toFixed(1)}h`}
              sublabel={`of ${timeSummary.total_estimated_hours.toFixed(1)}h estimated`}
            />
          </div>

          <StageBreakdownChart data={stageSummary} />
          <GanttTimeline rooms={timelineRooms} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">
                Rooms ({timelineRooms.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Detailer</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timelineRooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">{room.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {room.project_name}
                        {room.apartment_name && ` · ${room.apartment_name}`}
                      </TableCell>
                      <TableCell>{room.workflow_stage.name}</TableCell>
                      <TableCell>
                        <Badge variant={ROOM_WORKFLOW_STATUS_VARIANTS[room.workflow_status]}>
                          {ROOM_WORKFLOW_STATUS_LABELS[room.workflow_status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANTS[room.priority]}>
                          {PRIORITY_LABELS[room.priority]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {room.assigned_detailer?.full_name ?? "Unassigned"}
                      </TableCell>
                      <TableCell>{formatDate(room.due_date)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col leading-tight">
                          <span className="tabular-nums">
                            {(hoursByRoomId.get(room.id) ?? 0).toFixed(1)}h
                          </span>
                          <span className="text-xs text-muted-foreground">
                            of {room.estimated_hours != null ? `${room.estimated_hours}h` : "—"} est.
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
