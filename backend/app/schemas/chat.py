from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

class MessageCreate(BaseModel):
    content: str
    mode: Optional[str] = "chat"
    document_id: Optional[int] = None

class MessageResponse(BaseModel):
    id: int
    conversation_id: str
    role: str
    content: str
    citations: Optional[str] = None  # JSON string containing sources details
    feedback_rating: Optional[int] = None
    feedback_text: Optional[str] = None
    bookmarked: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ConversationCreate(BaseModel):
    title: Optional[str] = "New Chat"

class ConversationResponse(BaseModel):
    id: str
    title: str
    user_id: int
    workspace_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    messages: Optional[List[MessageResponse]] = None

    class Config:
        from_attributes = True

class FeedbackRequest(BaseModel):
    feedback_rating: int  # 1 for thumbs up, -1 for thumbs down
    feedback_text: Optional[str] = None

class BookmarkRequest(BaseModel):
    bookmarked: bool

class ConversationRenameRequest(BaseModel):
    title: str
