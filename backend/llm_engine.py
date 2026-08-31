"""LLM-backed intent parsing and match-reason generation.

Talks to any OpenAI-compatible chat completions endpoint (OpenAI, DeepSeek,
or a custom-compatible server) via LLM_BASE_URL/LLM_MODEL/LLM_API_KEY in
backend/config.py. Every failure mode (missing key, bad key, rate limit,
timeout, malformed response) raises a typed LLMError subclass so callers
(backend/ranking.py) can catch it and fall back to the rule-based TF-IDF
pipeline without ever failing a user's search.
"""

import json
import re

import httpx

from backend import config

REQUEST_TIMEOUT = 25

KNOWN_METRICS = ["quiet", "transit", "nightlife", "budget", "family", "space", "breakfast", "wifi"]
KNOWN_MUST_HAVES = ["quiet", "transit", "space", "family", "breakfast", "wifi"]

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class LLMError(Exception):
    """Base class for all LLM failures. Callers should catch this and fall back."""


class LLMNotConfigured(LLMError):
    pass


class LLMAuthError(LLMError):
    pass


class LLMRateLimitError(LLMError):
    pass


class LLMTimeoutError(LLMError):
    pass


class LLMNetworkError(LLMError):
    pass


class LLMResponseError(LLMError):
    pass


def _extract_json(content: str) -> dict:
    text = (content or "").strip()
    fence_match = _JSON_FENCE_RE.match(text)
    if fence_match:
        text = fence_match.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseError(f"LLM did not return valid JSON: {exc}") from exc


