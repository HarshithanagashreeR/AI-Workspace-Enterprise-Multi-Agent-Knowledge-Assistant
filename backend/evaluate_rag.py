import os
import sys

# Configure SQLite dev DB paths
os.environ["DATABASE_URL"] = "sqlite:///./local_dev.db"

from app.rag.vector_store import VectorStoreWrapper

# Sample facts for RAG evaluation
FACTS = [
    "Fact A: Sarah Jenkins is a Principal AI Platform Engineer specialized in LangGraph orchestration, residing in Boston, MA.",
    "Fact B: David Miller is a Senior Data Architect with 8 years of experience building secure PostgreSQL database connection pools.",
    "Fact C: Emily Watson is a Cloud security analyst who published a whitepaper on AWS IAM secrets rotating policies in June 2025.",
    "Fact D: The Jupiter RAG processor leverages recursive character splitting with a block size of 750 tokens and an overlap of 150 tokens.",
    "Fact E: Enterprise platform analytics show that cost allocation chart calculations utilize a standard rate of $0.00000015 per input token."
]

def prepare_evaluation_data():
    vs = VectorStoreWrapper()
    
    # Clear existing documents to avoid duplicate indices
    print("Clearing evaluation collection...")
    try:
        existing = vs.collection.get()
        if existing and existing["ids"]:
            vs.collection.delete(ids=existing["ids"])
    except Exception as e:
        print(f"Error clearing: {e}")
    
    print("Indexing evaluation facts...")
    vs.add_document_chunks(
        chunks=FACTS,
        document_id=999,
        filename="eval_facts.txt",
        owner_id=999
    )
    print("Evaluation data ready.")

def evaluate_retrieval() -> dict:
    vs = VectorStoreWrapper()
    
    # Define test queries and expected facts (ground truth)
    test_cases = [
        {
            "query": "Who is specialized in LangGraph orchestration?",
            "expected_fact": FACTS[0] # Fact A
        },
        {
            "query": "Senior Data Architect with 8 years experience building database pools",
            "expected_fact": FACTS[1] # Fact B
        },
        {
            "query": "Who wrote the AWS IAM secrets rotating policies whitepaper in 2025?",
            "expected_fact": FACTS[2] # Fact C
        },
        {
            "query": "What chunk size and overlap does the Jupiter processor use?",
            "expected_fact": FACTS[3] # Fact D
        },
        {
            "query": "How much does an input token cost in cost allocation calculations?",
            "expected_fact": FACTS[4] # Fact E
        }
    ]
    
    hits = 0
    rr_sum = 0.0
    k = 3
    
    print("\n--- Running Retrieval Evaluation @ K=3 ---")
    for idx, case in enumerate(test_cases):
        query = case["query"]
        expected = case["expected_fact"]
        
        # Use hybrid search
        results = vs.hybrid_search(query, limit=k, owner_id=999)
        
        # Calculate Hit Rate and Reciprocal Rank
        found_rank = -1
        for rank, res in enumerate(results):
            if res["content"] == expected:
                found_rank = rank + 1
                break
                
        if found_rank != -1:
            hits += 1
            rr = 1.0 / found_rank
            print(f"Query {idx+1}: SUCCESS (Rank {found_rank}) -> '{query}'")
        else:
            rr = 0.0
            print(f"Query {idx+1}: FAILED -> '{query}'")
            
        rr_sum += rr
        
    total = len(test_cases)
    hit_rate = hits / total
    mrr = rr_sum / total
    
    metrics = {
        "hit_rate": hit_rate,
        "mrr": mrr
    }
    
    print(f"\nEvaluation Results:")
    print(f"  Hit Rate @ {k}: {hit_rate:.2%}")
    print(f"  MRR @ {k}: {mrr:.4f}")
    return metrics

if __name__ == "__main__":
    prepare_evaluation_data()
    evaluate_retrieval()
