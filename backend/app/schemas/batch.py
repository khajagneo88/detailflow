from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BatchStatus
from app.schemas.user import UserRead
from app.schemas.workflow_stage import WorkflowStageRead


class BatchBase(BaseModel):
    # Also present in the URL (POST /projects/{project_id}/batches) — kept
    # here too, per the request shape, but the path segment is what the
    # route actually trusts for scoping (same convention as
    # RoomCreate/ApartmentCreate not needing a project_id at all, since
    # their create routes are likewise nested under /projects/{project_id}).
    project_id: int


class BatchCreate(BatchBase):
    room_ids: list[int]


class BatchStatusTransition(BaseModel):
    status: BatchStatus


class BatchRoomsUpdate(BaseModel):
    """PATCH /batches/{id}/rooms — add and/or remove rooms in one call."""

    add_room_ids: list[int] = []
    remove_room_ids: list[int] = []


class BatchRoomSummary(BaseModel):
    """Lightweight nested room shape for BatchRead — mirrors how ProjectRead
    nests only counts (apartment_count/room_count) rather than full Room
    objects; this goes one step further and includes a minimal per-room
    summary too, since "batch detail with its rooms" is an explicit
    requirement here."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    project_id: int
    apartment_id: int | None
    workflow_stage: WorkflowStageRead


class BatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    batch_number: int
    status: BatchStatus
    nester: UserRead
    room_count: int = 0
    rooms: list[BatchRoomSummary] = []
    created_at: datetime
    updated_at: datetime
