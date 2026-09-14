from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserRead


class WeeklyPlanEntryCreate(BaseModel):
    project_id: int
    user_id: int
    # Any date within the target week works — the server normalises it to
    # that week's Monday (see weekly_plan_service.monday_of) rather than
    # rejecting anything that isn't already one, so the frontend's week
    # picker doesn't have to get this exactly right either.
    week_start: date
    note: str | None = None


class WeeklyPlanEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    user_id: int
    user: UserRead
    week_start: date
    note: str | None
    created_by_id: int | None
    created_at: datetime

    # Populated by the route, not a relationship on the schema — same
    # pattern as TimeEntryRead.project_name (see app/schemas/time_entry.py).
    project_name: str | None = None
    project_number: str | None = None
