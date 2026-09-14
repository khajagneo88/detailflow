import { apiClient } from "@/lib/api-client";
import type {
  ActiveTimerItem,
  Room,
  RoomWorkflowStatus,
  TimeSummaryReport,
  WeeklyLoggedTimeItem,
} from "@/types";

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
};
