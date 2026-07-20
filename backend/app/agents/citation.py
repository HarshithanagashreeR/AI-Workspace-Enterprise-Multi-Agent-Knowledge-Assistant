import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from app.config.config import settings
from app.agents.state import AgentState, CitationsSchema, calculate_cost, is_mock_mode

logger = logging.getLogger("app.agents.citation")

async def citation_node(state: AgentState) -> dict:
    """
    Citation Agent.
    Validates claims in the draft answer and links sentences to specific source documents and page numbers.
    """
    logger.info("Starting Citation Agent execution")
    draft = state.get("draft_answer", "")
    contexts = state.get("retrieved_context", [])
    
    # Check for mock mode fallback
    if is_mock_mode() or not contexts:
        logger.info("Citation Agent running in MOCK mode")
        # Generate mock citations matching facts
        mock_cits = []
        if contexts:
            c = contexts[0]
            fn = c.get("metadata", {}).get("filename", "eval_facts.txt") if c.get("metadata") else "eval_facts.txt"
            p_num = c.get("metadata", {}).get("page_number", 1) if c.get("metadata") else 1
            mock_cits.append({
                "sentence": draft,
                "document_id": c.get("metadata", {}).get("document_id", 999) if c.get("metadata") else 999,
                "filename": f"{fn} (Page {p_num})",
                "snippet": c.get("content", "")[:100]
            })
        return {
            "citations": mock_cits
        }
        
    try:
        # Build context prompt layout
        context_str = ""
        for idx, c in enumerate(contexts):
            fn = c.get("metadata", {}).get("filename", "document") if c.get("metadata") else "document"
            p_num = c.get("metadata", {}).get("page_number", 1) if c.get("metadata") else 1
            doc_id = c.get("metadata", {}).get("document_id", 0) if c.get("metadata") else 0
            context_str += f"[Source Index {idx}] ID: {doc_id}, File: {fn} (Page {p_num})\nSnippet: {c['content']}\n\n"

        prompt_tmpl = ChatPromptTemplate.from_messages([
            ("system", "You are an Expert Citation Agent. Your job is to link sentences in the draft answer to the provided Context sources.\n"
                       "For each claim sentence, find the specific ID, filename (with page number format, e.g., 'resume.pdf (Page 1)'), and supporting snippet.\n"
                       "Return a list of mapped citations. If a sentence makes no factual claim or is common knowledge, you can skip it."),
            ("human", "Draft Answer:\n{draft}\n\nContext Sources:\n{context}")
        ])
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.1, openai_api_key=settings.OPENAI_API_KEY)
        structured_llm = llm.with_structured_output(CitationsSchema)
        chain = prompt_tmpl | structured_llm
        
        res = await chain.ainvoke({"draft": draft, "context": context_str})
        
        citations_list = []
        for item in res.citations:
            citations_list.append({
                "sentence": item.sentence,
                "document_id": item.document_id,
                "filename": item.filename,
                "snippet": item.snippet
            })
            
        logger.info(f"Citation Agent completed with {len(citations_list)} matched source citations")
        return {
            "citations": citations_list,
            "tokens_spent": 400,
            "llm_cost": calculate_cost(400, 150)
        }
    except Exception as e:
        logger.error(f"Citation Agent failed: {e}", exc_info=True)
        return {
            "citations": []
        }
