"""Business rules for the day-level planning grid — see
docs/ARCHITECTURE.md. Replaces app/services/weekly_plan_service.py
entirely (the old §16/§19 week-level design), now keyed to a specific
Room or Batch on a specific calendar date rather than a whole project for
a whole week. Kept out of the route module for the same reason as every
other services/*.py file in this codebase.
"""
from datetime import date as date_
from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.batch import Batch
from app.models.enums import BatchStatus, Priority
from app.models.plan_entry import PlanEntry
from app.models.project import Project
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workflow_stage import WorkflowStage


def _task_label(room: Room | None, batch: Batch | None) -> str:
    if room is not None:
        return room.name
    assert batch is not None
    return f"Batch {batch.batch_number}"


def _next_position(db: Session, user_id: int, plan_date: date_) -> int:
    max_position = (
        db.query(func.max(PlanEntry.position))
        .filter(PlanEntry.user_id == user_id, PlanEntry.date == plan_date)
        .scalar()
    )
    return (max_position if max_position is not None else -1) + 1


def _assert_not_already_planned(
    db: Session,
    *,
    room: Room | None,
    batch: Batch | None,
    plan_date: date_,
    exclude_id: int | None = None,
) -> None:
    """A room (or batch) can only be "the plan" for one detailer on a given
    day — reject a conflicting assignment naming who already has it,
    rather than silently overwriting (per the product spec). Mirrors the
    DB-level UniqueConstraints (room_id, date) / (batch_id, date) on
    PlanEntry; this is the friendly pre-check, the constraint itself is
    the real guarantee against a race between two managers (same
    fast-path-plus-constraint pattern as time_entries' one-active-timer
    index, docs/ARCHITECTURE.md §13.2)."""
    query = db.query(PlanEntry).options(joinedload(PlanEntry.user)).filter(
        PlanEntry.date == plan_date
    )
    if room is not None:
        query = query.filter(PlanEntry.room_id == room.id)
    else:
        assert batch is not None
        query = query.filter(PlanEntry.batch_id == batch.id)
    if exclude_id is not None:
        query = query.filter(PlanEntry.id != exclude_id)

    existing = query.first()
    if existing is not None:
        who = existing.user.full_name if existing.user else "someone else"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{_task_label(room, batch)} is already planned for {who} on "
            f"{plan_date.isoformat()}.",
        )


def create_entry(
    db: Session,
    *,
    user: User,
    plan_date: date_,
    room: Room | None,
    batch: Batch | None,
    position: int | None,
    note: str | None,
    created_by: User,
) -> PlanEntry:
    _assert_not_already_planned(db, room=room, batch=batch, plan_date=plan_date)

    entry = PlanEntry(
        user_id=user.id,
        date=plan_date,
        room_id=room.id if room else None,
        batch_id=batch.id if batch else None,
        position=position if position is not None else _next_position(db, user.id, plan_date),
        note=note,
        created_by_id=created_by.id,
    )
    db.add(entry)

    # Planning a ROOM task onto a detailer is also how they get assigned to
    # it — Room.assigned_detailer_id is set to the entry's user, in the
    # same transaction, so the room's own assignee and My Work both agree
    # with the plan immediately. This is the same "planning also assigns"
    # precedent app/services/weekly_plan_service.py used for
    # project_assignments (docs/ARCHITECTURE.md §16.2), just retargeted at
    # the room-level field since planning is now room/batch-level, not
    # project-level.
    #
    # JUDGMENT CALL / known gap: Batch has no equivalent per-task assignee
    # field — Batch.nester_id is the batch's *creator* (set once, at
    # creation, per docs/ARCHITECTURE.md §21.4), not a "who's working on
    # this today" pointer, and planning a batch onto a detailer here
    # deliberately does NOT overwrite it. Adding a real per-batch assignee
    # field would be a schema change (and its own product decision — who's
    # allowed to change it, does it affect My Work, etc.) well beyond what
    # was asked; a batch-linked plan entry is honest forecast-only until
    # that's actually requested.
    if room is not None:
        room.assigned_detailer_id = user.id

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{_task_label(room, batch)} is already planned for someone else on "
            f"{plan_date.isoformat()}.",
        ) from exc

    db.commit()
    db.refresh(entry)
    return entry


