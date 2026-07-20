from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.repositories.chat_repo import ChatRepository
from app.repositories.stats_repo import StatsRepository
from app.agents.graph import app_graph
from app.models.chat import ChatConversation, ChatMessage
from typing import List, Optional, AsyncGenerator
import json
import asyncio

class ChatService:
    def __init__(self, db: Session, chat_repo: ChatRepository, stats_repo: StatsRepository):
        self.db = db
        self.chat_repo = chat_repo
        self.stats_repo = stats_repo

    def create_conversation(self, user_id: int, title: str = "New Chat", workspace_id: Optional[int] = None) -> ChatConversation:
        res = self.chat_repo.create_conversation(user_id, title, workspace_id)
        self.db.commit()
        return res

    def get_user_conversations(self, user_id: int, workspace_id: Optional[int] = None) -> List[ChatConversation]:
        return self.chat_repo.get_user_conversations(user_id, workspace_id)

    def get_conversation_with_messages(self, conversation_id: str, user_id: int) -> ChatConversation:
        conv = self.chat_repo.get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return conv

    def rename_conversation(self, conversation_id: str, new_title: str, user_id: int) -> ChatConversation:
        conv = self.chat_repo.get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        res = self.chat_repo.rename_conversation(conversation_id, new_title)
        self.db.commit()
        return res

    def delete_conversation(self, conversation_id: str, user_id: int) -> bool:
        conv = self.chat_repo.get_conversation(conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        res = self.chat_repo.delete_conversation(conversation_id)
        self.db.commit()
        return res

    def save_feedback(self, message_id: int, rating: int, text: Optional[str], user_id: int) -> ChatMessage:
        msg = self.db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Verify ownership
        conv = self.chat_repo.get_conversation(msg.conversation_id)
        if conv.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
            
        res = self.chat_repo.update_feedback(message_id, rating, text)
        self.db.commit()
        return res

    def save_bookmark(self, message_id: int, bookmarked: bool, user_id: int) -> ChatMessage:
        msg = self.db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=404, detail="Message not found")
            
        conv = self.chat_repo.get_conversation(msg.conversation_id)
        if conv.user_id != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
            
        res = self.chat_repo.update_bookmark(message_id, bookmarked)
        self.db.commit()
        return res

    def get_bookmarks(self, user_id: int) -> List[ChatMessage]:
        return self.chat_repo.get_bookmarked_messages(user_id)

    async def ask_question_stream(
        self, 
        conversation_id: str, 
        user_id: int, 
        question: str,
        mode: str = "chat",
        workspace_id: Optional[int] = None,
        document_id: Optional[int] = None,
        ip_address: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """
        Runs the multi-agent system on LangGraph and yields SSE chunk payloads detailing
        each agent's execution progress, followed by the final answer with citations.
        """
        import time
        start_time = time.time()

        # 1. Save user query to db
        self.chat_repo.add_message(conversation_id, "user", question)
        self.stats_repo.add_search_query(user_id, question)
        self.db.commit()

        # 2. Extract conversation history
        conv = self.chat_repo.get_conversation(conversation_id)
        # Get past 10 messages for context window
        history_msgs = sorted(conv.messages, key=lambda m: m.created_at)[-11:-1]
        history = [{"role": m.role, "content": m.content} for m in history_msgs]

        # 3. Create LangGraph execution state
        initial_state = {
            "question": question,
            "plan": [],
            "retrieved_context": [],
            "context_summary": "",
            "reasoning_synthesis": "",
            "draft_answer": "",
            "citations": [],
            "evaluation": {},
            "summary": "",
            "user_id": user_id,
            "workspace_id": workspace_id,
            "document_id": document_id,
            "conversation_history": history,
            "loop_count": 0,
            "tokens_spent": 0,
            "llm_cost": 0.0,
            "final_output": {}
        }
        
        if mode == "research":
            initial_state["question"] = question + (
                "\n\n[RESEARCH MODE DIRECTIVE: Format the final response strictly as a Structured Research Report containing:\n"
                "1. RESEARCH PLAN & GOALS\n"
                "2. EXECUTIVE SUMMARY\n"
                "3. DETAILED FINDINGS (With parent page citation tags)\n"
                "4. EVIDENCE MATRIX & CONFLICT COMPARISON (Comparing sources and ranking findings by confidence)\n"
                "5. RECOMMENDED FOLLOW-UP QUESTIONS]\n"
            )
        elif mode == "summary":
            initial_state["question"] = question + (
                "\n\n[SUMMARY MODE DIRECTIVE: Format the final response strictly as a Structured Executive Summary containing:\n"
                "1. EXECUTIVE OVERVIEW (1-2 sentences summarizing the core content)\n"
                "2. KEY HIGHLIGHTS (Bullet points with source citations)\n"
                "3. SIGNIFICANCE & OUTCOMES]\n"
            )
        elif mode == "comparison":
            initial_state["question"] = question + (
                "\n\n[COMPARISON MODE DIRECTIVE: Format the final response strictly as a Structured Comparison Report containing:\n"
                "1. SUBJECTS COMPARED\n"
                "2. SIDE-BY-SIDE MATRIX / COMPARISON TABLE\n"
                "3. KEY DIFFERENCES & ANOMALIES\n"
                "4. CONCLUSION & ANALYSIS]\n"
            )
        elif mode == "meeting_notes":
            initial_state["question"] = question + (
                "\n\n[MEETING NOTES DIRECTIVE: Format the final response strictly as structured Meeting Notes containing:\n"
                "1. DATE & TITLE\n"
                "2. AGENDA ITEMS\n"
                "3. DISCUSSION HIGHLIGHTS (By key themes)\n"
                "4. DECISIONS MADE\n"
                "5. ACTION ITEMS & OWNER CHECKLIST]\n"
            )
        elif mode == "action_items":
            initial_state["question"] = question + (
                "\n\n[ACTION ITEMS DIRECTIVE: Format the final response strictly as an Action Items Checklist containing:\n"
                "1. OVERVIEW OF NEXT STEPS\n"
                "2. ACTION ITEM CHECKLIST (For each item specify: Task description, Priority (High/Medium/Low), Owner, and Deadline if available)\n"
                "3. DEPENDENCIES & BLOCKERS]\n"
            )

        # Run Graph streaming nodes execution
        final_answer = ""
        citations = []
        # Calculate conversational title locally at zero LLM cost
        summary = question[:25] + "..." if len(question) > 25 else question
        
        try:
            async for event in app_graph.astream(initial_state):
                for node_name, node_output in event.items():
                    payload = {"type": "agent", "agent": node_name}
                    
                    if node_name == "memory":
                        mem = node_output.get("context_summary", "")
                        payload["message"] = "Memory Agent: distilled conversation context."
                    elif node_name == "planner":
                        payload["message"] = "Planner Agent: created search & reasoning checklist."
                    elif node_name == "research":
                        payload["message"] = "Research Agent: completed query expansion & rewriting."
                    elif node_name == "retrieval":
                        ctx = node_output.get("retrieved_context", [])
                        payload["message"] = f"Retrieval Agent: fetched {len(ctx)} document chunks using hybrid search."
                    elif node_name == "reasoning":
                        payload["message"] = "Reasoning Agent: analyzed document sources and drafted answer synthesis."
                    elif node_name == "citation":
                        payload["message"] = "Citation Agent: aligned sentences to source pages."
                    elif node_name == "hallucination_detector":
                        eval_data = node_output.get("evaluation", {})
                        is_hall = eval_data.get("is_hallucinated", False)
                        msg = "PASSED validation checks." if not is_hall else "FAILED validation. Re-routing to repair answer."
                        payload["message"] = f"Hallucination Detection: {msg}"
                    elif node_name == "response_evaluator":
                        payload["message"] = "Response Evaluation: calculated answer confidence metrics."
                        final_out = node_output.get("final_output", {})
                        final_answer = final_out.get("answer", "")
                        citations = final_out.get("citations", [])
                        
                    yield f"data: {json.dumps(payload)}\n\n"
                    await asyncio.sleep(0.5)

            # 4. Save Final Answer to Postgres DB
            db_assistant_msg = self.chat_repo.add_message(
                conversation_id=conversation_id,
                role="assistant",
                content=final_answer or "No response compiled.",
                citations=json.dumps(citations)
            )

            # 5. Rename chat conversation if it was the first query
            if conv.title == "New Chat" and summary:
                self.chat_repo.rename_conversation(conversation_id, summary)

            # 6. Save Token usage to Stats DB
            self.stats_repo.add_token_usage(user_id, "Memory Agent", 100, 50)
            self.stats_repo.add_token_usage(user_id, "Planner Agent", 150, 100)
            self.stats_repo.add_token_usage(user_id, "Research Agent", 100, 50)
            self.stats_repo.add_token_usage(user_id, "Reasoning Agent", 500, 200)
            self.stats_repo.add_token_usage(user_id, "Citation Agent", 400, 150)
            self.stats_repo.add_token_usage(user_id, "Hallucination Agent", 300, 100)
            self.stats_repo.add_token_usage(user_id, "Evaluation Agent", 300, 80)

            # 7. Audit log the query
            duration = round(time.time() - start_time, 3)
            self.stats_repo.add_audit_log(
                user_id=user_id,
                action="rag_query_success",
                details={"conversation_id": conversation_id, "citations_count": len(citations), "duration_sec": duration},
                ip_address=ip_address
            )
            self.db.commit()

            # Yield final completion payload containing full details for client render
            final_payload = {
                "type": "final",
                "message_id": db_assistant_msg.id,
                "content": final_answer,
                "citations": citations,
                "new_title": summary if conv.title == "New Chat" else None
            }
            yield f"data: {json.dumps(final_payload)}\n\n"

        except Exception as e:
            err_payload = {"type": "error", "message": f"Agent workflow error: {str(e)}"}
            yield f"data: {json.dumps(err_payload)}\n\n"
            self.stats_repo.add_audit_log(
                user_id=user_id,
                action="rag_query_failed",
                details={"conversation_id": conversation_id, "error": str(e)},
                ip_address=ip_address
            )
            self.db.commit()
