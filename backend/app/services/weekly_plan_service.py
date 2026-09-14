"""Business rules for the weekly planning tool — see docs/ARCHITECTURE.md
§16. Kept out of the route module for the same reason as
services/time_entry_service.py: the route should stay a thin translation
from HTTP to these calls.
"""
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_assignment import ProjectAssignment
from app.models.user import User
from app.models.weekly_plan_entry import WeeklyPlanEntry


def monday_of(day: date) -> date:
    """Normalises any date to the Monday of its week, so a plan entry can
    never be keyed to, say, a Wednesday just because that's what the
    request happened to send."""
    return day - timedelta(days=day.weekday())


def create_entry(
    db: Session,
    *,
    project: Project,
    user: User,
    week_start: date,
    note: str | None,
    created_by: User,
) -> WeeklyPlanEntry:
    normalised_week = monday_of(week_start)

    entry = WeeklyPlanEntry(
        project_id=project.id,
        user_id=user.id,
        week_start=normalised_week,
        note=note,
        created_by_id=created_by.id,
    )
    db.add(entry)

    # Planning someone onto a project is also how they get assigned to it —
    # the user picked this over keeping the plan a pure forecast (see
    # docs/ARCHITECTURE.md §16.2), so a plan entry and project_assignments
    # never disagree about whether this person is on this project at all.
    already_assigned = (
        db.query(ProjectAssignment)
        .filter(
            ProjectAssignment.project_id == project.id,
            ProjectAssignment.user_id == user.id,
        )
        .first()
    )
    if already_assigned is None:
        db.add(ProjectAssignment(project_id=project.id, user_id=user.id))

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{user.full_name} is already planned on {project.name} for that week.",
        ) from exc

    db.commit()
    return entry
