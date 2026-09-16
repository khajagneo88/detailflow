from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import MANAGEMENT_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.comment import Comment
from app.models.enums import Priority, RoomWorkflowStatus, UserRole
from app.models.project import Project
from app.models.room import Room
from app.models.room_stage_event import RoomStageEvent
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.schemas.room import RoomCreate, RoomRead, RoomStageTimelineItem, RoomUpdate
from app.schemas.room_stage_event import RoomStageEventRead, StageTransitionRequest
from app.services.room_service import (
    assert_apartment_belongs_to_project,
    assert_can_transition_stage,
    refresh_room_progress,
    transition_room_stage,
)
from app.services.time_entry_service import auto_start_for_room, auto_stop_for_room

router = APIRouter(tags=["rooms"])


def _get_default_stage(db: Session) -> WorkflowStage:
    stage = db.query(WorkflowStage).order_by(WorkflowStage.sequence).first()
    if stage is None:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "No workflow stages configured — run the seed script.",
        )
    return stage


def _room_query(db: Session):
    return db.query(Room).options(
        joinedload(Room.assigned_detailer),
        joinedload(Room.workflow_stage),
        joinedload(Room.apartment),
        joinedload(Room.project),
        joinedload(Room.batch),
    )


def _to_read(room: Room) -> RoomRead:
    data = RoomRead.model_validate(room)
    data.apartment_name = room.apartment.name if room.apartment else None
    data.project_name = room.project.name if room.project else None
    return data


