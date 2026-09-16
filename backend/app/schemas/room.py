from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BatchStatus, Priority, RoomWorkflowStatus
from app.schemas.user import UserRead
from app.schemas.workflow_stage import WorkflowStageRead


class RoomBatchRead(BaseModel):
    """Minimal batch info surfaced on a room — enough for the frontend to
    show "Batch B-3 · Nesting" and link to it, without pulling in the full
    BatchRead (room list, nester, etc.) that GET /batches/{id} returns."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_number: int
    status: BatchStatus


class RoomBase(BaseModel):
    name: str
    code: str | None = None
    description: str | None = None
    apartment_id: int | None = None
    assigned_detailer_id: int | None = None
    priority: Priority = Priority.NORMAL
    due_date: date | None = None
    estimated_hours: float | None = None
    notes: str | None = None


class RoomCreate(RoomBase):
    pass


class RoomUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    apartment_id: int | None = None
    assigned_detailer_id: int | None = None
    priority: Priority | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    notes: str | None = None
    # Stage changes go through POST /rooms/{id}/stage-transitions instead of
    # here — that endpoint logs a RoomStageEvent so the change is never lost
    # (see docs/ARCHITECTURE.md). workflow_status stays directly editable —
    # e.g. a detailer flagging themselves blocked mid-stage is a legitimate
    # plain edit, not a stage change.
    workflow_status: RoomWorkflowStatus | None = None


class RoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    project_name: str | None = None
    apartment_id: int | None
    apartment_name: str | None = None
    name: str
    code: str | None
    description: str | None
    assigned_detailer: UserRead | None
    priority: Priority
    due_date: date | None
    workflow_stage: WorkflowStageRead
    workflow_status: RoomWorkflowStatus
    progress: int
    estimated_hours: float | None
    notes: str | None
    batch_id: int | None = None
    batch: RoomBatchRead | None = None
    created_at: datetime
    updated_at: datetime


class RoomStageTimelineItem(BaseModel):
    """One row of the project detail page's Stage Timeline tab — per-room
    IFA/IFC start/finish dates, revision counts, and where it stands with
    its Batch (if any), all derived from RoomStageEvent history rather than
    stored directly. See app/api/routes/rooms.py::project_room_stage_timeline
    for how each field is computed, and docs/ARCHITECTURE.md §25."""

    model_config = ConfigDict(from_attributes=True)

    room_id: int
    room_name: str
    apartment_name: str | None
    workflow_stage: WorkflowStageRead
    workflow_status: RoomWorkflowStatus
    # First time this room entered ifa_drafted — falls back to the room's
    # created_at when no such event exists (the common case: a room's very
    # first stage is never itself the target of a *transition* event, only
    # a re-entry via IFA Revision would log one).
    ifa_started_at: datetime
    # First time this room left the IFA cycle into ifc_drafted (i.e. the
    # client approved) — null if it hasn't gotten there yet.
    ifa_completed_at: datetime | None
    ifa_revision_count: int
    # Same instant as ifa_completed_at when set (entering IFC IS leaving
    # IFA) — kept as its own field for a self-explanatory column pair.
    ifc_started_at: datetime | None
    # First time this room reached ifc_issued — "IFC is ready", the point
    # this team's process hands a room off to BOM/Nesting (see §24.1).
    ifc_completed_at: datetime | None
    ifc_revision_count: int
    batch_id: int | None
    batch_number: int | None
    batch_status: BatchStatus | None
