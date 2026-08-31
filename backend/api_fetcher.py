"""Live hotel + review fetching from the Booking.com API on RapidAPI
(host: booking-com15.p.rapidapi.com).

Schemas below were ground-truthed against the real API during development
(not guessed from memory), since RapidAPI's various "Booking.com" listings
differ in host and response shape between providers/versions.

Design notes, given typical free-tier RapidAPI quotas:
  - One searchDestination + one searchHotels call covers an entire city
    (up to MAX_HOTELS_PER_CITY hotels), with no extra call needed per hotel
    for price/rating/photos - those already come back in the search response.
  - Reviews (getHotelReviews) are a separate call per hotel, so they're only
    fetched for the top MAX_HOTELS_WITH_REVIEWS hotels per city (by review
    score/count), not every hotel.
  - Booking's search response has no direct quiet/transit/nightlife/wifi
    dimensions, so several of our internal metrics are *derived* from what
    it does give us (price spread, review score, distance-to-center and
    room size parsed out of the listing's accessibility label). These are
    clearly heuristic estimates, not ground truth - see _derive_metrics.
"""

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from backend import circuit_breaker, config, database
from backend.placeholder import generate_placeholder

PROVIDER = "booking"


class BookingAPIError(Exception):
    """Base class for all live-API failures. Callers should catch this and
    fall back to procedurally generated data.
    """


class BookingNotConfigured(BookingAPIError):
    pass


class BookingAuthError(BookingAPIError):
    pass


class BookingRateLimitError(BookingAPIError):
    pass


class BookingNotFoundError(BookingAPIError):
    pass


class BookingNetworkError(BookingAPIError):
    pass


REQUEST_TIMEOUT = 20
MAX_HOTELS_PER_CITY = 40  # searchHotels already returns this in one call - raising the cap costs zero extra API quota
MAX_HOTELS_WITH_REVIEWS = 10
REVIEWS_PER_HOTEL = 5

_BIDI_SEGMENT_RE = re.compile(r"‎([^‎‬]+)‬")
_ROOM_SIZE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*m²")
_DISTANCE_RE = re.compile(r"([\d.]+)\s*km from downtown")
_BIDI_STRIP_RE = re.compile(r"[‎‬]")


def _clamp(value: float, low: float, high: float) -> int:
    return int(max(low, min(high, round(value))))


def _client() -> httpx.Client:
    if not config.is_live_api_configured():
        raise BookingNotConfigured("HOTEL_API_KEY is not configured")
    return httpx.Client(
        base_url=f"https://{config.HOTEL_API_HOST}",
        headers={"X-RapidAPI-Key": config.HOTEL_API_KEY, "X-RapidAPI-Host": config.HOTEL_API_HOST},
        timeout=REQUEST_TIMEOUT,
    )


