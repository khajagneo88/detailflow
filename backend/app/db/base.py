"""Import every model here so Alembic's autogenerate (and Base.metadata) can
see the full schema from a single import of app.db.base. Nothing else should
need to import individual model modules for this purpose."""
from app.db.base_class import Base  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.workflow_stage import WorkflowStage  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.project_assignment import ProjectAssignment  # noqa: F401
from app.models.apartment import Apartment  # noqa: F401
from app.models.room import Room  # noqa: F401
from app.models.batch import Batch  # noqa: F401
from app.models.room_stage_event import RoomStageEvent  # noqa: F401
from app.models.comment import Comment  # noqa: F401
from app.models.time_entry import TimeEntry  # noqa: F401
from app.models.plan_entry import PlanEntry  # noqa: F401
from app.models.notification import Notification  # noqa: F401
