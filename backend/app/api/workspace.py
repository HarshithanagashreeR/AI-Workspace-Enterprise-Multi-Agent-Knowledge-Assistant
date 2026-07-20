from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.workspace import WorkspaceCreate, WorkspaceDocumentBind, WorkspaceResponse
from app.services.workspace_service import WorkspaceService
from app.core.security import get_current_user
from app.models.user import User
from typing import List

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

def get_workspace_service(db: Session = Depends(get_db)) -> WorkspaceService:
    return WorkspaceService(db)

@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    workspace_in: WorkspaceCreate,
    service: WorkspaceService = Depends(get_workspace_service),
    current_user: User = Depends(get_current_user)
):
    return service.create_workspace(
        user_id=current_user.id,
        name=workspace_in.name,
        description=workspace_in.description
    )

@router.get("", response_model=List[WorkspaceResponse])
def list_workspaces(
    service: WorkspaceService = Depends(get_workspace_service),
    current_user: User = Depends(get_current_user)
):
    return service.list_workspaces(user_id=current_user.id)

@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: int,
    service: WorkspaceService = Depends(get_workspace_service),
    current_user: User = Depends(get_current_user)
):
    return service.get_workspace(workspace_id=workspace_id, user_id=current_user.id)

@router.post("/{workspace_id}/documents", response_model=WorkspaceResponse)
def bind_documents(
    workspace_id: int,
    bind_in: WorkspaceDocumentBind,
    service: WorkspaceService = Depends(get_workspace_service),
    current_user: User = Depends(get_current_user)
):
    return service.bind_documents(
        workspace_id=workspace_id,
        document_ids=bind_in.document_ids,
        user_id=current_user.id
    )

@router.delete("/{workspace_id}")
def delete_workspace(
    workspace_id: int,
    service: WorkspaceService = Depends(get_workspace_service),
    current_user: User = Depends(get_current_user)
):
    success = service.delete_workspace(workspace_id=workspace_id, user_id=current_user.id)
    return {"success": success}
