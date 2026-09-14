/**
 * Mirrors the backend Pydantic schemas (app/schemas/*.py). Kept as plain
 * types rather than generated from the OpenAPI schema for now — worth
 * revisiting (e.g. openapi-typescript) once the API stabilises.
 */

export type UserRole = "admin" | "manager" | "team_leader" | "detailer";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  // Bumped server-side on any authenticated request, at most once a
  // minute — see docs/ARCHITECTURE.md §17. Null means never seen.
  last_seen_at: string | null;
}

export type Priority = "low" | "normal" | "high" | "urgent";

export type ProjectStatus =
  | "not_started"
  | "in_progress"
  | "waiting_for_information"
  | "waiting_for_check_measure"
  | "under_review"
  | "ready_for_production"
  | "on_hold"
  | "complete";

export type ApartmentStatus =
  | "not_started"
  | "in_progress"
  | "waiting_for_information"
  | "waiting_for_check_measure"
  | "under_review"
  | "on_hold"
  | "complete";

export type RoomWorkflowStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "waiting"
  | "ready_for_review"
  | "changes_required"
  | "complete";

export interface WorkflowStage {
  id: number;
  key: string;
  name: string;
  sequence: number;
}

export interface ProjectListItem {
  id: number;
  project_number: string;
  name: string;
  client_name: string | null;
  priority: Priority;
  status: ProjectStatus;
  team_leader: User | null;
  detailing_due_date: string | null;
  is_archived: boolean;
  room_count: number;
  rooms_complete: number;
}

export interface Project {
  id: number;
  project_number: string;
  name: string;
  client_name: string | null;
  builder: string | null;
  site_address: string | null;
  project_manager: string | null;
  description: string | null;
  priority: Priority;
  status: ProjectStatus;
  team_leader: User | null;
  assigned_detailers: User[];
  start_date: string | null;
  detailing_due_date: string | null;
  installation_date: string | null;
  estimated_hours: number | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  apartment_count: number;
  room_count: number;
  rooms_complete: number;
}

export interface Apartment {
  id: number;
  project_id: number;
  name: string;
  level: string | null;
  apartment_type: string | null;
  description: string | null;
  assigned_detailer: User | null;
  due_date: string | null;
  status: ApartmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  room_count: number;
}

export interface Room {
  id: number;
  project_id: number;
  project_name: string | null;
  apartment_id: number | null;
  apartment_name: string | null;
  name: string;
  code: string | null;
  description: string | null;
  assigned_detailer: User | null;
  priority: Priority;
  due_date: string | null;
  workflow_stage: WorkflowStage;
  workflow_status: RoomWorkflowStatus;
  progress: number;
  estimated_hours: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StageTransitionOutcome = "approved" | "approved_with_comments" | "markups_required";

export interface RoomStageEvent {
  id: number;
  from_stage: WorkflowStage | null;
  to_stage: WorkflowStage;
  outcome: StageTransitionOutcome | null;
  note: string | null;
  changed_by: User | null;
  created_at: string;
}

export type CommentType = "note" | "rfi" | "blocker";
export type CommentStatus = "open" | "resolved";

export interface Comment {
  id: number;
  project_id: number;
  apartment_id: number | null;
  room_id: number | null;
  type: CommentType;
  title: string | null;
  body: string;
  status: CommentStatus;
  created_by: User | null;
  resolved_by: User | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TimeEntrySource = "timer" | "manual";

export interface TimeEntry {
  id: number;
  room_id: number;
  user_id: number | null;
  user: User | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  source: TimeEntrySource;
  note: string | null;
  created_at: string;
  updated_at: string;
  room_name: string | null;
  project_id: number | null;
  project_name: string | null;
}

export interface RoomTimeSummary {
  room_id: number;
  room_name: string;
  project_id: number;
  project_name: string | null;
  estimated_hours: number | null;
  logged_hours: number;
}

export interface TimeSummaryReport {
  rooms: RoomTimeSummary[];
  total_estimated_hours: number;
  total_logged_hours: number;
}

export interface ActiveTimerItem {
  user_id: number;
  room_id: number;
  room_name: string;
  project_id: number;
  project_name: string | null;
  started_at: string;
}

export interface WeeklyLoggedTimeItem {
  user_id: number;
  project_id: number;
  logged_minutes: number;
}

export interface WeeklyPlanEntry {
  id: number;
  project_id: number;
  project_name: string | null;
  project_number: string | null;
  user_id: number;
  user: User;
  week_start: string;
  note: string | null;
  created_by_id: number | null;
  created_at: string;
}
