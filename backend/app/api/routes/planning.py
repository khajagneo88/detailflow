from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import MANAGEMENT_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.batch import Batch
from app.models.enums import BatchStatus, Priority
from app.models.plan_entry import PlanEntry
from app.models.room import Room
from app.models.user import User
from app.schemas.plan_entry import (
    EligibleBatchItem,
    EligibleRoomItem,
    EligibleTasksRead,
    PlanEntryCreate,
    PlanEntryRead,
    PlanEntryUpdate,
)
from app.services.plan_service import (
    create_entry,
    list_eligible_batches,
    list_eligible_rooms,
    logged_minutes_map,
    room_completed_at_map,
    update_entry,
)

router = APIRouter(prefix="/planning", tags=["planning"])


def _entry_query(db: Session):
    return db.query(PlanEntry).options(
        joinedload(PlanEntry.user),
        joinedload(PlanEntry.room).joinedload(Room.workflow_stage),
        joinedload(PlanEntry.room).joinedload(Room.project),
        joinedload(PlanEntry.room).joinedload(Room.apartment),
        joinedload(PlanEntry.batch).joinedload(Batch.project),
    )


def _to_read(
    entry: PlanEntry,
    logged: dict[tuple[int, int, date], int] | None,
    room_completed: dict[int, datetime] | None = None,
) -> PlanEntryRead:
    data = PlanEntryRead.model_validate(entry)
    if entry.room is not None and data.room is not None:
        data.room.project_name = entry.room.project.name if entry.room.project else None
        data.room.apartment_name = entry.room.apartment.name if entry.room.apartment else None
        if logged is not None:
            data.logged_minutes = logged.get((entry.room_id, entry.user_id, entry.date))
        if room_completed is not None:
            data.task_completed_at = room_completed.get(entry.room_id)
    if entry.batch is not None and data.batch is not None:
        data.batch.project_name = entry.batch.project.name if entry.batch.project else None
        # Same precedent app/api/routes/reports.py::batch_throughput already
        # established — Batch has no dedicated completed_at column, so
        # updated_at doubles as "when it finished" once status is complete
        # (nothing updates a batch again after that).
        data.task_completed_at = (
            entry.batch.updated_at if entry.batch.status == BatchStatus.COMPLETE else None
        )
    return data


@router.get("/entries", response_model=list[PlanEntryRead])
def list_entries(
    start: date = Query(..., description="Inclusive start of the date range."),
    end: date = Query(..., description="Inclusive end of the date range."),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[PlanEntryRead]:
    """Every plan entry whose date falls within [start, end] — the
    frontend asks for one visible work week (Monday-Friday) at a time.
    Open to any authenticated user, same read-access precedent every other
    planning/reports read in this codebase already follows: seeing the
    plan isn't a privileged view of anything a detailer couldn't already
    piece together from My Work and the project pages."""
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "end must not be before start.")

    entries = (
        _entry_query(db)
        .filter(PlanEntry.date >= start, PlanEntry.date <= end)
        .order_by(PlanEntry.user_id, PlanEntry.date, PlanEntry.position)
        .all()
    )
    logged = logged_minutes_map(db, start, end)
    # One extra query for every room actually present in this response,
    # not one query per entry — see plan_service.py::room_completed_at_map.
    room_ids = [e.room_id for e in entries if e.room_id is not None]
    room_completed = room_completed_at_map(db, room_ids)
    return [_to_read(e, logged, room_completed) for e in entries]


