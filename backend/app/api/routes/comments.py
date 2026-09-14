from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.comment import Comment
from app.models.enums import CommentStatus, CommentType
from app.models.project import Project
from app.models.room import Room
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentRead
from app.services.room_service import assert_apartment_belongs_to_project

router = APIRouter(tags=["comments"])


def _comment_query(db: Session):
    return db.query(Comment).options(
        joinedload(Comment.created_by), joinedload(Comment.resolved_by)
    )


@router.get("/projects/{project_id}/comments", response_model=list[CommentRead])
def list_comments(
    project_id: int,
    room_id: int | None = None,
    type: CommentType | None = None,
    status_filter: CommentStatus | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[Comment]:
    query = _comment_query(db).filter(Comment.project_id == project_id)
    if room_id is not None:
        query = query.filter(Comment.room_id == room_id)
    if type is not None:
        query = query.filter(Comment.type == type)
    if status_filter is not None:
        query = query.filter(Comment.status == status_filter)
    return query.order_by(Comment.created_at.desc()).all()


@router.post(
    "/projects/{project_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED
)
def create_comment(
    project_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Comment:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    assert_apartment_belongs_to_project(db, payload.apartment_id, project_id)

    workflow_stage_id = None
    if payload.room_id is not None:
        room = db.get(Room, payload.room_id)
        if room is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
        if room.project_id != project_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "That room belongs to a different project."
            )
        workflow_stage_id = room.workflow_stage_id

    comment = Comment(
        project_id=project_id,
        workflow_stage_id=workflow_stage_id,
        created_by_id=current_user.id,
        **payload.model_dump(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_query(db).filter(Comment.id == comment.id).one()


@router.patch("/comments/{comment_id}/resolve", response_model=CommentRead)
def resolve_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")

    comment.status = CommentStatus.RESOLVED
    comment.resolved_by_id = current_user.id
    comment.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return _comment_query(db).filter(Comment.id == comment.id).one()


@router.patch("/comments/{comment_id}/reopen", response_model=CommentRead)
def reopen_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> Comment:
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")

    comment.status = CommentStatus.OPEN
    comment.resolved_by_id = None
    comment.resolved_at = None
    db.commit()
    return _comment_query(db).filter(Comment.id == comment.id).one()
