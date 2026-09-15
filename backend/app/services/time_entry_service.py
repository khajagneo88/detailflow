"""Business rules for starting/stopping timers and recording manual time
against a room — kept out of the route handlers so the duration math and
the "only one running timer per user" story live in exactly one place.

The one-active-timer-per-user rule is enforced twice on purpose: the
partial unique index on time_entries (see app/models/time_entry.py) is the
real guarantee, safe against two concurrent "start" requests; the check in
start_timer() below just gets there first in the common case so the user
sees a clean 409 naming the room instead of a raw database error.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enums import TimeEntrySource
from app.models.room import Room
from app.models.time_entry import TimeEntry
from app.models.user import User


def _minutes_between(started_at: datetime, ended_at: datetime) -> int:
    return max(0, round((ended_at - started_at).total_seconds() / 60))


def get_active_entry(db: Session, user: User) -> TimeEntry | None:
    return (
        db.query(TimeEntry)
        .filter(TimeEntry.user_id == user.id, TimeEntry.ended_at.is_(None))
        .first()
    )


def _conflict_from_integrity_error(db: Session, user: User) -> HTTPException:
    active = get_active_entry(db, user)
    room_name = active.room.name if active is not None and active.room else "another room"
    return HTTPException(
        status.HTTP_409_CONFLICT,
        f"You already have a running timer on {room_name}. Stop it before starting another.",
    )


def start_timer(db: Session, room: Room, user: User, note: str | None) -> TimeEntry:
    # Belt-and-suspenders: check first (fast path, friendly message before
    # we even hit the DB), but the partial unique index is what actually
    # prevents a race between two "start" clicks landing at once.
    if get_active_entry(db, user) is not None:
        raise _conflict_from_integrity_error(db, user)

    entry = TimeEntry(
        room_id=room.id,
        user_id=user.id,
        started_at=datetime.now(timezone.utc),
        source=TimeEntrySource.TIMER,
        note=note,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "ux_time_entries_one_active_per_user" in str(exc.orig):
            raise _conflict_from_integrity_error(db, user) from exc
        raise
    db.refresh(entry)
    return entry


def stop_timer(db: Session, entry: TimeEntry) -> TimeEntry:
    if entry.ended_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This timer has already been stopped.")

    entry.ended_at = datetime.now(timezone.utc)
    entry.duration_minutes = _minutes_between(entry.started_at, entry.ended_at)
    db.commit()
    db.refresh(entry)
    return entry


def create_manual_entry(
    db: Session,
    room: Room,
    user: User,
    started_at: datetime,
    duration_minutes: int,
    note: str | None,
) -> TimeEntry:
    entry = TimeEntry(
        room_id=room.id,
        user_id=user.id,
        started_at=started_at,
        ended_at=started_at + timedelta(minutes=duration_minutes),
        duration_minutes=duration_minutes,
        source=TimeEntrySource.MANUAL,
        note=note,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def auto_start_for_room(db: Session, room: Room, actor: User) -> None:
    """Side effect of a detailer clicking Start on their own room — begins
    an automatic stage-clock in place of the old manual "Start timer"
    control (see docs/ARCHITECTURE.md, "automatic time tracking"). A no-op
    if a clock is already running on this exact room (a repeat Start click,
    e.g. after a page refresh); otherwise subject to the same
    one-running-timer-per-user rule the manual timer used — this is what
    now enforces "one active task per detailer" without any separate check.
    Only ever tracks the room's own assigned detailer's time; a manager or
    team leader changing someone else's room status through the same PATCH
    endpoint doesn't start a clock on that detailer's behalf.
    """
    if room.assigned_detailer_id != actor.id:
        return
    active = get_active_entry(db, actor)
    if active is not None and active.room_id == room.id:
        return
    start_timer(db, room=room, user=actor, note=None)


def auto_stop_for_room(db: Session, room: Room, actor: User) -> None:
    """Side effect of a detailer putting a room on hold, submitting it for
    IFA/IFC review, or moving it to the next stage — stops their own
    automatic stage-clock if it's the one currently running on this room.
    A no-op otherwise (nothing running, or the running entry belongs to a
    different room or a different user than the one acting) — see
    auto_start_for_room above and docs/ARCHITECTURE.md."""
    if room.assigned_detailer_id != actor.id:
        return
    active = get_active_entry(db, actor)
    if active is not None and active.room_id == room.id:
        stop_timer(db, active)


def apply_manual_update(
    entry: TimeEntry,
    started_at: datetime | None,
    duration_minutes: int | None,
    note: str | None,
    note_provided: bool,
) -> None:
    """Recomputes ended_at whenever either input to it changes, so a manual
    entry never drifts into having a duration that doesn't match its own
    start/end — same invariant create_manual_entry establishes."""
    new_started_at = started_at if started_at is not None else entry.started_at
    new_duration = duration_minutes if duration_minutes is not None else entry.duration_minutes
    if new_duration is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "A manual entry must have a duration."
        )

    entry.started_at = new_started_at
    entry.duration_minutes = new_duration
    entry.ended_at = new_started_at + timedelta(minutes=new_duration)
    if note_provided:
        entry.note = note
