"""Real nearest-public-transit-stop lookup via the Overpass API - same free,
no-key, OpenStreetMap-backed pattern already used in poi.py and geocoding.py.

Competitor research: Google Hotels and Booking.com both show a concrete
"X min walk to [named] metro station" line in their hotel detail views - a
real, checkable fact, not a vague "TRANSIT 76/100" score. This app already
computes a TRANSIT metric (see ranking.py), but it's an honestly-disclosed
proxy/estimate, not a real transit fact. This adds the real fact alongside
it: the actual nearest station/stop OSM knows about, by name, with a real
straight-line distance - queried lazily, once per hotel, only when its
detail dialog is opened (never for the whole result list at once, to stay
a light, considerate caller of a shared public endpoint - same discipline
poi.py already documents for its own Overpass usage).

Verified live before building: a real query around downtown Toronto
returned real TTC subway stations (King, Queen, Osgoode, St. Andrew, TMU)
with real names, coordinates, and even a real wheelchair-accessibility tag
- genuine OSM data, not invented.
"""

import math

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT = 20
STATION_RADIUS_M = 1200
STOP_RADIUS_M = 600
# Verified empirically (same requirement documented in poi.py/geocoding.py):
# Overpass rejects requests without a real, identifying User-Agent.
USER_AGENT = "StayRankAI/1.0 (hotel-ranking prototype; nearest-transit lookup)"

_transit_cache: dict[tuple[float, float], dict | None] = {}

# (tag key, tag value, display label) - ordered rail/rapid-transit first
# since a subway/train station is the more useful "how do I get around"
# fact than a plain bus stop when both exist nearby.
_STOP_KINDS: list[tuple[str, str, str]] = [
    ("railway", "station", "train/subway station"),
    ("railway", "subway_entrance", "subway entrance"),
    ("public_transport", "station", "transit station"),
    ("amenity", "bus_station", "bus station"),
    ("highway", "bus_stop", "bus stop"),
]


class TransitError(Exception):
    """Raised only on network/response failure, not on "nothing nearby"."""


def _build_query(lat: float, lon: float) -> str:
    clauses = "\n".join(
        f'  nwr["{key}"="{value}"](around:{STOP_RADIUS_M if key == "highway" else STATION_RADIUS_M},{lat},{lon});'
        for key, value, _label in _STOP_KINDS
    )
    return f"[out:json][timeout:{REQUEST_TIMEOUT}];\n(\n{clauses}\n);\nout center 30;"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_nearest_transit(lat: float, lon: float) -> dict | None:
    """Returns the real nearest transit stop within range, or None if OSM
    has nothing mapped nearby - a legitimate "no coverage" outcome for
    less-mapped areas, not an error.
    """
    key = (round(lat, 4), round(lon, 4))
    if key in _transit_cache:
        return _transit_cache[key]

    query = _build_query(lat, lon)
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
            )
    except httpx.TimeoutException as exc:
        raise TransitError("Overpass request timed out") from exc
    except httpx.RequestError as exc:
        raise TransitError(f"Overpass network error: {exc}") from exc

    if response.status_code >= 400:
        raise TransitError(f"Overpass returned {response.status_code}: {response.text[:200]}")

    try:
        elements = response.json()["elements"]
    except (KeyError, ValueError) as exc:
        raise TransitError("Overpass returned an unexpected response shape") from exc

    kind_rank = {(key, value): index for index, (key, value, _label) in enumerate(_STOP_KINDS)}
    kind_label = {(key, value): label for key, value, label in _STOP_KINDS}

    best = None
    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name")
        if not name:
            continue
        stop_lat = element.get("lat") or (element.get("center") or {}).get("lat")
        stop_lon = element.get("lon") or (element.get("center") or {}).get("lon")
        if stop_lat is None or stop_lon is None:
            continue
        matched_kind = next(
            ((k, v) for k, v, _label in _STOP_KINDS if tags.get(k) == v),
            None,
        )
        if matched_kind is None:
            continue
        distance_km = _haversine_km(lat, lon, stop_lat, stop_lon)
        candidate = {
            "name": name,
            "kind": kind_label[matched_kind],
            "distanceKm": round(distance_km, 2),
            "walkMinutes": max(1, round(distance_km * 1000 / 80)),  # ~80 m/min average walking pace
            "wheelchairAccessible": tags.get("wheelchair") == "yes",
            "rank": kind_rank[matched_kind],
        }
        # Prefer the closer stop; among equally-real ties, prefer the more
        # useful kind (rail over a plain bus stop) - matches how a traveler
        # actually decides "which nearby stop matters."
        if best is None or (candidate["distanceKm"], candidate["rank"]) < (best["distanceKm"], best["rank"]):
            best = candidate

    result = None
    if best is not None:
        result = {k: v for k, v in best.items() if k != "rank"}
    _transit_cache[key] = result
    return result
