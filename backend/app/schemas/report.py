from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import ProjectStatus


class ActiveTimerItem(BaseModel):
    """One row per currently-running timer, across every user — powers the
    Team page's presence dot (docs/ARCHITECTURE.md §17): a user with a row
    here is shown "working"; a user with none (but recently seen) is
    "idle"."""

    user_id: int
    room_id: int
    room_name: str
    project_id: int
    project_name: str | None
    started_at: datetime


class WeeklyLoggedTimeItem(BaseModel):
    """One row per (detailer, project) pair that has at least one logged
    time entry within a given week — powers the Planning page's past-week
    completed/not-completed marking (docs/ARCHITECTURE.md §19). A pair
    with no logged time simply has no row here; the frontend treats
    "no row" as "nothing logged", not as an error."""

    user_id: int
    project_id: int
    logged_minutes: int


class StageSummaryItem(BaseModel):
    stage_key: str
    stage_name: str
    sequence: int
    room_count: int


class RoomTimeSummaryItem(BaseModel):
    room_id: int
    room_name: str
    project_id: int
    project_name: str | None
    estimated_hours: float | None
    logged_hours: float


class TimeSummaryReport(BaseModel):
    rooms: list[RoomTimeSummaryItem]
    total_estimated_hours: float
    total_logged_hours: float


class TimesheetEntryItem(BaseModel):
    """One row per (detailer, calendar day, project) with at least one
    logged time entry within the requested window — powers the Team page's
    admin-only Timesheet tab (docs/ARCHITECTURE.md §28): what project a
    detailer worked on, and how long, on a given day. A detailer/day with
    nothing logged simply has no row, same "no row = nothing logged"
    convention as WeeklyLoggedTimeItem/DetailerHoursItem above. A detailer
    who split a day across two projects gets two rows, one per project."""

    user_id: int
    full_name: str
    date: date
    project_id: int
    project_name: str
    logged_minutes: int


class DetailerHoursItem(BaseModel):
    """One row per user with any logged time in the requested window —
    powers the Reports "Hours per detailer" ranked list (docs/ARCHITECTURE.md
    §12.3's Reports section, extended). Users with nothing logged in the
    window simply have no row, same "no row = nothing logged" convention as
    WeeklyLoggedTimeItem above."""

    user_id: int
    full_name: str
    logged_hours: float


class ProjectBurnItem(BaseModel):
    """Logged-vs-estimated hours for one active project — all-time totals,
    not scoped to the hours/rework date range, since `estimated_hours` is a
    single whole-project figure rather than a per-period one. A project with
    no `estimated_hours` set still appears (estimated_hours: null) rather
    than being dropped, matching RoomTimeSummaryItem's own "zero, not
    missing" convention."""

    project_id: int
    project_name: str
    status: ProjectStatus
    estimated_hours: float | None
    logged_hours: float


class ReworkSummaryItem(BaseModel):
    """Revision (a stage transition into ifa_revision/ifc_revision) and
    Variation (a Comment with type=variation) counts for one project, within
    the requested window — surfaces where rework is concentrated. Projects
    with zero of both simply have no row."""

    project_id: int
    project_name: str
    revision_count: int
    variation_count: int


class BatchThroughputReport(BaseModel):
    """How many Batches reached `complete` in the requested window, and the
    average creation-to-completion time across them (in hours) — `Batch` has
    no dedicated `completed_at` column, so `updated_at` at the moment its
    status last changed to `complete` is used as the completion timestamp
    (nothing updates a completed batch afterwards — see app/models/batch.py).
    `avg_completion_hours` is null when nothing completed in the window,
    rather than zero, so the frontend can render "no batches completed" and
    not a misleading 0h average."""

    completed_count: int
    avg_completion_hours: float | None
