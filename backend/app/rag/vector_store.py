import chromadb
import logging
from typing import List, Dict, Any, Optional
from app.config.config import settings
from app.agents.state import is_mock_mode
import uuid

logger = logging.getLogger("app.vector_store")

class VectorStoreWrapper:
    _client = None
    _collection = None

    def __init__(self):
        if VectorStoreWrapper._client is None:
            VectorStoreWrapper._client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIRECTORY)
            VectorStoreWrapper._collection = VectorStoreWrapper._client.get_or_create_collection("enterprise_knowledge_base")
        
        self.client = VectorStoreWrapper._client
        self.collection = VectorStoreWrapper._collection
        self._embeddings = None

    @property
    def embeddings(self):
        if self._embeddings is None:
            # Lazy initialize embeddings to avoid errors on startup if API key is not yet set
            from langchain_openai import OpenAIEmbeddings
            self._embeddings = OpenAIEmbeddings(openai_api_key=settings.OPENAI_API_KEY)
        return self._embeddings

    def add_document_chunks(self, chunks: List[Any], document_id: int, filename: str, owner_id: int) -> int:
        """
        Embeds chunks of text and adds them to ChromaDB.
        Supports both raw strings and dictionary-structured chunks.
        Returns the number of chunks added.
        """
        if not chunks:
            return 0
            
        is_mock = is_mock_mode()

        text_list = []
        metadatas = []
        
        for i, chunk in enumerate(chunks):
            if isinstance(chunk, dict):
                text_content = chunk["text"]
                chunk_meta = chunk.get("metadata", {})
            else:
                text_content = chunk
                chunk_meta = {}
                
            text_list.append(text_content)
            
            # Combine standard metadata with chunk-specific metadata
            meta = {
                "document_id": document_id,
                "filename": filename,
                "owner_id": owner_id,
                "chunk_index": i
            }
            meta.update(chunk_meta)
            metadatas.append(meta)

        try:
            if is_mock:
                raise ValueError("Using mock key")
            embeddings = self.embeddings.embed_documents(text_list)
        except Exception as e:
            logger.warning(f"Embedding failed (falling back to mock embeddings): {e}")
            # Generate dummy 1536-dim vectors
            embeddings = [[0.01 * (i % 100) for i in range(1536)] for _ in text_list]
        
        ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(text_list))]
        
        self.collection.add(
            embeddings=embeddings,
            documents=text_list,
            metadatas=metadatas,
            ids=ids
        )
        return len(text_list)

    def delete_document_chunks(self, document_id: int):
        """
        Deletes all vector store records for a specific document ID.
        """
        # In ChromaDB, metadata filters use the dictionary structure
        self.collection.delete(where={"document_id": document_id})

    def semantic_search(self, query: str, limit: int = 5, owner_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Performs semantic search over embedded chunks.
        """
        is_mock = is_mock_mode()

        try:
            if is_mock:
                raise ValueError("Using mock key")
            query_embedding = self.embeddings.embed_query(query)
        except Exception as e:
            logger.warning(f"Query embedding failed (falling back to mock embedding): {e}")
            query_embedding = [0.0] * 1536
        
        # Build filter
        where_filter = {}
        if owner_id is not None:
            where_filter = {"owner_id": owner_id}
            
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            where=where_filter if where_filter else None
        )
        
        formatted_results = []
        if results and results["documents"]:
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results["distances"][0]
            ids = results["ids"][0]
            
            for doc, meta, dist, id_ in zip(docs, metas, distances, ids):
                similarity = 1.0 / (1.0 + dist)
                # Map to parent text context dynamically
                content_text = meta.get("parent_chunk_text", doc) if meta else doc
                formatted_results.append({
                    "id": id_,
                    "content": content_text,
                    "metadata": meta,
                    "score": similarity
                })
        return formatted_results

    def hybrid_search(self, query: str, limit: int = 5, owner_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Performs Hybrid Search using Reciprocal Rank Fusion (RRF) on:
        1. Semantic vector search
        2. Okapi BM25 Lexical search (calculated locally on-the-fly)
        3. Cross-Encoder reranking
        """
        # 1. Semantic Vector Search
        semantic_results = self.semantic_search(query, limit=limit * 3, owner_id=owner_id)
        
        # 2. Okapi BM25 Lexical Keyword Search
        keyword_results = []
        try:
            where_filter = {}
            if owner_id is not None:
                where_filter = {"owner_id": owner_id}
                
            # Fetch all matching owner chunks
            all_chunks = self.collection.get(
                where=where_filter if where_filter else None,
                include=["documents", "metadatas"]
            )
            
            docs = all_chunks.get("documents", [])
            ids = all_chunks.get("ids", [])
            metas = all_chunks.get("metadatas", [])
            
            if docs:
                from app.rag.bm25 import BM25
                bm25 = BM25(docs)
                scores = bm25.get_scores(query)
                
                ranked_pairs = sorted(
                    [(score, idx) for idx, score in enumerate(scores) if score > 0.0],
                    key=lambda x: x[0],
                    reverse=True
                )[:limit * 3]
                
                for score, idx in ranked_pairs:
                    meta = metas[idx]
                    # Map to parent text context dynamically
                    content_text = meta.get("parent_chunk_text", docs[idx]) if meta else docs[idx]
                    keyword_results.append({
                        "id": ids[idx],
                        "content": content_text,
                        "metadata": meta,
                        "score": score
                    })
        except Exception as e:
            logger.warning(f"BM25 lexical search failed, falling back to empty keyword branch. Error: {e}")
            
        # 3. Reciprocal Rank Fusion (RRF)
        rrf_scores = {}
        doc_details = {}
        
        def apply_rrf(results_list):
            for rank, item in enumerate(results_list):
                doc_id = item["id"]
                doc_details[doc_id] = item
                if doc_id not in rrf_scores:
                    rrf_scores[doc_id] = 0.0
                rrf_scores[doc_id] += 1.0 / (60.0 + (rank + 1))
                
        apply_rrf(semantic_results)
        apply_rrf(keyword_results)
        
        # Sort and select top candidates for reranking
        sorted_docs = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:limit * 2]
        
        merged_results = []
        for doc_id, rrf_score in sorted_docs:
            original_item = doc_details[doc_id]
            original_item["fused_score"] = rrf_score
            merged_results.append(original_item)
            
        # 4. Apply Cross-Encoder Reranking
        from app.rag.reranker import LexicalSemanticReranker
        reranked_results = LexicalSemanticReranker.rerank(query, merged_results, limit=limit)
        return reranked_results