def _request(client: httpx.Client, path: str, params: dict):
    # See backend/circuit_breaker.py's module docstring for why this
    # exists: without it, every city search independently rediscovers a
    # rate limit by making its own doomed call. Booking.com's free RapidAPI
    # tier was rate-limited on essentially every real call made against it
    # this session, so this isn't a defensive-only guard.
    open_now, retry_after = circuit_breaker.is_open(PROVIDER)
    if open_now:
        raise BookingRateLimitError(
            f"Booking.com is temporarily paused after a recent failure - retrying automatically in "
            f"{circuit_breaker.format_retry_after(retry_after)}"
        )

    try:
        response = client.get(path, params=params)
    except httpx.TimeoutException as exc:
        circuit_breaker.record_failure(PROVIDER, "request timed out")
        raise BookingNetworkError(f"Timed out calling {path}") from exc
    except httpx.RequestError as exc:
        circuit_breaker.record_failure(PROVIDER, f"network error: {exc}")
        raise BookingNetworkError(f"Network error calling {path}: {exc}") from exc

    if response.status_code in (401, 403):
        circuit_breaker.record_failure(PROVIDER, f"key rejected ({response.status_code})")
        raise BookingAuthError(f"{path} rejected the API key ({response.status_code})")
    if response.status_code == 429:
        circuit_breaker.record_failure(PROVIDER, "rate limited (429)")
        raise BookingRateLimitError(f"{path} was rate-limited (429)")
    if response.status_code == 404:
        # Not a provider-health signal - a single missing destination/hotel
        # doesn't mean Booking.com itself is down, so this deliberately
        # doesn't trip the breaker the way the failures above do.
        raise BookingNotFoundError(f"{path} returned 404")
    if response.status_code >= 400:
        circuit_breaker.record_failure(PROVIDER, f"HTTP {response.status_code}")
        raise BookingAPIError(f"{path} failed with {response.status_code}: {response.text[:200]}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise BookingAPIError(f"{path} returned a non-JSON response") from exc

    if payload.get("status") is False:
        raise BookingAPIError(f"{path} reported failure: {payload.get('message')}")

    circuit_breaker.record_success(PROVIDER)
    return payload.get("data")


def search_destination(client: httpx.Client, city_name: str) -> dict | None:
    data = _request(client, "/api/v1/hotels/searchDestination", {"query": city_name})
    if not data:
        return None
    cities = [item for item in data if item.get("dest_type") == "city"]
    candidates = cities or data
    exact = [item for item in candidates if (item.get("name") or "").lower() == city_name.lower()]
    return (exact or candidates)[0]


def search_hotels(client: httpx.Client, dest_id: str) -> list[dict]:
    arrival = datetime.now(timezone.utc) + timedelta(days=45)
    departure = arrival + timedelta(days=3)
    data = _request(client, "/api/v1/hotels/searchHotels", {
        "dest_id": dest_id,
        "search_type": "CITY",
        "arrival_date": arrival.strftime("%Y-%m-%d"),
        "departure_date": departure.strftime("%Y-%m-%d"),
        "adults": "2",
        "room_qty": "1",
        "page_number": "1",
        "units": "metric",
        "currency_code": "USD",
        "languagecode": "en-us",
    })
    hotels = (data or {}).get("hotels", [])
    return hotels[:MAX_HOTELS_PER_CITY]


def fetch_reviews(client: httpx.Client, hotel_id: str) -> list[dict]:
    try:
        data = _request(client, "/api/v1/hotels/getHotelReviews", {
            "hotel_id": str(hotel_id),
            "languagecode": "en-us",
            "sort_type": "SORT_MOST_RELEVANT",
        })
    except BookingAPIError:
        return []  # reviews are a nice-to-have; don't fail the whole sync over one hotel's reviews

    results = (data or {}).get("result", [])
    reviews = []
    for item in results[:REVIEWS_PER_HOTEL]:
        author = (item.get("author") or {}).get("name") or "Anonymous guest"
        comment = " ".join(part for part in [item.get("title"), item.get("pros"), item.get("cons")] if part).strip()
        # Note: this endpoint's "average_score" field was verified against real
        # responses to be a near-constant value (~4) uncorrelated with review
        # sentiment - not a genuine per-review rating - so we deliberately don't
        # surface it. The hotel's overall real_rating (from search) is accurate;
        # only the *individual review* score is unreliable on this API.
        reviews.append({
            "author": author,
            "rating": None,
            "comment": (comment or "No written comment.")[:500],
            "created_at": item.get("date"),
        })
    return reviews


def _parse_accessibility_label(label: str) -> dict:
    label = label or ""
    segments = _BIDI_SEGMENT_RE.findall(label)
    room_size_match = _ROOM_SIZE_RE.search(label)
    distance_match = _DISTANCE_RE.search(label)
    return {
        "area_name": segments[0].strip() if segments else None,
        "room_size_m2": float(room_size_match.group(1)) if room_size_match else None,
        "distance_km": float(distance_match.group(1)) if distance_match else None,
        "is_family_friendly": "family" in label.lower(),
    }


def _clean_label_text(label: str) -> str:
    return _BIDI_STRIP_RE.sub("", label or "").replace("\n", " ").strip()


def _derive_metrics(prop: dict, parsed: dict, price_stats: dict, price: float | None) -> dict:
    review_score = prop.get("reviewScore") or 0  # 0-10 scale from Booking.com

    # Directly informed by real API fields:
    cleanliness = _clamp(review_score * 10, 20, 99) if review_score else 75
    if price is not None and price_stats["max"] > price_stats["min"]:
        position = (price - price_stats["min"]) / (price_stats["max"] - price_stats["min"])
        value = _clamp(98 - position * 58, 20, 98)
    else:
        value = 75
    room_size_score = _clamp(parsed["room_size_m2"] * 3.2, 30, 98) if parsed["room_size_m2"] else 65

    # Heuristic proxies derived from distance-to-center, since Booking's
    # search response has no direct quiet/transit/nightlife dimensions.
    distance_km = parsed["distance_km"]
    if distance_km is not None:
        transit = _clamp(100 - distance_km * 9, 15, 97)
        nightlife = _clamp(88 - distance_km * 7, 20, 90)
        quiet = _clamp(38 + distance_km * 6, 30, 95)
    else:
        transit, nightlife, quiet = 70, 50, 65

    family = 82 if parsed["is_family_friendly"] else 55
    couple = 78 if review_score >= 8 else 68
    breakfast = 65  # not available without an extra per-hotel details call
    wifi = 75  # not available without an extra per-hotel details call

    return {
        "quiet": quiet, "cleanliness": cleanliness, "transit": transit, "roomSize": room_size_score,
        "value": value, "family": family, "couple": couple, "nightlife": nightlife,
        "breakfast": breakfast, "wifi": wifi,
    }


def _derive_tags(metrics: dict) -> list[str]:
    tags = []
    if metrics["quiet"] >= 75:
        tags.append("quiet")
    if metrics["transit"] >= 85:
        tags.append("transit")
    if metrics["value"] >= 85:
        tags.append("value")
    if metrics["roomSize"] >= 80:
        tags.append("space")
    if metrics["family"] >= 78:
        tags.append("family")
    if metrics["nightlife"] >= 70:
        tags.append("nightlife")
    return tags[:3] or ["clean"]


def _derive_strengths(prop: dict, parsed: dict, city_name: str) -> list[str]:
    strengths = []
    review_word = prop.get("reviewScoreWord")
    review_count = prop.get("reviewCount") or 0
    if review_word:
        strengths.append(f"{review_word} guest reviews ({review_count} review{'s' if review_count != 1 else ''} on Booking.com)")
    if parsed["distance_km"] is not None:
        strengths.append(f"{parsed['distance_km']:.1f} km from downtown {city_name}")
    if parsed["room_size_m2"] is not None:
        strengths.append(f"{parsed['room_size_m2']:.0f}m² of living space")
    return strengths[:3] or ["Live listing with real-time Booking.com pricing"]


def _derive_risk(prop: dict) -> str:
    review_count = prop.get("reviewCount") or 0
    if review_count == 0:
        return "New to Booking.com - no guest reviews yet."
    if review_count < 3:
        return "Limited review history so far."
    return "Pricing and availability can change quickly on Booking.com."


def _derive_amenities(label: str, parsed: dict) -> list[str]:
    lower = label.lower()
    amenities = []
    if parsed["is_family_friendly"]:
        amenities.append("Family friendly")
    if "free cancellation" in lower:
        amenities.append("Free cancellation")
    if "entire apartment" in lower or "entire home" in lower:
        amenities.append("Entire place")
    # Found via testing: this unconditionally claimed "Wi-Fi" for every
    # single Booking.com-sourced hotel regardless of evidence - Booking's
    # search response has no real per-property Wi-Fi confirmation without
    # an extra getHotelDetails call (see the `wifi = 75` placeholder score
    # above, which is honestly commented as unavailable). Every other tag
    # in this list is only added when Booking's own accessibility-label
    # text actually mentions it; "Wi-Fi" now follows the same rule instead
    # of being the one unconditional exception.
    if "wifi" in lower or "wi-fi" in lower:
        amenities.append("Wi-Fi")
    return amenities


def _booking_search_url(name: str, city_name: str) -> str:
    """A real, always-resolvable Booking.com deep link for this hotel. We
    don't have the exact hotel slug/URL without an extra getHotelDetails
    call per hotel (skipped to save API quota), so this routes to a
    Booking.com search pre-filled with the hotel name - lands the user on
    the real listing in practice, same host as the data source itself.
    """
    query = quote(f"{name} {city_name}")
    return f"https://www.booking.com/searchresults.html?ss={query}"


def _build_hotel_record(raw_hotel: dict, city_name: str, price_stats: dict) -> dict | None:
    prop = raw_hotel.get("property") or {}
    hotel_id = raw_hotel.get("hotel_id")
    name = prop.get("name")
    if not hotel_id or not name:
        return None

    label = raw_hotel.get("accessibilityLabel", "")
    parsed = _parse_accessibility_label(label)

    price_breakdown = prop.get("priceBreakdown") or {}
    gross_price = price_breakdown.get("grossPrice") or {}
    price = gross_price.get("value")
    metrics = _derive_metrics(prop, parsed, price_stats, price)

    strikethrough = price_breakdown.get("strikethroughPrice") or {}
    original_price_value = strikethrough.get("value")
    original_price = round(original_price_value) if isinstance(original_price_value, (int, float)) else None

    review_score = prop.get("reviewScore") or 0
    review_count = prop.get("reviewCount") or 0
    rating5 = round(review_score / 2, 1) if review_count > 0 and review_score else 4.0

    # accuratePropertyClass is Booking's "verified" star rating; propertyClass
    # is the (sometimes less reliable) self-reported one. Both are 0 when unrated.
    star_rating = prop.get("accuratePropertyClass") or prop.get("propertyClass") or None

    photo_urls = prop.get("photoUrls") or []
    image = photo_urls[0] if photo_urls else generate_placeholder(f"hotel-{hotel_id}", name)

    return {
        "slug": f"live-{hotel_id}",
        "name": name,
        "price": max(round(price), 1) if isinstance(price, (int, float)) else 100,
        "original_price": original_price if original_price and original_price > (price or 0) else None,
        "rating": rating5,
        "star_rating": star_rating,
        "latitude": prop.get("latitude"),
        "longitude": prop.get("longitude"),
        "image": image,
        "photos": photo_urls or [image],
        "tags": _derive_tags(metrics),
        "metrics": metrics,
        "strengths": _derive_strengths(prop, parsed, city_name),
        "risk": _derive_risk(prop),
        "evidence": _clean_label_text(label) or f"Live Booking.com listing in {city_name}.",
        "external_id": str(hotel_id),
        "real_rating": review_score,
        "review_count": review_count,
        "amenities": _derive_amenities(label, parsed),
        "booking_url": _booking_search_url(name, city_name),
        "area_name": parsed["area_name"] or f"{city_name} Center",
        "_review_priority": (review_score, review_count),
    }


def _group_into_neighborhoods(records: list[dict], city_name: str) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for record in records:
        groups.setdefault(record["area_name"], []).append(record)

    return [
        {
            "name": area_name,
            "description": f"A live-listed area of {city_name} with {len(hotels)} Booking.com propert{'y' if len(hotels) == 1 else 'ies'} in this search.",
            "hotels": hotels,
        }
        for area_name, hotels in groups.items()
    ]


def sync_city(conn, city_name: str, country_hint: str | None = None) -> dict:
    """Fetches live hotels + reviews for a city and replaces whatever is
    cached for it in the database. Raises BookingAPIError (or a subclass)
    on any failure - callers are expected to catch that and fall back to
    procedurally generated data.
    """
    with _client() as client:
        destination = search_destination(client, city_name)
        if not destination:
            raise BookingNotFoundError(f"No Booking.com destination match for '{city_name}'")

        dest_id = destination.get("dest_id")
        country = destination.get("country") or country_hint or "Unknown"
        raw_hotels = search_hotels(client, dest_id)
        if not raw_hotels:
            raise BookingNotFoundError(f"Booking.com returned no hotels for '{city_name}'")

        prices = []
        for raw in raw_hotels:
            gross = ((raw.get("property") or {}).get("priceBreakdown") or {}).get("grossPrice") or {}
            value = gross.get("value")
            if isinstance(value, (int, float)):
                prices.append(value)
        price_stats = {"min": min(prices) if prices else 0, "max": max(prices) if prices else 0}

        records = [
            record for record in (_build_hotel_record(raw, city_name, price_stats) for raw in raw_hotels)
            if record
        ]
        if not records:
            raise BookingNotFoundError(f"Booking.com hotels for '{city_name}' could not be parsed")

        records.sort(key=lambda r: r["_review_priority"], reverse=True)
        for record in records[:MAX_HOTELS_WITH_REVIEWS]:
            record["reviews"] = fetch_reviews(client, record["external_id"])
        for record in records:
            record.pop("_review_priority", None)
            record.setdefault("reviews", [])

        neighborhoods = _group_into_neighborhoods(records, city_name)
        hero_image = generate_placeholder(f"city-{city_name.lower()}", city_name, width=900, height=500)

    database.replace_city_with_live_data(conn, city_name, country, hero_image, neighborhoods)

    return {
        "city": city_name,
        "country": country,
        "hotelsSynced": len(records),
        "reviewsSynced": sum(len(record["reviews"]) for record in records),
    }
