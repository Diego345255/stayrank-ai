"""Landscape/culture/entertainment/family points of interest via the
Overpass API - OpenStreetMap's free, no-key query endpoint (same "free
public data" pattern as geocoding.py and weather.py). Verified live against
the real API during development.

The public Overpass instance is shared infrastructure under real load (per
its own docs), so this module does one combined query per city (not one
per category) and caches the result in memory, the same discipline already
used for landmark geocoding.
"""

from urllib.parse import quote

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT = 25
SEARCH_RADIUS_M = 4000
MAX_PER_CATEGORY = 10
# Verified empirically: Overpass returns 406 Not Acceptable without a real,
# identifying User-Agent (same requirement as Nominatim in geocoding.py).
USER_AGENT = "StayRankAI/1.0 (hotel-ranking prototype; trip-planner POIs)"

_poi_cache: dict[tuple[float, float], dict] = {}

# Food & Dining is deliberately a SEPARATE, tighter query, not another
# clause unioned into the main one below. Measured empirically: restaurant
# + cafe nodes within the main query's 4km radius returned a 1.2MB payload
# for central Tokyo (vs the rest of the combined query, tens of KB) - too
# heavy for a public, rate-considerate endpoint just to keep 10 results.
# A 900m walk radius with a server-side `out center 12` cap keeps this to
# single-digit KB while still returning real, walkable options.
FOOD_RADIUS_M = 900
FOOD_RESULT_CAP = 12


class POIError(Exception):
    """Raised only on network/response failure."""


# (category key, display label) -> ordered so a POI matching multiple tags
# lands in the first (most specific) category it qualifies for.
CATEGORIES = {
    "nature": "Nature & Scenery",
    "culture": "Culture & History",
    "entertainment": "Entertainment & Nightlife",
    "family": "Family & Parks",
    "food": "Food & Dining",
}

# (overpass tag key, tag value or None for "key present") -> category
_TAG_RULES: list[tuple[str, str | None, str]] = [
    ("tourism", "viewpoint", "nature"),
    ("natural", "beach", "nature"),
    ("natural", "peak", "nature"),
    ("leisure", "park", "nature"),
    ("leisure", "garden", "nature"),
    ("tourism", "museum", "culture"),
    ("tourism", "gallery", "culture"),
    ("tourism", "artwork", "culture"),
    ("historic", None, "culture"),
    ("amenity", "nightclub", "entertainment"),
    ("amenity", "theatre", "entertainment"),
    ("amenity", "cinema", "entertainment"),
    ("leisure", "water_park", "entertainment"),
    ("tourism", "zoo", "family"),
    ("tourism", "theme_park", "family"),
    ("tourism", "aquarium", "family"),
    ("leisure", "playground", "family"),
]

def _query_clause(key: str, value: str | None) -> str:
    if value is None:
        return f'  nwr["{key}"](around:{{radius}},{{lat}},{{lon}});'
    return f'  nwr["{key}"="{value}"](around:{{radius}},{{lat}},{{lon}});'


_QUERY_TEMPLATE = "\n".join(_query_clause(key, value) for key, value, _category in _TAG_RULES)


def _categorize(tags: dict) -> str | None:
    for key, value, category in _TAG_RULES:
        if value is None:
            if key in tags:
                return category
        elif tags.get(key) == value:
            return category
    return None


def _run_overpass(query: str) -> list[dict]:
    try:
        response = httpx.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        raise POIError(f"Overpass request failed: {exc}") from exc
    except ValueError as exc:
        raise POIError(f"Overpass response was not valid JSON: {exc}") from exc
    return payload.get("elements", [])


