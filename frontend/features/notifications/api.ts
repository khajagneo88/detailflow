import { apiClient } from "@/lib/api-client";
import type { Notification } from "@/types";

/** Mirrors app/api/routes/notifications.py. No create call — notifications
 * are only ever produced server-side as a side effect of a room stage
 * transition (see app/services/room_service.py). */
export const notificationsApi = {
  list: (unreadOnly = false) =>
    apiClient.get<Notification[]>(`/notifications${unreadOnly ? "?unread_only=true" : ""}`),
  unreadCount: () => apiClient.get<{ count: number }>("/notifications/unread-count"),
  markRead: (id: number) => apiClient.post<Notification>(`/notifications/${id}/read`),
  markAllRead: () => apiClient.post<{ updated: number }>("/notifications/read-all"),
};
