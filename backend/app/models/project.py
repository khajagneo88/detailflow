from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import Priority, ProjectStatus


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    client_name: Mapped[str | None] = mapped_column(String(255))
    builder: Mapped[str | None] = mapped_column(String(255))
    site_address: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)

    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority"), default=Priority.NORMAL, nullable=False
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status"),
        default=ProjectStatus.NOT_STARTED,
        nullable=False,
    )

    team_leader_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # Was a free-text name column; now a real reference to a user (typically
    # UserRole.PROJECT_MANAGER, though nothing enforces that role at the FK
    # level, same as team_leader_id not enforcing UserRole.TEAM_LEADER). See
    # docs/ARCHITECTURE.md §11 for the IFA/IFC pipeline this supports.
    project_manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    start_date: Mapped[date | None] = mapped_column(Date)
    detailing_due_date: Mapped[date | None] = mapped_column(Date)
    installation_date: Mapped[date | None] = mapped_column(Date)

    estimated_hours: Mapped[float | None] = mapped_column(Numeric(8, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    team_leader = relationship("User", foreign_keys=[team_leader_id])
    project_manager = relationship("User", foreign_keys=[project_manager_id])
    assignments = relationship(
        "ProjectAssignment", back_populates="project", cascade="all, delete-orphan"
    )
    apartments = relationship(
        "Apartment", back_populates="project", cascade="all, delete-orphan"
    )
    rooms = relationship("Room", back_populates="project", cascade="all, delete-orphan")
    batches = relationship("Batch", back_populates="project", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Project {self.project_number} {self.name!r}>"
