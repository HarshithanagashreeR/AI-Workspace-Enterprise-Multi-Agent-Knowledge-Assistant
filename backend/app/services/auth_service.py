from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.repositories.user_repo import UserRepository
from app.repositories.stats_repo import StatsRepository
from app.models.auth import RefreshToken
from app.schemas.user import UserCreate, UserLogin
from app.core.security import verify_password, create_access_token, create_refresh_token
from jose import jwt, JWTError
from app.config.config import settings
from datetime import datetime, timedelta
from typing import Optional

class AuthService:
    def __init__(self, db: Session, user_repo: UserRepository, stats_repo: StatsRepository):
        self.db = db
        self.user_repo = user_repo
        self.stats_repo = stats_repo

    def register(self, user_in: UserCreate, ip_address: Optional[str] = None):
        existing_user = self.user_repo.get_by_email(user_in.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists."
            )
        
        # If it's the first user, make them admin for evaluation/admin console access
        is_first_user = self.user_repo.count() == 0
        if is_first_user:
            user_in.role = "admin"

        new_user = self.user_repo.create(user_in)
        self.stats_repo.add_audit_log(
            user_id=new_user.id,
            action="register",
            details={"email": new_user.email, "role": new_user.role},
            ip_address=ip_address
        )
        self.db.commit()
        return new_user

    def login(self, login_in: UserLogin, ip_address: Optional[str] = None) -> dict:
        user = self.user_repo.get_by_email(login_in.email)
        if not user or not verify_password(login_in.password, user.hashed_password):
            self.stats_repo.add_audit_log(
                user_id=None,
                action="failed_login",
                details={"email": login_in.email},
                ip_address=ip_address
            )
            self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password."
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is inactive."
            )

        # Generate tokens
        access_token = create_access_token(subject=user.id)
        refresh_token_str = create_refresh_token(subject=user.id)

        # Save refresh token to DB
        expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        db_refresh = RefreshToken(
            token=refresh_token_str,
            user_id=user.id,
            expires_at=expires_at
        )
        self.db.add(db_refresh)

        # Audit log login
        self.stats_repo.add_audit_log(
            user_id=user.id,
            action="login",
            details={"email": user.email},
            ip_address=ip_address
        )
        self.db.commit()

        return {
            "access_token": access_token,
            "refresh_token": refresh_token_str,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "role": user.role
            }
        }

    def refresh_tokens(self, refresh_token: str, ip_address: Optional[str] = None) -> dict:
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate refresh credentials",
        )
        try:
            payload = jwt.decode(refresh_token, settings.JWT_REFRESH_SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: str = payload.get("sub")
            token_type: str = payload.get("type")
            if user_id is None or token_type != "refresh":
                raise credentials_exception
        except JWTError:
            raise credentials_exception

        # Check in DB
        db_token = self.db.query(RefreshToken).filter(
            RefreshToken.token == refresh_token,
            RefreshToken.is_revoked == False
        ).first()

        if not db_token or db_token.expires_at < datetime.utcnow():
            raise credentials_exception

        # Revoke old refresh token
        db_token.is_revoked = True

        # Generate new ones
        new_access = create_access_token(subject=user_id)
        new_refresh = create_refresh_token(subject=user_id)

        expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        db_new_refresh = RefreshToken(
            token=new_refresh,
            user_id=int(user_id),
            expires_at=expires_at
        )
        self.db.add(db_new_refresh)

        self.stats_repo.add_audit_log(
            user_id=int(user_id),
            action="refresh_tokens",
            ip_address=ip_address
        )
        self.db.commit()

        return {
            "access_token": new_access,
            "refresh_token": new_refresh,
            "token_type": "bearer"
        }

    def logout(self, refresh_token: str):
        db_token = self.db.query(RefreshToken).filter(RefreshToken.token == refresh_token).first()
        if db_token:
            db_token.is_revoked = True
            self.db.commit()
            return True
        return False
