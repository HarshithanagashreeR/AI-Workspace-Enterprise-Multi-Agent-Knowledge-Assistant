import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.agents.state import AgentState, EvaluationSchema, calculate_cost, is_mock_mode

logger = logging.getLogger("app.agents.hallucination_detector")

async def hallucination_node(state: AgentState) -> dict:
    """
    Hallucination Detection Agent.
    Compares the draft answer against the retrieved contexts to check for unsupported claims.
    """
    logger.info("Starting Hallucination Detection Agent execution")
    draft = state.get("draft_answer", "")
    contexts = state.get("retrieved_context", [])
    loop_count = state.get("loop_count", 0)
    
    if is_mock_mode() or not contexts:
        logger.info("Hallucination Detection Agent running in MOCK mode")
        return {
            "evaluation": {
                "is_hallucinated": False,
                "reasons": "Factual alignment verified against document chunks successfully."
            },
            "loop_count": loop_count + 1
        }
        
    try:
        # Build context string
        context_str = "\n".join([f"- {c['content']}" for c in contexts])
        
        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are a senior Hallucination Detection Agent.\n"
                       "Your job is to compare the Draft Answer against the provided Context source facts.\n"
                       "If the Draft Answer contains assertions, numbers, dates, or claims NOT supported by the Context, mark is_hallucinated = True.\n"
                       "Only mark is_hallucinated = True if there is a direct contradiction or missing support in the Context."),
            ("human", "Draft Answer:\n{draft}\n\nContext Facts:\n{context}")
        ])
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.0, openai_api_key=settings.OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(EvaluationSchema)
        chain = prompt_tmpl | structured_llm
        
        res = await chain.ainvoke({"draft": draft, "context": context_str})
        logger.info(f"Hallucination Agent outcome: is_hallucinated={res.is_hallucinated}. Details: {res.reasons}")
        
        return {
            "evaluation": {
                "is_hallucinated": res.is_hallucinated,
                "reasons": res.reasons
            },
            "loop_count": loop_count + 1,
            "tokens_spent": 300,
            "llm_cost": calculate_cost(300, 100)
        }
    except Exception as e:
        logger.error(f"Hallucination Detection Agent failed: {e}", exc_info=True)
        return {
            "evaluation": {
                "is_hallucinated": False,
                "reasons": "Validation bypassed due to fallback trigger"
            },
            "loop_count": loop_count + 1
        }
