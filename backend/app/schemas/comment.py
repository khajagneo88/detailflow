from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import CommentStatus, CommentType
from app.schemas.user import UserRead


class CommentCreate(BaseModel):
    apartment_id: int | None = None
    room_id: int | None = None
    type: CommentType = CommentType.NOTE
    title: str | None = None
    body: str


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    apartment_id: int | None
    room_id: int | None
    type: CommentType
    title: str | None
    body: str
    status: CommentStatus
    created_by: UserRead | None
    resolved_by: UserRead | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
