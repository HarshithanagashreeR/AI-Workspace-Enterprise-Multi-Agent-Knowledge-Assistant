from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    version: int
    status: str
    owner_id: int
    size_bytes: int
    embedding_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