@router.get("/eligible-tasks", response_model=EligibleTasksRead)
def eligible_tasks(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> EligibleTasksRead:
    """Rooms and Batches eligible to be planned, top-priority-first —
    powers the grid's "+ add task" picker. See
    app/services/plan_service.py::list_eligible_rooms/list_eligible_batches
    for the exact eligibility rules and sort order.

    A dedicated, cross-project endpoint rather than the frontend composing
    GET /projects/{id}/rooms + GET /projects/{id}/batches per project: the
    picker has to span every project at once (a manager plans across the
    whole shop in one grid, not one project at a time), and this app
    already has more than one active project, so a per-project fan-out
    would mean an extra round trip per project every time any cell's
    picker opens — worse than one dedicated read the page can fetch once
    and reuse for every cell."""
    rooms = list_eligible_rooms(db)
    batches = list_eligible_batches(db)
    return EligibleTasksRead(
        rooms=[
            EligibleRoomItem(
                id=r.id,
                name=r.name,
                project_id=r.project_id,
                project_name=r.project.name if r.project else None,
                apartment_name=r.apartment.name if r.apartment else None,
                priority=r.priority,
                due_date=r.due_date,
                workflow_stage=r.workflow_stage,
            )
            for r in rooms
        ],
        batches=[
            EligibleBatchItem(
                id=b.id,
                batch_number=b.batch_number,
                project_id=b.project_id,
                project_name=b.project.name if b.project else None,
                status=b.status,
                project_priority=b.project.priority if b.project else Priority.NORMAL,
            )
            for b in batches
        ],
    )


@router.post("/entries", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED)
def create_plan_entry(
    payload: PlanEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> PlanEntryRead:
    """Management-role-gated, matching the old weekly-plan create endpoint
    (§16.4) — this doesn't just record a forecast, it also assigns the
    detailer to the room (see plan_service.create_entry), so it needs the
    same guard as anything else that mutates a real assignment."""
    if (payload.room_id is None) == (payload.batch_id is None):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Exactly one of room_id or batch_id must be provided."
        )

    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    room: Room | None = None
    batch: Batch | None = None
    if payload.room_id is not None:
        room = (
            db.query(Room)
            .options(joinedload(Room.workflow_stage))
            .filter(Room.id == payload.room_id)
            .first()
        )
        if room is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
    else:
        assert payload.batch_id is not None
        batch = db.get(Batch, payload.batch_id)
        if batch is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found.")

    entry = create_entry(
        db,
        user=user,
        plan_date=payload.date,
        room=room,
        batch=batch,
        position=payload.position,
        note=payload.note,
        created_by=current_user,
    )
    entry = _entry_query(db).filter(PlanEntry.id == entry.id).one()
    room_completed = room_completed_at_map(db, [entry.room_id] if entry.room_id else [])
    return _to_read(entry, logged=None, room_completed=room_completed)


@router.patch("/entries/{entry_id}", response_model=PlanEntryRead)
def update_plan_entry(
    entry_id: int,
    payload: PlanEntryUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> PlanEntryRead:
    """Moves an entry to a different detailer/day and/or reorders it —
    the endpoint behind both the grid's drag-and-drop and its "move"
    dropdown-menu fallback. Management-role-gated, same as create/delete."""
    entry = (
        db.query(PlanEntry)
        .options(
            joinedload(PlanEntry.room),
            joinedload(PlanEntry.batch),
            joinedload(PlanEntry.user),
        )
        .filter(PlanEntry.id == entry_id)
        .first()
    )
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan entry not found.")

    data = payload.model_dump(exclude_unset=True)

    new_user: User | None = None
    if "user_id" in data:
        new_user = db.get(User, data["user_id"])
        if new_user is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    entry = update_entry(
        db,
        entry=entry,
        user=new_user,
        plan_date=data.get("date"),
        position=data.get("position"),
        note_set="note" in data,
        note=data.get("note"),
    )
    entry = _entry_query(db).filter(PlanEntry.id == entry.id).one()
    room_completed = room_completed_at_map(db, [entry.room_id] if entry.room_id else [])
    return _to_read(entry, logged=None, room_completed=room_completed)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> None:
    """Un-planning someone doesn't undo the room assignment it created —
    same "sticky once made" precedent as the old weekly plan (§16.2),
    just retargeted at Room.assigned_detailer_id instead of
    project_assignments (see plan_service.create_entry)."""
    entry = db.get(PlanEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan entry not found.")
    db.delete(entry)
    db.commit()
