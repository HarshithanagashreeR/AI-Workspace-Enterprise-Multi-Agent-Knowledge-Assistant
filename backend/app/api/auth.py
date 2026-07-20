from fastapi import APIRouter, Depends, BackgroundTasks, Request, Response
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.user import UserCreate, UserResponse, UserLogin
from app.schemas.auth import TokenResponse, TokenRefreshRequest
from app.services.auth_service import AuthService
from typing import Dict, Any

from app.repositories.user_repo import UserRepository
from app.repositories.stats_repo import StatsRepository

def get_auth_service(db: Session = Depends(get_db)) -> AuthService:
    return AuthService(
        db=db,
        user_repo=UserRepository(db),
        stats_repo=StatsRepository(db)
    )

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=201)
def register(
    request: Request, 
    user_in: UserCreate, 
    auth_service: AuthService = Depends(get_auth_service)
):
    ip_address = request.client.host if request.client else None
    return auth_service.register(user_in, ip_address=ip_address)

@router.post("/login", response_model=Dict[str, Any])
def login(
    request: Request, 
    login_in: UserLogin, 
    auth_service: AuthService = Depends(get_auth_service)
):
    ip_address = request.client.host if request.client else None
    return auth_service.login(login_in, ip_address=ip_address)

@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request, 
    refresh_in: TokenRefreshRequest, 
    auth_service: AuthService = Depends(get_auth_service)
):
    ip_address = request.client.host if request.client else None
    return auth_service.refresh_tokens(refresh_in.refresh_token, ip_address=ip_address)

@router.post("/logout")
def logout(
    refresh_in: TokenRefreshRequest, 
    auth_service: AuthService = Depends(get_auth_service)
):
    success = auth_service.logout(refresh_in.refresh_token)
    return {"success": success}
