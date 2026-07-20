from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.schemas.stats import DashboardStatsResponse, AuditLogResponse
from app.services.stats_service import StatsService
from app.core.security import get_current_admin
from app.models.user import User
from typing import List

from app.repositories.user_repo import UserRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.chat_repo import ChatRepository
from app.repositories.stats_repo import StatsRepository

def get_stats_service(db: Session = Depends(get_db)) -> StatsService:
    return StatsService(
        db=db,
        user_repo=UserRepository(db),
        doc_repo=DocumentRepository(db),
        chat_repo=ChatRepository(db),
        stats_repo=StatsRepository(db)
    )

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/stats", response_model=DashboardStatsResponse)
def get_admin_dashboard_stats(
    stats_service: StatsService = Depends(get_stats_service),
    admin_user: User = Depends(get_current_admin)
):
    return stats_service.get_dashboard_stats()

@router.get("/logs", response_model=List[AuditLogResponse])
def get_admin_audit_logs(
    limit: int = Query(default=100, ge=1, le=1000),
    stats_service: StatsService = Depends(get_stats_service),
    admin_user: User = Depends(get_current_admin)
):
    return stats_service.get_raw_audit_logs(limit=limit)

@router.get("/evaluations")
def get_admin_evaluations(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin)
):
    from app.services.evaluator_service import EvaluatorService
    eval_service = EvaluatorService(db)
    
    # Trigger run of today's calculation to guarantee data baseline
    eval_service.calculate_daily_ragas_metrics()
    
    return {
        "historical_metrics": eval_service.get_historical_metrics(days=7),
        "weak_retrievals": eval_service.identify_weak_retrievals(limit=8)
    }

@router.get("/feedback/analysis")
def get_admin_feedback_analysis(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin)
):
    from app.services.feedback_analyzer import FeedbackAnalyzer
    analyzer = FeedbackAnalyzer(db)
    return analyzer.analyze_negative_feedback()