async def _chat_completion(
    messages: list[dict], *, max_tokens: int, temperature: float, timeout: float = REQUEST_TIMEOUT
) -> str:
    if not config.is_llm_configured():
        raise LLMNotConfigured("LLM_API_KEY is not configured")

    payload = {
        "model": config.LLM_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{config.LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.LLM_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise LLMTimeoutError("LLM request timed out") from exc
    except httpx.RequestError as exc:
        raise LLMNetworkError(f"LLM network error: {exc}") from exc

    if response.status_code in (401, 403):
        raise LLMAuthError(f"LLM API key was rejected ({response.status_code})")
    if response.status_code == 429:
        raise LLMRateLimitError("LLM API rate limit hit (429)")
    if response.status_code >= 400:
        raise LLMError(f"LLM API error {response.status_code}: {response.text[:300]}")

    try:
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMResponseError(f"Unexpected LLM response shape: {exc}") from exc


INTENT_SYSTEM_PROMPT = """You are a travel-intent parser for a hotel ranking engine. Given a traveler's free-text \
request, output STRICT JSON (no markdown, no commentary) with exactly these fields:

{
  "intent_weights": {"quiet": 0.0, "transit": 0.0, "nightlife": 0.0, "budget": 0.0, "family": 0.0, "space": 0.0, "breakfast": 0.0, "wifi": 0.0},
  "must_haves": [],
  "summary_vibe": ""
}

Rules:
- intent_weights: for EACH of the 8 keys above, a float 0.0-1.0 for how much the traveler wants/values that \
quality POSITIVELY (1.0 = extremely important to have). If they dislike or want to avoid something (e.g. \
"hates noisy nightlife"), score that quality LOW (near 0.0) - never invert the meaning by scoring an \
avoided quality highly. Keys not mentioned at all should be 0.0. Do not add keys outside this list.
- must_haves: an array containing ONLY values from this exact set: ["quiet", "transit", "space", "family", \
"breakfast", "wifi"]. Include a value only if the traveler explicitly treats it as a hard, non-negotiable \
requirement, not merely a preference. Usually 0-2 items.
- summary_vibe: one short sentence (under 90 characters) capturing the traveler's trip personality/vibe.
"""


async def parse_intent_with_llm(user_prompt: str, *, timeout: float = REQUEST_TIMEOUT) -> dict:
    content = await _chat_completion(
        [
            {"role": "system", "content": INTENT_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt or "No specific preferences mentioned."},
        ],
        # Generous headroom: reasoning-capable models (e.g. deepseek-v4-flash)
        # spend tokens on an internal "reasoning_content" pass before the
        # actual answer, and max_tokens caps both combined - a tight budget
        # here truncates the real JSON answer, not just the reasoning.
        max_tokens=1200,
        temperature=0.2,
        timeout=timeout,
    )
    parsed = _extract_json(content)

    raw_weights = parsed.get("intent_weights")
    if not isinstance(raw_weights, dict):
        raise LLMResponseError("LLM response missing 'intent_weights' object")

    weights = {}
    for key in KNOWN_METRICS:
        try:
            weights[key] = max(0.0, min(1.0, float(raw_weights.get(key, 0.0))))
        except (TypeError, ValueError):
            weights[key] = 0.0

    raw_musts = parsed.get("must_haves")
    must_haves = [item for item in raw_musts if item in KNOWN_MUST_HAVES] if isinstance(raw_musts, list) else []

    summary_vibe = parsed.get("summary_vibe")
    summary_vibe = summary_vibe.strip()[:160] if isinstance(summary_vibe, str) else ""

    return {"intent_weights": weights, "must_haves": must_haves, "summary_vibe": summary_vibe}


REASON_SYSTEM_PROMPT = """You are a travel concierge writing short "why this matches" explanations. For each \
hotel provided, write exactly ONE sentence (max 25 words) explaining why it fits the traveler's request, \
grounded ONLY in that hotel's listed traits, tags, strengths, or guest review excerpts - never invent facts \
that are not present in the data given. Return STRICT JSON: {"reasons": {"<hotel_id>": "<sentence>", ...}} \
with exactly one entry per hotel id provided.
"""


def _hotel_brief(hotel: dict) -> dict:
    reviews = hotel.get("reviews") or []
    return {
        "id": hotel["id"],
        "name": hotel["name"],
        "neighborhood": hotel.get("neighborhood"),
        "price": hotel.get("price"),
        "rating": hotel.get("rating"),
        "tags": hotel.get("tags", []),
        "strengths": hotel.get("strengths", []),
        "amenities": hotel.get("amenities", []),
        "guest_review_excerpts": [review.get("comment", "")[:200] for review in reviews[:2]],
    }


async def generate_match_reasons(
    user_prompt: str, top_hotels: list[dict], *, timeout: float = REQUEST_TIMEOUT
) -> dict[int, str]:
    if not top_hotels:
        return {}

    briefs = [_hotel_brief(hotel) for hotel in top_hotels[:5]]
    content = await _chat_completion(
        [
            {"role": "system", "content": REASON_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"traveler_request": user_prompt, "hotels": briefs})},
        ],
        # Same reasoning-token headroom as parse_intent_with_llm - 5 hotels'
        # worth of internal reasoning measured well over 1000 tokens before
        # the model even starts the actual JSON answer.
        max_tokens=2500,
        temperature=0.5,
        timeout=timeout,
    )
    parsed = _extract_json(content)
    raw_reasons = parsed.get("reasons")
    if not isinstance(raw_reasons, dict):
        raise LLMResponseError("LLM response missing 'reasons' object")

    valid_ids = {hotel["id"] for hotel in top_hotels}
    reasons: dict[int, str] = {}
    for key, value in raw_reasons.items():
        try:
            hotel_id = int(key)
        except (TypeError, ValueError):
            continue
        if hotel_id in valid_ids and isinstance(value, str) and value.strip():
            reasons[hotel_id] = value.strip()[:280]
    return reasons


COMPARISON_SYSTEM_PROMPT = """You are a travel concierge writing a short, honest comparison paragraph for a \
traveler looking at their shortlisted hotels side by side. You will be given a list of hotels with ONLY real, \
already-verified facts about each (price, star rating, guest rating, neighborhood, amenities, guest-favorite \
status). Write ONE short paragraph (2-4 sentences, under 500 characters total) that highlights the concrete \
TRADE-OFFS between them - e.g. "Hotel A is $40/night cheaper but has fewer amenities; Hotel B has a pool and \
a Guest Favorite badge from real reviews." Ground every claim ONLY in the fields given - NEVER invent an \
amenity, distance, price, or fact not present in the data, and never mention a hotel's star rating or price as \
if it were a guest opinion. If there is only one hotel, describe it in one sentence instead of comparing. \
Return STRICT JSON, no markdown: {"summary": "<paragraph>"}
"""


