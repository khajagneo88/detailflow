from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_nester
from app.db.session import get_db
from app.models.batch import Batch
from app.models.enums import BatchStatus
from app.models.project import Project
from app.models.room import Room
from app.models.user import User
from app.schemas.batch import BatchCreate, BatchRead, BatchRoomsUpdate, BatchStatusTransition
from app.services.batch_service import (
    assert_rooms_batch_eligible,
    assert_rooms_not_in_other_active_batch,
    complete_batch_rooms,
    next_batch_number,
)

router = APIRouter(tags=["batches"])

# The Batch lifecycle: bom_pending -> bom_review -> nesting -> complete,
# with a Team Leader "changes needed" loop back from bom_review to
# bom_pending. Kept as an explicit map (rather than a linear sequence
# check) so every legal move — including the one backward loop — is
# spelled out in one place and anything else is rejected outright.
_ALLOWED_TRANSITIONS: dict[BatchStatus, set[BatchStatus]] = {
    BatchStatus.BOM_PENDING: {BatchStatus.BOM_REVIEW},
    BatchStatus.BOM_REVIEW: {BatchStatus.NESTING, BatchStatus.BOM_PENDING},
    BatchStatus.NESTING: {BatchStatus.COMPLETE},
    BatchStatus.COMPLETE: set(),
}


def _batch_query(db: Session):
    return db.query(Batch).options(
        joinedload(Batch.nester),
        joinedload(Batch.rooms).joinedload(Room.workflow_stage),
    )


def _to_read(batch: Batch) -> BatchRead:
    data = BatchRead.model_validate(batch)
    data.room_count = len(batch.rooms)
    return data


def _get_batch_or_404(db: Session, batch_id: int) -> Batch:
    batch = _batch_query(db).filter(Batch.id == batch_id).first()
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found.")
    return batch


def _rooms_by_ids(db: Session, project_id: int, room_ids: list[int]) -> list[Room]:
    """Loads the given rooms (with workflow_stage/batch for the eligibility
    checks below) and 404/400s on anything that doesn't resolve cleanly —
    missing ids, or ids belonging to a different project."""
    if not room_ids:
        return []
    rooms = (
        db.query(Room)
        .options(joinedload(Room.workflow_stage), joinedload(Room.batch))
        .filter(Room.id.in_(room_ids))
        .all()
    )
    found_ids = {r.id for r in rooms}
    missing = set(room_ids) - found_ids
    if missing:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Room id(s) not found: {', '.join(str(i) for i in sorted(missing))}.",
        )
    wrong_project = [r for r in rooms if r.project_id != project_id]
    if wrong_project:
        names = ", ".join(f"{r.name} (#{r.id})" for r in wrong_project)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"These rooms don't belong to this project: {names}.",
        )
    return rooms


@router.post(
    "/projects/{project_id}/batches", response_model=BatchRead, status_code=status.HTTP_201_CREATED
)
def create_batch(
    project_id: int,
    payload: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_nester),
) -> BatchRead:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    if not payload.room_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A batch needs at least one room.")

    rooms = _rooms_by_ids(db, project_id, payload.room_ids)
    assert_rooms_batch_eligible(db, rooms)
    assert_rooms_not_in_other_active_batch(db, rooms, current_batch_id=None)

    batch = Batch(
        project_id=project_id,
        batch_number=next_batch_number(db, project_id),
        nester_id=current_user.id,
    )
    db.add(batch)
    db.flush()  # need batch.id before pointing rooms at it

    for room in rooms:
        room.batch_id = batch.id

    db.commit()
    return _to_read(_get_batch_or_404(db, batch.id))


@router.get("/projects/{project_id}/batches", response_model=list[BatchRead])
def list_batches(
    project_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[BatchRead]:
    batches = (
        _batch_query(db)
        .filter(Batch.project_id == project_id)
        .order_by(Batch.batch_number)
        .all()
    )
    return [_to_read(b) for b in batches]


@router.get("/batches/{batch_id}", response_model=BatchRead)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> BatchRead:
    return _to_read(_get_batch_or_404(db, batch_id))


@router.patch("/batches/{batch_id}/rooms", response_model=BatchRead)
def update_batch_rooms(
    batch_id: int,
    payload: BatchRoomsUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_nester),
) -> BatchRead:
    batch = _get_batch_or_404(db, batch_id)
    if batch.status == BatchStatus.COMPLETE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "This batch is complete and can no longer be modified."
        )

    overlap = set(payload.add_room_ids) & set(payload.remove_room_ids)
    if overlap:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Room id(s) can't be both added and removed in the same request: "
            f"{', '.join(str(i) for i in sorted(overlap))}.",
        )

    rooms_to_add = _rooms_by_ids(db, batch.project_id, payload.add_room_ids)
    if rooms_to_add:
        assert_rooms_batch_eligible(db, rooms_to_add)
        assert_rooms_not_in_other_active_batch(db, rooms_to_add, current_batch_id=batch.id)

    rooms_to_remove = _rooms_by_ids(db, batch.project_id, payload.remove_room_ids)
    not_in_batch = [r for r in rooms_to_remove if r.batch_id != batch.id]
    if not_in_batch:
        names = ", ".join(f"{r.name} (#{r.id})" for r in not_in_batch)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"These rooms aren't in this batch, so they can't be removed from it: {names}.",
        )

    for room in rooms_to_add:
        room.batch_id = batch.id
    for room in rooms_to_remove:
        room.batch_id = None

    db.commit()
    return _to_read(_get_batch_or_404(db, batch.id))


@router.post("/batches/{batch_id}/status-transitions", response_model=BatchRead)
def create_batch_status_transition(
    batch_id: int,
    payload: BatchStatusTransition,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BatchRead:
    """No role gate here. POST /rooms/{id}/stage-transitions used to follow
    this same "open to any authenticated user" rule, but as of §29
    (docs/ARCHITECTURE.md) that endpoint gained real per-transition role
    enforcement (app/services/room_service.py::assert_can_transition_stage)
    — the product spec was explicit about who does each *room* review step,
    but has never called out an equivalent per-role rule for a *batch*'s
    own bom_pending/bom_review/nesting/complete lifecycle, so this endpoint
    is left open deliberately rather than inventing a restriction nobody
    asked for. The Nester-only rule the spec does call out explicitly is
    enforced above, on batch creation and on add/remove room membership —
    those are the two places the spec asks for it."""
    batch = _get_batch_or_404(db, batch_id)

    allowed = _ALLOWED_TRANSITIONS.get(batch.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Can't move a batch from '{batch.status.value}' to '{payload.status.value}'.",
        )

    batch.status = payload.status

    if payload.status == BatchStatus.COMPLETE:
        complete_batch_rooms(db, batch, actor=current_user)

    db.commit()
    return _to_read(_get_batch_or_404(db, batch.id))
