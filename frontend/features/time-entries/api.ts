import { apiClient } from "@/lib/api-client";
import type { TimeEntry } from "@/types";

export interface ManualTimeEntryInput {
  started_at: string;
  duration_minutes: number;
  note?: string | null;
}

export interface TimeEntryUpdateInput {
  started_at?: string;
  duration_minutes?: number;
  note?: string | null;
}

export const timeEntriesApi = {
  getActive: () => apiClient.get<TimeEntry | null>("/time-entries/active"),
  start: (roomId: number, note?: string | null) =>
    apiClient.post<TimeEntry>(`/rooms/${roomId}/time-entries/start`, { note: note ?? null }),
  stop: (entryId: number) => apiClient.post<TimeEntry>(`/time-entries/${entryId}/stop`),
  listForRoom: (roomId: number) => apiClient.get<TimeEntry[]>(`/rooms/${roomId}/time-entries`),
  createManual: (roomId: number, input: ManualTimeEntryInput) =>
    apiClient.post<TimeEntry>(`/rooms/${roomId}/time-entries`, input),
  update: (entryId: number, input: TimeEntryUpdateInput) =>
    apiClient.patch<TimeEntry>(`/time-entries/${entryId}`, input),
  remove: (entryId: number) => apiClient.delete<void>(`/time-entries/${entryId}`),
};
