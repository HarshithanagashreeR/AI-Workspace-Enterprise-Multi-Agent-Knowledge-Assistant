from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    details: Optional[str]
    ip_address: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class TokenUsageResponse(BaseModel):
    id: int
    user_id: int
    agent_name: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost: float
    created_at: datetime

    class Config:
        from_attributes = True

class AgentCostBreakdown(BaseModel):
    agent_name: str
    total_tokens: int
    total_cost: float

class DailyTokenStats(BaseModel):
    date: str
    total_tokens: int
    total_cost: float

class MonthlyTokenStats(BaseModel):
    month: str
    total_tokens: int
    total_cost: float

class DashboardStatsResponse(BaseModel):
    user_count: int
    document_count: int
    total_embeddings: int
    total_queries: int
    storage_usage_bytes: int
    total_tokens_spent: int
    total_llm_cost: float
    recent_logs: List[AuditLogResponse]
    agent_breakdown: List[AgentCostBreakdown]
    daily_usage: List[DailyTokenStats]
    monthly_usage: List[MonthlyTokenStats]
    avg_response_time_sec: Optional[float] = 1.85
    system_health_status: Optional[str] = "optimal"
    most_used_documents: Optional[List[Dict[str, Any]]] = None
    most_asked_questions: Optional[List[str]] = None
