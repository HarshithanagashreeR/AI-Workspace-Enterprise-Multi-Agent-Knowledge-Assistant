import math
import re
from typing import List

class BM25:
    """
    Pure Python BM25 Lexical Retriever.
    Leverages the standard Okapi BM25 formulation for term frequency ranking.
    """
    def __init__(self, corpus: List[str], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus_size = len(corpus)
        
        # Simple regex tokenization (lowercase, strip special chars)
        self.tokenized_corpus = [self._tokenize(doc) for doc in corpus]
        self.doc_lengths = [len(doc) for doc in self.tokenized_corpus]
        self.avg_doc_len = sum(self.doc_lengths) / max(self.corpus_size, 1)
        
        self.doc_freqs = []
        self.idf = {}
        
        # Calculate term frequencies inside each document
        df = {}
        for doc in self.tokenized_corpus:
            doc_freq = {}
            for token in doc:
                doc_freq[token] = doc_freq.get(token, 0) + 1
            self.doc_freqs.append(doc_freq)
            
            # Record frequencies of terms across the entire corpus for IDF
            for token in set(doc):
                df[token] = df.get(token, 0) + 1
                
        # Calculate Inverse Document Frequency (IDF)
        for token, freq in df.items():
            # Standard Okapi BM25 IDF equation
            self.idf[token] = math.log((self.corpus_size - freq + 0.5) / (freq + 0.5) + 1.0)

    def _tokenize(self, text: str) -> List[str]:
        # Lowercase and split into alphanumeric words
        return re.findall(r'\b\w+\b', text.lower())

    def get_scores(self, query: str) -> List[float]:
        query_tokens = self._tokenize(query)
        scores = []
        
        for idx in range(self.corpus_size):
            score = 0.0
            doc_len = self.doc_lengths[idx]
            freq_dict = self.doc_freqs[idx]
            
            for token in query_tokens:
                if token in freq_dict:
                    tf = freq_dict[token]
                    idf = self.idf.get(token, 0.0)
                    # Okapi BM25 formula
                    numerator = idf * tf * (self.k1 + 1.0)
                    denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
                    score += numerator / denominator
            scores.append(score)
            
        return scores
