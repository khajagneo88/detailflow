"""Business rules for rooms that don't belong inline in a route handler and
must not be duplicated between the create and update endpoints.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.apartment import Apartment
from app.models.enums import RoomWorkflowStatus, StageTransitionOutcome
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.user import User
from app.models.workflow_stage import WorkflowStage


def assert_apartment_belongs_to_project(
    db: Session, apartment_id: int | None, project_id: int
) -> None:
    """Enforced here rather than as a DB constraint — see
    docs/ARCHITECTURE.md §6 for why this is a documented risk to revisit."""
    if apartment_id is None:
        return
    apartment = db.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Apartment not found.")
    if apartment.project_id != project_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That apartment belongs to a different project.",
        )


def compute_progress(stage: WorkflowStage, total_stages: int) -> int:
    """MVP progress = position of the current stage in the fixed sequence.
    Deliberately not user-editable — see docs/ARCHITECTURE.md §8."""
    if total_stages <= 0:
        return 0
    return round((stage.sequence / total_stages) * 100)


def refresh_room_progress(db: Session, room: Room) -> None:
    total_stages = db.query(WorkflowStage).count()
    room.progress = compute_progress(room.workflow_stage, total_stages)


def transition_room_stage(
    db: Session,
    room: Room,
    to_stage: WorkflowStage,
    actor: User,
    outcome: StageTransitionOutcome | None = None,
    note: str | None = None,
) -> RoomStageEvent:
    """The single place a room's workflow_stage_id changes outside of
    creation. Always logs a RoomStageEvent — this *is* the review history
    spec §15 asks for (never overwritten, always appended) — rather than
    letting callers PATCH workflow_stage_id directly and lose the "who
    changed what, and why" trail.
    """
    event = RoomStageEvent(
        room_id=room.id,
        from_stage_id=room.workflow_stage_id,
        to_stage_id=to_stage.id,
        outcome=outcome,
        note=note,
        changed_by_id=actor.id,
    )
    db.add(event)

    room.workflow_stage_id = to_stage.id
    room.workflow_stage = to_stage
    refresh_room_progress(db, room)

    # A room that lands back in Revision has changes required; one that's
    # issued for construction or fully complete is done with this loop.
    # Anything else just means work is under way. This is a convenience
    # default only — workflow_status can still be set independently via
    # PATCH /rooms/{id} (e.g. a detailer flagging themselves blocked).
    if to_stage.key == "revision":
        room.workflow_status = RoomWorkflowStatus.CHANGES_REQUIRED
    elif to_stage.key in ("issued_for_construction", "complete"):
        room.workflow_status = RoomWorkflowStatus.COMPLETE
    elif to_stage.key in (
        "initial_review",
        "issued_for_approval",
        "internal_review",
        "drawings_submitted",
    ):
        # Every checkpoint in the review cycle — including the two a
        # detailer moves a room into directly (Initial Review, when their
        # own modelling is done, and Drawings Submitted, on resubmission
        # after a Revision) — reads as "waiting on someone else" rather
        # than plain in_progress. See docs/ARCHITECTURE.md §12.1.
        room.workflow_status = RoomWorkflowStatus.READY_FOR_REVIEW

    return event
