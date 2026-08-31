"""Scoring, confidence, must-have filtering, and neighborhood aggregation.

Ported from the original client-side ranking engine so the backend is now
the single source of truth for how hotels are scored and ranked.

get_search_intent / get_match_reasons are the LLM-backed upgrade path: each
tries backend/llm_engine.py first (if LLM_API_KEY is configured), and on
ANY failure (unconfigured, auth, rate limit, timeout, malformed response)
logs a warning and falls back seamlessly to the pure rule-based pipeline in
backend/nlp.py - a search never fails because the LLM is unavailable.
"""

import logging
import time

from backend import config, llm_engine, nlp

logger = logging.getLogger("stayrank.ranking")

# LLM intent_weights keys -> our internal metric keys (most map 1:1). Also
# doubles as the reason-key normalization for `found` (see get_search_intent
# below), so the LLM path and the rule-based fallback in nlp.py emit reason
# keys from the same vocabulary for app.js's foundReasonLabels() to translate.
LLM_METRIC_TO_INTERNAL = {"budget": "value", "space": "roomSize"}

# Max weight boost for an intent_weights score of 1.0 - comparable in scale
# to the rule-based parser's flat +8 keyword boost, but continuous (0-18)
# rather than all-or-nothing, since the LLM gives a confident 0.0-1.0 signal.
LLM_WEIGHT_BOOST_SCALE = 18
LLM_FOUND_THRESHOLD = 0.35

DEFAULT_WEIGHTS = {
    "quiet": 20,
    "cleanliness": 18,
    "transit": 18,
    "roomSize": 12,
    "value": 14,
    "couple": 8,
    "family": 4,
    "breakfast": 3,
    "wifi": 3,
}

MUST_HAVE_META = {
    "quiet": {"metric": "quiet", "threshold": 70},
    "transit": {"metric": "transit", "threshold": 80},
    "space": {"metric": "roomSize", "threshold": 75},
    "family": {"metric": "family", "threshold": 70},
    "breakfast": {"metric": "breakfast", "threshold": 70},
    "wifi": {"metric": "wifi", "threshold": 80},
}

# Maps a metric key (used in weights/boosts) to the must-have checkbox key,
# used when a dynamically detected "must" (e.g. "quiet is essential") needs
# to be checked against MUST_HAVE_META, which is keyed by checkbox id.
METRIC_TO_MUST_KEY = {
    "quiet": "quiet",
    "transit": "transit",
    "roomSize": "space",
    "family": "family",
    "breakfast": "breakfast",
    "wifi": "wifi",
}


def compute_effective_weights(custom_weights: dict, boosts: dict, persona: str) -> dict:
    weights = {**DEFAULT_WEIGHTS, **(custom_weights or {})}

    for key, boost in boosts.items():
        weights[key] = weights.get(key, 0) + boost

    if persona == "couple":
        weights["couple"] = weights.get("couple", 0) + 10
    elif persona == "family":
        weights["family"] = weights.get("family", 0) + 12
    elif persona == "business":
        weights["wifi"] = weights.get("wifi", 0) + 8
        weights["transit"] = weights.get("transit", 0) + 4
    elif persona == "first-time":
        weights["transit"] = weights.get("transit", 0) + 8

    return weights


def score_hotel(hotel: dict, weights: dict, budget: float, boosts: dict, semantic_score: float) -> int:
    """semantic_score is a 0-1 cosine similarity from the vector index."""
    metrics = hotel["metrics"]
    weighted_total = sum((metrics.get(key, 0)) * weight for key, weight in weights.items())
    weight_sum = sum(weights.values()) or 1
    metric_score = weighted_total / weight_sum

    # Blend the structured metric score with the free-text semantic match,
    # so wording in the prompt (not just detected keywords) can move the ranking.
    score = metric_score * 0.8 + (semantic_score * 100) * 0.2

    if hotel["price"] > budget:
        score -= min(24, ((hotel["price"] - budget) / budget) * 60)
    else:
        score += min(8, ((budget - hotel["price"]) / budget) * 12)

    if boosts.get("quiet") and metrics.get("nightlife", 0) > 70:
        score -= 10
    if boosts.get("roomSize") and metrics.get("roomSize", 0) < 65:
        score -= 6

    return max(1, min(99, round(score)))


