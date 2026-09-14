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
    DETAILER = "detailer"


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


class CommentStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class TimeEntrySource(str, enum.Enum):
    """Distinguishes a live start/stop timer from a backfilled manual entry —
    same table, same reporting queries, but worth knowing which one produced
    a given row (a manual entry is self-reported after the fact and can't
    carry the same confidence a stopwatch does)."""

    TIMER = "timer"
    MANUAL = "manual"
