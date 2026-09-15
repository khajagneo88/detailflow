"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  REPORT_PERIOD_LABELS,
  resolveReportPeriod,
  type ReportPeriodPreset,
  type ReportPeriodRange,
} from "@/lib/report-period";
import {
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  ROOM_WORKFLOW_STATUS_LABELS,
  ROOM_WORKFLOW_STATUS_VARIANTS,
  formatDate,
  stageVariant,
} from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import type {
  BatchThroughputReport,
  DetailerHoursItem,
  ProjectBurnItem,
  ProjectListItem,
  ReworkSummaryItem,
  Room,
  RoomWorkflowStatus,
  TimeSummaryReport,
  WorkflowStage,
} from "@/types";

// The Gantt bars deliberately use only 3 colors, not one per workflow_status
// (5-7 values) — validated with the dataviz skill's palette checker. The
// full status set, and even a red/blue/green 3-way split, fail adjacent-pair
// colorblind separation (red vs green is the classic deuteranopia collision).
// This is an "emphasis" palette instead: attention in the accent red, active
// work in primary blue, and complete de-emphasized to gray (it needs no
// urgency color at all) — that combination passes cleanly. The exact status
// is never hue-only regardless: it's always in the bar's tooltip and in the
// Badge-labeled table below. See docs/ARCHITECTURE.md §12. PRESERVED AS-IS
// from the original Reports page — not re-validated because not touched.
type GanttBucket = "attention" | "active" | "complete";

// Small color dot for the stage-breakdown chart below — a lighter touch
// than a full Badge given the chart is already one row per stage (the name
// is right there as the row label), but still surfaces the same
// stageVariant() category coding the rest of the app now uses for stages.
// One class per Badge variant this app defines (components/ui/badge.tsx).
const STAGE_DOT_CLASS: Record<string, string> = {
  neutral: "bg-muted-foreground/40",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
};

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

