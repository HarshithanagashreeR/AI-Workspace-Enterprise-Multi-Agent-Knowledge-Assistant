import logging
import re
from collections import Counter
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.chat import ChatMessage, ChatConversation

logger = logging.getLogger("app.services.feedback_analyzer")

class FeedbackAnalyzer:
    def __init__(self, db: Session):
        self.db = db

    def analyze_negative_feedback(self) -> Dict[str, Any]:
        """
        Gathers downvoted queries, extracts common themes, and recommends 
        prompt/retrieval optimizations.
        """
        # Fetch downvoted messages
        downvoted = self.db.query(ChatMessage).filter(
            ChatMessage.feedback_rating == -1
        ).order_by(ChatMessage.created_at.desc()).all()
        
        failed_count = len(downvoted)
        
        # Default response if no downvotes exist
        if not downvoted:
            return {
                "failed_count": 0,
                "common_themes": [],
                "recommendations": [
                    "System performance looks optimal. No downvotes registered.",
                    "Recommendation: Continue monitoring chat logs and maintain current prompts."
                ],
                "frequent_questions": []
            }

        # Extract words from corresponding user queries
        query_texts = []
        user_queries = []
        
        for msg in downvoted:
            user_msg = self.db.query(ChatMessage).filter(
                ChatMessage.conversation_id == msg.conversation_id,
                ChatMessage.role == "user",
                ChatMessage.created_at < msg.created_at
            ).order_by(ChatMessage.created_at.desc()).first()
            
            if user_msg:
                user_queries.append(user_msg.content)
                query_texts.append(user_msg.content.lower())
                
        # Word frequency analyzer
        words_list = []
        stop_words = {"what", "when", "where", "which", "who", "whom", "this", "that", "there", "their", "about", "database", "query", "search"}
        
        for text in query_texts:
            tokens = re.findall(r'\b\w{4,}\b', text)
            words_list.extend([t for t in tokens if t not in stop_words])
            
        counter = Counter(words_list)
        common_themes = [item[0] for item in counter.most_common(4)]
        
        # Compile automatic optimizations recommendations
        recommendations = []
        if "postgresql" in common_themes or "pool" in common_themes:
            recommendations.append("High failure rate on database connection pool questions. Suggestion: Update the Reasoning Agent prompt to emphasize PostgreSQL pooling limits.")
        if "aws" in common_themes or "secret" in common_themes:
            recommendations.append("Multiple failures regarding security secrets rotation policies. Suggestion: Increase ChromaDB retrieval chunk count to prevent contextual cutting.")
        if "langgraph" in common_themes or "agent" in common_themes:
            recommendations.append("Failures in multi-agent orchestration queries. Suggestion: Add structured examples of LangGraph state routing inside the Planner Agent system prompt.")
            
        # Default fallbacks if no specific matches
        if not recommendations:
            recommendations.append(f"Failing queries frequently reference terms: {', '.join(common_themes) if common_themes else 'general topics'}.")
            recommendations.append("Recommendation: Increase chunk overlaps inside processor.py to preserve surrounding context strings.")
            recommendations.append("Recommendation: Refine Reasoning Agent constraints to strictly avoid drafting answers on missing facts.")

        return {
            "failed_count": failed_count,
            "common_themes": common_themes,
            "recommendations": recommendations,
            "frequent_questions": user_queries[:5]  # Top 5 recently failed questions
        }
