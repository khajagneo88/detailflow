from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import MANAGEMENT_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.apartment import Apartment
from app.models.enums import UserRole
from app.models.project import Project
from app.models.room import Room
from app.models.user import User
from app.schemas.apartment import ApartmentCreate, ApartmentRead, ApartmentUpdate

router = APIRouter(tags=["apartments"])


def _with_room_count(db: Session, apartment: Apartment) -> ApartmentRead:
    room_count = db.query(func.count(Room.id)).filter(Room.apartment_id == apartment.id).scalar()
    data = ApartmentRead.model_validate(apartment)
    data.room_count = room_count or 0
    return data


@router.get("/projects/{project_id}/apartments", response_model=list[ApartmentRead])
def list_apartments(
    project_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[ApartmentRead]:
    apartments = db.query(Apartment).filter(Apartment.project_id == project_id).all()
    return [_with_room_count(db, a) for a in apartments]


@router.post(
    "/projects/{project_id}/apartments",
    response_model=ApartmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_apartment(
    project_id: int,
    payload: ApartmentCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> ApartmentRead:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")

    apartment = Apartment(project_id=project_id, **payload.model_dump())
    db.add(apartment)
    db.commit()
    db.refresh(apartment)
    return _with_room_count(db, apartment)


@router.patch("/apartments/{apartment_id}", response_model=ApartmentRead)
def update_apartment(
    apartment_id: int,
    payload: ApartmentUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> ApartmentRead:
    apartment = db.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Apartment not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(apartment, field, value)

    db.commit()
    db.refresh(apartment)
    return _with_room_count(db, apartment)


@router.delete("/apartments/{apartment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_apartment(
    apartment_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_role(*MANAGEMENT_ROLES)),
) -> None:
    apartment = db.get(Apartment, apartment_id)
    if apartment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Apartment not found.")

    room_count = db.query(func.count(Room.id)).filter(Room.apartment_id == apartment_id).scalar()
    if room_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This apartment still has rooms assigned to it — reassign or delete "
            "those rooms first.",
        )

    db.delete(apartment)
    db.commit()
