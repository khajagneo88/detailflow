import { apiClient } from "@/lib/api-client";
import type { AppSettings, Weekday } from "@/types";

/** Mirrors app/api/routes/settings.py. The read is open to any
 * authenticated user (the Planning page needs it to render its grid); the
 * update is admin-only (Team Leader too, via the backend's own
 * _ROLES_WITH_ADMIN_BYPASS) — see lib/roles.ts::canManageSettings. */
export const settingsApi = {
  get: () => apiClient.get<AppSettings>("/settings"),
  update: (planning_week_start_day: Weekday) =>
    apiClient.patch<AppSettings>("/settings", { planning_week_start_day }),
};
