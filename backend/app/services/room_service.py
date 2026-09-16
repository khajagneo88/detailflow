"""Business rules for rooms that don't belong inline in a route handler and
must not be duplicated between the create and update endpoints.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import has_admin_bypass
from app.models.apartment import Apartment
from app.models.enums import NotificationType, RoomWorkflowStatus, StageTransitionOutcome, UserRole
from app.models.notification import Notification
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.services.time_entry_service import auto_stop_for_room

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

# Same pattern as _PM_NOTIFICATION_STAGES above, but for the project's
# Team Leader (Project.team_leader_id) at the *other* checkpoint: the
# moment a detailer submits a package for internal review, before it's
# anywhere near client-ready. A product-owner ask (docs/ARCHITECTURE.md
# §29) — previously nothing notified anyone when a room entered either
# Internal Review stage.
_TEAM_LEADER_NOTIFICATION_STAGES: dict[str, tuple[NotificationType, str]] = {
    "ifa_internal_review": (NotificationType.IFA_REVIEW_REQUESTED, "IFA ready for your review"),
    "ifc_internal_review": (NotificationType.IFC_REVIEW_REQUESTED, "IFC ready for your review"),
}

# Who may move a room FROM one stage TO another — checked by
# assert_can_transition_stage below, called from the stage-transitions route
# (not from transition_room_stage itself, so the batch-completion cascade's
# own direct call — app/services/batch_service.py::complete_batch_rooms,
# always to `complete`, always system-triggered off a Nester's own
# already-gated batch action — is unaffected by this table). Admin and Team
# Leader bypass every entry here too, via has_admin_bypass — same blanket
# rule as require_role() elsewhere (app/api/deps.py), so this isn't a
# second, inconsistent permission model, just one that has to be checked by
# hand because the allowed-roles set depends on the room's *current* stage,
# known only after it's been fetched — too late for a static
# Depends(require_role(...)).
#
# Three tiers, matching docs/ARCHITECTURE.md §29:
#   - DETAILER: drafting and (re)submitting — a detailer's own job.
#   - _MANAGEMENT: the internal review gate — is this good enough to send
#     to the client? Team Leader/Manager's call, either to issue it or send
#     it back to the detailer for fixes.
#   - _CLIENT_OUTCOME: recording what the client actually said once a
#     package went out — Team Leader/Manager/Project Manager's call (the PM
#     is often the one actually talking to the client).
_MANAGEMENT = (UserRole.MANAGER, UserRole.TEAM_LEADER)
_CLIENT_OUTCOME = (UserRole.MANAGER, UserRole.TEAM_LEADER, UserRole.PROJECT_MANAGER)

_STAGE_TRANSITION_RULES: dict[tuple[str, str], tuple[UserRole, ...]] = {
    ("ifa_drafted", "ifa_internal_review"): (UserRole.DETAILER,),
    ("ifa_internal_review", "ifa_issued"): _MANAGEMENT,
    ("ifa_internal_review", "ifa_drafted"): _MANAGEMENT,
    ("ifa_issued", "ifc_drafted"): _CLIENT_OUTCOME,
    ("ifa_issued", "ifa_revision"): _CLIENT_OUTCOME,
    ("ifa_revision", "ifa_drafted"): (UserRole.DETAILER,),
    ("ifc_drafted", "ifc_internal_review"): (UserRole.DETAILER,),
    ("ifc_internal_review", "ifc_issued"): _MANAGEMENT,
    ("ifc_internal_review", "ifc_drafted"): _MANAGEMENT,
    ("ifc_issued", "complete"): _CLIENT_OUTCOME,
    ("ifc_issued", "ifc_revision"): _CLIENT_OUTCOME,
    ("ifc_revision", "ifc_drafted"): (UserRole.DETAILER,),
}


def assert_can_transition_stage(from_stage_key: str, to_stage_key: str, actor: User) -> None:
    """Raises 403 unless `actor` is allowed to move a room from
    `from_stage_key` to `to_stage_key` — see _STAGE_TRANSITION_RULES above.
    A pair with no entry here (e.g. anything touching `complete` other than
    ifc_issued -> complete, since nothing should freely move a room in or
    out of the terminal stage by hand) is rejected outright, not silently
    allowed — same "unknown means no" default the batch status-transition
    map (app/api/routes/batches.py::_ALLOWED_TRANSITIONS) already uses."""
    if has_admin_bypass(actor.role):
        return
    allowed_roles = _STAGE_TRANSITION_RULES.get((from_stage_key, to_stage_key), ())
    if actor.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to move this room to that stage.",
        )


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


def _notify_team_leader_of_review_request(db: Session, room: Room, to_stage: WorkflowStage) -> None:
    """The Team Leader counterpart to _notify_project_manager_of_stage_
    readiness above — fires when a detailer submits a room for internal
    review (see _TEAM_LEADER_NOTIFICATION_STAGES), so the Team Leader knows
    there's something to check without having to go looking for it. Same
    "runs exactly once per transition, fires again on a resubmission"
    behaviour as the PM notification, for the same reason: a Team Leader
    needs to know each time, not just the first."""
    entry = _TEAM_LEADER_NOTIFICATION_STAGES.get(to_stage.key)
    if entry is None:
        return

    project = room.project
    if project is None or project.team_leader_id is None:
        # No Team Leader assigned to this project — nothing to notify, not
        # an error condition, same "not every project has one" reasoning as
        # the PM check above.
        return

    notification_type, title = entry
    package = "IFA" if notification_type == NotificationType.IFA_REVIEW_REQUESTED else "IFC"
    body = f"Room {room.name} in {project.name} was submitted for {package} internal review."

    db.add(
        Notification(
            user_id=project.team_leader_id,
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
    _notify_team_leader_of_review_request(db, room, to_stage)

    # Moving to a new stage — Next Stage, Submit IFA review, Submit IFC
    # review, all of which land here — always stops the acting detailer's
    # own automatic stage-clock if it's running on this room (see
    # docs/ARCHITECTURE.md's automatic time-tracking section and
    # time_entry_service.auto_stop_for_room). It deliberately does not
    # auto-start a new one for the stage just entered — resuming work
    # requires its own Start click, same as coming back from On Hold.
    auto_stop_for_room(db, room, actor)

    return event
