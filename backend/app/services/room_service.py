"""Business rules for rooms that don't belong inline in a route handler and
must not be duplicated between the create and update endpoints.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.apartment import Apartment
from app.models.enums import NotificationType, RoomWorkflowStatus, StageTransitionOutcome
from app.models.notification import Notification
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.user import User
from app.models.workflow_stage import WorkflowStage

# Stage key -> the NotificationType/title fired when a room transitions INTO
# it, and to the project's project_manager_id specifically (the PM is the
# one who needs to know a package is ready to submit to the client — see
# docs/ARCHITECTURE.md's IFA/IFC pipeline section and Project.project_manager_id).
# A dict, not two separate `if key == ...` branches, so a future third
# "PM needs to know" checkpoint is one more entry here, not new branching
# logic — same generic-over-stage-key style transition_room_stage already
# uses for the revision/complete/ready_for_review status defaults above.
_PM_NOTIFICATION_STAGES: dict[str, tuple[NotificationType, str]] = {
    "ifa_issued": (NotificationType.IFA_READY, "IFA ready for client"),
    "ifc_issued": (NotificationType.IFC_READY, "IFC ready for client"),
}


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


def _notify_project_manager_of_stage_readiness(db: Session, room: Room, to_stage: WorkflowStage) -> None:
    """Fires a Notification for the project's PM when a room lands on one of
    the client-ready checkpoints (see _PM_NOTIFICATION_STAGES). Called from
    inside transition_room_stage — the one place a room's stage actually
    changes — so this runs exactly once per transition, never on a plain
    read of a room already sitting in ifa_issued/ifc_issued, and DOES fire
    again on a repeat visit (e.g. after an IFA Revision loop-back and
    resubmission): the PM genuinely needs to know each time a package is
    ready to go out again, not just the first time. See docs/ARCHITECTURE.md.
    """
    entry = _PM_NOTIFICATION_STAGES.get(to_stage.key)
    if entry is None:
        return

    project = room.project
    if project is None or project.project_manager_id is None:
        # No PM assigned to this project — nothing to notify, and this is
        # not an error condition (plenty of projects may never get a PM).
        return

    notification_type, title = entry
    package = "IFA" if notification_type == NotificationType.IFA_READY else "IFC"
    body = f"Room {room.name} in {project.name} is ready to submit for {package} approval."

    db.add(
        Notification(
            user_id=project.project_manager_id,
            type=notification_type,
            title=title,
            body=body,
            room_id=room.id,
            project_id=project.id,
        )
    )


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

    # A room that lands back in a Revision stage (IFA or IFC — generic on
    # purpose, so a future loop-back target such as a "Variation" stage
    # just needs adding to this tuple, not new branching logic) has changes
    # required; one that reaches the terminal Complete stage is done.
    # Anything else just means work is under way. This is a convenience
    # default only — workflow_status can still be set independently via
    # PATCH /rooms/{id} (e.g. a detailer flagging themselves blocked).
    if to_stage.key in ("ifa_revision", "ifc_revision"):
        room.workflow_status = RoomWorkflowStatus.CHANGES_REQUIRED
    elif to_stage.key == "complete":
        room.workflow_status = RoomWorkflowStatus.COMPLETE
    elif to_stage.key in (
        "ifa_internal_review",
        "ifa_issued",
        "ifc_internal_review",
        "ifc_issued",
    ):
        # Every review/issue checkpoint in the IFA and IFC cycles — the
        # Team Leader review gates and the two "issued, PM notified"
        # checkpoints — reads as "waiting on someone else" rather than
        # plain in_progress. See docs/ARCHITECTURE.md §12.1 (the same
        # convenience the old single-pass review cycle applied to its own
        # four checkpoint stages).
        room.workflow_status = RoomWorkflowStatus.READY_FOR_REVIEW

    _notify_project_manager_of_stage_readiness(db, room, to_stage)

    return event
