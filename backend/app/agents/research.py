import logging
from typing import List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.agents.state import AgentState, calculate_cost, is_mock_mode

logger = logging.getLogger("app.agents.research")

class QueryExpansionSchema(BaseModel):
    expanded_queries: List[str] = Field(description="List of 2-3 semantic search variations of the original query.")

async def research_node(state: AgentState) -> dict:
    """
    Research Agent.
    Executes Query Expansion and Query Rewriting by generating multiple search variations.
    """
    logger.info("Starting Research Agent execution")
    question = state["question"]
    
    if is_mock_mode():
        logger.info("Research Agent running in MOCK mode")
        # In mock mode, query variations are simple expansions of the original question
        return {
            "summary": f"Expanded query: '{question}'",
            "plan": state.get("plan", []) + [f"Search variation: {question}"]
        }
        
    try:
        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are an Expert Research Agent specialized in Query Expansion and Query Rewriting.\nGenerate 2-3 distinct, short search query variations of the original question to maximize matches in a vector database index. Keep them concise and search-oriented."),
            ("human", "Original Query: {query}")
        ])
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2, openai_api_key=settings.OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(QueryExpansionSchema)
        chain = prompt_tmpl | structured_llm
        
        res = await chain.ainvoke({"query": question})
        queries = res.expanded_queries
        logger.info(f"Research Agent expanded query into: {queries}")
        
        # We place expanded queries inside the state "plan" list for Retrieval Node to consume
        return {
            "summary": f"Expanded queries: {', '.join(queries)}",
            "plan": state.get("plan", []) + queries,
            "tokens_spent": 80,
            "llm_cost": calculate_cost(80, 40)
        }
    except Exception as e:
        logger.error(f"Research Agent failed: {e}", exc_info=True)
        return {
            "summary": "Query expansion fallback"
        }
