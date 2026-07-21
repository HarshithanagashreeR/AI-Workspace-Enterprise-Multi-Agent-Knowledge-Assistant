import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.agents.state import AgentState, calculate_cost, is_mock_mode

logger = logging.getLogger("app.agents.reasoning")

async def reasoning_node(state: AgentState) -> dict:
    """
    Reasoning Agent.
    Synthesizes facts from the retrieved chunks to compile a draft answer.
    """
    logger.info("Starting Reasoning Agent execution")
    question = state["question"]
    contexts = state.get("retrieved_context", [])
    history = state.get("conversation_history", [])
    
    # Format context segments
    context_str = ""
    for idx, c in enumerate(contexts):
        fn = c.get("metadata", {}).get("filename", "document") if c.get("metadata") else "document"
        page = c.get("metadata", {}).get("page_number", "unknown") if c.get("metadata") else "unknown"
        context_str += f"\n--- Source {idx+1}: {fn} (Page {page}) ---\n{c['content']}\n"

    # Mock mode fallback
    if is_mock_mode() or not contexts:
        logger.info("Reasoning Agent running in MOCK mode")
        if contexts:
            clean_contexts = [c for c in contexts if "Neo4j Knowledge Graph" not in c.get("metadata", {}).get("filename", "")]
            if not clean_contexts:
                clean_contexts = contexts
            
            # Format and return the retrieved context as the answer
            draft_answer = f"According to the retrieved source document ({clean_contexts[0].get('metadata', {}).get('filename', 'document')}):\n\n"
            draft_answer += clean_contexts[0]["content"].strip()
            
            if len(clean_contexts) > 1:
                draft_answer += f"\n\nAdditional source context ({clean_contexts[1].get('metadata', {}).get('filename', 'document')}):\n\n"
                draft_answer += clean_contexts[1]["content"].strip()
                
            return {
                "reasoning_synthesis": draft_answer,
                "draft_answer": draft_answer
            }
            
        mock_answer = (
            f"Regarding your query: '{question}'. No context documents were found. "
            "Please upload a document to your workspace to retrieve information."
        )
        return {
            "reasoning_synthesis": mock_answer,
            "draft_answer": mock_answer
        }
        
    try:
        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are a senior Reasoning Agent. Your task is to draft a comprehensive, factually correct response to the user's question.\n"
                       "Format rules:\n"
                       "- Base your answer ONLY on the provided Context sources.\n"
                       "- Do NOT make assertions that cannot be directly verified by the source snippets.\n"
                       "- Keep the response concise, professional, and well-structured.\n\n"
                       "Context:\n{context}\n\nHistory Context:\n{history}"),
            ("human", "User Question: {query}")
        ])
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, openai_api_key=settings.OPENAI_API_KEY)
        chain = prompt_tmpl | llm
        
        res = await chain.ainvoke({
            "query": question,
            "context": context_str,
            "history": str(history)
        })
        
        logger.info("Reasoning Agent successfully compiled answer draft")
        return {
            "reasoning_synthesis": res.content,
            "draft_answer": res.content,
            "tokens_spent": 500,
            "llm_cost": calculate_cost(500, 200)
        }
    except Exception as e:
        logger.error(f"Reasoning Agent failed: {e}", exc_info=True)
        return {
            "reasoning_synthesis": "Reasoning compilation failed."
        }