def update_entry(
    db: Session,
    *,
    entry: PlanEntry,
    user: User | None,
    plan_date: date_ | None,
    position: int | None,
    note_set: bool,
    note: str | None,
) -> PlanEntry:
    """Moves and/or reorders an existing entry — the frontend's "drag a
    chip to another day/detailer" and its dropdown-menu "move" fallback
    both funnel through this one call. Deliberately does not accept a new
    room_id/batch_id: re-targeting an entry at a different work item is a
    remove-and-re-add on the frontend (see PlanEntryUpdate's docstring),
    not an edit here."""
    new_user = user if user is not None else entry.user
    new_date = plan_date if plan_date is not None else entry.date

    if new_user.id != entry.user_id or new_date != entry.date:
        _assert_not_already_planned(
            db,
            room=entry.room,
            batch=entry.batch,
            plan_date=new_date,
            exclude_id=entry.id,
        )

    if user is not None:
        entry.user_id = user.id
        # Moving a room task onto a different detailer re-assigns the room
        # to them too — same sticky-assignment reasoning as create_entry.
        if entry.room is not None:
            entry.room.assigned_detailer_id = user.id
    if plan_date is not None:
        entry.date = plan_date
    if position is not None:
        entry.position = position
    if note_set:
        entry.note = note

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{_task_label(entry.room, entry.batch)} is already planned for someone else on "
            f"{new_date.isoformat()}.",
        ) from exc

    db.commit()
    db.refresh(entry)
    return entry


def logged_minutes_map(
    db: Session, start: date_, end: date_
) -> dict[tuple[int, int, date_], int]:
    """(room_id, user_id, calendar_day) -> minutes logged that day, within
    [start, end] — the per-day-per-room adaptation of §19's project/week
    green-red marking (docs/ARCHITECTURE.md): a past day's room-linked
    chip can show whether that detailer actually logged any time entry
    against that room that day.

    Batches carry no equivalent signal — time_entries is keyed to room_id
    only (§13.1), not batch_id — so a batch-linked plan entry never gets a
    worked/not-worked mark. Documented gap, not an oversight: adding one
    would mean either a new time_entries.batch_id column or inferring it
    transitively through the batch's member rooms, both bigger changes
    than this feature asked for.

    Bucketed in Python against UTC-normalised bounds rather than a SQL
    func.date() grouping, so the result doesn't depend on the DB session's
    timezone setting — same plain-UTC-calendar-day approximation
    app/api/routes/reports.py::time_logged_for_week already makes (§19.2),
    just computed a different way here since this groups by day-per-room
    rather than summing a single fixed week."""
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end, time.min, tzinfo=timezone.utc) + timedelta(days=1)

    rows = (
        db.query(
            TimeEntry.room_id, TimeEntry.user_id, TimeEntry.started_at, TimeEntry.duration_minutes
        )
        .filter(
            TimeEntry.user_id.is_not(None),
            TimeEntry.room_id.is_not(None),
            TimeEntry.started_at >= start_dt,
            TimeEntry.started_at < end_dt,
        )
        .all()
    )

    totals: dict[tuple[int, int, date_], int] = {}
    for room_id, user_id, started_at, duration in rows:
        day = started_at.astimezone(timezone.utc).date()
        key = (room_id, user_id, day)
        totals[key] = totals.get(key, 0) + (duration or 0)
    return totals