def _comparison_brief(hotel: dict) -> dict:
    return {
        "id": hotel["id"],
        "name": hotel["name"],
        "neighborhood": hotel.get("neighborhood"),
        "price": hotel.get("price"),
        "star_rating": hotel.get("starRating"),
        "guest_rating": hotel.get("rating"),
        "amenities": hotel.get("amenities", []),
        "is_guest_favorite": bool(hotel.get("reviewCount") and hotel.get("realRating")),
    }


async def generate_shortlist_comparison(hotels: list[dict], *, timeout: float = REQUEST_TIMEOUT) -> str:
    """Returns a short grounded trade-off paragraph across the given
    (already-shortlisted) hotels, or raises an LLMError subclass on
    failure/not-configured - callers must fall back to showing nothing,
    same as every other LLM feature in this app, never a fabricated
    fallback paragraph.
    """
    if not hotels:
        return ""

    briefs = [_comparison_brief(hotel) for hotel in hotels[:8]]
    content = await _chat_completion(
        [
            {"role": "system", "content": COMPARISON_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({"shortlisted_hotels": briefs})},
        ],
        max_tokens=1200,
        temperature=0.4,
        timeout=timeout,
    )
    parsed = _extract_json(content)
    summary = parsed.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise LLMResponseError("LLM response missing 'summary' string")
    return summary.strip()[:600]


# Agoda's "AMA" bot and Expedia's "Property Expert" both let a traveler ask
# a hotel a free-text question and get an instant answer instead of reading
# the whole listing - but both work because those platforms hold rich,
# constantly-refreshed property data. This app's honest equivalent is
# retrieval-constrained, not open generation: the model may ONLY answer
# from the specific real fields already fetched for this one hotel (same
# fields the detail dialog itself already renders), and must say so
# plainly when the traveler asks about something genuinely not in that
# data (live availability, exact check-in time, a specific room photo)
# rather than guessing - the same "real fact or an honest gap, never a
# plausible-sounding invention" rule this app already applies everywhere
# else (see REASON_SYSTEM_PROMPT, COMPARISON_SYSTEM_PROMPT above).
ASK_HOTEL_SYSTEM_PROMPT = """You are answering a traveler's question about ONE specific hotel, using ONLY the \
real facts about it provided below - never invent, assume, or guess anything not present in this data. If the \
traveler's question can't be answered from these fields (e.g. asking about live availability, exact check-in \
time, a specific room type's price, or anything else genuinely absent here), say plainly that this isn't \
something you have on file for this hotel, and suggest checking the official website or calling the hotel if \
those are provided - never fabricate a plausible-sounding answer to fill the gap. When stating a price, always \
include its currency (e.g. "$150/night", never a bare number); when stating a distance or walk time, always \
include its unit (e.g. "0.33 km", "4 min walk"). Keep the answer to 1-3 sentences. Return STRICT JSON, no \
markdown: {"answer": "<your answer>"}
"""


def _ask_hotel_brief(hotel: dict, transit_info: dict | None = None) -> dict:
    return {
        "name": hotel["name"],
        "neighborhood": hotel.get("neighborhood"),
        "address": hotel.get("address"),
        "price": hotel.get("price"),
        "price_currency": "USD",
        "star_rating": hotel.get("starRating"),
        "guest_rating": hotel.get("rating"),
        "phone": hotel.get("phone"),
        "website": hotel.get("website"),
        "amenities": hotel.get("amenities", []),
        "meal_plans_offered": hotel.get("boardCodes", []),
        "nearby_landmarks": hotel.get("nearbyLandmarks", []),
        "official_description": hotel.get("officialDescription"),
        "nearest_public_transit": transit_info,
    }


async def answer_hotel_question(
    hotel: dict, question: str, *, transit_info: dict | None = None, timeout: float = REQUEST_TIMEOUT
) -> str:
    """Returns a grounded 1-3 sentence answer, or raises an LLMError
    subclass on failure/not-configured. Unlike the other LLM features in
    this app (which silently hide on failure since they're background
    bonuses), this one is a direct response to something the traveler just
    typed and clicked "Ask" for - the caller should show a clear error, not
    silence, when this fails.
    """
    content = await _chat_completion(
        [
            {"role": "system", "content": ASK_HOTEL_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps({"hotel": _ask_hotel_brief(hotel, transit_info), "question": question}),
            },
        ],
        max_tokens=600,
        temperature=0.3,
        timeout=timeout,
    )
    parsed = _extract_json(content)
    answer = parsed.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise LLMResponseError("LLM response missing 'answer' string")
    return answer.strip()[:500]


