import os
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException, status, BackgroundTasks
from app.repositories.document_repo import DocumentRepository
from app.repositories.stats_repo import StatsRepository
from app.rag.processor import DocumentProcessor
from app.rag.vector_store import VectorStoreWrapper
from app.models.document import Document
from typing import List, Optional, Dict, Any
import shutil

STORAGE_DIR = "./storage/documents"
os.makedirs(STORAGE_DIR, exist_ok=True)

class DocumentService:
    def __init__(self, db: Session, doc_repo: DocumentRepository, stats_repo: StatsRepository):
        self.db = db
        self.doc_repo = doc_repo
        self.stats_repo = stats_repo
        self.vector_store = VectorStoreWrapper()

    async def upload_document(
        self, 
        file: UploadFile, 
        owner_id: int, 
        background_tasks: BackgroundTasks,
        ip_address: Optional[str] = None
    ) -> Document:
        import re
        original_filename = os.path.basename(file.filename)
        sanitized_filename = re.sub(r'[^a-zA-Z0-9_\.\-]', '_', original_filename)
        filename = sanitized_filename
        
        file_ext = os.path.splitext(sanitized_filename)[1].lower().strip(".")
        
        supported_types = ["pdf", "docx", "csv", "txt", "md", "markdown"]
        if file_ext not in supported_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{file_ext}'. Supported: {', '.join(supported_types)}"
            )

        # Check if version exists and increment
        existing_doc = self.doc_repo.get_by_filename_and_owner(sanitized_filename, owner_id)
        version = (existing_doc.version + 1) if existing_doc else 1

        # Unique file storage name
        safe_filename = f"user_{owner_id}_v{version}_{sanitized_filename}"
        file_path = os.path.join(STORAGE_DIR, safe_filename)

        # Save file physically with size limitations (chunked copy)
        max_size = 15 * 1024 * 1024  # 15 MB limit
        total_size = 0
        try:
            with open(file_path, "wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 1024)  # Read 1MB chunks
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if total_size > max_size:
                        buffer.close()
                        if os.path.exists(file_path):
                            os.remove(file_path)
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="File size exceeds the maximum limit of 15MB."
                        )
                    buffer.write(chunk)
        except HTTPException:
            raise
        except Exception as e:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to write file physically: {str(e)}"
            )

        file_size = total_size

        # Create doc in Postgres (status='processing')
        db_doc = self.doc_repo.create(
            filename=filename,
            file_type=file_ext,
            storage_path=file_path,
            owner_id=owner_id,
            size_bytes=file_size,
            version=version
        )

        # Add parsing task to FastAPI background tasks
        background_tasks.add_task(
            self._process_document_in_background,
            db_doc.id,
            file_path,
            file_ext,
            filename,
            owner_id
        )

        # Audit log upload start
        self.stats_repo.add_audit_log(
            user_id=owner_id,
            action="upload_document_start",
            details={"filename": filename, "version": version, "size": file_size},
            ip_address=ip_address
        )
        self.db.commit()

        return db_doc

    def _process_document_in_background(
        self, 
        doc_id: int, 
        file_path: str, 
        file_ext: str, 
        filename: str, 
        owner_id: int
    ):
        from app.database.session import SessionLocal
        from app.repositories.document_repo import DocumentRepository
        from app.repositories.stats_repo import StatsRepository
        
        db = SessionLocal()
        doc_repo = DocumentRepository(db)
        stats_repo = StatsRepository(db)
        
        try:
            # 1. Parse pages
            pages = DocumentProcessor.parse_file_to_pages(file_path, file_ext)
            
            # 2. Chunk pages using Parent-Child mapping
            chunks = DocumentProcessor.chunk_pages_parent_child(pages)
            
            # 3. Add to Vector Store
            chunks_count = self.vector_store.add_document_chunks(
                chunks=chunks,
                document_id=doc_id,
                filename=filename,
                owner_id=owner_id
            )
            
            # 3.5 Extract and store entity-relationship links in Neo4j Graph
            try:
                import asyncio
                from app.rag.graph_extractor import GraphExtractor
                
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                for chunk in chunks:
                    chunk_text = chunk.get("text", "")
                    if chunk_text:
                        if loop.is_running():
                            asyncio.ensure_future(GraphExtractor.extract_and_store_entities(chunk_text))
                        else:
                            loop.run_until_complete(GraphExtractor.extract_and_store_entities(chunk_text))
            except Exception as ge:
                logger.error(f"Graph entity extraction failed: {ge}")
            
            # 4. Update Postgres status
            doc_repo.update_status(
                doc_id=doc_id,
                status="processed",
                embedding_count=chunks_count
            )
            
            # Audit log success
            stats_repo.add_audit_log(
                user_id=owner_id,
                action="upload_document_success",
                details={"filename": filename, "chunks": chunks_count}
            )
            db.commit()

        except Exception as e:
            logger.error(f"Error in background document processing: {e}", exc_info=True)
            # Update status to failed
            try:
                doc_repo.update_status(
                    doc_id=doc_id,
                    status="failed"
                )
                # Audit log failure
                stats_repo.add_audit_log(
                    user_id=owner_id,
                    action="upload_document_failed",
                    details={"filename": filename, "error": str(e)}
                )
                db.commit()
            except Exception as inner_e:
                logger.error(f"Failed to write failure status to DB: {inner_e}")
        finally:
            db.close()

    def delete_document(self, doc_id: int, owner_id: int, ip_address: Optional[str] = None) -> bool:
        db_doc = self.doc_repo.get_by_id(doc_id)
        if not db_doc:
            raise HTTPException(status_code=404, detail="Document not found")
            
        if db_doc.owner_id != owner_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this document")

        filename = db_doc.filename

        # 1. Delete physical file
        if os.path.exists(db_doc.storage_path):
            try:
                os.remove(db_doc.storage_path)
            except Exception:
                pass  # Proactively proceed if file was already removed manually

        # 2. Delete vectors
        self.vector_store.delete_document_chunks(doc_id)

        # 3. Delete DB record
        self.doc_repo.delete(doc_id)

        # Audit log delete
        self.stats_repo.add_audit_log(
            user_id=owner_id,
            action="delete_document",
            details={"filename": filename},
            ip_address=ip_address
        )
        self.db.commit()
        return True

    def get_user_documents(self, owner_id: int) -> List[Document]:
        return self.doc_repo.get_by_owner_id(owner_id)

    def get_document_preview_chunks(self, doc_id: int, owner_id: int) -> List[Dict[str, Any]]:
        db_doc = self.doc_repo.get_by_id(doc_id)
        if not db_doc:
            raise HTTPException(status_code=404, detail="Document not found")
        if db_doc.owner_id != owner_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this document")
            
        try:
            res = self.vector_store.collection.get(
                where={"document_id": doc_id},
                limit=5,
                include=["documents", "metadatas"]
            )
        except Exception as e:
            import logging
            logging.getLogger("app.services.doc").error(f"ChromaDB preview fetch failed: {e}", exc_info=True)
            res = {}
        
        preview = []
        docs = res.get("documents", [])
        metas = res.get("metadatas", []) if res.get("metadatas") else []
        
        for d, m in zip(docs, metas):
            preview.append({
                "content": d,
                "page": m.get("page_number", 1) if m else 1
            })
        return preview
