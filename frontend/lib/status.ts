import type { BadgeProps } from "@/components/ui/badge";
import type {
  ApartmentStatus,
  CommentStatus,
  CommentType,
  Priority,
  ProjectStatus,
  RoomWorkflowStatus,
  StageTransitionOutcome,
  TimeEntrySource,
  UserRole,
} from "@/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  team_leader: "Team Leader",
  detailer: "Detailer",
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
};

export const COMMENT_TYPE_VARIANTS: Record<CommentType, BadgeProps["variant"]> = {
  note: "neutral",
  rfi: "info",
  blocker: "danger",
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
