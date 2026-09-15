import { apiClient } from "@/lib/api-client";
import type { EligibleTasks, PlanEntry } from "@/types";

export interface PlanEntryCreateInput {
  user_id: number;
  date: string; // YYYY-MM-DD
  room_id?: number | null;
  batch_id?: number | null;
  position?: number | null;
  note?: string | null;
}

export interface PlanEntryUpdateInput {
  user_id?: number;
  date?: string;
  position?: number;
  note?: string | null;
}

/** Mirrors app/api/routes/planning.py. Create/update/delete are
 * management-role-gated on the backend (create/update also mutate
 * Room.assigned_detailer_id — see docs/ARCHITECTURE.md); the entries/
 * eligible-tasks reads are open to any authenticated user, same as every
 * other planning read in this codebase. */
export const planningApi = {
  listEntries: (start: string, end: string) =>
    apiClient.get<PlanEntry[]>(`/planning/entries?start=${start}&end=${end}`),
  eligibleTasks: () => apiClient.get<EligibleTasks>("/planning/eligible-tasks"),
  createEntry: (input: PlanEntryCreateInput) =>
    apiClient.post<PlanEntry>("/planning/entries", input),
  updateEntry: (id: number, input: PlanEntryUpdateInput) =>
    apiClient.patch<PlanEntry>(`/planning/entries/${id}`, input),
  deleteEntry: (id: number) => apiClient.delete<void>(`/planning/entries/${id}`),
};