def compute_confidence(hotel: dict, boosts: dict, budget: float, semantic_score: float) -> int:
    metrics = hotel["metrics"]
    rating_score = (hotel["rating"] / 5) * 100

    if boosts:
        intent_score = sum(metrics.get(key, 0) for key in boosts) / len(boosts)
    else:
        values = list(metrics.values())
        intent_score = sum(values) / len(values)

    budget_fit = 100 - min(100, (abs(hotel["price"] - budget) / budget) * 100)
    semantic_component = semantic_score * 100

    confidence = rating_score * 0.3 + intent_score * 0.4 + budget_fit * 0.15 + semantic_component * 0.15
    return max(30, min(99, round(confidence)))


def passes_must_haves(hotel: dict, musts: set) -> bool:
    for must in musts:
        meta = MUST_HAVE_META.get(must)
        if not meta:
            continue
        if hotel["metrics"].get(meta["metric"], 0) < meta["threshold"]:
            return False
    return True


def resolve_dynamic_musts(dynamic_metric_musts: set) -> set:
    """Translate metric keys (e.g. "roomSize") detected from prompt emphasis
    into must-have checkbox keys (e.g. "space") that MUST_HAVE_META understands.
    """
    return {
        METRIC_TO_MUST_KEY[metric]
        for metric in dynamic_metric_musts
        if metric in METRIC_TO_MUST_KEY
    }


# Real Hotelbeds facility labels (see hotelbeds.py's _FACILITY_LABELS,
# hand-verified against their /types/facilities master data) that
# genuinely indicate an accessibility feature. Researched competitor
# accessibility UX (Handiscover, Sociability) which flags a real industry
# problem: vague "accessible" labels vs. specific filterable criteria, and
# the risk of assuming "not reported" means "not accessible" when a
# property simply never reported that facility. This filter follows that
# caution - it only ever INCLUDES a hotel with a real, positively-reported
# accessibility facility; it never excludes one for lacking data, since
# missing data is not evidence of inaccessibility.
ACCESSIBLE_AMENITY_LABELS = {
    "Wheelchair accessible",
    "Accessible rooms",
    "Disability-friendly bathroom",
    "Universal accessibility",
}


def passes_accessible_filter(hotel: dict) -> bool:
    return any(label in hotel.get("amenities", []) for label in ACCESSIBLE_AMENITY_LABELS)


# Researched trend: pet-friendly is reportedly the 5th most popular search
# filter on Hilton.com, and the pet-friendly hotel market is growing at a
# ~12% CAGR - genuine, current traveler demand, not a niche edge case.
# Same honesty pattern as ACCESSIBLE_AMENITY_LABELS above: only ever
# INCLUDES a hotel with a real, positively-reported "pets allowed"
# facility (Hotelbeds facility codes 535/540 under group 70, already
# verified and flowing into hotel["amenities"] via hotelbeds.py's
# _FACILITY_LABELS/_real_amenities - this filter adds no new data source,
# just a gate on data already fetched and already shown as an amenity
# tag). Never excludes a hotel for lacking data, since a property simply
# not reporting a pet policy isn't evidence it bans pets.
PET_FRIENDLY_AMENITY_LABELS = {
    "Pets allowed",
}


def passes_pet_friendly_filter(hotel: dict) -> bool:
    return any(label in hotel.get("amenities", []) for label in PET_FRIENDLY_AMENITY_LABELS)


def passes_tag_filter(hotel: dict, tag_filter: str) -> bool:
    if tag_filter == "all":
        return True
    if tag_filter == "space":
        return hotel["metrics"].get("roomSize", 0) >= 75
    if tag_filter == "cancellation":
        return "Free cancellation" in hotel.get("amenities", [])
    if tag_filter == "deals":
        return bool(hotel.get("originalPrice")) and hotel["originalPrice"] > hotel["price"]
    return tag_filter in hotel.get("tags", [])


def build_neighborhood_insights(hotels: list[dict]) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for hotel in hotels:
        groups.setdefault(hotel["neighborhood"], []).append(hotel)

    def avg(items: list[dict], key: str) -> int:
        return round(sum(item["metrics"][key] for item in items) / len(items))

    rows = []
    for neighborhood, items in groups.items():
        quiet = avg(items, "quiet")
        transit = avg(items, "transit")
        nightlife = avg(items, "nightlife")
        value = avg(items, "value")

        vibe = "Balanced, all-purpose area"
        if quiet >= 80 and nightlife <= 40:
            vibe = "Calm, residential feel"
        elif nightlife >= 70:
            vibe = "Lively, high-energy nights"
        elif transit >= 90:
            vibe = "Highly connected transit hub"
        elif value >= 88:
            vibe = "Strong value pocket"

        rows.append({
            "neighborhood": neighborhood,
            "quiet": quiet,
            "transit": transit,
            "nightlife": nightlife,
            "value": value,
            "vibe": vibe,
            "count": len(items),
        })

    rows.sort(key=lambda row: row["quiet"] + row["transit"], reverse=True)
    return rows


