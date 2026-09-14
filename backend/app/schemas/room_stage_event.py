from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import StageTransitionOutcome
from app.schemas.user import UserRead
from app.schemas.workflow_stage import WorkflowStageRead


class StageTransitionRequest(BaseModel):
    to_stage_key: str
    outcome: StageTransitionOutcome | None = None
    note: str | None = None


class RoomStageEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_stage: WorkflowStageRead | None
    to_stage: WorkflowStageRead
    outcome: StageTransitionOutcome | None
    note: str | None
    changed_by: UserRead | None
    created_at: datetime
