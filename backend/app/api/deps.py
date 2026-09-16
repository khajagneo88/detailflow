"""Shared FastAPI dependencies: DB session access, current-user resolution,
and role-based authorization.

Authorization is enforced here — and only here — so every route that needs
a role check imports the same dependency instead of re-implementing the
check inline (see docs/ARCHITECTURE.md §2 and §7).
"""
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import ACCESS_TOKEN_COOKIE_NAME, decode_access_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
)

# How often an authenticated request is allowed to actually write
# last_seen_at (see User.last_seen_at) rather than just reading the user
# row — every request bumping the timestamp would mean a write on nearly
# every request in the app, for a presence signal that only needs
# roughly-a-minute resolution. The frontend's own polling (30s, see
# TimeTrackingContext) means this window is hit on essentially every poll
# anyway, so presence still updates close to live.
_PRESENCE_HEARTBEAT_INTERVAL = timedelta(seconds=60)


def get_current_user(
    access_token: str | None = Cookie(default=None, alias=ACCESS_TOKEN_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    if access_token is None:
        raise CREDENTIALS_EXCEPTION

    payload = decode_access_token(access_token)
    if payload is None or "sub" not in payload:
        raise CREDENTIALS_EXCEPTION

    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise CREDENTIALS_EXCEPTION

    now = datetime.now(timezone.utc)
    if user.last_seen_at is None or now - user.last_seen_at > _PRESENCE_HEARTBEAT_INTERVAL:
        user.last_seen_at = now
        db.commit()

    return user


# Roles that implicitly pass every role check, regardless of what a given
# route actually asks for — i.e. full admin rights. Admin has always been
# one; Team Leader was promoted to the same blanket bypass on explicit
# request (previously Team Leader only had MANAGEMENT_ROLES-level access,
# see the comment on MANAGEMENT_ROLES below — it stayed out of Nester-only
# and Admin-only endpoints like user management). Keeping this as a tuple
# rather than inlining the check means every route stays automatically
# correct if this set changes again later.
_ROLES_WITH_ADMIN_BYPASS = (UserRole.ADMIN, UserRole.TEAM_LEADER)


def require_role(*allowed_roles: UserRole) -> Callable[[User], User]:
    """Usage: `current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.TEAM_LEADER))`.

    Admin (and, as of this bypass list, Team Leader) implicitly passes
    every role check (spec §5: Admin "can perform all team-leader
    functionality").
    """

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role in _ROLES_WITH_ADMIN_BYPASS:
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return dependency


# Manager nominally sits above Team Leader (oversees multiple team leaders /
# projects), though Team Leader now actually carries broader permissions
# than Manager since it was added to _ROLES_WITH_ADMIN_BYPASS above — Manager
# is still only ever checked against MANAGEMENT_ROLES-gated routes. No
# project-level visibility restriction exists for either role, so there's
# nothing to differentiate beyond who *can* be assigned as a project's
# leader. Defined here as a tuple so every route that means
# "team-leader-or-above" imports one name instead of the pair drifting out
# of sync across route files.
MANAGEMENT_ROLES = (UserRole.MANAGER, UserRole.TEAM_LEADER)

# Batch creation and membership changes are explicitly Nester-only per
# product spec (unlike the room stage-transition endpoint, which has always
# been left open — see app/api/routes/batches.py for why that precedent is
# followed for the batch *status* transitions but not here). Admin and Team
# Leader still bypass via require_role()'s own _ROLES_WITH_ADMIN_BYPASS rule.
require_nester = require_role(UserRole.NESTER)
