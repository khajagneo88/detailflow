import type { UserRole } from "@/types";

/** Mirrors the backend's MANAGEMENT_ROLES (app/api/deps.py) — Admin bypasses
 * every check there automatically, so it's included here too for UI gating
 * to match exactly what the API will actually allow. */
export function canManage(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager" || role === "team_leader";
}
