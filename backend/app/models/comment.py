from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base
from app.models.enums import CommentStatus, CommentType


class Comment(Base):
    """A note, RFI, or blocking issue raised against a project — optionally
    scoped down to an apartment and/or room — during a given workflow stage.

    Deliberately one table with a `type` discriminator rather than three
    separate tables (notes / RFIs / blockers as spec'd independently): all
    three are "someone raised something, optionally needs resolving,"
    differing only in what `type` means for follow-up (a plain note has
    nothing to resolve; an RFI or blocker does). Splitting them would just
    duplicate the same create/list/resolve logic three times.
    """

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    apartment_id: Mapped[int | None] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT")
    )
    room_id: Mapped[int | None] = mapped_column(
        ForeignKey("rooms.id", ondelete="RESTRICT"), index=True
    )
    # Which stage the room/project was in when this was raised — context for
    # the thread, not a foreign key the comment depends on functionally.
    workflow_stage_id: Mapped[int | None] = mapped_column(
        ForeignKey("workflow_stages.id", ondelete="SET NULL")
    )

    type: Mapped[CommentType] = mapped_column(
        Enum(CommentType, name="comment_type"), default=CommentType.NOTE, nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[CommentStatus] = mapped_column(
        Enum(CommentStatus, name="comment_status"), default=CommentStatus.OPEN, nullable=False
    )

    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project = relationship("Project")
    apartment = relationship("Apartment")
    room = relationship("Room", back_populates="comments")
    workflow_stage = relationship("WorkflowStage")
    created_by = relationship("User", foreign_keys=[created_by_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Comment {self.type} project={self.project_id} room={self.room_id}>"
