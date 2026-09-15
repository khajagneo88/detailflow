/**
 * Mirrors the backend Pydantic schemas (app/schemas/*.py). Kept as plain
 * types rather than generated from the OpenAPI schema for now — worth
 * revisiting (e.g. openapi-typescript) once the API stabilises.
 */

export type UserRole =
  | "admin"
  | "manager"
  | "team_leader"
  | "project_manager"
  | "detailer"
  | "nester";

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

// Mirrors DEFAULT_WORKFLOW_STAGES (app/models/workflow_stage.py) — the fixed
// 13-stage list. WorkflowStage.key below stays a plain `string` (stages are
// rows in a lookup table, not a backend enum — see workflow_stage.py), but
// this union gives the frontend's own stage-keyed maps (lib/status.ts,
// lib/room-workflow.ts) exhaustiveness checking against the current set.
export type WorkflowStageKey =
  | "setup"
  | "modelling_3d"
  | "waiting_check_measure"
  | "final_detailing"
  | "ifa_drafted"
  | "ifa_internal_review"
  | "ifa_issued"
  | "ifa_revision"
  | "ifc_drafted"
  | "ifc_internal_review"
  | "ifc_issued"
  | "ifc_revision"
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
  // BREAKING CHANGE: was a free-text string; the backend now nests the
  // assigned User (see app/schemas/project.py::ProjectRead.project_manager)
  // — writes still go through project_manager_id (see ProjectCreateInput /
  // ProjectUpdateInput in features/projects/api.ts).
  project_manager: User | null;
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
  // JUDGMENT CALL: the backend Room model (app/models/room.py) has had a
  // `batch_id` column since the Batch entity landed, but as of this build
  // app/schemas/room.py::RoomRead does NOT actually declare/serialize a
  // batch_id (or nested batch) field yet — verified by reading the schema
  // directly rather than trusting that it was already wired up. Since we
  // can't touch backend/ from here, this field is declared for type-fidelity
  // with the model and to be forward-compatible the moment RoomRead adds it,
  // but nothing in this frontend build actually relies on it coming back
  // populated from GET /rooms/{id} or /projects/{id}/rooms — "which batch is
  // this room in" is instead derived by cross-referencing the batches list
  // for the room's project (BatchRead.rooms already nests real room ids), see
  // features/batches/api.ts and the room-batch lookup in the room detail page.
  batch_id: number | null;
}

/** Mirrors app/schemas/batch.py. A Batch groups IFC-approved rooms (which
 * may span multiple apartments in a project) for the Nester's own
 * bom_pending -> bom_review -> nesting -> complete lifecycle, kept
 * deliberately separate from the room-level WorkflowStage machinery — see
 * app/models/batch.py and docs/ARCHITECTURE.md. */
export type BatchStatus = "bom_pending" | "bom_review" | "nesting" | "complete";

/** Lightweight nested room shape returned on BatchRead.rooms — mirrors
 * app/schemas/batch.py::BatchRoomSummary, not the full Room type. */
export interface BatchRoomSummary {
  id: number;
  name: string;
  project_id: number;
  apartment_id: number | null;
  workflow_stage: WorkflowStage;
}

export interface Batch {
  id: number;
  project_id: number;
  batch_number: number;
  status: BatchStatus;
  nester: User;
  room_count: number;
  rooms: BatchRoomSummary[];
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

export type CommentType = "note" | "rfi" | "blocker" | "variation";
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

/** Mirrors app/schemas/report.py — the Reports page's expanded metrics
 * (docs/ARCHITECTURE.md §12.3, extended): hours per detailer, per-project
 * logged-vs-estimated burn, revision/variation rework counts, and batch
 * throughput. */
export interface DetailerHoursItem {
  user_id: number;
  full_name: string;
  logged_hours: number;
}

export interface ProjectBurnItem {
  project_id: number;
  project_name: string;
  status: ProjectStatus;
  estimated_hours: number | null;
  logged_hours: number;
}

export interface ReworkSummaryItem {
  project_id: number;
  project_name: string;
  revision_count: number;
  variation_count: number;
}

export interface BatchThroughputReport {
  completed_count: number;
  avg_completion_hours: number | null;
}

/** Mirrors app/schemas/plan_entry.py. Replaces the old week-level
 * WeeklyPlanEntry entirely — a PlanEntry points at a specific Room or Batch
 * on a specific calendar date, not a whole project for a whole week. */
export interface PlanEntryRoom {
  id: number;
  name: string;
  project_id: number;
  project_name: string | null;
  apartment_name: string | null;
  workflow_stage: WorkflowStage;
  priority: Priority;
  due_date: string | null;
}

export interface PlanEntryBatch {
  id: number;
  batch_number: number;
  project_id: number;
  project_name: string | null;
  status: BatchStatus;
}

export interface PlanEntry {
  id: number;
  user_id: number;
  user: User;
  date: string;
  room_id: number | null;
  batch_id: number | null;
  room: PlanEntryRoom | null;
  batch: PlanEntryBatch | null;
  position: number;
  note: string | null;
  created_by_id: number | null;
  created_at: string;
  // Minutes that user logged against that room on that date — only ever
  // populated for a room-linked entry; null means "nothing logged" (a
  // batch-linked entry always reads null — see docs/ARCHITECTURE.md /
  // app/services/plan_service.py::logged_minutes_map for why Batch has no
  // equivalent signal). No longer rendered on the grid (see
  // lib/plan-colors.ts::weekCompletionRing, which replaced the old
  // per-day worked/not-worked dot this field drove) — retained on the
  // type since the API still returns it.
  logged_minutes: number | null;
  // When this task actually reached "complete" — a room-linked entry's
  // most recent transition into the `complete` WorkflowStage, a
  // batch-linked entry's `updated_at` once its status is complete (see
  // app/schemas/plan_entry.py::PlanEntryRead.task_completed_at). Drives
  // the grid's past-week green/red completion ring — see
  // lib/plan-colors.ts::weekCompletionRing/weekCompletionTooltip.
  task_completed_at: string | null;
}

/** One row in the Planning grid's "+ add task" picker — mirrors
 * app/schemas/plan_entry.py::EligibleRoomItem/EligibleBatchItem. */
export interface EligibleRoomItem {
  id: number;
  name: string;
  project_id: number;
  project_name: string | null;
  apartment_name: string | null;
  priority: Priority;
  due_date: string | null;
  workflow_stage: WorkflowStage;
}

export interface EligibleBatchItem {
  id: number;
  batch_number: number;
  project_id: number;
  project_name: string | null;
  status: BatchStatus;
  project_priority: Priority;
}

export interface EligibleTasks {
  rooms: EligibleRoomItem[];
  batches: EligibleBatchItem[];
}

/** Mirrors app/schemas/notification.py. Only ever created server-side (a
 * side effect of a room stage transition — see
 * app/services/room_service.py::transition_room_stage) — there's no create
 * schema/input type to match, only reads and the read/read-all actions. */
export type NotificationType = "ifa_ready" | "ifc_ready";

export interface NotificationRoomSummary {
  id: number;
  name: string;
}

export interface NotificationProjectSummary {
  id: number;
  name: string;
}

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  room: NotificationRoomSummary | null;
  project: NotificationProjectSummary | null;
  read_at: string | null;
  created_at: string;
}
