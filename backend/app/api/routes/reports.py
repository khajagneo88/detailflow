from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.rooms import _room_query, _to_read
from app.db.session import get_db
from app.models.comment import Comment
from app.models.enums import CommentStatus, CommentType, RoomWorkflowStatus
from app.models.project import Project
from app.models.room import Room
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.schemas.report import (
    ActiveTimerItem,
    RoomTimeSummaryItem,
    StageSummaryItem,
    TimeSummaryReport,
    WeeklyLoggedTimeItem,
)
from app.schemas.room import RoomRead

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/stage-summary", response_model=list[StageSummaryItem])
def stage_summary(
    project_id: int | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[StageSummaryItem]:
    """Room counts per workflow stage — powers the Reports stage-breakdown
    chart. Every stage is included, even at zero, so the chart's x-axis
    never silently drops a stage nobody happens to be in right now."""
    counts_query = db.query(Room.workflow_stage_id, func.count(Room.id))
    if project_id is not None:
        counts_query = counts_query.filter(Room.project_id == project_id)
    counts = dict(counts_query.group_by(Room.workflow_stage_id).all())

    stages = db.query(WorkflowStage).order_by(WorkflowStage.sequence).all()
    return [
        StageSummaryItem(
            stage_key=s.key,
            stage_name=s.name,
            sequence=s.sequence,
            room_count=counts.get(s.id, 0),
        )
        for s in stages
    ]


@router.get("/rooms", response_model=list[RoomRead])
def report_rooms(
    project_id: int | None = None,
    stage_key: str | None = None,
    status_filter: RoomWorkflowStatus | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[RoomRead]:
    """Cross-project room listing, enriched with project/apartment name —
    powers the Reports Gantt-style timeline. Filterable by project and
    stage so the timeline can be scoped down instead of always showing
    every room in the system."""
    query = _room_query(db)
    if project_id is not None:
        query = query.filter(Room.project_id == project_id)
    if stage_key is not None:
        query = query.join(WorkflowStage, Room.workflow_stage_id == WorkflowStage.id).filter(
            WorkflowStage.key == stage_key
        )
    if status_filter is not None:
        query = query.filter(Room.workflow_status == status_filter)

    rooms = query.order_by(Room.due_date.is_(None), Room.due_date.asc()).all()
    return [_to_read(r) for r in rooms]


@router.get("/attention-summary")
def attention_summary(
    project_id: int | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> dict:
    """Small counts used for report headline stats: rooms blocked/changes-
    required, and open RFIs/blockers. Filterable by project so it stays in
    sync with the rest of the Reports page when a project filter is set."""
    room_filter = db.query(func.count(Room.id)).filter(
        Room.workflow_status.in_([RoomWorkflowStatus.BLOCKED, RoomWorkflowStatus.CHANGES_REQUIRED])
    )
    comment_base = db.query(func.count(Comment.id))
    if project_id is not None:
        room_filter = room_filter.filter(Room.project_id == project_id)
        comment_base = comment_base.filter(Comment.project_id == project_id)

    blocked = room_filter.scalar() or 0
    open_rfis = (
        comment_base.filter(Comment.type == CommentType.RFI, Comment.status == CommentStatus.OPEN)
        .scalar()
        or 0
    )
    open_blockers = (
        comment_base.filter(
            Comment.type == CommentType.BLOCKER, Comment.status == CommentStatus.OPEN
        )
        .scalar()
        or 0
    )
    return {
        "rooms_needing_attention": blocked,
        "open_rfis": open_rfis,
        "open_blockers": open_blockers,
    }


@router.get("/active-timers", response_model=list[ActiveTimerItem])
def active_timers(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[ActiveTimerItem]:
    """Every currently-running timer, across every user — the "is this
    detailer actually on a job right now" half of the Team page's presence
    dot (docs/ARCHITECTURE.md §17). Open to any authenticated user, same as
    every other /reports endpoint."""
    rows = (
        db.query(TimeEntry, Room, Project)
        .join(Room, TimeEntry.room_id == Room.id)
        .join(Project, Room.project_id == Project.id)
        .filter(TimeEntry.ended_at.is_(None), TimeEntry.user_id.is_not(None))
        .all()
    )
    return [
        ActiveTimerItem(
            user_id=entry.user_id,
            room_id=room.id,
            room_name=room.name,
            project_id=project.id,
            project_name=project.name,
            started_at=entry.started_at,
        )
        for entry, room, project in rows
    ]


@router.get("/time-logged", response_model=list[WeeklyLoggedTimeItem])
def time_logged_for_week(
    week_start: date,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[WeeklyLoggedTimeItem]:
    """Every (detailer, project) pair with at least one logged time entry
    in the 7 days starting `week_start` — the Planning page (§16) uses
    this to mark a past week's plan items green (logged something that
    week) or red (didn't), per docs/ARCHITECTURE.md §19. `week_start` is
    taken as-is, not normalised to a Monday here — the frontend already
    only ever passes one of its own normalised week Mondays (lib/week.ts),
    the same value it used to fetch that week's plan entries.

    Treated as a plain calendar week in UTC rather than per-user local
    time — the same approximation weekly_plan_service.monday_of already
    makes for "which week is this", consistent rather than more precise
    than the rest of the planning feature."""
    start_dt = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(days=7)

    rows = (
        db.query(
            TimeEntry.user_id,
            Room.project_id,
            func.sum(TimeEntry.duration_minutes).label("logged_minutes"),
        )
        .join(Room, TimeEntry.room_id == Room.id)
        .filter(
            TimeEntry.user_id.is_not(None),
            TimeEntry.started_at >= start_dt,
            TimeEntry.started_at < end_dt,
        )
        .group_by(TimeEntry.user_id, Room.project_id)
        .all()
    )
    return [
        WeeklyLoggedTimeItem(
            user_id=row.user_id,
            project_id=row.project_id,
            logged_minutes=int(row.logged_minutes or 0),
        )
        for row in rows
    ]


@router.get("/time-summary", response_model=TimeSummaryReport)
def time_summary(
    project_id: int | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> TimeSummaryReport:
    """Logged vs. estimated hours per room — powers the Reports hours KPI
    tile and the per-room hours column. Logged hours come from
    time_entries.duration_minutes (timer and manual entries count the same
    way); a room with no time logged yet still appears, at zero, rather
    than being dropped from the report."""
    logged_subq = (
        db.query(
            TimeEntry.room_id.label("room_id"),
            func.sum(TimeEntry.duration_minutes).label("logged_minutes"),
        )
        .group_by(TimeEntry.room_id)
        .subquery()
    )

    query = (
        db.query(
            Room.id.label("room_id"),
            Room.name.label("room_name"),
            Room.project_id.label("project_id"),
            Project.name.label("project_name"),
            Room.estimated_hours.label("estimated_hours"),
            func.coalesce(logged_subq.c.logged_minutes, 0).label("logged_minutes"),
        )
        .join(Project, Room.project_id == Project.id)
        .outerjoin(logged_subq, logged_subq.c.room_id == Room.id)
    )
    if project_id is not None:
        query = query.filter(Room.project_id == project_id)

    rows = query.order_by(Room.name).all()
    items = [
        RoomTimeSummaryItem(
            room_id=row.room_id,
            room_name=row.room_name,
            project_id=row.project_id,
            project_name=row.project_name,
            estimated_hours=float(row.estimated_hours) if row.estimated_hours is not None else None,
            logged_hours=round((row.logged_minutes or 0) / 60, 2),
        )
        for row in rows
    ]
    return TimeSummaryReport(
        rooms=items,
        total_estimated_hours=round(sum(i.estimated_hours or 0 for i in items), 2),
        total_logged_hours=round(sum(i.logged_hours for i in items), 2),
    )