def compute_price_insights(hotels: list[dict]) -> dict[int, dict]:
    """Price-vs-market comparison, inspired by Google Hotels' Price Insights
    - deliberately only the "market comparison" component, not the
    "when to book" historical price-trend one (that needs real price-history
    data this app doesn't have, same reasoning behind flights.py's estimate
    -only approach). Compares each hotel's price only against OTHER hotels
    in the same city sharing the same rounded star rating, using data
    already fetched for this search - no new calls, no invented numbers.
    Returns {hotel_id: {comparisonPercent, label}}, omitting hotels whose
    star tier doesn't have enough peers in this city for a meaningful average.
    """
    by_star: dict[float, list[dict]] = {}
    for hotel in hotels:
        star = hotel.get("starRating")
        if star is None or hotel.get("price") is None:
            continue
        by_star.setdefault(star, []).append(hotel)

    insights: dict[int, dict] = {}
    for star, group in by_star.items():
        if len(group) < 3:
            continue  # Too few same-tier hotels in this city for a fair average.
        avg_price = sum(h["price"] for h in group) / len(group)
        for hotel in group:
            diff_percent = round((hotel["price"] - avg_price) / avg_price * 100)
            star_label = f"{star:.0f}-star" if star == int(star) else f"{star}-star"
            if diff_percent <= -10:
                label = f"{abs(diff_percent)}% below average for {star_label} hotels here"
            elif diff_percent >= 10:
                label = f"{diff_percent}% above average for {star_label} hotels here"
            else:
                label = f"Typical price for {star_label} hotels here"
            insights[hotel["id"]] = {"comparisonPercent": diff_percent, "label": label}
    return insights


# A search should feel instant, not like it's waiting on a network call -
# but reasoning-capable models (see llm_engine.py's max_tokens comment)
# spend real time on an internal "thinking" pass before answering, and
# measured live against this app's own configured LLM, a single intent-parse
# call took 9.7 seconds end to end. That's not a rare tail case worth a
# generous timeout; it's the normal case for this class of model, and it
# was the entire reason typing a search prompt felt stuck. Both LLM calls
# in this file are capped short and fall back to the free, instant
# rule-based/no-op path on timeout - reusing the exact same LLMError catch
# already here for auth/rate-limit/malformed-response failures, since a
# timeout is just one more way this optional enrichment can fail. Worst
# case (LLM configured but consistently slower than the cap) a search now
# takes roughly 2-2.5s instead of 9-10+ - httpx's ReadTimeout on this
# specific host measured consistently ~2s even with this constant set as
# low as 0.6, so pushing the constant far below ~1s buys nothing further
# and just shrinks the window a genuinely-fast LLM response would have had
# to land in; 1.2s was the better tradeoff, confirmed by direct
# measurement, not assumption. Best case (a fast LLM) it still gets used.
SEARCH_INTENT_LLM_TIMEOUT = 1.2
MATCH_REASON_LLM_TIMEOUT = 1.2

# Long-documented gap (see README's "Next production steps"), built now:
# every search re-ran intent parsing from scratch even for a prompt
# identical to one just parsed seconds ago - e.g. a traveler tweaking the
# budget slider or rating filter re-triggers a full search on the exact
# same prompt text, which had no reason to pay the LLM round-trip (or its
# own timeout, on a bad day) a second time for an answer that can't have
# changed. Keyed on normalized prompt text, not on anything search-specific
# (city, budget, weights), since intent parsing only ever looks at the
# prompt itself. A short TTL (not permanent) is deliberate: a permanent
# cache would freeze in a rule-based fallback forever the moment the LLM
# has one bad response, even after it recovers - this way a stale answer
# gets a real chance to refresh periodically instead of a manual
# `existing["source"]`-style cache-clear ever being needed.
_INTENT_CACHE_MAX_ENTRIES = 200
_INTENT_CACHE_TTL_SECONDS = 15 * 60
_intent_cache: dict[str, tuple[float, dict]] = {}


