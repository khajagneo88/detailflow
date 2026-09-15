from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin


class PlanEntry(Base, TimestampMixin):
    """Day-level planning grid entry — replaces WeeklyPlanEntry (see
    docs/ARCHITECTURE.md, "Day-Level Planning" section, which replaces the
    old §16/§19 week-level design entirely, not alongside it).

    A PlanEntry is "this detailer is planned to work on this specific Room
    or Batch, on this specific date" — a real work item, not a freeform
    label. Exactly one of `room_id`/`batch_id` is set (enforced by the
    `ck_plan_entry_room_xor_batch` CHECK constraint below, since Postgres
    can express "exactly one of two nullable columns is set" directly and
    cleanly, unlike the cross-project apartment/room invariant in
    docs/ARCHITECTURE.md §6 that has no equally clean CHECK-constraint
    shape). `position` orders multiple entries within the same
    (user, date) cell — "multiple rows inside each day" from the product
    ask — server-assigned on create (append to the end) unless the client
    supplies one explicitly (used when reordering).

    Both `room_id` and `batch_id` are ON DELETE CASCADE rather than SET
    NULL: unlike assigned_detailer_id (docs/ARCHITECTURE.md §6), a
    PlanEntry has no valid state with both FKs null — the CHECK constraint
    above would reject it — so if the room or batch it points at is ever
    hard-deleted, the plan entry itself must go too rather than becoming an
    orphaned, constraint-violating row.

    One (room, date) or (batch, date) pair can only be planned once — a
    work item can only be "the plan" for one detailer on a given day. This
    is deliberately per-item, not per-detailer-per-day like the old
    (project, user, week) uniqueness: two different rooms can still be
    planned for the same detailer on the same day (that's the whole point
    of allowing multiple chips per cell), just not the same room for two
    different detailers.
    """

    __tablename__ = "plan_entries"
    __table_args__ = (
        CheckConstraint(
            "(room_id IS NOT NULL AND batch_id IS NULL) "
            "OR (room_id IS NULL AND batch_id IS NOT NULL)",
            name="ck_plan_entry_room_xor_batch",
        ),
        UniqueConstraint("room_id", "date", name="uq_plan_entry_room_date"),
        UniqueConstraint("batch_id", "date", name="uq_plan_entry_batch_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    user = relationship("User", foreign_keys=[user_id])
    room = relationship("Room")
    batch = relationship("Batch")
    created_by = relationship("User", foreign_keys=[created_by_id])

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<PlanEntry user={self.user_id} date={self.date} "
            f"room={self.room_id} batch={self.batch_id}>"
        )
