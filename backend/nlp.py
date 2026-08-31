"""Rule-based free-text intent extraction.

This parses a traveler's natural-language prompt into:
  - `boosts`: metric -> extra ranking weight, based on keyword hits
  - `found`: stable, English-only reason keys describing what was detected
    (translated to display text by app.js's foundReasonLabels() - never
    rendered directly, so this stays language-agnostic)
  - `dynamic_musts`: metric keys the prompt treats as non-negotiable
    (e.g. "must be quiet", "needs to be near transit")

It intentionally stays dependency-free (no external NLP libraries) so the
backend keeps starting instantly with no model downloads.
"""

# Third tuple element is a stable, English-only REASON KEY - not display
# text. Found via live testing (switched to Spanish, searched "quiet hotel
# near the subway"): the "DETECTED INTENT" line stayed in English no
# matter the selected language, while the scoring-model panel just below
# it translated correctly - because that panel maps a machine key through
# the frontend's own i18n-backed metricLabels(), but this parser was
# baking already-English prose directly into `found` with nothing for the
# frontend to translate. Reason keys get mapped to translated text by
# app.js's foundReasonLabels(), the same pattern metricLabels() already
# uses, keeping all display strings on the frontend where i18n.js lives.
CHECKS = [
    ("quiet", ["quiet", "noise", "sleep", "calm"], "quiet"),
    ("transit", ["subway", "metro", "train", "station", "transport"], "transit"),
    ("cleanliness", ["clean", "hygiene", "spotless"], "cleanliness"),
    ("roomSize", ["large", "big room", "spacious", "not tiny", "space"], "roomSize"),
    ("value", ["budget", "cheap", "value", "under", "affordable"], "value"),
    # Found via live testing: "cheap"/"budget" had a boost, but the opposite
    # intent ("show me luxury options", "I want to splurge") matched nothing
    # at all and silently left rankings unchanged - a traveler asking for
    # nicer hotels got the exact same list as one who asked for nothing.
    # Maps to the existing "cleanliness" metric rather than inventing a new
    # one: real hospitality data consistently ties guest-perceived luxury to
    # upkeep/polish more than any other single scored dimension here, and
    # this app has no separate "prestige" score to ground a new metric in
    # without fabricating one - reusing a metric this app already measures
    # honestly beats adding a metric it can't actually back with real data.
    ("cleanliness", ["luxury", "luxurious", "upscale", "premium", "5-star", "five-star", "high-end", "splurge", "treat myself"], "premium"),
    ("couple", ["girlfriend", "boyfriend", "wife", "husband", "couple", "romantic"], "couple"),
    ("family", ["family", "kids", "children", "parents"], "family"),
    ("wifi", ["remote work", "wifi", "work", "laptop"], "wifi"),
    ("breakfast", ["breakfast", "buffet"], "breakfast"),
    # "nightlife" has been a real, fully-populated per-hotel metric since
    # this app's earliest data (every hotel has a genuine 0-100 score,
    # already used for neighborhood tags and the LLM-backed intent path's
    # "nightlife" weight) - but this rule-based parser, the one that runs
    # whenever LLM_API_KEY isn't configured, never had a keyword check for
    # it. A traveler typing "close to bars and nightlife" with no LLM key
    # set got zero boost toward it, same silent-no-op bug class as the
    # "luxury" gap above, just on a metric this app already tracks well.
    ("nightlife", ["nightlife", "bars", "clubbing", "nightclub", "going out", "party scene"], "nightlife"),
]

# Phrases that signal a mentioned preference is a hard requirement, not a soft boost.
EMPHASIS_PHRASES = [
    "must", "must-have", "must have", "need", "needs to", "needed",
    "required", "require", "requires", "essential", "has to be",
    "have to be", "non-negotiable", "absolutely",
]


# Found via testing the same adversarial prompt that led to the
# proximity fix below: "not too quiet" still boosted the quiet metric as
# a detected *soft* preference (just not a hard must-have) - a traveler
# who explicitly said the opposite still saw "Quiet sleep" listed as
# something their search was tuned toward. Real negation understanding is
# out of scope for a dependency-free substring parser, but "not "/"no "/
# "n't " directly preceding a matched keyword is a narrow, cheap, common
# case worth catching - it doesn't understand "quiet" 20 words earlier
# being un-done by a "not" much later, but it does catch the direct,
# common phrasing this bug report was actually about.
NEGATION_MARKERS = ["not ", "n't ", "no ", "without ", "hardly ", "barely "]
NEGATION_WINDOW_CHARS = 15


def _is_negated(lower_text: str, match_idx: int) -> bool:
    window = lower_text[max(0, match_idx - NEGATION_WINDOW_CHARS) : match_idx]
    return any(marker in window for marker in NEGATION_MARKERS)


def infer_intent(text: str) -> dict:
    lower = (text or "").lower()
    boosts: dict[str, int] = {}
    found: list[str] = []

    for metric, words, reason_key in CHECKS:
        matched = False
        for word in words:
            start = 0
            while True:
                idx = lower.find(word, start)
                if idx == -1:
                    break
                if not _is_negated(lower, idx):
                    matched = True
                    break
                start = idx + len(word)
            if matched:
                break
        if matched:
            boosts[metric] = 8
            found.append(reason_key)

    if "first-time" in lower or "first time" in lower or "first visit" in lower:
        boosts["transit"] = boosts.get("transit", 0) + 4
        found.append("firstTime")

    # De-duplicate while preserving order, matching the original client behavior.
    found = list(dict.fromkeys(found))[:5]

    return {"boosts": boosts, "found": found}


# Found via testing: "not too quiet, but definitely walkable, budget
# doesn't matter much, and breakfast is nice but not essential" promoted
# BOTH quiet and breakfast to hard must-haves - the old check just asked
# "does an emphasis phrase (e.g. "essential") appear ANYWHERE in the whole
# prompt", and if so, promoted every single detected preference, including
# ones nowhere near that phrase. Here "essential" was describing breakfast
# (and even then, negated - "not essential" - a real gap this rewrite
# doesn't fix; true negation detection needs more than substring matching,
# out of scope for a dependency-free parser), but its mere presence
# anywhere in the sentence was enough to also hard-require quiet, which
# the traveler had explicitly said the opposite about. Requiring the
# emphasis phrase to actually appear near the specific keyword it's
# supposed to modify - not just anywhere in a long, multi-clause prompt -
# fixes the cross-contamination even though it doesn't yet fix negation.
EMPHASIS_WINDOW_CHARS = 40


def infer_dynamic_musts(text: str, boosts: dict) -> set[str]:
    """Promote a boosted metric to a hard requirement only when emphatic
    language (e.g. "must", "essential") appears near the words that
    actually triggered that metric (e.g. "quiet is a must"), not merely
    somewhere else in the same prompt.
    """
    lower = (text or "").lower()
    musts: set[str] = set()
    for metric in boosts:
        words = next((w for m, w, _ in CHECKS if m == metric), [])
        for word in words:
            start = 0
            found_nearby = False
            while True:
                idx = lower.find(word, start)
                if idx == -1:
                    break
                window = lower[max(0, idx - EMPHASIS_WINDOW_CHARS) : idx + len(word) + EMPHASIS_WINDOW_CHARS]
                if any(phrase in window for phrase in EMPHASIS_PHRASES):
                    found_nearby = True
                    break
                start = idx + len(word)
            if found_nearby:
                musts.add(metric)
                break
    return musts
