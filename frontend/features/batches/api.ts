import { apiClient } from "@/lib/api-client";
import type { Batch, BatchStatus } from "@/types";

export interface BatchStatusTransitionInput {
  status: BatchStatus;
}

export interface BatchRoomsUpdateInput {
  add_room_ids?: number[];
  remove_room_ids?: number[];
}

/** Mirrors app/api/routes/batches.py. Batch creation and room add/remove are
 * Nester-only on the backend (require_nester) — status-transitions has no
 * server-side role gate at all (see the docstring on
 * create_batch_status_transition), so the frontend is solely responsible for
 * only showing the right lifecycle controls to the right role there. */
export const batchesApi = {
  listForProject: (projectId: number) =>
    apiClient.get<Batch[]>(`/projects/${projectId}/batches`),
  create: (projectId: number, roomIds: number[]) =>
    apiClient.post<Batch>(`/projects/${projectId}/batches`, {
      project_id: projectId,
      room_ids: roomIds,
    }),
  get: (batchId: number) => apiClient.get<Batch>(`/batches/${batchId}`),
  updateRooms: (batchId: number, input: BatchRoomsUpdateInput) =>
    apiClient.patch<Batch>(`/batches/${batchId}/rooms`, input),
  createStatusTransition: (batchId: number, status: BatchStatus) =>
    apiClient.post<Batch>(`/batches/${batchId}/status-transitions`, { status }),
};
