from datetime import date

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base, TimestampMixin
from app.models.enums import Priority, RoomWorkflowStatus


class Room(Base, TimestampMixin):
    __tablename__ = "rooms"
    __table_args__ = (
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_room_progress_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Optional — a room always belongs to a project directly; apartment_id is
    # an optional refinement, never the sole path back to the project. The
    # invariant "apartment.project_id == room.project_id" is enforced in
    # services/room_service.py rather than the DB — see docs/ARCHITECTURE.md §6.
    apartment_id: Mapped[int | None] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT"), index=True
    )

    name: Mapped[str] = mapped_column(String(128), nullable=False)  # free text, not an enum
    code: Mapped[str | None] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text)

    assigned_detailer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    # Optional — a room joins a Batch only once it's IFC-approved (see
    # app/services/batch_service.py::assert_rooms_batch_eligible), and only
    # ever belongs to one active batch at a time. SET NULL rather than
    # RESTRICT/CASCADE: a batch being removed (not offered in the API today,
    # but the FK shouldn't assume it never will be) must not take the room
    # down with it — the room just becomes unbatched again, same reasoning
    # as assigned_detailer_id. See docs/ARCHITECTURE.md.
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id", ondelete="SET NULL"), index=True
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority"), default=Priority.NORMAL, nullable=False
    )
    due_date: Mapped[date | None] = mapped_column(Date)

    workflow_stage_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_stages.id", ondelete="RESTRICT"), nullable=False
    )
    workflow_status: Mapped[RoomWorkflowStatus] = mapped_column(
        Enum(RoomWorkflowStatus, name="room_workflow_status"),
        default=RoomWorkflowStatus.NOT_STARTED,
        nullable=False,
    )
    # Cached/derived from workflow_stage.sequence (see docs/ARCHITECTURE.md §8);
    # never directly editable by users.
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    estimated_hours: Mapped[float | None] = mapped_column(Numeric(8, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    project = relationship("Project", back_populates="rooms")
    apartment = relationship("Apartment", back_populates="rooms")
    assigned_detailer = relationship("User", foreign_keys=[assigned_detailer_id])
    workflow_stage = relationship("WorkflowStage")
    batch = relationship("Batch", back_populates="rooms")
    stage_events = relationship(
        "RoomStageEvent",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="RoomStageEvent.created_at",
    )
    comments = relationship("Comment", back_populates="room", order_by="Comment.created_at")
    time_entries = relationship(
        "TimeEntry", back_populates="room", order_by="TimeEntry.started_at"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Room {self.name!r} project={self.project_id}>"
