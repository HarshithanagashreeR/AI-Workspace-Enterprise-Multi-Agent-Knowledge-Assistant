import logging
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.workspace import Workspace
from app.models.document import Document
from fastapi import HTTPException, status

logger = logging.getLogger("app.services.workspace")

class WorkspaceService:
    def __init__(self, db: Session):
        self.db = db

    def create_workspace(self, user_id: int, name: str, description: Optional[str] = None) -> Workspace:
        workspace = Workspace(name=name, description=description, user_id=user_id)
        self.db.add(workspace)
        self.db.commit()
        self.db.refresh(workspace)
        logger.info(f"Workspace '{name}' created for user {user_id}")
        return workspace

    def list_workspaces(self, user_id: int) -> List[Workspace]:
        return self.db.query(Workspace).filter(Workspace.user_id == user_id).all()

    def get_workspace(self, workspace_id: int, user_id: int) -> Workspace:
        workspace = self.db.query(Workspace).filter(
            Workspace.id == workspace_id,
            Workspace.user_id == user_id
        ).first()
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found"
            )
        return workspace

    def bind_documents(self, workspace_id: int, document_ids: List[int], user_id: int) -> Workspace:
        workspace = self.get_workspace(workspace_id, user_id)
        
        # Verify that all documents belong to the user
        documents = self.db.query(Document).filter(
            Document.id.in_(document_ids),
            Document.owner_id == user_id
        ).all()
        
        if len(documents) != len(document_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Some documents do not exist or do not belong to you"
            )
            
        workspace.documents = documents
        self.db.commit()
        self.db.refresh(workspace)
        logger.info(f"Bound {len(document_ids)} documents to Workspace ID {workspace_id}")
        return workspace

    def delete_workspace(self, workspace_id: int, user_id: int) -> bool:
        workspace = self.get_workspace(workspace_id, user_id)
        self.db.delete(workspace)
        self.db.commit()
        logger.info(f"Workspace ID {workspace_id} deleted successfully")
        return True
