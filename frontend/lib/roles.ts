import type { UserRole } from "@/types";

/** Mirrors the backend's MANAGEMENT_ROLES (app/api/deps.py) — Admin bypasses
 * every check there automatically, so it's included here too for UI gating
 * to match exactly what the API will actually allow. */
export function canManage(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager" || role === "team_leader";
}

/** Mirrors the backend's _ROLES_WITH_ADMIN_BYPASS (app/api/deps.py) — the
 * roles that pass require_role(UserRole.ADMIN) checks, e.g. user
 * management (PATCH /users/{id}) and the workspace settings update
 * (PATCH /settings). Manager is deliberately excluded here even though
 * it's in canManage() above — those two endpoints are admin-only on the
 * backend, not management-role-gated. */
export function canManageAdminSettings(role: UserRole | undefined): boolean {
  return role === "admin" || role === "team_leader";
}
