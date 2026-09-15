from sqlalchemy import Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import BatchStatus


class Batch(Base, TimestampMixin):
    """BOM/Nesting happens once per Batch, not once per room — a Nester
    groups a set of IFC-approved rooms (which may span multiple apartments
    within one project) into a Batch and drives it through its own
    bom_pending -> bom_review -> nesting -> complete lifecycle. See
    docs/ARCHITECTURE.md for why this is a separate, lighter-weight entity
    rather than reusing WorkflowStage/room_stage_events."""

    __tablename__ = "batches"
    __table_args__ = (
        UniqueConstraint("project_id", "batch_number", name="uq_batch_project_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Sequential per project (Batch 1, Batch 2, ... resets to 1 for each new
    # project) — server-assigned as max(existing for this project) + 1, never
    # client-supplied. See app/api/routes/batches.py::create_batch.
    batch_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BatchStatus] = mapped_column(
        Enum(BatchStatus, name="batch_status"),
        default=BatchStatus.BOM_PENDING,
        nullable=False,
    )
    # Who created the batch — always a Nester at creation time (enforced in
    # the route, not at the FK level, same as team_leader_id/project_manager_id
    # not enforcing their respective roles at the DB layer). Not nullable:
    # users are deactivated, never hard-deleted (docs/ARCHITECTURE.md §6), so
    # ON DELETE RESTRICT is safe here the same way project_id/apartment_id use
    # RESTRICT elsewhere on rows that in practice never lose their parent.
    nester_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    project = relationship("Project", back_populates="batches")
    nester = relationship("User", foreign_keys=[nester_id])
    rooms = relationship("Room", back_populates="batch")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Batch #{self.batch_number} project={self.project_id} status={self.status}>"
