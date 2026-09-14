from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.enums import StageTransitionOutcome


class RoomStageEvent(Base):
    """Append-only log of every workflow-stage change a room goes through.

    This is the "review history" spec §15 requires ("do not overwrite
    previous review records") — rather than a separate Review table that
    duplicates what a stage change already represents, a review round *is*
    a stage transition, optionally carrying an outcome (approved / markups
    required) and a note. Never updated or deleted once created.
    """

    __tablename__ = "room_stage_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("workflow_stages.id", ondelete="RESTRICT")
    )
    to_stage_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_stages.id", ondelete="RESTRICT"), nullable=False
    )
    outcome: Mapped[StageTransitionOutcome | None] = mapped_column(
        Enum(StageTransitionOutcome, name="stage_transition_outcome")
    )
    note: Mapped[str | None] = mapped_column(Text)
    changed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    room = relationship("Room", back_populates="stage_events")
    from_stage = relationship("WorkflowStage", foreign_keys=[from_stage_id])
    to_stage = relationship("WorkflowStage", foreign_keys=[to_stage_id])
    changed_by = relationship("User")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<RoomStageEvent room={self.room_id} -> stage={self.to_stage_id}>"
