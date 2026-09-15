from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import NotificationType

# No NotificationCreate — notifications are only ever created server-side as
# a side effect of some other action (see
# app/services/room_service.py::transition_room_stage), never via a
# user-facing POST, so there's nothing for a create schema to validate.


class NotificationRoomSummary(BaseModel):
    """Lightweight nested room shape, mirroring BatchRoomSummary
    (app/schemas/batch.py) — enough for the frontend to render/deep-link a
    notification without a second request, not a full RoomRead."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class NotificationProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: NotificationType
    title: str
    body: str
    room: NotificationRoomSummary | None
    project: NotificationProjectSummary | None
    read_at: datetime | None
    created_at: datetime
