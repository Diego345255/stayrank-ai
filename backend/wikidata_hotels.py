"""Real hotel identities (name, coordinates, real Wikimedia Commons photo)
via Wikidata's free, keyless SPARQL Query Service - a third real-data
fallback tier, used when both Booking.com and Hotelbeds fail or are
currently circuit-broken (see backend/circuit_breaker.py). Unlike those
two, this has no API key, no request quota, and no rate limit tight
enough to matter for this app's traffic - so it can't get exhausted the
way this session's Booking.com/Hotelbeds attempts repeatedly did.

Verified live before building on it: a coordinate-radius SPARQL query
(using the `wikibase:around` geo service, not the much slower
administrative-hierarchy walk via P131*, which timed out during
development) returned real, named hotels with real Commons photos for
both Toronto (7 unique photo-bearing hotels) and Marrakech (5) within a
normal request timeout, and a sampled photo URL resolved to a genuine
`200 image/jpeg` (3.8MB full-size, 105KB at `?width=500`).

Coverage caveat, disclosed honestly via the same source="content" badge
Hotelbeds' tier already uses: only NOTABLE hotels (the kind with their own
Wikipedia/Wikidata entry - flagship, historic, or landmark properties)
show up here, not the full inventory a live booking search would return.
A city with fewer than MIN_HOTELS_TO_USE qualifying hotels is treated the
same as "not covered" and falls through to fully generated data, rather
than shipping a suspiciously short real-hotel list that would read as
broken, not honest.

Like Hotelbeds' Content API, this has no live pricing or guest reviews -
price, guest rating, and the quiet/transit/value-style metric bars reuse
the exact same disclosed archetype-based estimate the rest of the
"content" tier already uses, deterministically seeded by the hotel's real
Wikidata entity ID so a given real hotel's estimated numbers stay stable
across repeat searches.
"""

import random
import re

import httpx

from backend import circuit_breaker
from backend.generator import ARCHETYPES, _slugify
from backend.placeholder import generate_placeholder

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
REQUEST_TIMEOUT = 20
SEARCH_RADIUS_KM = 10
IMAGE_WIDTH = 500
MIN_HOTELS_TO_USE = 3
MAX_HOTELS = 15
PROVIDER = "wikidata"

# Wikimedia's documented User-Agent policy asks API clients to identify
# themselves; httpx's default UA already got a 200 in testing, so this
# isn't fixing an observed failure, just following the stated policy
# proactively - the same courtesy this app already extends to
# Nominatim/Overpass elsewhere (geocoding.py, poi.py).
USER_AGENT = "StayRankAI/1.0 (hotel-ranking prototype; personal project, no contact endpoint)"

# Q27686 = "hotel" on Wikidata. wdt:P31 (instance of) rather than a
# subclass walk (wdt:P31/wdt:P279*) on purpose - the latter, tried first,
# is exactly what timed out against the public endpoint; a plain P31 check
# already covers essentially every real-world hotel entity in practice.
_QUERY_TEMPLATE = """
SELECT ?hotel ?hotelLabel ?coord ?image WHERE {{
  SERVICE wikibase:around {{
    ?hotel wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "{radius}" .
  }}
  ?hotel wdt:P31 wd:Q27686 .
  ?hotel wdt:P18 ?image .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" . }}
}} LIMIT 40
"""

_COORD_RE = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


class WikidataError(Exception):
    pass


def _query(lat: float, lon: float) -> list[dict]:
    open_now, retry_after = circuit_breaker.is_open(PROVIDER)
    if open_now:
        raise WikidataError(
            f"Wikidata query service is temporarily paused after a recent failure - retrying in "
            f"{circuit_breaker.format_retry_after(retry_after)}"
        )

    query = _QUERY_TEMPLATE.format(lat=lat, lon=lon, radius=SEARCH_RADIUS_KM)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(
                SPARQL_ENDPOINT,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT},
            )
    except httpx.TimeoutException as exc:
        circuit_breaker.record_failure(PROVIDER, "request timed out")
        raise WikidataError("Wikidata query timed out") from exc
    except httpx.RequestError as exc:
        circuit_breaker.record_failure(PROVIDER, f"network error: {exc}")
        raise WikidataError(f"Wikidata network error: {exc}") from exc

    if response.status_code >= 400:
        circuit_breaker.record_failure(PROVIDER, f"HTTP {response.status_code}")
        raise WikidataError(f"Wikidata query failed with {response.status_code}: {response.text[:200]}")

    circuit_breaker.record_success(PROVIDER)
    try:
        return response.json()["results"]["bindings"]
    except (KeyError, ValueError) as exc:
        raise WikidataError("Wikidata returned an unexpected response shape") from exc


