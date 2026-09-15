import { apiClient } from "@/lib/api-client";
import type { TimeEntry } from "@/types";

export interface TimeEntryUpdateInput {
  started_at?: string;
  duration_minutes?: number;
  note?: string | null;
}

// Time is tracked automatically now, as a side effect of the Start / On
// Hold / Next Stage / Submit IFA / Submit IFC review actions (see
// features/rooms/RoomActions.tsx and the backend's
// time_entry_service.auto_start_for_room/auto_stop_for_room) — there's no
// more manual "start timer"/"stop"/"add manual entry" flow, so this API
// only reads the resulting history and lets it be corrected after the
// fact.
export const timeEntriesApi = {
  getActive: () => apiClient.get<TimeEntry | null>("/time-entries/active"),
  listForRoom: (roomId: number) => apiClient.get<TimeEntry[]>(`/rooms/${roomId}/time-entries`),
  update: (entryId: number, input: TimeEntryUpdateInput) =>
    apiClient.patch<TimeEntry>(`/time-entries/${entryId}`, input),
  remove: (entryId: number) => apiClient.delete<void>(`/time-entries/${entryId}`),
};
