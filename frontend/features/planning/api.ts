import { apiClient } from "@/lib/api-client";
import type { WeeklyPlanEntry } from "@/types";

export interface WeeklyPlanEntryCreateInput {
  project_id: number;
  user_id: number;
  week_start: string; // any date within the target week — the server normalises it
  note?: string | null;
}

export const planningApi = {
  listWeekly: (weekStart: string) =>
    apiClient.get<WeeklyPlanEntry[]>(`/planning/weekly?week_start=${weekStart}`),
  createWeekly: (input: WeeklyPlanEntryCreateInput) =>
    apiClient.post<WeeklyPlanEntry>("/planning/weekly", input),
  deleteWeekly: (id: number) => apiClient.delete<void>(`/planning/weekly/${id}`),
};
