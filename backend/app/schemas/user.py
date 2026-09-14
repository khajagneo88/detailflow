from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.enums import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    password: str | None = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    # Null means never seen since this column existed. See User.last_seen_at
    # and docs/ARCHITECTURE.md §17 — the frontend derives online/offline
    # from this rather than the backend baking a status string in here, so
    # the "how stale is too stale" threshold can change without an API change.
    last_seen_at: datetime | None = None
