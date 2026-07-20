from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.document import Document
from typing import List, Optional

class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, doc_id: int) -> Optional[Document]:
        return self.db.query(Document).filter(Document.id == doc_id).first()

    def get_by_filename_and_owner(self, filename: str, owner_id: int) -> Optional[Document]:
        return self.db.query(Document).filter(
            Document.filename == filename,
            Document.owner_id == owner_id
        ).order_by(Document.version.desc()).first()

    def get_by_owner_id(self, owner_id: int, skip: int = 0, limit: int = 100) -> List[Document]:
        return self.db.query(Document).filter(Document.owner_id == owner_id).offset(skip).limit(limit).all()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[Document]:
        return self.db.query(Document).offset(skip).limit(limit).all()

    def create(self, filename: str, file_type: str, storage_path: str, owner_id: int, size_bytes: int, version: int = 1) -> Document:
        db_doc = Document(
            filename=filename,
            file_type=file_type,
            storage_path=storage_path,
            owner_id=owner_id,
            size_bytes=size_bytes,
            version=version,
            status="processing"
        )
        self.db.add(db_doc)
        self.db.flush()
        self.db.refresh(db_doc)
        return db_doc

    def delete(self, doc_id: int) -> bool:
        db_doc = self.get_by_id(doc_id)
        if db_doc:
            self.db.delete(db_doc)
            self.db.flush()
            return True
        return False

    def update_status(self, doc_id: int, status: str, embedding_count: int = 0) -> Optional[Document]:
        db_doc = self.get_by_id(doc_id)
        if db_doc:
            db_doc.status = status
            if embedding_count > 0:
                db_doc.embedding_count = embedding_count
            self.db.flush()
            self.db.refresh(db_doc)
        return db_doc

    def count(self) -> int:
        return self.db.query(Document).count()

    def sum_storage_bytes(self) -> int:
        result = self.db.query(func.sum(Document.size_bytes)).scalar()
        return result or 0

    def sum_embeddings(self) -> int:
        result = self.db.query(func.sum(Document.embedding_count)).scalar()
        return result or 0
