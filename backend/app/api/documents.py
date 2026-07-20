from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, Request
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.document import DocumentResponse
from app.services.doc_service import DocumentService
from app.core.security import get_current_user
from app.models.user import User
from typing import List

from app.repositories.document_repo import DocumentRepository
from app.repositories.stats_repo import StatsRepository

def get_doc_service(db: Session = Depends(get_db)) -> DocumentService:
    return DocumentService(
        db=db,
        doc_repo=DocumentRepository(db),
        stats_repo=StatsRepository(db)
    )

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentResponse, status_code=202)
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_service: DocumentService = Depends(get_doc_service),
    current_user: User = Depends(get_current_user)
):
    ip_address = request.client.host if request.client else None
    return await doc_service.upload_document(
        file=file,
        owner_id=current_user.id,
        background_tasks=background_tasks,
        ip_address=ip_address
    )

@router.post("/upload-multiple", response_model=List[DocumentResponse], status_code=202)
async def upload_multiple_files(
    request: Request,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    doc_service: DocumentService = Depends(get_doc_service),
    current_user: User = Depends(get_current_user)
):
    ip_address = request.client.host if request.client else None
    results = []
    for file in files:
        res = await doc_service.upload_document(
            file=file,
            owner_id=current_user.id,
            background_tasks=background_tasks,
            ip_address=ip_address
        )
        results.append(res)
    return results

@router.get("/", response_model=List[DocumentResponse])
def list_documents(
    doc_service: DocumentService = Depends(get_doc_service),
    current_user: User = Depends(get_current_user)
):
    return doc_service.get_user_documents(owner_id=current_user.id)

@router.delete("/{doc_id}")
def delete_document(
    request: Request,
    doc_id: int,
    doc_service: DocumentService = Depends(get_doc_service),
    current_user: User = Depends(get_current_user)
):
    ip_address = request.client.host if request.client else None
    success = doc_service.delete_document(doc_id, current_user.id, ip_address=ip_address)
    return {"success": success}

@router.get("/{doc_id}/preview")
def get_document_preview(
    doc_id: int,
    doc_service: DocumentService = Depends(get_doc_service),
    current_user: User = Depends(get_current_user)
):
    return doc_service.get_document_preview_chunks(doc_id, current_user.id)
