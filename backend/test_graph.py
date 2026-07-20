import asyncio
import os
from app.config.config import settings

# Force local sqlite env variables
os.environ["DATABASE_URL"] = "sqlite:///./local_dev.db"

from app.agents.graph import create_agent_graph

async def main():
    graph = create_agent_graph()
    initial_state = {
        "question": "Hello, this is a test query.",
        "plan": [],
        "retrieved_context": [],
        "reasoning_synthesis": "",
        "draft_answer": "",
        "citations": [],
        "evaluation": {},
        "summary": "",
        "user_id": 1,
        "conversation_history": [],
        "loop_count": 0,
        "tokens_spent": 0,
        "llm_cost": 0.0,
        "final_output": {}
    }
    
    print("Testing LangGraph execution stream...")
    try:
        async for event in graph.astream(initial_state):
            print(f"EVENT: {event}")
        print("LangGraph run completed successfully.")
    except Exception as e:
        import traceback
        print("\n--- TRACEBACK ---")
        traceback.print_exc()
        print("-----------------\n")

asyncio.run(main())
