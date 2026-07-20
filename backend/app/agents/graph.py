import logging
from langgraph.graph import StateGraph, END
from app.agents.state import AgentState
from app.agents.planner import planner_node
from app.agents.research import research_node
from app.agents.retrieval import retrieval_node
from app.agents.reasoning import reasoning_node
from app.agents.citation import citation_node
from app.agents.hallucination_detector import hallucination_node
from app.agents.response_evaluator import response_evaluator_node

logger = logging.getLogger("app.agents.graph")

async def memory_node(state: AgentState) -> dict:
    """
    Memory Agent.
    Distills past dialogue turns into a compressed context summary to keep context compact.
    """
    logger.info("Starting Memory Agent execution")
    history = state.get("conversation_history", [])
    if not history:
        return {"context_summary": ""}
        
    # Compress last 4 chat turns as contextual summary
    turns = [f"{turn['role']}: {turn['content']}" for turn in history[-4:]]
    summary_text = "Dialogue summary: " + " | ".join(turns)
    return {"context_summary": summary_text}

# 1. Initialize StateGraph
workflow = StateGraph(AgentState)

# 2. Register Nodes
workflow.add_node("memory", memory_node)
workflow.add_node("planner", planner_node)
workflow.add_node("research", research_node)
workflow.add_node("retrieval", retrieval_node)
workflow.add_node("reasoning", reasoning_node)
workflow.add_node("citation", citation_node)
workflow.add_node("hallucination_detector", hallucination_node)
workflow.add_node("response_evaluator", response_evaluator_node)

# 3. Establish Edges & Routing Flow
workflow.set_entry_point("memory")

workflow.add_edge("memory", "planner")
workflow.add_edge("planner", "research")
workflow.add_edge("research", "retrieval")
workflow.add_edge("retrieval", "reasoning")
workflow.add_edge("reasoning", "citation")
workflow.add_edge("citation", "hallucination_detector")

# Define self-correction loop edge routing
def route_after_hallucination_check(state: AgentState) -> str:
    eval_state = state.get("evaluation", {})
    loop_count = state.get("loop_count", 0)
    
    if eval_state.get("is_hallucinated", False) and loop_count < 3:
        logger.warning(f"Hallucination detected in draft answer. Routing back to Reasoning Agent (Loop #{loop_count})")
        return "reasoning"
    else:
        logger.info("Hallucination check passed or loop count limit reached. Routing to Response Evaluator.")
        return "response_evaluator"

workflow.add_conditional_edges(
    "hallucination_detector",
    route_after_hallucination_check,
    {
        "reasoning": "reasoning",
        "response_evaluator": "response_evaluator"
    }
)

workflow.add_edge("response_evaluator", END)

# 4. Compile CompiledGraph Runnable
app_graph = workflow.compile()
def create_agent_graph():
    """Return the compiled agent graph."""
    return app_graph
