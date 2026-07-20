from typing import List, Dict, Any, TypedDict, Optional
from pydantic import BaseModel, Field
from app.config.config import settings

# Define state schema
class AgentState(TypedDict):
    question: str
    plan: List[str]
    retrieved_context: List[Dict[str, Any]]
    context_summary: str  # Historical distilled memory
    reasoning_synthesis: str
    draft_answer: str
    citations: List[Dict[str, Any]]
    evaluation: Dict[str, Any]
    summary: str
    user_id: int
    conversation_history: List[Dict[str, Any]]
    loop_count: int
    tokens_spent: int
    llm_cost: float
    final_output: Dict[str, Any]

# Pydantic schemas for structured LLM outputs
class EvaluationSchema(BaseModel):
    is_hallucinated: bool = Field(description="True if the draft answer contains assertions not backed by the retrieved context.")
    reasons: str = Field(description="Justification explaining why the answer is or isn't hallucinated.")

class CitationItem(BaseModel):
    sentence: str = Field(description="The specific sentence in the answer that makes a claim.")
    document_id: int = Field(description="The database document ID of the source.")
    filename: str = Field(description="The filename of the source document.")
    snippet: str = Field(description="The exact text snippet from the retrieved context that supports the claim.")

class CitationsSchema(BaseModel):
    citations: List[CitationItem] = Field(description="List of citations linking statements to source documents.")

class PlannerSchema(BaseModel):
    tasks: List[str] = Field(description="A list of step-by-step search and reasoning tasks.")

class ResponseEvaluationSchema(BaseModel):
    completeness: float = Field(description="Score between 0.0 and 1.0 rating whether the question was answered fully.")
    confidence_score: float = Field(description="Score between 0.0 and 1.0 rating confidence in correctness.")
    reasons: str = Field(description="Brief validation details of the response quality.")

# Helpers for costing
def calculate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    # Estimate: gpt-4o-mini pricing
    return (prompt_tokens * 0.00000015) + (completion_tokens * 0.00000060)

def is_mock_mode() -> bool:
    # Returns True if OpenAI Key is default or missing
    return not settings.OPENAI_API_KEY or "sk-proj-mock" in settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == "your_openai_api_key_here"
