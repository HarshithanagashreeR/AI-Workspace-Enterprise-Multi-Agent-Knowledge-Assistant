from sqlalchemy.orm import Session
from app.repositories.user_repo import UserRepository
from app.repositories.document_repo import DocumentRepository
from app.repositories.chat_repo import ChatRepository
from app.repositories.stats_repo import StatsRepository
from app.schemas.stats import DashboardStatsResponse, AuditLogResponse, AgentCostBreakdown, DailyTokenStats, MonthlyTokenStats
from typing import List, Optional, Dict, Any
import json

class StatsService:
    def __init__(
        self, 
        db: Session,
        user_repo: UserRepository,
        doc_repo: DocumentRepository,
        chat_repo: ChatRepository,
        stats_repo: StatsRepository
    ):
        self.db = db
        self.user_repo = user_repo
        self.doc_repo = doc_repo
        self.chat_repo = chat_repo
        self.stats_repo = stats_repo

    def get_dashboard_stats(self) -> DashboardStatsResponse:
        user_count = self.user_repo.count()
        doc_count = self.doc_repo.count()
        total_embeddings = self.doc_repo.sum_embeddings()
        total_queries = self.chat_repo.count_queries()
        storage_usage = self.doc_repo.sum_storage_bytes()
        
        total_tokens, total_cost = self.stats_repo.get_total_tokens_and_cost()
        
        # Get recent audit logs
        raw_logs = self.stats_repo.get_audit_logs(limit=10)
        recent_logs = []
        for log in raw_logs:
            recent_logs.append(AuditLogResponse.from_orm(log))
            
        # Get agent costs breakdown
        agent_breakdown_raw = self.stats_repo.get_agent_breakdown()
        agent_breakdown = [
            AgentCostBreakdown(
                agent_name=item["agent_name"],
                total_tokens=item["total_tokens"],
                total_cost=item["total_cost"]
            )
            for item in agent_breakdown_raw
        ]
        
        # Get daily usage (last 7 days)
        daily_usage_raw = self.stats_repo.get_daily_usage()
        daily_usage = [
            DailyTokenStats(
                date=item["date"],
                total_tokens=item["total_tokens"],
                total_cost=item["total_cost"]
            )
            for item in daily_usage_raw
        ]

        # Get monthly usage
        monthly_usage_raw = self.stats_repo.get_monthly_usage()
        monthly_usage = [
            MonthlyTokenStats(
                month=item["month"],
                total_tokens=item["total_tokens"],
                total_cost=item["total_cost"]
            )
            for item in monthly_usage_raw
        ]
        
        # Resolve health status
        health_status = "optimal"
        try:
            self.db.execute("SELECT 1")
        except Exception:
            health_status = "degraded"

        # Resolve average response time dynamically from audit logs
        avg_latency = 1.85
        try:
            from app.models.stats import AuditLog
            logs = self.db.query(AuditLog).filter(AuditLog.action == "rag_query_success").order_by(AuditLog.created_at.desc()).limit(50).all()
            latencies = []
            for l in logs:
                if l.details:
                    try:
                        d_dict = json.loads(l.details)
                        if "duration_sec" in d_dict:
                            latencies.append(d_dict["duration_sec"])
                    except Exception:
                        pass
            if latencies:
                avg_latency = round(sum(latencies) / len(latencies), 2)
        except Exception:
            pass

        # Resolve document usage list
        from app.models.document import Document
        docs = self.db.query(Document).order_by(Document.embedding_count.desc()).limit(5).all()
        most_used_documents = [
            {"filename": d.filename, "size_bytes": d.size_bytes, "embedding_count": d.embedding_count}
            for d in docs
        ]

        # Resolve questions list
        from app.models.chat import ChatMessage
        queries = self.db.query(ChatMessage).filter(ChatMessage.role == "user").limit(5).all()
        most_asked_questions = [q.content for q in queries]

        # Ensure we return a structured dashboard object
        return DashboardStatsResponse(
            user_count=user_count,
            document_count=doc_count,
            total_embeddings=total_embeddings,
            total_queries=total_queries,
            storage_usage_bytes=storage_usage,
            total_tokens_spent=total_tokens,
            total_llm_cost=total_cost,
            recent_logs=recent_logs,
            agent_breakdown=agent_breakdown,
            daily_usage=daily_usage,
            monthly_usage=monthly_usage,
            avg_response_time_sec=avg_latency,
            system_health_status=health_status,
            most_used_documents=most_used_documents,
            most_asked_questions=most_asked_questions
        )

    def get_raw_audit_logs(self, limit: int = 100) -> List[AuditLogResponse]:
        raw_logs = self.stats_repo.get_audit_logs(limit=limit)
        return [AuditLogResponse.from_orm(log) for log in raw_logs]
