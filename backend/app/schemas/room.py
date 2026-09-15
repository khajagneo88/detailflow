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