def _element_to_poi(element: dict, category: str) -> dict | None:
    tags = element.get("tags", {})
    name = tags.get("name:en") or tags.get("name")
    if not name:
        return None
    lat = element.get("lat") or (element.get("center") or {}).get("lat")
    lon = element.get("lon") or (element.get("center") or {}).get("lon")
    if lat is None or lon is None:
        return None
    return {
        "name": name,
        "category": category,
        "categoryLabel": CATEGORIES[category],
        "latitude": lat,
        "longitude": lon,
        "wikipedia": tags.get("wikipedia"),
        # Language-neutral ID - lets the frontend look up the English
        # Wikipedia article via Wikidata's sitelinks when the OSM
        # `wikipedia` tag itself points at a non-English edition (very
        # common for city-specific places), instead of only ever being able
        # to show a description in the local language.
        "wikidata": tags.get("wikidata"),
        "cuisine": tags.get("cuisine"),
        "photoUrl": _resolve_osm_image_tag(tags.get("image")),
    }


def _resolve_osm_image_tag(image_tag: str | None) -> str | None:
    """OSM's own `image` tag, when present, is a mapper-curated photo of
    this exact node - real coverage the wikipedia/wikidata tags don't
    always have (small viewpoints, local parks). But per OSM's own tagging
    convention the value is free-form: sometimes a bare Commons filename,
    sometimes a `File:` prefix, sometimes an arbitrary external URL (a
    Google Photos share page, a personal blog) that isn't a direct image at
    all and would render as a broken `<img>` if used blindly. Only resolve
    the forms that are reliably a real, embeddable photo; skip everything
    else rather than risk a broken or misleading image.
    """
    if not image_tag:
        return None
    if image_tag.startswith("File:"):
        return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(image_tag[len('File:'):])}?width=330"
    if image_tag.startswith("https://upload.wikimedia.org/") or image_tag.startswith("http://upload.wikimedia.org/"):
        return image_tag
    return None


def _fetch_landscape_culture_entertainment_family(latitude: float, longitude: float) -> dict[str, list[dict]]:
    query = (
        f"[out:json][timeout:20];\n(\n"
        f"{_QUERY_TEMPLATE.format(radius=SEARCH_RADIUS_M, lat=latitude, lon=longitude)}\n"
        f");\nout center;"
    )
    grouped: dict[str, list[dict]] = {key: [] for key in CATEGORIES if key != "food"}
    for element in _run_overpass(query):
        category = _categorize(element.get("tags", {}))
        if category is None or category not in grouped or len(grouped[category]) >= MAX_PER_CATEGORY:
            continue
        poi_entry = _element_to_poi(element, category)
        if poi_entry:
            grouped[category].append(poi_entry)
    return grouped


def _fetch_food(latitude: float, longitude: float) -> list[dict]:
    # Own tight radius + server-side result cap (see FOOD_RADIUS_M comment
    # above) - kept as a separate lighter request rather than joining the
    # main query above, which uses a much wider 4km radius.
    query = (
        f'[out:json][timeout:15];\n(\n'
        f'  nwr["amenity"="restaurant"](around:{FOOD_RADIUS_M},{latitude},{longitude});\n'
        f'  nwr["amenity"="cafe"](around:{FOOD_RADIUS_M},{latitude},{longitude});\n'
        f');\nout center {FOOD_RESULT_CAP};'
    )
    results = []
    for element in _run_overpass(query):
        poi_entry = _element_to_poi(element, "food")
        if poi_entry:
            results.append(poi_entry)
        if len(results) >= MAX_PER_CATEGORY:
            break
    return results


def get_points_of_interest(latitude: float, longitude: float) -> dict[str, list[dict]]:
    """Returns {category_key: [poi, ...]} for all categories in CATEGORIES,
    each capped at MAX_PER_CATEGORY. Raises POIError only on an actual
    request failure - an empty result for a sparsely-mapped area is not
    an error.
    """
    cache_key = (round(latitude, 3), round(longitude, 3))
    if cache_key in _poi_cache:
        return _poi_cache[cache_key]

    grouped = _fetch_landscape_culture_entertainment_family(latitude, longitude)
    grouped["food"] = _fetch_food(latitude, longitude)

    _poi_cache[cache_key] = grouped
    return grouped
