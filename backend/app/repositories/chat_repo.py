from sqlalchemy.orm import Session
from app.models.chat import ChatConversation, ChatMessage
from typing import List, Optional
import uuid

class ChatRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_conversation(self, conversation_id: str) -> Optional[ChatConversation]:
        from sqlalchemy.orm import joinedload
        return self.db.query(ChatConversation).options(
            joinedload(ChatConversation.messages)
        ).filter(ChatConversation.id == conversation_id).first()

    def get_user_conversations(self, user_id: int, workspace_id: Optional[int] = None) -> List[ChatConversation]:
        query = self.db.query(ChatConversation).filter(
            ChatConversation.user_id == user_id
        )
        if workspace_id is not None:
            query = query.filter(ChatConversation.workspace_id == workspace_id)
        return query.order_by(ChatConversation.updated_at.desc()).all()

    def create_conversation(self, user_id: int, title: str = "New Chat", workspace_id: Optional[int] = None) -> ChatConversation:
        conv_id = str(uuid.uuid4())
        db_conv = ChatConversation(
            id=conv_id,
            title=title,
            user_id=user_id,
            workspace_id=workspace_id
        )
        self.db.add(db_conv)
        self.db.flush()
        self.db.refresh(db_conv)
        return db_conv
 
    def rename_conversation(self, conversation_id: str, new_title: str) -> Optional[ChatConversation]:
        db_conv = self.get_conversation(conversation_id)
        if db_conv:
            db_conv.title = new_title
            self.db.flush()
            self.db.refresh(db_conv)
        return db_conv
 
    def delete_conversation(self, conversation_id: str) -> bool:
        db_conv = self.get_conversation(conversation_id)
        if db_conv:
            self.db.delete(db_conv)
            self.db.flush()
            return True
        return False
 
    def add_message(self, conversation_id: str, role: str, content: str, citations: Optional[str] = None) -> ChatMessage:
        db_msg = ChatMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            citations=citations
        )
        self.db.add(db_msg)
        
        # Update conversation's updated_at
        db_conv = self.get_conversation(conversation_id)
        if db_conv:
            import datetime
            db_conv.updated_at = datetime.datetime.utcnow()
            
        self.db.flush()
        self.db.refresh(db_msg)
        return db_msg
 
    def update_feedback(self, message_id: int, rating: int, text: Optional[str] = None) -> Optional[ChatMessage]:
        db_msg = self.db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
        if db_msg:
            db_msg.feedback_rating = rating
            db_msg.feedback_text = text
            self.db.flush()
            self.db.refresh(db_msg)
        return db_msg
 
    def update_bookmark(self, message_id: int, bookmarked: bool) -> Optional[ChatMessage]:
        db_msg = self.db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
        if db_msg:
            db_msg.bookmarked = bookmarked
            self.db.flush()
            self.db.refresh(db_msg)
        return db_msg

    def get_bookmarked_messages(self, user_id: int) -> List[ChatMessage]:
        return self.db.query(ChatMessage).join(ChatConversation).filter(
            ChatConversation.user_id == user_id,
            ChatMessage.bookmarked == True
        ).all()

    def count_queries(self) -> int:
        return self.db.query(ChatMessage).filter(ChatMessage.role == "user").count()
