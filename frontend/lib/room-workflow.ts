import type { Room, UserRole, WorkflowStage } from "@/types";

/** Urgency bucket for a room, independent of whose "current jobs" list it's
 * shown in — used by My Work (bucketed for one detailer) and the Team page's
 * Workload tab (bucketed per detailer, for everyone) so the two views can
 * never disagree about what counts as "needs attention" vs. "on track." */
export type Bucket = "attention" | "overdue" | "active" | "waiting" | "complete";

export function bucketFor(room: Room): Bucket {
  if (room.workflow_status === "blocked" || room.workflow_status === "changes_required") {
    return "attention";
  }
  if (room.workflow_status === "complete") return "complete";
  if (room.workflow_status === "ready_for_review" || room.workflow_status === "waiting") {
    return "waiting";
  }
  if (room.due_date && new Date(room.due_date) < new Date(new Date().toDateString())) {
    return "overdue";
  }
  return "active";
}

export const BUCKET_META: Record<Bucket, { title: string; hint: string }> = {
  attention: {
    title: "Needs your attention",
    hint: "Blocked, or came back with changes required.",
  },
  overdue: { title: "Overdue", hint: "Past their due date and still not finished." },
  active: { title: "In progress", hint: "Not started or currently being worked on." },
  waiting: { title: "Waiting on review", hint: "Handed off — nothing to do until it comes back." },
  complete: { title: "Complete", hint: "Finished." },
};

export const BUCKET_ORDER: Bucket[] = ["attention", "overdue", "active", "waiting", "complete"];

/** Sorts by urgency bucket first (see BUCKET_ORDER), then soonest due date —
 * the same tie-break /rooms/mine uses server-side, reimplemented client-side
 * here since the Workload tab's data comes from /reports/rooms unsorted. */
export function compareRoomUrgency(a: Room, b: Room): number {
  const bucketDiff = BUCKET_ORDER.indexOf(bucketFor(a)) - BUCKET_ORDER.indexOf(bucketFor(b));
  if (bucketDiff !== 0) return bucketDiff;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

/** Where a detailer's simplified "Ready for Check" action goes next.
 * Almost always the immediate next stage in sequence, except the two
 * Revision stages — redrafting after markups goes back to that package's
 * own Drafted stage (IFA Revision -> IFA Drafted, IFC Revision -> IFC
 * Drafted, sequences 5/9), which is *earlier* than Revision itself
 * (sequences 8/12), so it can't be derived from sequence order alone —
 * mirrors the old single-cycle Revision -> Drawings Submitted override,
 * now doubled across both cycles. See workflow_stage.py's DEFAULT_WORKFLOW_
 * STAGES comment for the full old -> new stage mapping. Shared by the room
 * detail page and My Work. */
export const NEXT_STAGE_OVERRIDES: Record<string, string> = {
  ifa_revision: "ifa_drafted",
  ifc_revision: "ifc_drafted",
};

/** A room sitting in one of these is waiting on someone else (a reviewer,
 * a client, or it's already done) — there's nothing for the detailer to
 * click. Mirrors the room_status defaults room_service.transition_room_
 * stage applies to the same stage keys (READY_FOR_REVIEW). The two Drafted
 * stages are deliberately *not* here — that's the detailer's own active
 * drafting work, same as the old Initial Review + Issued for Approval pair
 * it replaces — nor are the Revision stages, which have their own override
 * above regardless of this set. */
export const WAITING_ON_SOMEONE_ELSE = new Set([
  "ifa_internal_review",
  "ifa_issued",
  "ifc_internal_review",
  "ifc_issued",
  "complete",
]);

export function getReadyForCheckTarget(room: Room, stages: WorkflowStage[]): WorkflowStage | null {
  const currentKey = room.workflow_stage.key;
  const targetKey = NEXT_STAGE_OVERRIDES[currentKey];
  if (targetKey) return stages.find((s) => s.key === targetKey) ?? null;
  if (WAITING_ON_SOMEONE_ELSE.has(currentKey)) return null;
  return stages.find((s) => s.sequence === room.workflow_stage.sequence + 1) ?? null;
}

/** Mirrors backend/app/services/room_service.py::_STAGE_TRANSITION_RULES —
 * kept in sync by hand (see docs/ARCHITECTURE.md §29), same as every other
 * pair of frontend/backend rule tables in this app. This is UI convenience
 * only (which options to even offer, so a user doesn't hit a 403 by
 * picking a stage they were never going to be allowed to move to) — the
 * backend enforces the real rule regardless of what this table says.
 *
 * Three tiers:
 *   - detailer: drafting and (re)submitting for review.
 *   - management: the internal review gate (issue it, or send it back).
 *   - client outcome: recording what the client said once issued.
 * Admin and Team Leader implicitly pass every entry (matching the
 * backend's own has_admin_bypass), so they're folded into every tier
 * rather than repeated on each line. */
const _DETAILER_ROLES: UserRole[] = ["detailer", "team_leader", "admin"];
const _MANAGEMENT_ROLES: UserRole[] = ["manager", "team_leader", "admin"];
const _CLIENT_OUTCOME_ROLES: UserRole[] = ["manager", "team_leader", "project_manager", "admin"];

const STAGE_TRANSITION_RULES: Record<string, Record<string, UserRole[]>> = {
  ifa_drafted: { ifa_internal_review: _DETAILER_ROLES },
  ifa_internal_review: { ifa_issued: _MANAGEMENT_ROLES, ifa_drafted: _MANAGEMENT_ROLES },
  ifa_issued: { ifc_drafted: _CLIENT_OUTCOME_ROLES, ifa_revision: _CLIENT_OUTCOME_ROLES },
  ifa_revision: { ifa_drafted: _DETAILER_ROLES },
  ifc_drafted: { ifc_internal_review: _DETAILER_ROLES },
  ifc_internal_review: { ifc_issued: _MANAGEMENT_ROLES, ifc_drafted: _MANAGEMENT_ROLES },
  ifc_issued: { complete: _CLIENT_OUTCOME_ROLES, ifc_revision: _CLIENT_OUTCOME_ROLES },
  ifc_revision: { ifc_drafted: _DETAILER_ROLES },
};

/** Every stage `role` is currently allowed to move `room` into, given its
 * current stage — powers the "Move stage" picker on the room detail page
 * (StageTransitionCard) so a Manager/Team Leader/Project Manager/Nester/
 * Admin only ever sees the options that actually apply right now, instead
 * of every other stage in the whole pipeline. */
export function allowedStageTransitions(
  room: Room,
  role: UserRole | undefined,
  stages: WorkflowStage[]
): WorkflowStage[] {
  if (!role) return [];
  const options = STAGE_TRANSITION_RULES[room.workflow_stage.key] ?? {};
  return stages.filter((s) => {
    const allowedRoles = options[s.key];
    return allowedRoles !== undefined && allowedRoles.includes(role);
  });
}
