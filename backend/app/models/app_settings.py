from sqlalchemy import Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, TimestampMixin
from app.models.enums import Weekday

# Every workspace-wide (not per-user) configurable setting lives on this one
# singleton row (id is always 1 — see get_or_create_settings in
# app/services/settings_service.py) rather than one table per setting, since
# there's currently exactly one of these (the Planning grid's week-start
# day) and a single small table is simpler to read/write/migrate than a
# generic key-value store until there's a second setting that actually
# needs one. Admin-only to change (see app/api/routes/settings.py — Team
# Leader too, per its own admin-bypass in app/api/deps.py), readable by any
# authenticated user since the Planning page needs it to render at all.
APP_SETTINGS_SINGLETON_ID = 1


class AppSettings(Base, TimestampMixin):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Which day the Planning grid's week starts on — previously hardcoded to
    # Monday, then briefly hardcoded to Tuesday to match this shop's weekly
    # planning meeting, now admin-configurable so a future change of
    # meeting day doesn't need a code change. See frontend/lib/week.ts.
    planning_week_start_day: Mapped[Weekday] = mapped_column(
        Enum(Weekday, name="weekday", native_enum=True),
        default=Weekday.TUESDAY,
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<AppSettings planning_week_start_day={self.planning_week_start_day}>"