/** Section wrapper giving the page real information hierarchy — a named
 * cluster (Workload / Project health / Production) instead of one long
 * stack of equally-weighted cards. See docs/ARCHITECTURE.md for the
 * redesign this belongs to. */
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
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
            <span
              className="flex w-40 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground"
              title={d.stage_name}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT_CLASS[stageVariant(d.stage_key) ?? "neutral"]}`}
              />
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

/** Hours logged per detailer, ranked desc — a horizontal bar list rather
 * than a pie (identity isn't the point here, magnitude/ranking is), reusing
 * the same single-hue-sequential treatment as the stage-breakdown chart
 * above (bg-primary — no new color introduced). A single series needs no
 * legend (dataviz skill): the card title already says what's plotted. */
function DetailerHoursChart({
  data,
  periodLabel,
}: {
  data: DetailerHoursItem[];
  periodLabel: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.logged_hours));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">Hours per detailer</CardTitle>
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time logged in this period.</p>
        ) : (
          data.map((d) => (
            <div key={d.user_id} className="flex items-center gap-3">
              <span
                className="w-32 shrink-0 truncate text-xs text-muted-foreground"
                title={d.full_name}
              >
                {d.full_name}
              </span>
              <div
                className="group relative flex h-5 flex-1 items-center"
                title={`${d.full_name} — ${d.logged_hours.toFixed(1)}h logged`}
              >
                <div
                  className="h-5 min-w-[3px] rounded-r-[4px] bg-primary transition-[filter] group-hover:brightness-110"
                  style={{ width: `${(d.logged_hours / max) * 100}%` }}
                />
                <span className="ml-2 text-xs font-medium tabular-nums text-foreground">
                  {d.logged_hours.toFixed(1)}h
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

type BurnVariant = "primary" | "warning" | "danger";

function burnVariant(ratio: number | null): BurnVariant {
  if (ratio === null) return "primary";
  if (ratio > 100) return "danger";
  if (ratio >= 80) return "warning";
  return "primary";
}

const BURN_FILL_CLASS: Record<BurnVariant, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
};
const BURN_TRACK_CLASS: Record<BurnVariant, string> = {
  primary: "bg-surface-muted",
  warning: "bg-warning-bg",
  danger: "bg-danger-bg",
};
const BURN_TEXT_CLASS: Record<BurnVariant, string> = {
  primary: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-danger",
};
const BURN_CAPTION: Record<BurnVariant, string> = {
  primary: "of estimate",
  warning: "of estimate — approaching",
  danger: "of estimate — over",
};

/** Per-project logged-vs-estimated comparison — a meter (dataviz skill:
 * "a single ratio against a limit"), not a pie or a second bar chart. The
 * fill's color carries severity (accent -> warning -> danger, same
 * thresholds a meter is meant to use) and the unfilled track is a lighter
 * step of that same color, so the state reads across the whole bar — but
 * the over/under call is never color-only: the percentage and a plain-text
 * "over estimate"/"approaching" caption say the same thing in words. */
function ProjectBurnList({ data }: { data: ProjectBurnItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">
          Logged vs. estimated hours
        </CardTitle>
        <p className="text-xs text-muted-foreground">Active projects, all time</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active projects.</p>
        ) : (
          data.map((p) => {
            const ratio = p.estimated_hours ? (p.logged_hours / p.estimated_hours) * 100 : null;
            const variant = burnVariant(ratio);
            return (
              <div key={p.project_id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {p.project_name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {p.logged_hours.toFixed(1)}h
                    {p.estimated_hours != null && ` of ${p.estimated_hours.toFixed(0)}h est.`}
                  </span>
                </div>
                {ratio === null ? (
                  <span className="text-xs text-muted-foreground">No estimate set</span>
                ) : (
                  <>
                    <div
                      className={`h-2.5 w-full overflow-hidden rounded-full ${BURN_TRACK_CLASS[variant]}`}
                      title={`${p.project_name} — ${ratio.toFixed(0)}% of estimate`}
                    >
                      <div
                        className={`h-2.5 rounded-full ${BURN_FILL_CLASS[variant]}`}
                        style={{ width: `${Math.min(ratio, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${BURN_TEXT_CLASS[variant]}`}>
                      {ratio.toFixed(0)}% {BURN_CAPTION[variant]}
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/** Revision/variation counts per project — a plain ranked table, not a
 * chart (dataviz skill: identity-carrying counts like these read fine as
 * numbers; a table is the honest form here). Badge colors reuse the app's
 * own established meaning rather than inventing a new one: danger for a
 * revision (matches STAGE_VARIANTS.ifa_revision/ifc_revision in lib/status.ts)
 * and warning for a variation (matches COMMENT_TYPE_VARIANTS.variation). */
function ReworkTable({ data }: { data: ReworkSummaryItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-foreground">
          Revisions &amp; variations
        </CardTitle>
        <p className="text-xs text-muted-foreground">Where rework is concentrated, this period</p>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No revisions or variations logged in this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Revisions</TableHead>
                <TableHead>Variations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.project_id}>
                  <TableCell className="font-medium">{r.project_name}</TableCell>
                  <TableCell>
                    {r.revision_count > 0 ? (
                      <Badge variant="danger">{r.revision_count}</Badge>
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.variation_count > 0 ? (
                      <Badge variant="warning">{r.variation_count}</Badge>
                    ) : (
                      <span className="text-xs tabular-nums text-muted-foreground">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function formatDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  return `${hours.toFixed(1)}h`;
}

export default function ReportsPage() {
  const [projects, setProjects] = React.useState<ProjectListItem[] | null>(null);
  const [stages, setStages] = React.useState<WorkflowStage[] | null>(null);
  const [projectId, setProjectId] = React.useState<string>("");
  const [stageKey, setStageKey] = React.useState<string>("");
  const [periodPreset, setPeriodPreset] = React.useState<ReportPeriodPreset>("week");
  const [customRange, setCustomRange] = React.useState<ReportPeriodRange>({});

  const [stageSummary, setStageSummary] = React.useState<StageSummaryItem[] | null>(null);
  const [timelineRooms, setTimelineRooms] = React.useState<Room[] | null>(null);
  const [attention, setAttention] = React.useState<{
    rooms_needing_attention: number;
    open_rfis: number;
    open_blockers: number;
  } | null>(null);
  const [timeSummary, setTimeSummary] = React.useState<TimeSummaryReport | null>(null);
  const [detailerHours, setDetailerHours] = React.useState<DetailerHoursItem[] | null>(null);
  const [projectBurn, setProjectBurn] = React.useState<ProjectBurnItem[] | null>(null);
  const [reworkSummary, setReworkSummary] = React.useState<ReworkSummaryItem[] | null>(null);
  const [batchThroughput, setBatchThroughput] = React.useState<BatchThroughputReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const period = React.useMemo(
    () => resolveReportPeriod(periodPreset, customRange),
    [periodPreset, customRange]
  );
  const periodLabel = REPORT_PERIOD_LABELS[periodPreset];

  React.useEffect(() => {
    Promise.all([projectsApi.list(), workflowStagesApi.list()])
      .then(([p, s]) => {
        setProjects(p);
        setStages(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load."));
  }, []);

  // Project + stage filters — scope the stage chart, Gantt timeline and room
  // table, exactly as before.
  React.useEffect(() => {
    Promise.all([
      reportsApi.stageSummary(projectId || undefined),
      reportsApi.rooms(projectId || undefined, stageKey || undefined),
      reportsApi.attentionSummary(projectId || undefined),
      reportsApi.timeSummary(projectId || undefined),
      reportsApi.projectBurn(projectId || undefined),
    ])
      .then(([summary, rooms, kpis, hours, burn]) => {
        setStageSummary(summary);
        setTimelineRooms(rooms);
        setAttention(kpis);
        setTimeSummary(hours);
        setProjectBurn(burn);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reports."));
  }, [projectId, stageKey]);

  // Project + period filters — scope the workload/rework/throughput metrics,
  // which are read over a selectable window rather than all-time.
  React.useEffect(() => {
    Promise.all([
      reportsApi.detailerHours(projectId || undefined, period),
      reportsApi.reworkSummary(projectId || undefined, period),
      reportsApi.batchThroughput(projectId || undefined, period),
    ])
      .then(([hours, rework, throughput]) => {
        setDetailerHours(hours);
        setReworkSummary(rework);
        setBatchThroughput(throughput);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load reports."));
  }, [projectId, period]);

  // Keyed by room id so the rooms table can look up logged hours without a
  // per-row request — time-summary is fetched once per project filter, same
  // as the other report widgets.
  const hoursByRoomId = React.useMemo(() => {
    const map = new Map<number, number>();
    timeSummary?.rooms.forEach((r) => map.set(r.room_id, r.logged_hours));
    return map;
  }, [timeSummary]);

  if (error) return <p className="text-sm text-danger">{error}</p>;

  const ready =
    stageSummary &&
    timelineRooms &&
    attention &&
    timeSummary &&
    detailerHours &&
    projectBurn &&
    reworkSummary &&
    batchThroughput;

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="report-period">Period</Label>
          <Select
            id="report-period"
            className="w-44"
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as ReportPeriodPreset)}
          >
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </Select>
        </div>
        {periodPreset === "custom" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-period-start">From</Label>
              <Input
                id="report-period-start"
                type="date"
                className="w-40"
                value={customRange.start ?? ""}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, start: e.target.value || undefined }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-period-end">To</Label>
              <Input
                id="report-period-end"
                type="date"
                className="w-40"
                value={customRange.end ?? ""}
                onChange={(e) =>
                  setCustomRange((prev) => ({ ...prev, end: e.target.value || undefined }))
                }
              />
            </div>
          </>
        )}
        <p className="pb-1.5 text-xs text-muted-foreground">
          Period scopes Workload, Rework and Batch throughput below — burn is
          always all-time, since it&apos;s compared against each project&apos;s
          single whole-project estimate.
        </p>
      </div>

      {!ready ? (
        <p className="text-sm text-muted-foreground">Loading reports…</p>
      ) : (
        <>
          {/* Headline numbers lead, before any chart or table detail. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Rooms needing attention" value={attention.rooms_needing_attention} />
            <StatTile label="Open RFIs" value={attention.open_rfis} />
            <StatTile label="Open blockers" value={attention.open_blockers} />
            <StatTile
              label="Hours logged"
              value={`${timeSummary.total_logged_hours.toFixed(1)}h`}
              sublabel={`of ${timeSummary.total_estimated_hours.toFixed(1)}h estimated (all time)`}
            />
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="rooms">Room table ({timelineRooms.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="flex flex-col gap-8">
                <Section
                  title="Workload"
                  subtitle={`Hours logged per detailer — ${periodLabel}`}
                >
                  <DetailerHoursChart data={detailerHours} periodLabel={periodLabel} />
                </Section>

                <Section
                  title="Project health"
                  subtitle="Burn against estimate, where rework is concentrated, and the room-level timeline"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <ProjectBurnList data={projectBurn} />
                    <ReworkTable data={reworkSummary} />
                  </div>
                  <GanttTimeline rooms={timelineRooms} />
                </Section>

                <Section title="Production" subtitle="Stage load and batch throughput">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
                    <StageBreakdownChart data={stageSummary} />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
                      <StatTile
                        label="Batches completed"
                        value={batchThroughput.completed_count}
                        sublabel={periodLabel}
                      />
                      <StatTile
                        label="Avg. completion time"
                        value={formatDuration(batchThroughput.avg_completion_hours)}
                        sublabel="creation to complete"
                      />
                    </div>
                  </div>
                </Section>
              </div>
            </TabsContent>

            <TabsContent value="rooms">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Rooms ({timelineRooms.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
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
                            <TableCell>
                              <Badge variant={stageVariant(room.workflow_stage.key)}>
                                {room.workflow_stage.name}
                              </Badge>
                            </TableCell>
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
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
