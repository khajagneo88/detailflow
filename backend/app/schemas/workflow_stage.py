from pydantic import BaseModel, ConfigDict


class WorkflowStageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    sequence: int
