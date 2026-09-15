from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import NotificationType


class Notification(Base, TimestampMixin):
    """A single in-app notification for one recipient user. First use case:
    telling a project's project_manager that a room's drawings have reached
    ifa_issued/ifc_issued and are ready to submit to the client (see
    app/services/room_service.py::transition_room_stage) — but the shape is
    deliberately generic (a recipient, a type, a title/body, optional
    room/project links) rather than IFA/IFC-specific, so a future
    notification source (an RFI raised, a room gone blocked, ...) is just a
    new NotificationType member plus a new call site, not a schema change.

    No update endpoint beyond marking read — notifications are only ever
    created server-side as a side effect, never via a user-facing POST."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)

    # The recipient. Not nullable — a notification with nobody to show it to
    # isn't worth creating (see room_service's "skip silently if the
    # project has no project_manager_id" rule at the call site). RESTRICT,
    # not CASCADE/SET NULL: users are deactivated, never hard-deleted (see
    # docs/ARCHITECTURE.md §6 and Batch.nester_id's identical reasoning), so
    # this FK never actually blocks anything in practice.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Deep-link context for the frontend. Both nullable and both SET NULL on
    # delete (not RESTRICT/CASCADE) — a notification is a point-in-time
    # record of something that happened; the room or project disappearing
    # later must not take the notification's own history down with it, the
    # same reasoning as assigned_detailer_id in docs/ARCHITECTURE.md §6.
    # project_id is kept alongside room_id (not derived through the room)
    # since it stays useful for filtering/display even if the room itself
    # is ever removed.
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )

    # Null means unread — no separate `is_read` boolean, so "when was this
    # read" is never a fact that has to be reconstructed later.
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user = relationship("User", foreign_keys=[user_id])
    room = relationship("Room")
    project = relationship("Project")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Notification {self.type} user={self.user_id}>"
