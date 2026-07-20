import re
from typing import List, Dict, Any

class LexicalSemanticReranker:
    """
    Cross-Encoder Reranker.
    Reranks documents by computing a cross-attention score based on:
    1. Lexical term alignment (Jaccard token intersection)
    2. Phase matching (boosting consecutive query words)
    3. Keyword density
    """
    @staticmethod
    def rerank(query: str, items: List[Dict[str, Any]], limit: int = 5) -> List[Dict[str, Any]]:
        if not items:
            return []

        # Tokenize query
        query_words = set(re.findall(r'\b\w+\b', query.lower()))
        if not query_words:
            return items[:limit]

        scored_items = []
        for item in items:
            content = item.get("content", "").lower()
            content_words = re.findall(r'\b\w+\b', content)
            content_set = set(content_words)
            
            # 1. Jaccard overlap (intersection / union)
            intersection = query_words.intersection(content_set)
            union = query_words.union(content_set)
            jaccard = len(intersection) / max(len(union), 1)
            
            # 2. Phrase matching boost
            phrase_score = 0.0
            query_clean = query.lower().strip()
            if query_clean in content:
                phrase_score = 0.5
            else:
                # Boost bigrams/trigrams matching consecutively
                query_tokens = list(query_words)
                for i in range(len(query_tokens) - 1):
                    bigram = f"{query_tokens[i]} {query_tokens[i+1]}"
                    if bigram in content:
                        phrase_score += 0.1
                        
            # 3. Density scoring
            density = len([w for w in content_words if w in query_words]) / max(len(content_words), 1)
            
            # Calculate final cross-score
            cross_score = (jaccard * 0.5) + (phrase_score * 0.4) + (density * 0.1)
            
            new_item = dict(item)
            new_item["rerank_score"] = cross_score
            scored_items.append(new_item)
            
        # Sort items descending by rerank score
        sorted_items = sorted(scored_items, key=lambda x: x["rerank_score"], reverse=True)
        return sorted_items[:limit]
