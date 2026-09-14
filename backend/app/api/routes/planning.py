from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import MANAGEMENT_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.project import Project
from app.models.user import User
from app.models.weekly_plan_entry import WeeklyPlanEntry
from app.schemas.weekly_plan import WeeklyPlanEntryCreate, WeeklyPlanEntryRead
from app.services.weekly_plan_service import create_entry, monday_of

router = APIRouter(prefix="/planning", tags=["planning"])


def _to_read(entry: WeeklyPlanEntry) -> WeeklyPlanEntryRead:
    data = WeeklyPlanEntryRead.model_validate(entry)
    if entry.project is not None:
        data.project_name = entry.project.name
        data.project_number = entry.project.project_number
    return data


@router.get("/weekly", response_model=list[WeeklyPlanEntryRead])
def list_weekly_plan(
    week_start: date = Query(..., description="Any date in the target week."),
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[WeeklyPlanEntryRead]:
    """Every planned assignment for the week containing `week_start`, across
    every project — read-only and open to any authenticated user, same as
    /reports/rooms and /users (§12.3, §15.1): seeing who's planned where
    isn't a privileged view of anything a detailer couldn't already piece
    together from My Work and the project pages."""
    normalised_week = monday_of(week_start)
    entries = (
        db.query(WeeklyPlanEntry)
        .options(joinedload(WeeklyPlanEntry.user), joinedload(WeeklyPlanEntry.project))
        .filter(WeeklyPlanEntry.week_start == normalised_week)
        .all()
    )
    return [_to_read(e) for e in entries]


@router.post("/weekly", response_model=WeeklyPlanEntryRead, status_code=status.HTTP_201_CREATED)
def create_weekly_plan_entry(
    payload: WeeklyPlanEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> WeeklyPlanEntryRead:
    """Management-role-gated, matching project/apartment/room creation
    (§14.1) — this doesn't just record a forecast, it also assigns the
    detailer to the project (see weekly_plan_service.create_entry), so it
    needs the same guard as anything else that mutates project_assignments."""
    project = db.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    entry = create_entry(
        db,
        project=project,
        user=user,
        week_start=payload.week_start,
        note=payload.note,
        created_by=current_user,
    )
    entry = (
        db.query(WeeklyPlanEntry)
        .options(joinedload(WeeklyPlanEntry.user), joinedload(WeeklyPlanEntry.project))
        .filter(WeeklyPlanEntry.id == entry.id)
        .one()
    )
    return _to_read(entry)


@router.delete("/weekly/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_plan_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> None:
    """Un-planning someone doesn't undo the project assignment it created —
    see docs/ARCHITECTURE.md §16.2: the assignment is a real, sticky fact
    once made, the plan entry is just this week's forecast."""
    entry = db.get(WeeklyPlanEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan entry not found.")
    db.delete(entry)
    db.commit()
