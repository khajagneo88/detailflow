import type { BadgeProps } from "@/components/ui/badge";
import type {
  ApartmentStatus,
  BatchStatus,
  CommentStatus,
  CommentType,
  Priority,
  ProjectStatus,
  RoomWorkflowStatus,
  StageTransitionOutcome,
  TimeEntrySource,
  UserRole,
  WorkflowStageKey,
} from "@/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  team_leader: "Team Leader",
  project_manager: "Project Manager",
  detailer: "Detailer",
  nester: "Nester",
};

/** Central label + colour mapping for every status/priority enum, so a
 * given value renders identically wherever it appears (dashboard, project
 * list, room table) instead of each screen inventing its own copy. */

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting_for_information: "Waiting for Information",
  waiting_for_check_measure: "Waiting for Check Measure",
  under_review: "Under Review",
  ready_for_production: "Ready for Production",
  on_hold: "On Hold",
  complete: "Complete",
};

export const PROJECT_STATUS_VARIANTS: Record<ProjectStatus, BadgeProps["variant"]> = {
  not_started: "neutral",
  in_progress: "info",
  waiting_for_information: "warning",
  waiting_for_check_measure: "warning",
  under_review: "info",
  ready_for_production: "success",
  on_hold: "warning",
  complete: "success",
};

export const APARTMENT_STATUS_LABELS: Record<ApartmentStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting_for_information: "Waiting for Information",
  waiting_for_check_measure: "Waiting for Check Measure",
  under_review: "Under Review",
  on_hold: "On Hold",
  complete: "Complete",
};

export const APARTMENT_STATUS_VARIANTS: Record<ApartmentStatus, BadgeProps["variant"]> = {
  not_started: "neutral",
  in_progress: "info",
  waiting_for_information: "warning",
  waiting_for_check_measure: "warning",
  under_review: "info",
  on_hold: "warning",
  complete: "success",
};

export const ROOM_WORKFLOW_STATUS_LABELS: Record<RoomWorkflowStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  waiting: "Waiting",
  ready_for_review: "Ready for Review",
  changes_required: "Changes Required",
  complete: "Complete",
};

export const ROOM_WORKFLOW_STATUS_VARIANTS: Record<RoomWorkflowStatus, BadgeProps["variant"]> = {
  not_started: "neutral",
  in_progress: "info",
  blocked: "danger",
  waiting: "warning",
  ready_for_review: "info",
  changes_required: "danger",
  complete: "success",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_VARIANTS: Record<Priority, BadgeProps["variant"]> = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  urgent: "danger",
};

export const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  note: "Note",
  rfi: "RFI",
  blocker: "Blocker",
  variation: "Variation",
};

export const COMMENT_TYPE_VARIANTS: Record<CommentType, BadgeProps["variant"]> = {
  note: "neutral",
  rfi: "info",
  blocker: "danger",
  // Distinct from all three others (neutral/info/danger already taken) —
  // a client-requested late change is notable but not a problem the way a
  // blocker is, so it gets the one remaining variant rather than reusing
  // blocker's red. See CommentType.VARIATION (app/models/enums.py).
  variation: "warning",
};

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  open: "Open",
  resolved: "Resolved",
};

export const COMMENT_STATUS_VARIANTS: Record<CommentStatus, BadgeProps["variant"]> = {
  open: "warning",
  resolved: "success",
};

export const STAGE_OUTCOME_LABELS: Record<StageTransitionOutcome, string> = {
  approved: "Approved",
  approved_with_comments: "Approved with Comments",
  markups_required: "Markups Required",
};

export const STAGE_OUTCOME_VARIANTS: Record<StageTransitionOutcome, BadgeProps["variant"]> = {
  approved: "success",
  approved_with_comments: "info",
  markups_required: "danger",
};

/**
 * Shared stage-metadata module (see docs/ARCHITECTURE.md §8 /
 * workflow_stage.py's DEFAULT_WORKFLOW_STAGES for the fixed 13-stage list
 * this mirrors). Room stage *names* already come straight from the API
 * (WorkflowStage.name) and don't need a label map — this only supplies the
 * color coding, which is otherwise pure frontend styling and appears
 * nowhere in the backend response.
 *
 * Color scheme extends the app's existing 5-variant Badge palette by rough
 * category, applied identically to both the IFA and IFC cycles (each is a
 * full drafting -> review -> issued[-> revision] pass over the same
 * package-in-progress, so they read the same way twice):
 *  - neutral: pre-work (Setup)
 *  - info (blue): active drafting work — 3D Modelling, Final Detailing,
 *    IFA/IFC Drafted
 *  - warning (amber): waiting on a review/check — Waiting for Check
 *    Measure, IFA/IFC Internal Review
 *  - success (green): issued to/ready for the client, or done — IFA/IFC
 *    Issued, Complete
 *  - danger (red): a revision loop-back — IFA/IFC Revision
 */
export const STAGE_VARIANTS: Record<WorkflowStageKey, BadgeProps["variant"]> = {
  setup: "neutral",
  modelling_3d: "info",
  waiting_check_measure: "warning",
  final_detailing: "info",
  ifa_drafted: "info",
  ifa_internal_review: "warning",
  ifa_issued: "success",
  ifa_revision: "danger",
  ifc_drafted: "info",
  ifc_internal_review: "warning",
  ifc_issued: "success",
  ifc_revision: "danger",
  complete: "success",
};

/** Looks up a stage's color by key with a safe fallback — stage keys are
 * rows in a backend lookup table, not a closed enum (see workflow_stage.py),
 * so an environment seeded with a stage this map doesn't know about should
 * degrade to a plain neutral badge rather than throwing. */
export function stageVariant(key: string): BadgeProps["variant"] {
  return (STAGE_VARIANTS as Record<string, BadgeProps["variant"]>)[key] ?? "neutral";
}

/**
 * Batch lifecycle (app/models/enums.py::BatchStatus) — a Nester's own
 * bom_pending -> bom_review -> nesting -> complete flow, separate from room
 * WorkflowStage. Kept as its own Record (rather than folded into
 * STAGE_VARIANTS above) since BatchStatus is a distinct closed backend enum
 * with its own key space, not a WorkflowStageKey:
 *  - info (blue): bom_pending — the Nester is drafting the BOM
 *  - warning (amber): bom_review — the Team Leader review gate; a batch
 *    found to need changes here loops back to bom_pending
 *  - info (blue): nesting — active nesting work, same "in progress" color
 *    as bom_pending since there's no distinct "nester-flavored" variant in
 *    the app's 5-variant palette (neutral/success/warning/danger/info)
 *  - success (green): complete
 */
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  bom_pending: "BOM Pending",
  bom_review: "BOM Review",
  nesting: "Nesting",
  complete: "Complete",
};

export const BATCH_STATUS_VARIANTS: Record<BatchStatus, BadgeProps["variant"]> = {
  bom_pending: "info",
  bom_review: "warning",
  nesting: "info",
  complete: "success",
};

/** Looks up a batch status's color by key with a safe fallback — same
 * defensive pattern as stageVariant() above, in case a future status value
 * isn't in this map yet. */
export function batchStatusVariant(status: string): BadgeProps["variant"] {
  return (BATCH_STATUS_VARIANTS as Record<string, BadgeProps["variant"]>)[status] ?? "neutral";
}

export const TIME_ENTRY_SOURCE_LABELS: Record<TimeEntrySource, string> = {
  timer: "Timer",
  manual: "Manual",
};

export const TIME_ENTRY_SOURCE_VARIANTS: Record<TimeEntrySource, BadgeProps["variant"]> = {
  timer: "info",
  manual: "neutral",
};

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
