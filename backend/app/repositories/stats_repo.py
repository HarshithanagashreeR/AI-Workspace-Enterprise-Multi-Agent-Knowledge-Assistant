from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.stats import SearchHistory, AuditLog, TokenUsage
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json

class StatsRepository:
    def __init__(self, db: Session):
        self.db = db

    def add_search_query(self, user_id: int, query: str) -> SearchHistory:
        db_history = SearchHistory(user_id=user_id, query=query)
        self.db.add(db_history)
        self.db.flush()
        self.db.refresh(db_history)
        return db_history

    def get_search_history(self, user_id: int, limit: int = 20) -> List[SearchHistory]:
        return self.db.query(SearchHistory).filter(
            SearchHistory.user_id == user_id
        ).order_by(SearchHistory.created_at.desc()).limit(limit).all()

    def add_audit_log(self, user_id: Optional[int], action: str, details: Optional[Dict[str, Any]] = None, ip_address: Optional[str] = None) -> AuditLog:
        details_str = json.dumps(details) if details else None
        db_log = AuditLog(
            user_id=user_id,
            action=action,
            details=details_str,
            ip_address=ip_address
        )
        self.db.add(db_log)
        self.db.flush()
        self.db.refresh(db_log)
        return db_log

    def get_audit_logs(self, limit: int = 100) -> List[AuditLog]:
        return self.db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()

    def add_token_usage(self, user_id: int, agent_name: str, prompt_tokens: int, completion_tokens: int) -> TokenUsage:
        # standard GPT-4o-mini pricing model estimates:
        # Prompt: $0.15 / 1M tokens ($0.00000015 per token)
        # Completion: $0.60 / 1M tokens ($0.00000060 per token)
        prompt_cost = prompt_tokens * 0.00000015
        completion_cost = completion_tokens * 0.00000060
        cost = prompt_cost + completion_cost
        
        db_usage = TokenUsage(
            user_id=user_id,
            agent_name=agent_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            cost=cost
        )
        self.db.add(db_usage)
        self.db.flush()
        self.db.refresh(db_usage)
        return db_usage

    def get_total_tokens_and_cost(self) -> tuple[int, float]:
        res = self.db.query(
            func.sum(TokenUsage.total_tokens),
            func.sum(TokenUsage.cost)
        ).first()
        return (res[0] or 0, res[1] or 0.0)

    def get_agent_breakdown(self) -> List[Dict[str, Any]]:
        results = self.db.query(
            TokenUsage.agent_name,
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.sum(TokenUsage.cost).label("total_cost")
        ).group_by(TokenUsage.agent_name).all()
        
        return [
            {
                "agent_name": r.agent_name,
                "total_tokens": int(r.total_tokens or 0),
                "total_cost": float(r.total_cost or 0.0)
            }
            for r in results
        ]

    def get_daily_usage(self) -> List[Dict[str, Any]]:
        # Query usage for past 7 days grouped by date
        # Check dialect dynamically (SQLite vs Postgres)
        if self.db.bind.dialect.name == "sqlite":
            date_func = func.strftime("%Y-%m-%d", TokenUsage.created_at)
        else:
            date_func = func.to_char(TokenUsage.created_at, "YYYY-MM-DD")

        results = self.db.query(
            date_func.label("date"),
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.sum(TokenUsage.cost).label("total_cost")
        ).group_by("date").order_by("date").limit(7).all()
        
        return [
            {
                "date": r.date,
                "total_tokens": int(r.total_tokens or 0),
                "total_cost": float(r.total_cost or 0.0)
            }
            for r in results
        ]

    def get_monthly_usage(self) -> List[Dict[str, Any]]:
        # Query usage for past 12 months grouped by month
        if self.db.bind.dialect.name == "sqlite":
            date_func = func.strftime("%Y-%m", TokenUsage.created_at)
        else:
            date_func = func.to_char(TokenUsage.created_at, "YYYY-MM")

        results = self.db.query(
            date_func.label("month"),
            func.sum(TokenUsage.total_tokens).label("total_tokens"),
            func.sum(TokenUsage.cost).label("total_cost")
        ).group_by("month").order_by("month").limit(12).all()
        
        return [
            {
                "month": r.month,
                "total_tokens": int(r.total_tokens or 0),
                "total_cost": float(r.total_cost or 0.0)
            }
            for r in results
        ]
