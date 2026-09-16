from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.settings import AppSettingsRead, AppSettingsUpdate
from app.services.settings_service import get_or_create_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=AppSettingsRead)
def get_settings(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> AppSettingsRead:
    """Open to any authenticated user — the Planning page needs
    planning_week_start_day to render its grid for every role that can view
    it, not just the admins who can change it."""
    return AppSettingsRead.model_validate(get_or_create_settings(db))


@router.patch("", response_model=AppSettingsRead)
def update_settings(
    payload: AppSettingsUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.ADMIN)),
) -> AppSettingsRead:
    """Admin-only (Team Leader too, via require_role()'s own
    _ROLES_WITH_ADMIN_BYPASS — see app/api/deps.py) — a workspace-wide
    setting like which day Planning's week starts on shouldn't be
    changeable by every management-level role, same reasoning as the
    user-management endpoints in app/api/routes/users.py."""
    settings_row = get_or_create_settings(db)
    settings_row.planning_week_start_day = payload.planning_week_start_day
    db.commit()
    db.refresh(settings_row)
    return AppSettingsRead.model_validate(settings_row)
