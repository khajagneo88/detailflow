import { apiClient } from "@/lib/api-client";
import type {
  ActiveTimerItem,
  BatchThroughputReport,
  DetailerHoursItem,
  ProjectBurnItem,
  ReworkSummaryItem,
  Room,
  RoomWorkflowStatus,
  TimesheetEntryItem,
  TimeSummaryReport,
  WeeklyLoggedTimeItem,
} from "@/types";

/** A selectable date window shared by the hours-per-detailer, rework, and
 * batch-throughput metrics — reports.ts's own equivalent of the room
 * table's project/stage filter row. `undefined` bounds mean "all time". */
export interface ReportPeriod {
  start?: string;
  end?: string;
}

export interface StageSummaryItem {
  stage_key: string;
  stage_name: string;
  sequence: number;
  room_count: number;
}

export interface AttentionSummary {
  rooms_needing_attention: number;
  open_rfis: number;
  open_blockers: number;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
}

export const reportsApi = {
  stageSummary: (projectId?: string) =>
    apiClient.get<StageSummaryItem[]>(`/reports/stage-summary${qs({ project_id: projectId })}`),
  rooms: (projectId?: string, stageKey?: string, statusFilter?: RoomWorkflowStatus) =>
    apiClient.get<Room[]>(
      `/reports/rooms${qs({ project_id: projectId, stage_key: stageKey, status_filter: statusFilter })}`
    ),
  attentionSummary: (projectId?: string) =>
    apiClient.get<AttentionSummary>(`/reports/attention-summary${qs({ project_id: projectId })}`),
  timeSummary: (projectId?: string) =>
    apiClient.get<TimeSummaryReport>(`/reports/time-summary${qs({ project_id: projectId })}`),
  activeTimers: () => apiClient.get<ActiveTimerItem[]>("/reports/active-timers"),
  timeLogged: (weekStart: string) =>
    apiClient.get<WeeklyLoggedTimeItem[]>(`/reports/time-logged?week_start=${weekStart}`),
  /** Admin-only on the backend (Team Leader too, via its own admin bypass)
   * — powers the Team page's Timesheet tab. `start`/`end` are inclusive
   * calendar dates. */
  timesheet: (start: string, end: string) =>
    apiClient.get<TimesheetEntryItem[]>(`/reports/timesheet${qs({ start, end })}`),
  detailerHours: (projectId?: string, period?: ReportPeriod) =>
    apiClient.get<DetailerHoursItem[]>(
      `/reports/detailer-hours${qs({ project_id: projectId, start: period?.start, end: period?.end })}`
    ),
  projectBurn: (projectId?: string) =>
    apiClient.get<ProjectBurnItem[]>(`/reports/project-burn${qs({ project_id: projectId })}`),
  reworkSummary: (projectId?: string, period?: ReportPeriod) =>
    apiClient.get<ReworkSummaryItem[]>(
      `/reports/rework-summary${qs({ project_id: projectId, start: period?.start, end: period?.end })}`
    ),
  batchThroughput: (projectId?: string, period?: ReportPeriod) =>
    apiClient.get<BatchThroughputReport>(
      `/reports/batch-throughput${qs({ project_id: projectId, start: period?.start, end: period?.end })}`
    ),
};
