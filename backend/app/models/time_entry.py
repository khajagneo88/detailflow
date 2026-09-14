from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import TimeEntrySource


class TimeEntry(Base, TimestampMixin):
    """One block of logged time against a room, either a live timer
    (`ended_at` null while running, set on stop) or a manual backfill
    (`started_at`/`ended_at` set immediately, `duration_minutes` taken from
    what the user typed rather than derived).

    "Only one running timer per user" is enforced with a real database
    constraint — a partial unique index on `user_id` WHERE `ended_at IS
    NULL` — not just an application-level check, so it holds even against
    two concurrent "start timer" requests from the same user. See
    docs/ARCHITECTURE.md §13.
    """

    __tablename__ = "time_entries"
    __table_args__ = (
        Index(
            "ux_time_entries_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Null only while a timer is running; set at stop time (or immediately,
    # for a manual entry) — see room_service/time_entry_service for the
    # single place duration is computed from started_at/ended_at.
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[TimeEntrySource] = mapped_column(
        Enum(TimeEntrySource, name="time_entry_source"),
        default=TimeEntrySource.TIMER,
        nullable=False,
    )
    note: Mapped[str | None] = mapped_column(Text)

    room = relationship("Room", back_populates="time_entries")
    user = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<TimeEntry room={self.room_id} user={self.user_id} running={self.ended_at is None}>"
