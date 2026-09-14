from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.schemas.workflow_stage import WorkflowStageRead

router = APIRouter(tags=["workflow-stages"])


@router.get("/workflow-stages", response_model=list[WorkflowStageRead])
def list_workflow_stages(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[WorkflowStage]:
    """The fixed MVP stage list, in order — used to populate the stage-
    transition picker on a room's detail page. See workflow_stage.py for
    why this is data rather than a hardcoded frontend list."""
    return db.query(WorkflowStage).order_by(WorkflowStage.sequence).all()
