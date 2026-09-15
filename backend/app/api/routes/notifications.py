from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationRead

router = APIRouter(tags=["notifications"])

# No existing pagination convention elsewhere in the codebase to mirror
# (every other list endpoint returns its full, naturally-small result set —
# see docs/ARCHITECTURE.md) so this is a plain limit, capped to keep a
# runaway `?limit=` query from pulling someone's entire history in one call.
_DEFAULT_LIST_LIMIT = 50
_MAX_LIST_LIMIT = 200


def _notification_query(db: Session):
    return db.query(Notification).options(
        joinedload(Notification.room), joinedload(Notification.project)
    )


def _get_own_notification_or_404(db: Session, notification_id: int, user: User) -> Notification:
    """A notification belongs to exactly one recipient. Scoping the lookup
    by user_id in the same query (rather than fetching by id and checking
    afterward) means another user's notification 404s instead of 403ing —
    it never even reveals that the id exists, which is the stricter of the
    two options the task allows and avoids leaking one user's notification
    ids/existence to another."""
    notification = (
        _notification_query(db)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if notification is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    return notification


@router.get("/notifications", response_model=list[NotificationRead])
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(_DEFAULT_LIST_LIMIT, ge=1, le=_MAX_LIST_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Notification]:
    """The current user's own notifications only — never another user's, no
    matter what's asked for. Newest first."""
    query = _notification_query(db).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.read_at.is_(None))
    return query.order_by(Notification.created_at.desc()).limit(limit).all()


@router.get("/notifications/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    """Cheap count for a header badge — no row bodies, no joins."""
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .count()
    )
    return {"count": count}


@router.post("/notifications/{notification_id}/read", response_model=NotificationRead)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Notification:
    notification = _get_own_notification_or_404(db, notification_id, current_user)
    if notification.read_at is None:  # idempotent — a second call is a no-op
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
    return notification


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: now}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}