@router.get("/projects/{project_id}/rooms", response_model=list[RoomRead])
def list_rooms(
    project_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[RoomRead]:
    rooms = _room_query(db).filter(Room.project_id == project_id).all()
    return [_to_read(r) for r in rooms]


@router.get(
    "/projects/{project_id}/rooms/stage-timeline",
    response_model=list[RoomStageTimelineItem],
)
def project_room_stage_timeline(
    project_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[RoomStageTimelineItem]:
    """Powers the project detail page's Stage Timeline tab — one row per
    room with IFA/IFC start/finish dates, revision counts, and Batch/BOM/
    Nesting standing, all derived from this room's RoomStageEvent history
    (see docs/ARCHITECTURE.md §25) rather than stored directly. Read-only,
    open to any authenticated role, same as list_rooms above — this is a
    view onto data every role can already see room-by-room, just rolled up.
    """
    rooms = _room_query(db).filter(Room.project_id == project_id).all()
    room_ids = [r.id for r in rooms]

    # One query for every room's history rather than one query per room —
    # events ordered oldest-first so "the first event whose to_stage.key
    # matches" (below) is always the *earliest* occurrence, not just any.
    events = (
        db.query(RoomStageEvent)
        .options(joinedload(RoomStageEvent.to_stage))
        .filter(RoomStageEvent.room_id.in_(room_ids))
        .order_by(RoomStageEvent.created_at.asc())
        .all()
        if room_ids
        else []
    )
    events_by_room: dict[int, list[RoomStageEvent]] = {}
    for event in events:
        events_by_room.setdefault(event.room_id, []).append(event)

    items: list[RoomStageTimelineItem] = []
    for room in rooms:
        room_events = events_by_room.get(room.id, [])
        ifa_completed_at = next(
            (e.created_at for e in room_events if e.to_stage.key == "ifc_drafted"), None
        )
        ifc_completed_at = next(
            (e.created_at for e in room_events if e.to_stage.key == "ifc_issued"), None
        )
        ifa_started_at = next(
            (e.created_at for e in room_events if e.to_stage.key == "ifa_drafted"),
            room.created_at,
        )
        ifa_revision_count = sum(1 for e in room_events if e.to_stage.key == "ifa_revision")
        ifc_revision_count = sum(1 for e in room_events if e.to_stage.key == "ifc_revision")

        items.append(
            RoomStageTimelineItem(
                room_id=room.id,
                room_name=room.name,
                apartment_name=room.apartment.name if room.apartment else None,
                workflow_stage=room.workflow_stage,
                workflow_status=room.workflow_status,
                ifa_started_at=ifa_started_at,
                ifa_completed_at=ifa_completed_at,
                ifa_revision_count=ifa_revision_count,
                ifc_started_at=ifa_completed_at,
                ifc_completed_at=ifc_completed_at,
                ifc_revision_count=ifc_revision_count,
                batch_id=room.batch.id if room.batch else None,
                batch_number=room.batch.batch_number if room.batch else None,
                batch_status=room.batch.status if room.batch else None,
            )
        )

    # Apartment, then room name — matches the Apartments & Rooms tab's own
    # grouping so the two tabs read as the same room order.
    items.sort(key=lambda i: (i.apartment_name or "", i.room_name))
    return items


@router.get("/rooms/mine", response_model=list[RoomRead])
def list_my_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RoomRead]:
    """Cross-project worklist for the current user, ordered by urgency —
    powers the My Work page. Registered before /rooms/{room_id} so "mine"
    is never swallowed by that route's int path param."""
    today = date.today()

    # Needs attention now (blocked / has markups to fix), then anything
    # actually overdue, then the rest of what's actively in play, then
    # things sitting with someone else (ready for review / waiting), then
    # complete rooms last. Ties broken by soonest due date, then priority.
    status_rank = case(
        (Room.workflow_status == RoomWorkflowStatus.BLOCKED, 0),
        (Room.workflow_status == RoomWorkflowStatus.CHANGES_REQUIRED, 1),
        (
            and_(
                Room.due_date.isnot(None),
                Room.due_date < today,
                Room.workflow_status.in_(
                    [RoomWorkflowStatus.NOT_STARTED, RoomWorkflowStatus.IN_PROGRESS]
                ),
            ),
            2,
        ),
        (
            Room.workflow_status.in_(
                [RoomWorkflowStatus.NOT_STARTED, RoomWorkflowStatus.IN_PROGRESS]
            ),
            3,
        ),
        (
            Room.workflow_status.in_(
                [RoomWorkflowStatus.READY_FOR_REVIEW, RoomWorkflowStatus.WAITING]
            ),
            4,
        ),
        (Room.workflow_status == RoomWorkflowStatus.COMPLETE, 5),
        else_=6,
    )
    priority_rank = case(
        (Room.priority == Priority.URGENT, 0),
        (Room.priority == Priority.HIGH, 1),
        (Room.priority == Priority.NORMAL, 2),
        (Room.priority == Priority.LOW, 3),
        else_=4,
    )

    rooms = (
        _room_query(db)
        .filter(Room.assigned_detailer_id == current_user.id)
        .order_by(status_rank, Room.due_date.is_(None), Room.due_date.asc(), priority_rank)
        .all()
    )
    return [_to_read(r) for r in rooms]


@router.get("/rooms/{room_id}", response_model=RoomRead)
def get_room(
    room_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> RoomRead:
    room = _room_query(db).filter(Room.id == room_id).first()
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
    return _to_read(room)


@router.post(
    "/projects/{project_id}/rooms", response_model=RoomRead, status_code=status.HTTP_201_CREATED
)
def create_room(
    project_id: int,
    payload: RoomCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> RoomRead:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    assert_apartment_belongs_to_project(db, payload.apartment_id, project_id)

    default_stage = _get_default_stage(db)
    # Set the relationship object, not just workflow_stage_id — this room
    # isn't flushed yet, so refresh_room_progress() (which reads
    # room.workflow_stage.sequence) can't lazy-load the FK into a relationship
    # on an unpersisted row. Assigning the object directly makes it available
    # immediately, and SQLAlchemy still derives workflow_stage_id from it on
    # flush.
    room = Room(project_id=project_id, workflow_stage=default_stage, **payload.model_dump())
    refresh_room_progress(db, room)
    db.add(room)
    db.commit()
    db.refresh(room)
    return _to_read(_room_query(db).filter(Room.id == room.id).one())


@router.patch("/rooms/{room_id}", response_model=RoomRead)
def update_room(
    room_id: int,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoomRead:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")

    data = payload.model_dump(exclude_unset=True)
    if "apartment_id" in data:
        assert_apartment_belongs_to_project(db, data["apartment_id"], room.project_id)

    for field, value in data.items():
        setattr(room, field, value)

    if "workflow_stage_id" in data:
        db.flush()
        db.refresh(room)
        refresh_room_progress(db, room)

    # Automatic stage-based time tracking (replaces the old manual
    # Start/Stop timer — see docs/ARCHITECTURE.md): the detailer action set
    # (Start / On Hold) drives workflow_status through this same PATCH
    # endpoint, so this is the one place a status change turns into a
    # started or stopped clock. Moving *into* in_progress starts it; moving
    # to anything else (blocked/waiting/etc.) stops it. Stage-transition-
    # driven stops (Next Stage / Submit IFA/IFC review) are handled
    # separately in room_service.transition_room_stage.
    if "workflow_status" in data:
        if room.workflow_status == RoomWorkflowStatus.IN_PROGRESS:
            auto_start_for_room(db, room, current_user)
        else:
            auto_stop_for_room(db, room, current_user)

    db.commit()
    return _to_read(_room_query(db).filter(Room.id == room.id).one())


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> None:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")

    has_history = (
        db.query(func.count(RoomStageEvent.id)).filter(RoomStageEvent.room_id == room_id).scalar()
        or db.query(func.count(Comment.id)).filter(Comment.room_id == room_id).scalar()
        or db.query(func.count(TimeEntry.id)).filter(TimeEntry.room_id == room_id).scalar()
    )
    if has_history:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This room has stage history, comments, or logged time recorded against it "
            "and can't be deleted — it can still be reassigned or its details edited.",
        )

    db.delete(room)
    db.commit()


@router.post("/rooms/{room_id}/stage-transitions", response_model=RoomStageEventRead)
def create_stage_transition(
    room_id: int,
    payload: StageTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RoomStageEvent:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")

    to_stage = db.query(WorkflowStage).filter(WorkflowStage.key == payload.to_stage_key).first()
    if to_stage is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown workflow stage.")

    assert_can_transition_stage(room.workflow_stage.key, to_stage.key, current_user)

    event = transition_room_stage(
        db,
        room=room,
        to_stage=to_stage,
        actor=current_user,
        outcome=payload.outcome,
        note=payload.note,
    )
    db.commit()
    return (
        db.query(RoomStageEvent)
        .options(
            joinedload(RoomStageEvent.from_stage),
            joinedload(RoomStageEvent.to_stage),
            joinedload(RoomStageEvent.changed_by),
        )
        .filter(RoomStageEvent.id == event.id)
        .one()
    )


@router.get("/rooms/{room_id}/stage-events", response_model=list[RoomStageEventRead])
def list_stage_events(
    room_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[RoomStageEvent]:
    return (
        db.query(RoomStageEvent)
        .options(
            joinedload(RoomStageEvent.from_stage),
            joinedload(RoomStageEvent.to_stage),
            joinedload(RoomStageEvent.changed_by),
        )
        .filter(RoomStageEvent.room_id == room_id)
        .order_by(RoomStageEvent.created_at)
        .all()
    )
