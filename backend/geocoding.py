"""Landmark/address geocoding via OpenStreetMap's Nominatim - free, no API
key, consistent with the Leaflet/OSM map already in use.

Proxied through the backend (not called from the browser) per Nominatim's
usage policy: it asks for a real identifying User-Agent (browsers can't set
that reliably) and a max of ~1 request/second, which is much easier to
respect server-side with a small in-memory cache than from the client.
"""

import math

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_TIMEOUT = 10
USER_AGENT = "StayRankAI/1.0 (hotel-ranking prototype; landmark search)"

# Tiny in-memory cache: the same landmark string is very likely to be
# searched repeatedly (e.g. "Eiffel Tower" from many different users/tests),
# and caching keeps us comfortably under Nominatim's rate-limit guidance.
# Keyed on (text, near) - "Central Park" near Tokyo and "Central Park" near
# New York are different searches and must not share a cached answer.
_geocode_cache: dict[tuple[str, tuple[float, float] | None], tuple[float, float, str] | None] = {}

# Half-width in degrees for the "same metro area" bounding box passed to
# Nominatim's viewbox when a `near` point is given - about 65km at the
# equator, generous enough to cover a city's outskirts (and most of its
# airports) while still excluding a same-named landmark in another city
# entirely. Not distance-corrected for longitude at high latitudes; an
# intentional simplification, not a claimed precise radius.
NEAR_BOX_DEGREES = 0.6


class GeocodeError(Exception):
    """Raised on network/timeout failures. A landmark simply not being found
    is NOT an error - it returns None - since that's an expected outcome for
    a made-up or misspelled place name, not a system failure.
    """


def geocode_landmark(query: str, near: tuple[float, float] | None = None) -> tuple[float, float, str] | None:
    """Returns (latitude, longitude, display_name) for the best match, or
    None if nothing was found. Raises GeocodeError on network failure.

    `near`, when given as (latitude, longitude), restricts results to
    roughly that metro area (Nominatim's `viewbox` + `bounded=1`) rather
    than the single globally-top-ranked match for the query text anywhere
    on Earth. Found via testing the "nearest to landmark" sort: searching
    Tokyo hotels with landmark "Central Park" (unbounded) resolved to
    Central Park in New York and reported every Tokyo hotel as ~10,837km
    from it, sorted by that number, with no error shown - a real risk for
    any landmark name that isn't unique to one city (city halls, cathedrals,
    main squares, and plenty of literal "Central Park"s exist worldwide).
    Leave `near` unset for genuinely global lookups (e.g. resolving a
    flight's origin city, which legitimately can be anywhere).
    """
    key = (query.strip().lower(), near)
    if not key[0]:
        return None
    if key in _geocode_cache:
        return _geocode_cache[key]

    params = {"q": query, "format": "json", "limit": 1}
    if near is not None:
        lat, lon = near
        params["viewbox"] = (
            f"{lon - NEAR_BOX_DEGREES},{lat + NEAR_BOX_DEGREES},"
            f"{lon + NEAR_BOX_DEGREES},{lat - NEAR_BOX_DEGREES}"
        )
        params["bounded"] = 1

    try:
        response = httpx.get(
            NOMINATIM_URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        results = response.json()
    except httpx.HTTPError as exc:
        raise GeocodeError(f"Geocoding request failed: {exc}") from exc
    except ValueError as exc:
        raise GeocodeError(f"Geocoding response was not valid JSON: {exc}") from exc

    if not results:
        _geocode_cache[key] = None
        return None

    top = results[0]
    try:
        resolved = (float(top["lat"]), float(top["lon"]), top.get("display_name", query))
    except (KeyError, TypeError, ValueError) as exc:
        raise GeocodeError(f"Unexpected geocoding response shape: {exc}") from exc

    _geocode_cache[key] = resolved
    return resolved


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers between two lat/lon points."""
    radius_km = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
