from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.schemas.document import DocumentResponse

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceDocumentBind(BaseModel):
    document_ids: List[int]

class WorkspaceResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    user_id: int
    created_at: datetime
    documents: Optional[List[DocumentResponse]] = None

    class Config:
        from_attributes = True
