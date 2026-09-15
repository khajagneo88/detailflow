from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import TimeEntrySource
from app.schemas.user import UserRead


class TimeEntryUpdate(BaseModel):
    """Corrects an existing (already-stopped) automatically-tracked entry —
    there's no manual create anymore (see time_entry_service.py's
    auto_start_for_room/auto_stop_for_room, the sole way an entry now comes
    into being); a *running* entry's started_at/duration isn't editable
    here since it's still an open record of what's actually happening —
    delete it instead if it's stuck."""

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
