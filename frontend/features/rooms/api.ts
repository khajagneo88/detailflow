import { apiClient } from "@/lib/api-client";
import type {
  Comment,
  CommentStatus,
  CommentType,
  Room,
  RoomStageEvent,
  RoomWorkflowStatus,
  StageTransitionOutcome,
  WorkflowStage,
} from "@/types";

export interface StageTransitionInput {
  to_stage_key: string;
  outcome?: StageTransitionOutcome | null;
  note?: string | null;
}

export interface CommentCreateInput {
  room_id: number;
  apartment_id?: number | null;
  type: CommentType;
  title?: string | null;
  body: string;
}

export const roomsApi = {
  get: (id: number) => apiClient.get<Room>(`/rooms/${id}`),
  listMine: () => apiClient.get<Room[]>("/rooms/mine"),
  listStageEvents: (roomId: number) =>
    apiClient.get<RoomStageEvent[]>(`/rooms/${roomId}/stage-events`),
  createStageTransition: (roomId: number, input: StageTransitionInput) =>
    apiClient.post<RoomStageEvent>(`/rooms/${roomId}/stage-transitions`, input),
  updateStatus: (roomId: number, workflow_status: RoomWorkflowStatus) =>
    apiClient.patch<Room>(`/rooms/${roomId}`, { workflow_status }),
};

export const workflowStagesApi = {
  list: () => apiClient.get<WorkflowStage[]>("/workflow-stages"),
};

export const commentsApi = {
  listForRoom: (projectId: number, roomId: number, statusFilter?: CommentStatus) =>
    apiClient.get<Comment[]>(
      `/projects/${projectId}/comments?room_id=${roomId}` +
        (statusFilter ? `&status_filter=${statusFilter}` : "")
    ),
  create: (projectId: number, input: CommentCreateInput) =>
    apiClient.post<Comment>(`/projects/${projectId}/comments`, input),
  resolve: (commentId: number) => apiClient.patch<Comment>(`/comments/${commentId}/resolve`),
  reopen: (commentId: number) => apiClient.patch<Comment>(`/comments/${commentId}/reopen`),
};
