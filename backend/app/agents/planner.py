import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.agents.state import AgentState, PlannerSchema, calculate_cost, is_mock_mode

logger = logging.getLogger("app.agents.planner")

async def planner_node(state: AgentState) -> dict:
    """
    Planner Agent.
    Deconstructs the user query into a step-by-step search and reasoning task list.
    """
    logger.info("Starting Planner Agent execution")
    question = state["question"]
    history = state.get("conversation_history", [])
    
    # Check for mock mode fallback
    if is_mock_mode():
        logger.info("Planner Agent running in MOCK mode")
        return {
            "plan": [
                f"Analyze core topic of '{question}'",
                "Execute vector retrieval on knowledge base",
                "Synthesize context facts and generate detailed cited response"
            ]
        }
        
    try:
        # Prompt definition
        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are an Expert Planner Agent. Your job is to break down a user's complex search query into a step-by-step task list.\nAnalyze the query and history, and return a structured list of tasks to resolve it."),
            ("human", "User query: {query}\nHistory context: {history}")
        ])
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, openai_api_key=settings.OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(PlannerSchema)
        chain = prompt_tmpl | structured_llm
        
        # Execute chain
        res = await chain.ainvoke({"query": question, "history": str(history)})
        logger.info(f"Planner Agent completed with {len(res.tasks)} plan tasks")
        
        return {
            "plan": res.tasks,
            "tokens_spent": 100,  # approximate token counters
            "llm_cost": calculate_cost(100, 50)
        }
    except Exception as e:
        logger.error(f"Planner Agent execution failed: {e}", exc_info=True)
        # Safe fallback
        return {
            "plan": ["Execute standard vector search", "Compile response context"]
        }
