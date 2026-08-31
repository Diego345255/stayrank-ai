"""A small, dependency-free TF-IDF + cosine similarity engine.

This gives the search endpoint genuine semantic ranking (matching a free-text
prompt against each hotel's neighborhood description, tags, strengths, risk,
and evidence text) without pulling in a heavyweight ML stack or requiring an
external LLM API key. It is a real vector-space ranking model, just a small
one, which keeps the backend fast to start and easy to run anywhere.
"""

import math
import re
from collections import Counter

# Found via auditing nlp.py's negation fixes for the same bug class here:
# "not" was in this stopword list, meaning it got stripped from EVERY
# document before vectorizing - "not quiet" and "quiet" tokenized to the
# exact same bag of words, so a traveler explicitly avoiding something
# scored just as similar to hotels emphasizing it as a traveler seeking
# it out. This bag-of-words model has no real concept of negation scope
# either way (removing "not" from the stopword list doesn't make it
# understand that "not" attaches specifically to "quiet" two words later -
# that needs real NLP this dependency-free engine doesn't have), but
# actively discarding the one token that at least signals "something here
# is being negated" was strictly worse than keeping it. Keeping it can
# only reduce a false-positive similarity, never invert a true one, so
# there's no real downside to no longer throwing it away.
STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "to", "of", "in", "on", "at", "for", "with", "and", "or", "but",
    "this", "that", "these", "those", "it", "its", "as", "by", "from",
    "i", "my", "me", "we", "our", "you", "your", "want", "looking", "look",
    "hotel", "hotels", "night", "nights", "stay", "staying", "trip", "going",
    "am", "im", "have", "has", "will", "would", "like", "need", "needs",
}

TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    tokens = TOKEN_RE.findall((text or "").lower())
    return [token for token in tokens if token not in STOPWORDS and len(token) > 1]


def hotel_document(hotel: dict, neighborhood_description: str) -> str:
    parts = [
        neighborhood_description or "",
        " ".join(hotel.get("tags", [])),
        " ".join(hotel.get("strengths", [])),
        " ".join(hotel.get("amenities", [])),
        hotel.get("risk", "") or "",
        hotel.get("evidence", "") or "",
        hotel.get("name", "") or "",
        " ".join(review.get("comment", "") for review in hotel.get("reviews", [])),
    ]
    return " ".join(parts)


class TfidfIndex:
    """Fits a TF-IDF vector space over a small corpus of hotel documents."""

    def __init__(self, documents: dict[int, str]):
        self.doc_tokens: dict[int, list[str]] = {
            hotel_id: tokenize(doc) for hotel_id, doc in documents.items()
        }

        doc_count = len(self.doc_tokens) or 1
        doc_freq: Counter[str] = Counter()
        for tokens in self.doc_tokens.values():
            doc_freq.update(set(tokens))

        self.idf: dict[str, float] = {
            term: math.log((1 + doc_count) / (1 + freq)) + 1.0
            for term, freq in doc_freq.items()
        }

        self.doc_vectors: dict[int, dict[str, float]] = {
            hotel_id: self._vectorize(tokens)
            for hotel_id, tokens in self.doc_tokens.items()
        }

    def _vectorize(self, tokens: list[str]) -> dict[str, float]:
        if not tokens:
            return {}
        term_freq = Counter(tokens)
        max_freq = max(term_freq.values())
        vector = {
            term: (0.5 + 0.5 * (count / max_freq)) * self.idf.get(term, 0.0)
            for term, count in term_freq.items()
        }
        norm = math.sqrt(sum(value * value for value in vector.values())) or 1.0
        return {term: value / norm for term, value in vector.items()}

    def score(self, query_text: str) -> dict[int, float]:
        """Returns cosine similarity (0-1) between the query and every document.

        Both `query_vector` and each `doc_vector` are already L2-normalized by
        `_vectorize`, so their dot product directly is the cosine similarity.
        """
        query_vector = self._vectorize(tokenize(query_text))
        if not query_vector:
            return {hotel_id: 0.0 for hotel_id in self.doc_vectors}

        scores = {}
        for hotel_id, doc_vector in self.doc_vectors.items():
            if not doc_vector:
                scores[hotel_id] = 0.0
                continue
            dot = sum(weight * doc_vector.get(term, 0.0) for term, weight in query_vector.items())
            scores[hotel_id] = max(0.0, min(1.0, dot))
        return scores