ITINERARY_SYSTEM_PROMPT = """You are adjusting a traveler's day-by-day trip itinerary. You will be given the \
full list of REAL places available (grouped by category) and the traveler's request. Build a day-by-day plan \
using ONLY places from the provided list - you must NEVER invent a place name that isn't in the list, since \
these are real locations pulled from map data, not suggestions. Return STRICT JSON, no markdown:

{"days": {"1": ["Exact Place Name", "Exact Place Name"], "2": [...], ...}}

Rules:
- Include an entry for every day number from 1 to the given night count, even if some days have no obvious \
match for the request (in that case reuse a sensible earlier-category choice or leave the array shorter).
- Unless the traveler's request says otherwise, prefer giving each day one food/dining place plus one \
activity place, and vary the activity categories across days rather than repeating the same one every day.
- Follow specific per-day instructions literally (e.g. "day 2 should be more relaxed" means fewer, calmer \
activities that day - fewer entries or nature/scenery over nightlife).
- Do not reuse the exact same place on two different days unless the traveler explicitly asks for a repeat.
- Every place name in your output must be copied EXACTLY as it appears in the provided list.
"""


def _flatten_pois_for_prompt(points_of_interest: dict) -> list[dict]:
    flat = []
    for category, items in points_of_interest.items():
        for item in items:
            flat.append({"name": item["name"], "category": category})
    return flat


async def adjust_itinerary_with_llm(instruction: str, points_of_interest: dict, nights: int) -> dict[str, list[str]]:
    """Returns {day_number_str: [place name, ...]}. Raises LLMError subclasses
    on failure - callers must catch and fall back (e.g. keep the existing
    plan) rather than let a broken AI edit corrupt the itinerary.
    """
    available = _flatten_pois_for_prompt(points_of_interest)
    content = await _chat_completion(
        [
            {"role": "system", "content": ITINERARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps({
                    "nights": nights,
                    "available_places": available,
                    "traveler_request": instruction,
                }),
            },
        ],
        # Bumped from 2500 after a real user-reported failure: "LLM did not
        # return valid JSON: Unterminated string starting at ... char 178" -
        # the response cut off almost immediately, consistent with a
        # reasoning-capable model spending most of its max_tokens budget on
        # hidden reasoning before it ever got to emit the actual JSON (this
        # file's own _chat_completion docstring already flags that "max_tokens
        # caps both combined"). 2500 wasn't enough headroom for that; giving
        # substantially more costs nothing extra on a normal-length response
        # and only helps on a reasoning-heavy one.
        max_tokens=5000,
        temperature=0.6,
    )
    parsed = _extract_json(content)
    raw_days = parsed.get("days")
    if not isinstance(raw_days, dict):
        raise LLMResponseError("LLM response missing 'days' object")

    valid_names = {item["name"] for item in available}
    days: dict[str, list[str]] = {}
    for day_key, names in raw_days.items():
        if not isinstance(names, list):
            continue
        # Same defense as the name check below, applied to the day key: the
        # system prompt asks for "every day number from 1 to the given night
        # count", but nothing enforced that - tested live with an
        # instruction referencing a day past the trip's actual length, and
        # while this model folded it into the nearest real day on its own,
        # nothing here would have stopped a differently-behaved response
        # from returning an out-of-range key. The frontend only ever
        # *renders* itinerary days 1..nights, but its map markers and
        # Wikipedia/routing enrichment iterate the itinerary dict directly
        # with no such bound - an out-of-range day would silently place a
        # phantom marker on the map for an item invisible in the itinerary
        # itself. Drop it here instead, same as a hallucinated place name.
        try:
            if not (1 <= int(day_key) <= nights):
                continue
        except (TypeError, ValueError):
            continue
        # Silently drop any hallucinated name rather than failing the whole
        # response - the system prompt forbids inventing places, but an LLM
        # is never a guaranteed-correct source, so this is real defense,
        # not decoration.
        kept = [name for name in names if isinstance(name, str) and name in valid_names]
        if kept:
            days[day_key] = kept
    return days
