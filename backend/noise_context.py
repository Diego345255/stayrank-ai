"""Real "likely quiet / likely lively" context for a single hotel via the
Overpass API - same free, no-key, OpenStreetMap-backed pattern already used
in poi.py and transit.py.

Competitor research (2025-2026): no major booking platform - Booking.com,
Expedia, Google Hotels, Airbnb - has shipped a noise-level or quiet-hours
signal as a filterable/visible attribute, despite it being one of the most
common real complaints in guest reviews. This app has no real decibel data
(no honest source exists for that), so this does NOT invent a noise score.
Instead it counts two real, checkable things OpenStreetMap actually knows
near a hotel's real coordinates - nearby nightlife venues (bars/clubs/pubs)
and nearby major roads (primary/trunk/motorway, the road classes actually
loud enough to matter, not every residential street) - and reports the
real counts alongside a plain-language bucket, so a traveler can see
exactly what the label is based on, not just trust it.

Queried lazily, once per hotel, only when its detail dialog is opened -
same "light, considerate caller of a shared public endpoint" discipline
poi.py and transit.py already document for their own Overpass usage.
"""

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT = 20
NIGHTLIFE_RADIUS_M = 200
ROAD_RADIUS_M = 50
# Verified empirically (same requirement documented in poi.py/transit.py):
# Overpass rejects requests without a real, identifying User-Agent.
USER_AGENT = "StayRankAI/1.0 (hotel-ranking prototype; noise-context lookup)"

_noise_cache: dict[tuple[float, float], dict] = {}

_NIGHTLIFE_TAGS = [("amenity", "bar"), ("amenity", "nightclub"), ("amenity", "pub")]
_MAJOR_ROAD_VALUES = ["motorway", "trunk", "primary"]


class NoiseContextError(Exception):
    """Raised only on network/response failure - callers should fall back
    to showing nothing, same as transit.py's TransitError."""


def _build_query(lat: float, lon: float) -> str:
    nightlife_clauses = "\n".join(
        f'  nwr["{key}"="{value}"](around:{NIGHTLIFE_RADIUS_M},{lat},{lon});' for key, value in _NIGHTLIFE_TAGS
    )
    road_clauses = "\n".join(
        f'  way["highway"="{value}"](around:{ROAD_RADIUS_M},{lat},{lon});' for value in _MAJOR_ROAD_VALUES
    )
    return f"[out:json][timeout:{REQUEST_TIMEOUT}];\n(\n{nightlife_clauses}\n{road_clauses}\n);\nout center 60;"


def get_noise_context(lat: float, lon: float) -> dict:
    """Returns {"label", "nightlifeCount", "nearMajorRoad"} built entirely
    from real, counted OSM elements. Raises NoiseContextError only on a
    genuine network/response failure - a real zero-count result (nothing
    nearby) is a legitimate, meaningful "likely quiet" outcome, not an error.
    """
    key = (round(lat, 4), round(lon, 4))
    if key in _noise_cache:
        return _noise_cache[key]

    query = _build_query(lat, lon)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
            )
    except httpx.TimeoutException as exc:
        raise NoiseContextError("Overpass request timed out") from exc
    except httpx.RequestError as exc:
        raise NoiseContextError(f"Overpass network error: {exc}") from exc

    if response.status_code >= 400:
        raise NoiseContextError(f"Overpass returned {response.status_code}: {response.text[:200]}")

    try:
        elements = response.json()["elements"]
    except (KeyError, ValueError) as exc:
        raise NoiseContextError("Overpass returned an unexpected response shape") from exc

    nightlife_names = set()
    near_major_road = False
    for element in elements:
        tags = element.get("tags") or {}
        if tags.get("highway") in _MAJOR_ROAD_VALUES:
            near_major_road = True
            continue
        if any(tags.get(k) == v for k, v in _NIGHTLIFE_TAGS):
            # Dedup by name (falls back to the element id for unnamed venues)
            # so the same venue mapped as both a node and part of a larger
            # way isn't double-counted.
            nightlife_names.add(tags.get("name") or f"unnamed-{element.get('id')}")

    nightlife_count = len(nightlife_names)
    if near_major_road or nightlife_count >= 3:
        label = "likely_lively"
    elif nightlife_count >= 1:
        label = "somewhat_lively"
    else:
        label = "likely_quiet"

    result = {
        "label": label,
        "nightlifeCount": nightlife_count,
        "nearMajorRoad": near_major_road,
    }
    _noise_cache[key] = result
    return result