def room_completed_at_map(db: Session, room_ids: list[int]) -> dict[int, datetime]:
    """room_id -> the timestamp its most recent transition *to* the
    `complete` WorkflowStage happened, for exactly the room ids given —
    one query regardless of how many plan entries the caller is rendering
    (see app/api/routes/planning.py::list_entries), never one query per
    entry. "Most recent" rather than "first": a room can in theory be
    reopened after Complete and completed again later (nothing in this
    codebase forbids transitioning a `complete` room onward and back), so
    the latest completion is the one that actually answers "is it complete
    right now, and when did that happen" — same reasoning as `Batch`'s
    completion timing below, which also reflects the current status only.

    Powers PlanEntryRead.task_completed_at (see docs/ARCHITECTURE.md — the
    week-completion highlight, §22's day-level grid follow-up) — the
    frontend compares this against the plan entry's assigned week to
    decide whether that task actually finished during the week it was
    planned for, which is a different question from §22.4's per-day
    logged-time indicator this field's frontend feature replaces."""
    if not room_ids:
        return {}
    rows = (
        db.query(RoomStageEvent.room_id, func.max(RoomStageEvent.created_at))
        .join(WorkflowStage, RoomStageEvent.to_stage_id == WorkflowStage.id)
        .filter(WorkflowStage.key == "complete", RoomStageEvent.room_id.in_(room_ids))
        .group_by(RoomStageEvent.room_id)
        .all()
    )
    return {room_id: completed_at for room_id, completed_at in rows}


_ROOM_PRIORITY_RANK = case(
    (Room.priority == Priority.URGENT, 0),
    (Room.priority == Priority.HIGH, 1),
    (Room.priority == Priority.NORMAL, 2),
    (Room.priority == Priority.LOW, 3),
    else_=4,
)

_PROJECT_PRIORITY_RANK = case(
    (Project.priority == Priority.URGENT, 0),
    (Project.priority == Priority.HIGH, 1),
    (Project.priority == Priority.NORMAL, 2),
    (Project.priority == Priority.LOW, 3),
    else_=4,
)


def list_eligible_rooms(db: Session) -> list[Room]:
    """Rooms that make sense to plan day-to-day work against for the
    grid's "+ add task" picker: not yet Complete, and not already living
    inside an active Batch — once a room joins a Batch, the real unit of
    work a manager plans against is the Batch (BOM/Nesting), not the room
    individually (docs/ARCHITECTURE.md §21.4), so a batched room drops out
    of this list the same way it drops out of the batch-eligibility
    picker on the other side of that transition (see
    app/services/batch_service.py). Archived projects' rooms are excluded,
    same as every other project picker in this codebase.

    Sorted top-priority-first (urgent > high > normal > low), then
    soonest due date, matching the same ranking `GET /rooms/mine` already
    uses (docs/ARCHITECTURE.md §12.2)."""
    return (
        db.query(Room)
        .join(Project, Room.project_id == Project.id)
        .join(WorkflowStage, Room.workflow_stage_id == WorkflowStage.id)
        .options(
            joinedload(Room.workflow_stage),
            joinedload(Room.project),
            joinedload(Room.apartment),
        )
        .filter(Project.is_archived.is_(False))
        .filter(Room.batch_id.is_(None))
        .filter(WorkflowStage.key != "complete")
        .order_by(_ROOM_PRIORITY_RANK, Room.due_date.is_(None), Room.due_date.asc(), Room.name)
        .all()
    )


def list_eligible_batches(db: Session) -> list[Batch]:
    """Batches with BOM/Nesting work still open — a Complete batch has
    nothing left to plan against. Sorted by the batch's *project* priority:
    JUDGMENT CALL — Batch has no priority field of its own (see
    app/models/batch.py), so its project's priority is the closest
    reasonable proxy, same spirit as using a room's own priority above.
    Tie-broken by batch_number (rather than a due date, which Batch also
    doesn't have)."""
    return (
        db.query(Batch)
        .join(Project, Batch.project_id == Project.id)
        .options(joinedload(Batch.project))
        .filter(Project.is_archived.is_(False))
        .filter(Batch.status != BatchStatus.COMPLETE)
        .order_by(_PROJECT_PRIORITY_RANK, Batch.batch_number)
        .all()
    )
