from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin


class ProjectAssignment(Base, TimestampMixin):
    """Many-to-many join: which detailers are assigned to a project.

    Deliberately separate from Project.team_leader_id — "leads this project"
    and "is one of the detailers doing work on it" are different facts (see
    docs/ARCHITECTURE.md §5).
    """

    __tablename__ = "project_assignments"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    project = relationship("Project", back_populates="assignments")
    user = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ProjectAssignment project={self.project_id} user={self.user_id}>"
