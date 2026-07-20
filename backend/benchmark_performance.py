import os
import time
import sys

# Configure SQLite dev DB paths
os.environ["DATABASE_URL"] = "sqlite:///./local_dev.db"

from app.rag.vector_store import VectorStoreWrapper
from app.database.session import SessionLocal
from app.repositories.chat_repo import ChatRepository

def benchmark_chroma_connections():
    print("--- 1. Benchmarking ChromaDB Connection Latency ---")
    
    # 1. Cold connection (Force clear cache first to measure cold boot)
    VectorStoreWrapper._client = None
    VectorStoreWrapper._collection = None
    
    start_cold = time.perf_counter()
    vs_cold = VectorStoreWrapper()
    end_cold = time.perf_counter()
    cold_duration = (end_cold - start_cold) * 1000.0
    print(f"Cold connection init time: {cold_duration:.2f} ms")
    
    # 2. Warm connection (Hits singleton cache)
    start_warm = time.perf_counter()
    vs_warm = VectorStoreWrapper()
    end_warm = time.perf_counter()
    warm_duration = (end_warm - start_warm) * 1000.0
    print(f"Warm connection (cached singleton) time: {warm_duration:.4f} ms")
    
    improvement = (cold_duration - warm_duration)
    percent = (improvement / cold_duration) * 100.0
    print(f"Connection Latency Improvement: {improvement:.2f} ms ({percent:.2f}% faster)\n")
    return cold_duration, warm_duration

def benchmark_search_query_latency():
    print("--- 2. Benchmarking Search Query Latency ---")
    vs = VectorStoreWrapper()
    
    # Run 5 searches to calculate average search latency
    queries = [
        "LangGraph orchestration",
        "AWS IAM secrets rotating",
        "database connection pools",
        "cost allocation rates",
        "recursive character splitting"
    ]
    
    latencies = []
    for q in queries:
        start = time.perf_counter()
        _ = vs.hybrid_search(q, limit=3, owner_id=999)
        end = time.perf_counter()
        latencies.append((end - start) * 1000.0)
        
    avg_latency = sum(latencies) / len(latencies)
    print(f"Queries evaluated: {len(queries)}")
    for i, lat in enumerate(latencies):
        print(f"  Query {i+1} latency: {lat:.2f} ms")
    print(f"Average hybrid search query execution speed: {avg_latency:.2f} ms\n")
    return avg_latency

def benchmark_database_latency():
    print("--- 3. Benchmarking Database Read Query Latency ---")
    db = SessionLocal()
    chat_repo = ChatRepository(db)
    
    # Measure conversation retrieval speed (using joinedload optimization)
    start = time.perf_counter()
    # Query all active conversations for a user
    _ = chat_repo.get_user_conversations(user_id=999)
    end = time.perf_counter()
    
    duration = (end - start) * 1000.0
    print(f"Database query fetch duration: {duration:.2f} ms\n")
    db.close()
    return duration

if __name__ == "__main__":
    print("====================================================")
    print("      ENTERPRISE PLATFORM PERFORMANCE BENCHMARKS   ")
    print("====================================================\n")
    
    cold, warm = benchmark_chroma_connections()
    search_avg = benchmark_search_query_latency()
    db_time = benchmark_database_latency()
    
    print("====================================================")
    print("                   SUMMARY REPORT                   ")
    print("====================================================")
    print(f"Chroma Client Cold Connection : {cold:.2f} ms")
    print(f"Chroma Client Cache Hit       : {warm:.4f} ms")
    print(f"Average Hybrid Search Speed   : {search_avg:.2f} ms")
    print(f"Database Queries Fetch Speed  : {db_time:.2f} ms")
    print("====================================================")
