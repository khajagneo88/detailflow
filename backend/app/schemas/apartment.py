from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ApartmentStatus
from app.schemas.user import UserRead


class ApartmentBase(BaseModel):
    name: str
    level: str | None = None
    apartment_type: str | None = None
    description: str | None = None
    assigned_detailer_id: int | None = None
    due_date: date | None = None
    notes: str | None = None


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(BaseModel):
    name: str | None = None
    level: str | None = None
    apartment_type: str | None = None
    description: str | None = None
    assigned_detailer_id: int | None = None
    due_date: date | None = None
    status: ApartmentStatus | None = None
    notes: str | None = None


class ApartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    level: str | None
    apartment_type: str | None
    description: str | None
    assigned_detailer: UserRead | None
    due_date: date | None
    status: ApartmentStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime
    room_count: int = 0
