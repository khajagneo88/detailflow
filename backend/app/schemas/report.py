from datetime import datetime

from pydantic import BaseModel


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
