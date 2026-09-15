"""Business rules for Batches that don't belong inline in a route handler —
mirrors the split app/services/room_service.py already uses.
"""
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.enums import BatchStatus
from app.models.room import Room
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.services.room_service import transition_room_stage

# A room counts as "IFC approved" once it has reached IFC Issued and hasn't
# looped back into a revision. IFC Issued deliberately carries no required
# client-approval gate of its own (see app/models/workflow_stage.py) — so
# "approved" here just means the room reached that resting point without
# landing back in IFC Revision. Eligibility is read off `sequence` (>=
# ifc_issued.sequence) rather than hardcoded as "must equal ifc_issued",
# the same "generic on purpose" reasoning transition_room_stage already
# uses for its own revision-stage tuple — a future stage inserted between
# IFC Issued and Complete (e.g. the Variation loop already anticipated in
# workflow_stage.py's comments) would then count as still-eligible without
# a code change here.
#
# JUDGMENT CALL: "complete" is explicitly excluded even though it is
# >= ifc_issued.sequence and isn't a revision stage. A room already at
# Complete (today, rooms can go straight from IFC Issued to Complete with
# no batch at all — see docs/ARCHITECTURE.md) has finished all its work;
# grouping it into a *new* Batch would have nothing left to accomplish and
# would make the batch-completion cascade below (which calls
# transition_room_stage(..., complete) on every room in the batch) produce
# a confusing same-stage/no-op event on a room that never actually went
# through this batch's BOM/nesting work.
_INELIGIBLE_STAGE_KEYS = {"ifc_revision", "complete"}


def _ifc_issued_stage(db: Session) -> WorkflowStage:
    stage = db.query(WorkflowStage).filter(WorkflowStage.key == "ifc_issued").first()
    if stage is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The 'ifc_issued' workflow stage is not configured — run the seed script.",
        )
    return stage


def _complete_stage(db: Session) -> WorkflowStage:
    stage = db.query(WorkflowStage).filter(WorkflowStage.key == "complete").first()
    if stage is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The 'complete' workflow stage is not configured — run the seed script.",
        )
    return stage


def assert_rooms_batch_eligible(db: Session, rooms: Iterable[Room]) -> None:
    """400s, naming every offending room, if any room hasn't reached (an
    approved) IFC Issued yet — see the eligibility reasoning above."""
    ifc_issued = _ifc_issued_stage(db)
    ineligible = [
        room
        for room in rooms
        if room.workflow_stage.sequence < ifc_issued.sequence
        or room.workflow_stage.key in _INELIGIBLE_STAGE_KEYS
    ]
    if ineligible:
        names = ", ".join(f"{r.name} (#{r.id}, stage: {r.workflow_stage.name})" for r in ineligible)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "These rooms have not had their IFC approved yet and can't join a batch: "
            f"{names}.",
        )


def assert_rooms_not_in_other_active_batch(
    db: Session, rooms: Iterable[Room], current_batch_id: int | None
) -> None:
    """400s, naming every offending room, if any room already belongs to a
    different batch that hasn't reached `complete`. A room's own current
    batch (`current_batch_id`, e.g. re-adding it on the same PATCH) is not
    a conflict with itself."""
    conflicting = [
        room
        for room in rooms
        if room.batch_id is not None
        and room.batch_id != current_batch_id
        and room.batch is not None
        and room.batch.status != BatchStatus.COMPLETE
    ]
    if conflicting:
        names = ", ".join(
            f"{r.name} (#{r.id}, already in Batch {r.batch.batch_number})" for r in conflicting
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"These rooms already belong to another active batch: {names}.",
        )


def next_batch_number(db: Session, project_id: int) -> int:
    """Batch numbers are sequential per project (Batch 1, Batch 2, ...,
    resetting to 1 for each new project) — server-assigned as
    max(existing for this project) + 1, never client-supplied."""
    current_max = (
        db.query(func.max(Batch.batch_number)).filter(Batch.project_id == project_id).scalar()
    )
    return (current_max or 0) + 1


def complete_batch_rooms(db: Session, batch: Batch, actor: User) -> None:
    """Side effect of a Batch reaching `complete` — every room belonging to
    it is moved to the room-level Complete stage too, via the existing
    transition_room_stage (reused rather than hand-rolling a parallel
    room-completion path). See docs/ARCHITECTURE.md."""
    complete_stage = _complete_stage(db)
    for room in batch.rooms:
        if room.workflow_stage_id == complete_stage.id:
            continue  # already complete — skip, don't write a redundant no-op event
        transition_room_stage(db, room=room, to_stage=complete_stage, actor=actor)
