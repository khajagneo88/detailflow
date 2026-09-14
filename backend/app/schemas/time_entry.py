from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TimeEntrySource
from app.schemas.user import UserRead


class TimeEntryStart(BaseModel):
    note: str | None = None


class TimeEntryManualCreate(BaseModel):
    started_at: datetime
    # Manual entries record the duration the user typed directly rather than
    # deriving it from two timestamps (see app/models/time_entry.py) — this
    # is the one number the create form actually asks for.
    duration_minutes: int = Field(gt=0, le=24 * 60)
    note: str | None = None


class TimeEntryUpdate(BaseModel):
    """Manual entries only — a running or completed timer's started_at/
    duration is a record of what actually happened and isn't editable here;
    stop the timer or delete the entry instead."""

    started_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, gt=0, le=24 * 60)
    note: str | None = None


class TimeEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: int
    user_id: int | None
    user: UserRead | None
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: int | None
    source: TimeEntrySource
    note: str | None
    created_at: datetime
    updated_at: datetime

    # Populated by the route (not a relationship on the schema) so the
    # header's running-timer indicator and the room's time list don't need a
    # second request just to say which room/project an entry belongs to.
    room_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
