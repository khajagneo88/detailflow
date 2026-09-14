from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import ApartmentStatus


class Apartment(Base, TimestampMixin):
    __tablename__ = "apartments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)  # "Apartment 101"
    level: Mapped[str | None] = mapped_column(String(64))
    # Free text for now; FK to a future apartment_templates table once that
    # feature is built (spec §29) — see docs/ARCHITECTURE.md §9.
    apartment_type: Mapped[str | None] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text)

    assigned_detailer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[ApartmentStatus] = mapped_column(
        Enum(ApartmentStatus, name="apartment_status"),
        default=ApartmentStatus.NOT_STARTED,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="apartments")
    assigned_detailer = relationship("User", foreign_keys=[assigned_detailer_id])
    rooms = relationship("Room", back_populates="apartment")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Apartment {self.name!r} project={self.project_id}>"
