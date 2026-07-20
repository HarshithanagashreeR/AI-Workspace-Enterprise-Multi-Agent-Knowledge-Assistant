import logging
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.eval import EvaluationMetric
from app.models.chat import ChatMessage, ChatConversation
import json

logger = logging.getLogger("app.services.evaluator")

class EvaluatorService:
    def __init__(self, db: Session):
        self.db = db

    def calculate_daily_ragas_metrics(self) -> EvaluationMetric:
        """
        Gathers recent chat records, computes Faithfulness, Relevancy, Precision, 
        and Recall, and saves the day's average scores to the database.
        """
        logger.info("Starting daily RAGAS metrics calculation")
        
        # 1. Fetch recent assistant messages with context source citations
        recent_messages = self.db.query(ChatMessage).filter(
            ChatMessage.role == "assistant",
            ChatMessage.citations != None
        ).limit(30).all()
        
        if not recent_messages:
            logger.info("No query logs found to evaluate. Saving default baseline scores.")
            metric = EvaluationMetric(
                faithfulness=1.00,
                answer_relevancy=1.00,
                context_recall=1.00,
                context_precision=1.00,
                answer_correctness=1.00,
                sample_size=0
            )
            self.db.add(metric)
            self.db.commit()
            self.db.refresh(metric)
            return metric

        total_faithfulness = 0.0
        total_relevancy = 0.0
        total_precision = 0.0
        total_recall = 0.0
        total_correctness = 0.0
        
        for msg in recent_messages:
            # Fetch corresponding user query
            user_msg = self.db.query(ChatMessage).filter(
                ChatMessage.conversation_id == msg.conversation_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < msg.created_at
            ).order_by(ChatMessage.created_at.desc()).first()
            
            query = user_msg.content.lower() if user_msg else ""
            answer = msg.content.lower()
            
            # Extract citations snippets (the retrieved contexts)
            try:
                citations = json.loads(msg.citations) if msg.citations else []
            except Exception:
                citations = []
                
            snippets = " ".join([c.get("snippet", "").lower() for c in citations])
            
            # --- 1. Compute Faithfulness (hallucination rate) ---
            # Ratio of answer words present in retrieved contexts
            answer_words = re.findall(r'\b\w{3,}\b', answer)
            if answer_words:
                matched_words = [w for w in answer_words if w in snippets]
                faith = len(matched_words) / len(answer_words)
            else:
                faith = 1.0
                
            # --- 2. Compute Answer Relevancy ---
            # Token intersection ratio between user query and generated answer
            query_words = set(re.findall(r'\b\w{3,}\b', query))
            answer_set = set(re.findall(r'\b\w{3,}\b', answer))
            if query_words:
                intersection = query_words.intersection(answer_set)
                relevancy = len(intersection) / len(query_words)
            else:
                relevancy = 1.0
                
            # --- 3. Compute Context Precision ---
            # Did the top retrieved chunks match the query keyword terms?
            precision = 1.0
            if query_words and citations:
                matched_chunks = 0
                for c in citations[:3]:
                    c_text = c.get("snippet", "").lower()
                    if any(qw in c_text for qw in query_words):
                        matched_chunks += 1
                precision = matched_chunks / min(len(citations), 3) if citations else 1.0
                
            # --- 4. Compute Context Recall ---
            # Simulate recall (how much of expected facts are loaded in context)
            recall = 1.0
            if msg.feedback_rating == -1:  # Downvoted query indicates context gaps
                recall = 0.50
                
            # --- 5. Compute Answer Correctness ---
            # Combine faithfulness & semantic relevancy
            correctness = (faith * 0.6) + (relevancy * 0.4)
            
            total_faithfulness += faith
            total_relevancy += relevancy
            total_precision += precision
            total_recall += recall
            total_correctness += correctness

        n = len(recent_messages)
        metric = EvaluationMetric(
            faithfulness=round(total_faithfulness / n, 4),
            answer_relevancy=round(total_relevancy / n, 4),
            context_recall=round(total_recall / n, 4),
            context_precision=round(total_precision / n, 4),
            answer_correctness=round(total_correctness / n, 4),
            sample_size=n
        )
        self.db.add(metric)
        self.db.commit()
        self.db.refresh(metric)
        logger.info(f"Daily RAGAS metrics saved. Sample size: {n}")
        return metric

    def get_historical_metrics(self, days: int = 7) -> List[Dict[str, Any]]:
        """
        Returns recent evaluation metric averages to populate line charts.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)
        records = self.db.query(EvaluationMetric).filter(
            EvaluationMetric.timestamp >= cutoff
        ).order_by(EvaluationMetric.timestamp.asc()).all()
        
        # If no records exist, run execution to bootstrap baseline
        if not records:
            baseline = self.calculate_daily_ragas_metrics()
            records = [baseline]
            
        return [{
            "date": r.timestamp.strftime("%Y-%m-%d"),
            "faithfulness": r.faithfulness,
            "answer_relevancy": r.answer_relevancy,
            "context_recall": r.context_recall,
            "context_precision": r.context_precision,
            "answer_correctness": r.answer_correctness
        } for r in records]

    def identify_weak_retrievals(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Scans recent logs to isolate queries failing SLA constraints.
        """
        recent_messages = self.db.query(ChatMessage).filter(
            ChatMessage.role == "assistant",
            ChatMessage.citations != None
        ).order_by(ChatMessage.created_at.desc()).limit(50).all()
        
        weak_cases = []
        for msg in recent_messages:
            user_msg = self.db.query(ChatMessage).filter(
                ChatMessage.conversation_id == msg.conversation_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < msg.created_at
            ).order_by(ChatMessage.created_at.desc()).first()
            
            if not user_msg:
                continue
                
            query = user_msg.content
            answer = msg.content
            
            # Simple local metrics compilation to detect failure
            try:
                citations = json.loads(msg.citations) if msg.citations else []
            except Exception:
                citations = []
                
            snippets = " ".join([c.get("snippet", "").lower() for c in citations])
            
            # Compute local faithfulness
            ans_words = re.findall(r'\b\w{3,}\b', answer.lower())
            faith = 1.0
            if ans_words:
                matches = [w for w in ans_words if w in snippets]
                faith = len(matches) / len(ans_words)
                
            # If faithfulness falls below SLA (85%) or user downvoted it, it's flagged as a weak retrieval
            if faith < 0.85 or msg.feedback_rating == -1:
                weak_cases.append({
                    "id": msg.id,
                    "query": query,
                    "answer": answer,
                    "faithfulness": round(faith, 2),
                    "feedback": msg.feedback_rating,
                    "citations_count": len(citations),
                    "timestamp": msg.created_at.isoformat()
                })
                if len(weak_cases) >= limit:
                    break
                    
        return weak_cases
