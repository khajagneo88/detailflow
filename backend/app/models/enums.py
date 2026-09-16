"""Plain Python enums shared across models and schemas.

Kept in one module so a value list (e.g. valid project statuses) has exactly
one source of truth used by SQLAlchemy columns, Pydantic schemas, and any
frontend type generation later.
"""
import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    TEAM_LEADER = "team_leader"
    PROJECT_MANAGER = "project_manager"
    DETAILER = "detailer"
    NESTER = "nester"


class Weekday(str, enum.Enum):
    """A day of the week, spelled out rather than stored as an integer, so
    AppSettings.planning_week_start_day is self-documenting in the database
    and over the API — no "is 0 Sunday or Monday" ambiguity to remember.
    frontend/lib/week.ts maps these onto JS's Date.getDay() (0=Sunday) at
    the one place that needs an actual index, everywhere else just passes
    the string straight through."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class Priority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class ProjectStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_INFORMATION = "waiting_for_information"
    WAITING_FOR_CHECK_MEASURE = "waiting_for_check_measure"
    UNDER_REVIEW = "under_review"
    READY_FOR_PRODUCTION = "ready_for_production"
    ON_HOLD = "on_hold"
    COMPLETE = "complete"


class ApartmentStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_INFORMATION = "waiting_for_information"
    WAITING_FOR_CHECK_MEASURE = "waiting_for_check_measure"
    UNDER_REVIEW = "under_review"
    ON_HOLD = "on_hold"
    COMPLETE = "complete"


class RoomWorkflowStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    WAITING = "waiting"
    READY_FOR_REVIEW = "ready_for_review"
    CHANGES_REQUIRED = "changes_required"
    COMPLETE = "complete"


class StageTransitionOutcome(str, enum.Enum):
    """Recorded on a RoomStageEvent when a stage change is the result of a
    review decision (Internal Review / Issued for Approval) rather than a
    routine forward move. Preserves the "why" behind a Revision loop-back —
    see docs/ARCHITECTURE.md."""

    APPROVED = "approved"
    APPROVED_WITH_COMMENTS = "approved_with_comments"
    MARKUPS_REQUIRED = "markups_required"


class CommentType(str, enum.Enum):
    NOTE = "note"
    RFI = "rfi"
    BLOCKER = "blocker"
    # A client-requested change logged after IFC Issued — mechanically the
    # same loop-back as any other revision (IFC Issued -> IFC Revision ->
    # IFC Drafted), just tagged distinctly for the record: "the client
    # changed their mind after sign-off" rather than "we caught a mistake".
    # Not restricted to any particular room stage at the API/schema level —
    # same as NOTE/RFI/BLOCKER, a comment's type carries no stage-gating of
    # its own (see app/api/routes/comments.py). See docs/ARCHITECTURE.md.
    VARIATION = "variation"


class CommentStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class BatchStatus(str, enum.Enum):
    """A Batch's own lightweight lifecycle — deliberately separate from the
    room-level WorkflowStage/room_stage_events machinery (see
    docs/ARCHITECTURE.md). `bom_review` is the Team Leader internal-review
    gate between drafting the BOM and starting nesting; a Batch found to need
    changes at that gate loops back to `bom_pending` rather than advancing."""

    BOM_PENDING = "bom_pending"
    BOM_REVIEW = "bom_review"
    NESTING = "nesting"
    COMPLETE = "complete"


class NotificationType(str, enum.Enum):
    """What a Notification is about. Kept as its own enum (rather than a
    free-text `type` string) for the same reason every other small fixed set
    in this codebase is an enum — see docs/ARCHITECTURE.md §11.5 for the
    native-Postgres-enum gotcha to remember when a future notification type
    is added here (an ALTER TYPE ... ADD VALUE migration, not autogenerate).

    Originally just two project-manager-facing "this needs to go to the
    client" moments; extended with a second pair for the Team Leader's own
    "please check this" moment when a detailer submits for internal review
    (see room_service.py's _TEAM_LEADER_NOTIFICATION_STAGES) — nothing about
    the Notification model or the notifications router assumes these four
    are the only types that will ever exist; a future type (e.g. an RFI
    raised, a room gone blocked) is just a new member plus whatever service
    call creates it."""

    IFA_READY = "ifa_ready"
    IFC_READY = "ifc_ready"
    IFA_REVIEW_REQUESTED = "ifa_review_requested"
    IFC_REVIEW_REQUESTED = "ifc_review_requested"


class TimeEntrySource(str, enum.Enum):
    """Distinguishes a live start/stop timer from a backfilled manual entry —
    same table, same reporting queries, but worth knowing which one produced
    a given row (a manual entry is self-reported after the fact and can't
    carry the same confidence a stopwatch does)."""

    TIMER = "timer"
    MANUAL = "manual"
