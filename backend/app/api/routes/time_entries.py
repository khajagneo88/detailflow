from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import MANAGEMENT_ROLES, get_current_user
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.room import Room
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.schemas.time_entry import TimeEntryRead, TimeEntryUpdate
from app.services.time_entry_service import apply_manual_update, get_active_entry

router = APIRouter(tags=["time-entries"])


def _entry_query(db: Session):
    return db.query(TimeEntry).options(
        joinedload(TimeEntry.user),
        joinedload(TimeEntry.room).joinedload(Room.project),
    )


def _to_read(entry: TimeEntry) -> TimeEntryRead:
    data = TimeEntryRead.model_validate(entry)
    if entry.room is not None:
        data.room_name = entry.room.name
        data.project_id = entry.room.project_id
        data.project_name = entry.room.project.name if entry.room.project else None
    return data


def _get_room_or_404(db: Session, room_id: int) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
    return room


def _get_entry_or_404(db: Session, entry_id: int) -> TimeEntry:
    entry = _entry_query(db).filter(TimeEntry.id == entry_id).first()
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Time entry not found.")
    return entry


def _assert_can_modify(entry: TimeEntry, user: User) -> None:
    """Whoever logged the time can fix their own mistake; managers/team
    leaders/admin can clean up on anyone's behalf (spec: management roles
    can perform all detailer-facing actions plus oversight)."""
    if entry.user_id == user.id:
        return
    if user.role == UserRole.ADMIN or user.role in MANAGEMENT_ROLES:
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN, "You can only edit or delete your own time entries."
    )


@router.get("/time-entries/active", response_model=TimeEntryRead | None)
def get_active_timer(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimeEntryRead | None:
    """Polled by the header's running-timer indicator. Returns null (200)
    rather than 404 when nothing is running, so the frontend doesn't have to
    treat every poll as a potential error."""
    entry = get_active_entry(db, current_user)
    if entry is None:
        return None
    return _to_read(_entry_query(db).filter(TimeEntry.id == entry.id).one())


@router.get("/rooms/{room_id}/time-entries", response_model=list[TimeEntryRead])
def list_room_time_entries(
    room_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[TimeEntryRead]:
    _get_room_or_404(db, room_id)
    entries = (
        _entry_query(db)
        .filter(TimeEntry.room_id == room_id)
        .order_by(TimeEntry.started_at.desc())
        .all()
    )
    return [_to_read(e) for e in entries]


@router.patch("/time-entries/{entry_id}", response_model=TimeEntryRead)
def update_time_entry(
    entry_id: int,
    payload: TimeEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TimeEntryRead:
    entry = _get_entry_or_404(db, entry_id)
    _assert_can_modify(entry, current_user)

    if entry.ended_at is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "A running timer can't be edited — stop it first, or delete it.",
        )

    data = payload.model_dump(exclude_unset=True)
    apply_manual_update(
        entry,
        started_at=data.get("started_at"),
        duration_minutes=data.get("duration_minutes"),
        note=data.get("note"),
        note_provided="note" in data,
    )
    db.commit()
    return _to_read(_entry_query(db).filter(TimeEntry.id == entry.id).one())


@router.delete("/time-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    entry = _get_entry_or_404(db, entry_id)
    _assert_can_modify(entry, current_user)
    db.delete(entry)
    db.commit()