def _image_url(raw_image_url: str) -> str:
    # SPARQL's P18 binding is already a full Special:FilePath URL (unlike
    # the OSM-tag-derived filenames elsewhere in this app, which need one
    # built from scratch) - just add a thumbnail width so hotel cards don't
    # load multi-megabyte originals.
    separator = "&" if "?" in raw_image_url else "?"
    return f"{raw_image_url}{separator}width={IMAGE_WIDTH}"


def _pick_archetype(rng: random.Random) -> dict:
    # No real star-category signal from this source (unlike Hotelbeds'
    # categoryCode), so this picks freely across all archetypes rather
    # than filtering by one - still fine, since nothing here contradicts a
    # known real fact the way an unfiltered pick would for Hotelbeds' data.
    return rng.choice(ARCHETYPES)


def fetch_city_hotels(city_name: str, center_lat: float, center_lon: float) -> tuple[list[dict], str | None] | None:
    """Returns (neighborhoods, hero_image) in the same shape
    backend/generator.py and backend/hotelbeds.py already produce. Returns
    None if this city has fewer than MIN_HOTELS_TO_USE real, photo-bearing
    notable hotels nearby - a real "not enough coverage" outcome, not an
    error.
    """
    bindings = _query(center_lat, center_lon)

    seen_entities: set[str] = set()
    candidates = []
    for binding in bindings:
        entity_url = binding.get("hotel", {}).get("value", "")
        if not entity_url or entity_url in seen_entities:
            continue
        name = binding.get("hotelLabel", {}).get("value")
        image = binding.get("image", {}).get("value")
        coord = binding.get("coord", {}).get("value", "")
        if not name or not image:
            continue
        match = _COORD_RE.match(coord)
        if not match:
            continue
        seen_entities.add(entity_url)
        candidates.append({
            "qid": entity_url.rsplit("/", 1)[-1],
            "name": name,
            "longitude": float(match.group(1)),
            "latitude": float(match.group(2)),
            "image": _image_url(image),
        })

    if len(candidates) < MIN_HOTELS_TO_USE:
        return None
    candidates = candidates[:MAX_HOTELS]

    # A single shared neighborhood, not one per hotel, on purpose: the
    # `neighborhoods` table has a UNIQUE(city_id, name) constraint, and
    # every candidate here was going to get the exact same name (city_name
    # - there's no real per-hotel district/neighborhood data available
    # from this source, unlike Hotelbeds' city field). Building one
    # neighborhood dict per hotel, all sharing that one name, crashed the
    # second insert onward with sqlite3.IntegrityError - reproduced live,
    # a real 500 on /api/search whenever this path actually succeeded
    # (earlier testing never hit it because the circuit breaker or quota
    # failures kept this function from returning real data at all).
    # Grouping every hotel into one neighborhood entry is also the more
    # honest structure anyway: multiple real hotels in the same city ARE
    # genuinely "the same neighborhood" as far as this data source can
    # actually tell us, rather than inventing distinct districts we have
    # no real data for.
    hotels = []
    hero_image = candidates[0]["image"]
    for candidate in candidates:
        rng = random.Random(f"wikidata-{candidate['qid']}")
        archetype = _pick_archetype(rng)
        metrics = {key: rng.randint(low, high) for key, (low, high) in archetype["metric_ranges"].items()}
        price = rng.randint(*archetype["price_range"])
        rating = round(rng.uniform(4.0, 4.7), 1)
        star_rating = rng.randint(*archetype["star_range"])
        slug = _slugify(f"wikidata-{candidate['qid']}-{candidate['name']}")

        hotel = {
            "slug": slug,
            "name": candidate["name"],
            "price": price,
            "original_price": None,
            "rating": rating,
            "star_rating": star_rating,
            "latitude": candidate["latitude"],
            "longitude": candidate["longitude"],
            "image": candidate["image"],
            "photos": [candidate["image"]],
            "tags": archetype["tags"],
            "metrics": metrics,
            "strengths": archetype["strengths"],
            "risk": archetype["risk"],
            "evidence": archetype["evidence"],
            # Truthy only so the frontend's existing PROXY_METRIC_TITLE
            # tooltip applies here too (see hotelbeds.py's identical
            # comment) - not a real booking-flow identifier.
            "external_id": f"wd-{candidate['qid']}",
        }
        hotels.append(hotel)

    neighborhoods = [{
        "name": city_name,
        "description": (
            f"Notable real hotels near {city_name}, each with its own Wikidata entry - pricing, guest "
            "rating, and category-fit metrics shown here are estimated, not live (see the source badge)."
        ),
        "hotels": hotels,
    }]

    return neighborhoods, hero_image
