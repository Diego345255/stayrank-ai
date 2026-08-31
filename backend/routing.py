"""Real walking-route distance/duration via OSRM's free public demo server
(router.project-osrm.org) - no API key, real street-network routing (not a
straight-line guess), verified live during development (foot profile).

This is OSRM's shared demo instance, explicitly not meant for production or
heavy use - fine for a prototype's per-click lookups, same "free public
data, be a considerate caller" posture already used for Overpass and
Nominatim in poi.py / geocoding.py. Only called lazily, one place at a time,
never batched across a whole POI list.
"""

import httpx

OSRM_URL = "https://router.project-osrm.org/route/v1/foot"
REQUEST_TIMEOUT = 8


class RoutingError(Exception):
    """Raised only on network/response failure - the frontend falls back to
    the straight-line distance it already has rather than losing the card.
    """


def get_walking_route(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> dict:
    """Returns {"distanceKm", "walkMinutes"} from a real routed walking path.
    Raises RoutingError on failure - callers should fall back gracefully,
    never block the rest of the page on this.
    """
    coords = f"{from_lon},{from_lat};{to_lon},{to_lat}"
    try:
        response = httpx.get(
            f"{OSRM_URL}/{coords}",
            # "simplified" geometry (not "full") - enough points to draw a
            # recognizable path on the map without a heavy payload for what
            # is usually a 1-5km city walk.
            params={"overview": "simplified", "geometries": "geojson"},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        raise RoutingError(f"Routing request failed: {exc}") from exc
    except ValueError as exc:
        raise RoutingError(f"Routing response was not valid JSON: {exc}") from exc

    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise RoutingError(f"No walking route found ({payload.get('code', 'unknown error')}).")

    route = payload["routes"][0]
    distance_km = route["distance"] / 1000
    walk_minutes = route["duration"] / 60

    # Found via testing a real 10.3km hotel-to-landmark pair in Lisbon:
    # OSRM's public /foot demo server returned duration=678s for that
    # distance - an implied ~55 km/h "walk", physically impossible (a
    # sustained human walking pace tops out around 6-7 km/h). Reproduced
    # live via a direct call to the same public endpoint, so this isn't our
    # own unit-conversion bug - the free demo server's foot profile
    # occasionally mis-routes a pair along a motorway/highway link never
    # meant for pedestrians and reports a driving-speed duration for it.
    # This app's honesty principle applies just as much to a real service's
    # bad data as to our own: an implausible number stated as fact is worse
    # than no number. Any implied pace faster than a brisk 9 km/h (a
    # generous ceiling - race-walkers can hit ~15 km/h, but no real
    # traveler is doing that with luggage) is treated as an unreliable
    # result, same as a network failure - callers already fall back
    # gracefully on RoutingError.
    implied_kmh = distance_km / (walk_minutes / 60) if walk_minutes > 0 else float("inf")
    if implied_kmh > 9:
        raise RoutingError(
            f"Routed walking time looked implausible ({implied_kmh:.0f} km/h implied pace) - "
            "likely a bad route from the free routing service, not a real walking path."
        )

    # GeoJSON coordinates are [lon, lat] pairs - flipped to [lat, lon] here
    # so the frontend can feed them straight to Leaflet without re-mapping.
    coordinates = route.get("geometry", {}).get("coordinates", [])
    return {
        "distanceKm": round(distance_km, 1),
        "walkMinutes": round(walk_minutes),
        "path": [[lat, lon] for lon, lat in coordinates],
    }
