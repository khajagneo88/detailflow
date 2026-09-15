from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import Priority, ProjectStatus
from app.schemas.user import UserRead


class ProjectBase(BaseModel):
    project_number: str
    name: str
    client_name: str | None = None
    builder: str | None = None
    site_address: str | None = None
    project_manager_id: int | None = None
    description: str | None = None
    priority: Priority = Priority.NORMAL
    status: ProjectStatus = ProjectStatus.NOT_STARTED
    team_leader_id: int | None = None
    start_date: date | None = None
    detailing_due_date: date | None = None
    installation_date: date | None = None
    estimated_hours: float | None = None
    notes: str | None = None


class ProjectCreate(ProjectBase):
    assigned_detailer_ids: list[int] = []


class ProjectUpdate(BaseModel):
    project_number: str | None = None
    name: str | None = None
    client_name: str | None = None
    builder: str | None = None
    site_address: str | None = None
    project_manager_id: int | None = None
    description: str | None = None
    priority: Priority | None = None
    status: ProjectStatus | None = None
    team_leader_id: int | None = None
    start_date: date | None = None
    detailing_due_date: date | None = None
    installation_date: date | None = None
    estimated_hours: float | None = None
    notes: str | None = None
    is_archived: bool | None = None
    assigned_detailer_ids: list[int] | None = None


class ProjectListItem(BaseModel):
    """Lightweight shape for the projects table / dashboard — avoids pulling
    every nested relationship for a list view."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_number: str
    name: str
    client_name: str | None
    priority: Priority
    status: ProjectStatus
    team_leader: UserRead | None
    detailing_due_date: date | None
    is_archived: bool
    room_count: int = 0
    rooms_complete: int = 0


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_number: str
    name: str
    client_name: str | None
    builder: str | None
    site_address: str | None
    project_manager: UserRead | None
    description: str | None
    priority: Priority
    status: ProjectStatus
    team_leader: UserRead | None
    assigned_detailers: list[UserRead] = []
    start_date: date | None
    detailing_due_date: date | None
    installation_date: date | None
    estimated_hours: float | None
    notes: str | None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    apartment_count: int = 0
    room_count: int = 0
    rooms_complete: int = 0
