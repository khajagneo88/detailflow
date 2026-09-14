from datetime import date

from sqlalchemy import Date, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin


class WeeklyPlanEntry(Base, TimestampMixin):
    """A manager's rough weekly forecast: "this detailer is planned on this
    project, for this week." Deliberately coarse — see docs/ARCHITECTURE.md
    §16 for why this isn't room-level or hour-level.

    `week_start` is always normalised to the Monday of whatever week it
    falls in (app/services/weekly_plan_service.py::monday_of) so two entries
    for the same person/project/week can never disagree about which week
    they mean just because one request sent a Wednesday and another sent a
    Monday.

    One (project, user, week) triple can only be planned once — a detailer
    can be planned on several *different* projects in the same week (a
    split week), just not the same project twice.
    """

    __tablename__ = "weekly_plan_entries"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", "week_start", name="uq_weekly_plan_entry"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
    created_by = relationship("User", foreign_keys=[created_by_id])

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<WeeklyPlanEntry project={self.project_id} user={self.user_id} "
            f"week={self.week_start}>"
        )
