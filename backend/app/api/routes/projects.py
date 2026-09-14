from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import MANAGEMENT_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.apartment import Apartment
from app.models.enums import UserRole
from app.models.project import Project
from app.models.project_assignment import ProjectAssignment
from app.models.room import Room
from app.models.user import User
from app.models.workflow_stage import WorkflowStage
from app.schemas.project import ProjectCreate, ProjectListItem, ProjectRead, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _room_stats(db: Session, project_id: int) -> tuple[int, int]:
    total = db.query(func.count(Room.id)).filter(Room.project_id == project_id).scalar() or 0
    complete_stage_id = (
        db.query(WorkflowStage.id).filter(WorkflowStage.key == "complete").scalar()
    )
    complete = 0
    if complete_stage_id is not None:
        complete = (
            db.query(func.count(Room.id))
            .filter(Room.project_id == project_id, Room.workflow_stage_id == complete_stage_id)
            .scalar()
            or 0
        )
    return total, complete


def _to_list_item(db: Session, project: Project) -> ProjectListItem:
    total, complete = _room_stats(db, project.id)
    item = ProjectListItem.model_validate(project)
    item.room_count = total
    item.rooms_complete = complete
    return item


def _to_read(db: Session, project: Project) -> ProjectRead:
    total, complete = _room_stats(db, project.id)
    apartment_count = (
        db.query(func.count(Apartment.id)).filter(Apartment.project_id == project.id).scalar()
        or 0
    )
    data = ProjectRead.model_validate(project)
    data.room_count = total
    data.rooms_complete = complete
    data.apartment_count = apartment_count
    data.assigned_detailers = [a.user for a in project.assignments]
    return data


def _project_query(db: Session):
    return db.query(Project).options(
        joinedload(Project.team_leader),
        joinedload(Project.assignments).joinedload(ProjectAssignment.user),
    )


@router.get("", response_model=list[ProjectListItem])
def list_projects(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[ProjectListItem]:
    query = _project_query(db)
    if not include_archived:
        query = query.filter(Project.is_archived.is_(False))
    projects = query.order_by(Project.detailing_due_date.asc().nullslast()).all()
    return [_to_list_item(db, p) for p in projects]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> ProjectRead:
    project = _project_query(db).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return _to_read(db, project)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> ProjectRead:
    existing = db.query(Project).filter(Project.project_number == payload.project_number).first()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That project number is already in use.")

    data = payload.model_dump(exclude={"assigned_detailer_ids"})
    project = Project(**data)
    db.add(project)
    db.flush()  # need project.id before creating assignments

    for user_id in payload.assigned_detailer_ids:
        db.add(ProjectAssignment(project_id=project.id, user_id=user_id))

    db.commit()
    project = _project_query(db).filter(Project.id == project.id).one()
    return _to_read(db, project)


@router.patch("/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> ProjectRead:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    data = payload.model_dump(exclude_unset=True, exclude={"assigned_detailer_ids"})
    for field, value in data.items():
        setattr(project, field, value)

    if payload.assigned_detailer_ids is not None:
        db.query(ProjectAssignment).filter(ProjectAssignment.project_id == project_id).delete()
        for user_id in payload.assigned_detailer_ids:
            db.add(ProjectAssignment(project_id=project_id, user_id=user_id))

    db.commit()
    project = _project_query(db).filter(Project.id == project_id).one()
    return _to_read(db, project)