def _intent_cache_key(prompt: str) -> str:
    return (prompt or "").strip().lower()


def _get_cached_intent(cache_key: str) -> dict | None:
    entry = _intent_cache.get(cache_key)
    if not entry:
        return None
    cached_at, result = entry
    if time.monotonic() - cached_at > _INTENT_CACHE_TTL_SECONDS:
        del _intent_cache[cache_key]
        return None
    # dynamicMusts is a set - callers only ever read it via non-mutating
    # set ops (main.py does `set(...) | intent["dynamicMusts"]`), but
    # handing back a fresh copy costs nothing and closes off any future
    # caller accidentally mutating a value every other cache hit shares.
    return {**result, "dynamicMusts": set(result["dynamicMusts"])}


def _store_cached_intent(cache_key: str, result: dict) -> None:
    if not cache_key:
        return  # an empty prompt isn't worth caching or keying on
    if cache_key not in _intent_cache and len(_intent_cache) >= _INTENT_CACHE_MAX_ENTRIES:
        _intent_cache.pop(next(iter(_intent_cache)))  # evict oldest (dict preserves insertion order)
    _intent_cache[cache_key] = (time.monotonic(), result)


async def get_search_intent(prompt: str) -> dict:
    """Returns {"boosts", "found", "dynamicMusts", "summaryVibe", "usedLlm"}.

    Tries the LLM-backed parser first (if configured); on any LLMError
    (including a timeout past SEARCH_INTENT_LLM_TIMEOUT), falls back to the
    rule-based keyword parser in nlp.py. Checks/populates the short-lived
    per-prompt cache above either way, so a repeated prompt is instant
    regardless of which path answered it the first time.
    """
    cache_key = _intent_cache_key(prompt)
    cached = _get_cached_intent(cache_key)
    if cached is not None:
        return cached

    if config.is_llm_configured():
        try:
            llm_result = await llm_engine.parse_intent_with_llm(prompt, timeout=SEARCH_INTENT_LLM_TIMEOUT)
            boosts = {}
            found = []
            for key, weight in llm_result["intent_weights"].items():
                if weight <= 0:
                    continue
                internal_key = LLM_METRIC_TO_INTERNAL.get(key, key)
                boosts[internal_key] = round(weight * LLM_WEIGHT_BOOST_SCALE)
                if weight >= LLM_FOUND_THRESHOLD:
                    # A reason key, not display text - see nlp.py's CHECKS
                    # comment. Normalized through the same internal_key map
                    # so this path and the rule-based fallback below share
                    # one reason-key vocabulary the frontend can translate.
                    found.append(internal_key)

            result = {
                "boosts": boosts,
                "found": found[:5],
                "dynamicMusts": set(llm_result["must_haves"]),
                "summaryVibe": llm_result["summary_vibe"] or None,
                "usedLlm": True,
            }
            _store_cached_intent(cache_key, result)
            return result
        except llm_engine.LLMError as exc:
            logger.warning("LLM intent parsing failed (%s); falling back to rule-based parser.", exc)

    rule_based = nlp.infer_intent(prompt)
    dynamic_metric_musts = nlp.infer_dynamic_musts(prompt, rule_based["boosts"])
    result = {
        "boosts": rule_based["boosts"],
        "found": rule_based["found"],
        "dynamicMusts": resolve_dynamic_musts(dynamic_metric_musts),
        "summaryVibe": None,
        "usedLlm": False,
    }
    _store_cached_intent(cache_key, result)
    return result


async def get_match_reasons(prompt: str, top_hotels: list[dict]) -> dict[int, str]:
    """AI-generated "why this matches" sentences for the top-ranked hotels.
    Returns {} (no callouts shown) if the LLM isn't configured or fails -
    this is a nice-to-have enrichment, never a search-blocking dependency.
    """
    if not config.is_llm_configured() or not top_hotels:
        return {}
    try:
        return await llm_engine.generate_match_reasons(prompt, top_hotels, timeout=MATCH_REASON_LLM_TIMEOUT)
    except llm_engine.LLMError as exc:
        logger.warning("LLM match-reason generation failed (%s); omitting AI match reasons.", exc)
        return {}


def build_scoring_model(weights: dict, boosts: dict) -> list[dict]:
    total = sum(weights.values()) or 1
    ranked = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:6]
    return [
        {
            "metric": key,
            "sharePercent": round((value / total) * 100),
            "boostedByPrompt": key in boosts,
        }
        for key, value in ranked
    ]
