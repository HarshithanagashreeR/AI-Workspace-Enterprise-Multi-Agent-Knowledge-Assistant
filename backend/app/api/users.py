from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.user import UserResponse, UserProfileUpdate
from app.core.security import get_current_user
from app.models.user import User
from app.repositories.user_repo import UserRepository

def get_user_repo(db: Session = Depends(get_db)) -> UserRepository:
    return UserRepository(db)

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserResponse)
def read_user_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
def update_user_me(
    profile_in: UserProfileUpdate,
    db: Session = Depends(get_db),
    user_repo: UserRepository = Depends(get_user_repo),
    current_user: User = Depends(get_current_user)
):
    update_dict = profile_in.dict(exclude_unset=True)
    updated_user = user_repo.update(current_user, update_dict)
    db.commit()
    return updated_user
