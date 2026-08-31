import asyncio
import json
import re
from datetime import date, datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from backend import best_time, billing, config, currency, flights, geocoding, llm_engine, poi, ranking, routing, transit, weather, world_cities
from backend import noise_context as noise_context_module
from backend.database import (
    _sync_or_generate,
    ensure_curated_cities,
    find_city_row,
    get_community_reviews_by_hotel,
    get_connection,
    get_or_create_city,
    get_subscription_by_customer_id,
    get_subscription_by_email,
    init_db,
    insert_community_review,
    seed_sample_community_reviews,
    upsert_subscription,
)
from backend.schemas import (
    CheckoutSessionRequest,
    CommunityReviewCreate,
    HotelQuestionRequest,
    ItineraryAdjustRequest,
    PortalSessionRequest,
    SearchRequest,
    ShortlistSummaryRequest,
    SyncRequest,
    TripPlanRequest,
    WalkingRouteRequest,
)
from backend.vector_search import TfidfIndex, hotel_document

app = FastAPI(title="StayRank AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    ensure_curated_cities()
    seed_sample_community_reviews()


def _row_to_hotel(row) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "neighborhood": row["neighborhood_name"],
        "city": row["city_name"],
        "price": row["price"],
        "rating": row["rating"],
        "image": row["image"],
        "tags": json.loads(row["tags"]),
        "strengths": json.loads(row["strengths"]),
        "risk": row["risk"],
        "evidence": row["evidence"],
        "metrics": {
            "quiet": row["quiet"],
            "cleanliness": row["cleanliness"],
            "transit": row["transit"],
            "roomSize": row["room_size"],
            "value": row["value"],
            "family": row["family"],
            "couple": row["couple"],
            "nightlife": row["nightlife"],
            "breakfast": row["breakfast"],
            "wifi": row["wifi"],
        },
        "externalId": row["external_id"],
        "realRating": row["real_rating"],
        "reviewCount": row["review_count"],
        "amenities": json.loads(row["amenities_json"] or "[]"),
        "starRating": row["star_rating"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "photos": json.loads(row["photos_json"] or "[]"),
        "originalPrice": row["original_price"],
        "bookingUrl": row["booking_url"],
        "address": row["address"],
        "officialDescription": row["official_description"],
        "phone": row["phone"],
        "nearbyLandmarks": json.loads(row["nearby_landmarks_json"] or "[]"),
        "website": row["website"],
        "boardCodes": json.loads(row["board_codes_json"] or "[]"),
        "sustainabilityCertifications": json.loads(row["sustainability_certifications_json"] or "[]"),
    }


def _row_to_review(row) -> dict:
    return {
        "id": row["id"],
        "author": row["author"],
        "rating": row["rating"],
        "comment": row["comment"],
        "createdAt": row["created_at"],
    }


def _row_to_community_review(row) -> dict:
    # author_email is deliberately never included - it's the poster's
    # identity for anti-spam purposes only (see schemas.CommunityReviewCreate),
    # never meant to be public.
    return {
        "id": row["id"],
        "author": row["author_name"],
        "rating": row["rating"],
        "tripType": row["trip_type"],
        "body": row["body"],
        "photos": json.loads(row["photos_json"] or "[]"),
        "isSample": bool(row["is_sample"]),
        "createdAt": row["created_at"],
    }


def _fetch_city_hotels(conn, city_id: int) -> list[dict]:
    return conn.execute(
        """
        SELECT hotels.*, neighborhoods.name AS neighborhood_name,
               neighborhoods.description AS neighborhood_description,
               cities.name AS city_name
        FROM hotels
        JOIN neighborhoods ON neighborhoods.id = hotels.neighborhood_id
        JOIN cities ON cities.id = neighborhoods.city_id
        WHERE cities.id = ?
        """,
        (city_id,),
    ).fetchall()


def _fetch_reviews_by_hotel(conn, hotel_ids: list[int]) -> dict[int, list[dict]]:
    if not hotel_ids:
        return {}
    placeholders = ",".join("?" * len(hotel_ids))
    rows = conn.execute(
        f"SELECT * FROM reviews WHERE hotel_id IN ({placeholders}) ORDER BY id DESC",
        hotel_ids,
    ).fetchall()
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["hotel_id"], []).append(_row_to_review(row))
    return grouped


def _resolve_sync_target(city_name: str) -> tuple[str, str] | None:
    """Returns (canonical_name, country) for any recognized city - curated,
    already-cached, or in the world-cities list - so /api/hotels/sync can
    accept the same free-typed input the search box accepts.
    """
    with get_connection() as conn:
        existing = find_city_row(conn, city_name)
        if existing:
            return existing["name"], existing["country"]
    match = world_cities.find_world_city(city_name)
    if match:
        canonical_name, country, _continent, _lat, _lon = match
        return canonical_name, country
    return None


@app.get("/api/world-cities")
def list_world_cities(q: str = ""):
    """The full bundled worldwide city list, for search-box autocomplete.
    This never touches the database or generates hotel data - it's just the
    static list of city names/countries the generator is allowed to use.
    """
    needle = q.strip().lower()
    return [
        {"name": name, "country": country, "continent": continent}
        for name, country, continent, _lat, _lon in world_cities.WORLD_CITIES
        if not needle or needle in name.lower()
    ]


@app.get("/api/cities")
def list_cities():
    """Cities that have actually been searched (and thus cached) so far -
    used for dashboard stats, not for the search box's autocomplete list.
    """
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT cities.id, cities.name, cities.country, cities.hero_image,
                   cities.source, cities.last_synced_at,
                   COUNT(hotels.id) AS hotel_count
            FROM cities
            LEFT JOIN neighborhoods ON neighborhoods.city_id = cities.id
            LEFT JOIN hotels ON hotels.neighborhood_id = neighborhoods.id
            GROUP BY cities.id
            ORDER BY cities.name
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "name": row["name"],
            "country": row["country"],
            "heroImage": row["hero_image"],
            "hotelCount": row["hotel_count"],
            "source": row["source"],
            "lastSyncedAt": row["last_synced_at"],
        }
        for row in rows
    ]


@app.get("/api/config")
def get_config():
    """Lets the frontend show whether live data / LLM search are enabled, without exposing either key."""
    return {
        "liveApiConfigured": config.is_live_api_configured(),
        "liveApiHost": config.HOTEL_API_HOST,
        "llmConfigured": config.is_llm_configured(),
        "llmModel": config.LLM_MODEL,
        "stripeConfigured": config.is_stripe_configured(),
        "stripeLiveMode": config.stripe_is_live_mode(),
        "proPriceCents": config.STRIPE_PRO_PRICE_CENTS,
    }


@app.post("/api/hotels/sync")
def sync_hotels(payload: SyncRequest):
    """Forces a fresh real-data sync for a city, regardless of cache
    staleness - trying the same fallback chain a search already does
    (Booking.com -> Hotelbeds -> Wikidata, see database._sync_or_generate)
    rather than only ever attempting Booking.com. Fixed after a user
    report: the button previously reported outright failure - a plain
    "Booking.com API rate limit hit" error, nothing else attempted -
    while an ordinary search for the very same city, moments later,
    successfully used Hotelbeds or Wikidata data instead via that same
    fallback chain. The button was telling travelers "no real data is
    available" when that was only true of one of now three real sources.
    """
    target = _resolve_sync_target(payload.city)
    if not target:
        raise HTTPException(
            status_code=404,
            detail=f"'{payload.city}' isn't a recognized city. Try a major world city, e.g. Paris, Sydney, or Dubai.",
        )
    canonical_name, country = target

    # world_cities coordinates are needed for the Hotelbeds/Wikidata legs
    # of the fallback chain (a generated-fallback pin, and Wikidata's
    # coordinate-radius query, respectively) - None for a city outside the
    # curated ~124-city list, same limitation get_or_create_city already
    # has for that case (see its own docstring).
    match = world_cities.find_world_city(canonical_name)
    center_lat, center_lon = (match[3], match[4]) if match else (None, None)

    with get_connection() as conn:
        city_row, sync_error = _sync_or_generate(conn, canonical_name, country, center_lat, center_lon)
        hotel_count = len(_fetch_city_hotels(conn, city_row["id"]))

    if city_row["source"] == "generated":
        # Every real source was tried and failed - this is the one case
        # where "Sync live data" should report failure, same honesty bar
        # the automatic search-time toast already holds itself to.
        raise HTTPException(
            status_code=502,
            detail=sync_error or f"No real hotel data available for {canonical_name} right now.",
        )

    return {
        "city": canonical_name,
        "country": country,
        "source": city_row["source"],
        "hotelsSynced": hotel_count,
    }


@app.get("/api/hotels/{hotel_id}")
def get_hotel_detail(hotel_id: int):
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT hotels.*, neighborhoods.name AS neighborhood_name,
                   neighborhoods.description AS neighborhood_description,
                   cities.name AS city_name, cities.source AS city_source,
                   cities.last_synced_at AS city_synced_at
            FROM hotels
            JOIN neighborhoods ON neighborhoods.id = hotels.neighborhood_id
            JOIN cities ON cities.id = neighborhoods.city_id
            WHERE hotels.id = ?
            """,
            (hotel_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"No hotel with id {hotel_id}")
        reviews = _fetch_reviews_by_hotel(conn, [hotel_id]).get(hotel_id, [])
        community_reviews = [_row_to_community_review(r) for r in get_community_reviews_by_hotel(conn, hotel_id)]

    hotel = _row_to_hotel(row)
    hotel["reviews"] = reviews
    hotel["communityReviews"] = community_reviews
    hotel["neighborhoodDescription"] = row["neighborhood_description"]
    # Real per-city sync provenance (backend/database.py already tracks
    # this on every insert/refresh) - feeds the detail dialog's "Data
    # sources" panel so a traveler can see which facts are live/estimated
    # and how fresh the underlying city sync actually is, not just an
    # overall trust claim. citySource is one of live/content/generated/
    # curated - see SOURCE_BADGE_TEXT in app.js for what each tier means.
    hotel["citySource"] = row["city_source"]
    hotel["citySyncedAt"] = row["city_synced_at"]
    return hotel


# --- Community reviews (traveler-submitted, free, no account) ------------
# Deliberately separate from the `reviews` table above, which holds real
# Booking.com/Hotelbeds guest-review data - these are this app's OWN
# visitors writing about their own stay. Posting only requires a name and
# email (no password), same lightweight identity pattern as Trip Planner
# Pro's email-only billing lookup - see database.py's community_reviews
# table comment for why a password-based account would be overkill here.

def _validate_photo_urls(photos: list[str]) -> list[str]:
    cleaned = []
    for url in photos:
        url = url.strip()
        if not url:
            continue
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="Photo links must be a real http:// or https:// image URL.")
        if len(url) > 500:
            raise HTTPException(status_code=422, detail="One of those photo links is too long.")
        cleaned.append(url)
    return cleaned


@app.post("/api/community-reviews")
def create_community_review(payload: CommunityReviewCreate):
    email = _normalize_email(payload.authorEmail)
    author_name = payload.authorName.strip()
    if not author_name:
        raise HTTPException(status_code=422, detail="Enter a name to post under.")
    body = payload.body.strip()
    if len(body) < 10:
        raise HTTPException(status_code=422, detail="Write a few more words about your stay.")
    photos = _validate_photo_urls(payload.photos)
    trip_type = (payload.tripType or "").strip() or None

    with get_connection() as conn:
        hotel_row = conn.execute("SELECT id FROM hotels WHERE id = ?", (payload.hotelId,)).fetchone()
        if not hotel_row:
            raise HTTPException(status_code=404, detail=f"No hotel with id {payload.hotelId}")
        review_id = insert_community_review(
            conn,
            hotel_id=payload.hotelId,
            author_name=author_name,
            author_email=email,
            rating=payload.rating,
            body=body,
            trip_type=trip_type,
            photos=photos,
            is_sample=False,
        )
        row = conn.execute("SELECT * FROM community_reviews WHERE id = ?", (review_id,)).fetchone()

    return _row_to_community_review(row)


MATCH_REASON_TOP_N = 5


@app.post("/api/search")
async def search_hotels(payload: SearchRequest):
    with get_connection() as conn:
        city_row, live_sync_error = get_or_create_city(conn, payload.city)
        if not city_row:
            raise HTTPException(
                status_code=404,
                detail=f"'{payload.city}' isn't a recognized city. Try a major world city, e.g. Paris, Sydney, or Dubai.",
            )
        rows = _fetch_city_hotels(conn, city_row["id"])
        all_city_hotels = [_row_to_hotel(row) for row in rows]
        reviews_by_hotel = _fetch_reviews_by_hotel(conn, [hotel["id"] for hotel in all_city_hotels])

    # Attach a short review preview to each hotel (full list is available via
    # GET /api/hotels/{id}); also feeds the semantic search corpus below.
    for hotel in all_city_hotels:
        hotel["reviews"] = reviews_by_hotel.get(hotel["id"], [])[:3]

    # Semantic search: build a small TF-IDF index over this city's hotels and
    # score every hotel's similarity to the free-text prompt. This stays
    # active regardless of LLM availability - it's the metric-blending layer,
    # not the intent parser.
    documents = {
        hotel["id"]: hotel_document(hotel, row["neighborhood_description"])
        for hotel, row in zip(all_city_hotels, rows)
    }
    index = TfidfIndex(documents)
    semantic_scores = index.score(payload.prompt)

    # LLM-backed intent parsing, with automatic fallback to the rule-based
    # parser inside ranking.get_search_intent - never raises.
    intent = await ranking.get_search_intent(payload.prompt)
    all_musts = (set(payload.mustHaves) | intent["dynamicMusts"]) - set(payload.suppressMusts)

    weights = ranking.compute_effective_weights(payload.weights, intent["boosts"], payload.persona)

    filtered = [
        hotel for hotel in all_city_hotels
        if ranking.passes_tag_filter(hotel, payload.tagFilter)
        and hotel["rating"] >= payload.minRating
        and (payload.minStarRating <= 0 or (hotel["starRating"] or 0) >= payload.minStarRating)
        and ranking.passes_must_haves(hotel, all_musts)
        and (not payload.accessibleOnly or ranking.passes_accessible_filter(hotel))
        and (not payload.budgetOnly or hotel["price"] <= payload.budget)
        and (not payload.petFriendlyOnly or ranking.passes_pet_friendly_filter(hotel))
        and (not payload.neighborhoodFilter or hotel["neighborhood"] == payload.neighborhoodFilter)
    ]

    # Compared against the full city dataset (not just what passed this
    # search's filters) so the average stays statistically meaningful even
    # when strict must-haves narrow the visible results down to a handful.
    price_insights = ranking.compute_price_insights(all_city_hotels)

    ranked = []
    for hotel in filtered:
        semantic_score = semantic_scores.get(hotel["id"], 0.0)
        score = ranking.score_hotel(hotel, weights, payload.budget, intent["boosts"], semantic_score)
        confidence = ranking.compute_confidence(hotel, intent["boosts"], payload.budget, semantic_score)
        ranked.append({
            **hotel,
            "score": score,
            "confidence": confidence,
            "semanticMatch": round(semantic_score * 100),
            "priceInsight": price_insights.get(hotel["id"]),
        })

    landmark_info = None
    landmark_error = None
    landmark_query = payload.landmark.strip()
    if landmark_query:
        # Bias the geocoding search toward this city (see geocode_landmark's
        # own docstring for why this matters) using the average of this
        # city's own real hotel coordinates - already-available data, no
        # extra lookup needed just to get a "center point" for the city.
        city_coords = [
            (hotel["latitude"], hotel["longitude"]) for hotel in all_city_hotels
            if hotel.get("latitude") is not None and hotel.get("longitude") is not None
        ]
        near = (
            (sum(c[0] for c in city_coords) / len(city_coords), sum(c[1] for c in city_coords) / len(city_coords))
            if city_coords else None
        )
        try:
            resolved = geocoding.geocode_landmark(landmark_query, near=near)
        except geocoding.GeocodeError as exc:
            resolved = None
            landmark_error = f"Couldn't reach the geocoding service: {exc}"
        if resolved:
            lat, lon, display_name = resolved
            landmark_info = {"query": landmark_query, "name": display_name, "latitude": lat, "longitude": lon}
            for hotel in ranked:
                if hotel.get("latitude") is not None and hotel.get("longitude") is not None:
                    hotel["distanceFromLandmark"] = round(
                        geocoding.haversine_km(lat, lon, hotel["latitude"], hotel["longitude"]), 1
                    )
                else:
                    hotel["distanceFromLandmark"] = None
        elif not landmark_error:
            landmark_error = f"Couldn't find a location matching '{landmark_query}'."

    sort_key = {
        "price": lambda h: h["price"],
        "confidence": lambda h: -h["confidence"],
        "rating": lambda h: -h["rating"],
        "distance": lambda h: h.get("distanceFromLandmark") if h.get("distanceFromLandmark") is not None else float("inf"),
    }.get(payload.sort, lambda h: -h["score"])
    ranked.sort(key=sort_key)

    # AI "why this matches" callouts for the top few hotels only (separate
    # LLM call, also with its own graceful fallback to no callouts at all).
    # Only attempted when the intent call above actually got a real LLM
    # response within its own short timeout (intent["usedLlm"]) - if that
    # one already fell back (timed out, LLM down, whatever), this second
    # call would almost certainly hit the exact same timeout too, and
    # there's no reason to make every search pay that wait twice just to
    # confirm what the first call already showed. Keeps the worst case for
    # a whole search close to one LLM timeout, not two stacked back to back.
    match_reasons = (
        await ranking.get_match_reasons(payload.prompt, ranked[:MATCH_REASON_TOP_N]) if intent["usedLlm"] else {}
    )
    for hotel in ranked:
        hotel["aiMatchReason"] = match_reasons.get(hotel["id"])

    return {
        "intent": {"found": intent["found"], "boosts": intent["boosts"], "dynamicMusts": sorted(intent["dynamicMusts"])},
        "summaryVibe": intent["summaryVibe"],
        "usedLlm": intent["usedLlm"],
        "weights": weights,
        "budget": payload.budget,
        "cityName": city_row["name"],
        "cityCountry": city_row["country"],
        "cityHeroImage": city_row["hero_image"],
        "citySource": city_row["source"],
        "cityLiveSyncError": live_sync_error,
        "cityHotelCount": len(all_city_hotels),
        "hotels": ranked,
        "neighborhoods": ranking.build_neighborhood_insights(all_city_hotels),
        "scoringModel": ranking.build_scoring_model(weights, intent["boosts"]),
        "landmark": landmark_info,
        "landmarkError": landmark_error,
    }


@app.post("/api/trip-plan")
async def build_trip_plan(payload: TripPlanRequest):
    """Trip Planner Pro: weather + points of interest + a flight-time/fare
    ESTIMATE for a city, built entirely from free/no-key data sources
    (Open-Meteo, Overpass/OSM, great-circle distance). Every sub-fetch has
    its own graceful-fallback error message rather than failing the whole
    plan - same pattern as the live-hotel-data and LLM fallbacks above.
    """
    with get_connection() as conn:
        city_row, _live_sync_error = get_or_create_city(conn, payload.city)
        if not city_row:
            raise HTTPException(
                status_code=404,
                detail=f"'{payload.city}' isn't a recognized city. Try a major world city, e.g. Paris, Sydney, or Dubai.",
            )
        rows = _fetch_city_hotels(conn, city_row["id"])

    # Anchor to the traveler's actual chosen hotel when one is given - real
    # walking distances only mean something relative to where they'd
    # actually be staying. Falls back to the centroid of this city's own
    # hotel coordinates (every source - curated/generated/live - already
    # populates these) rather than failing, since a trip plan is still
    # useful as a general city overview even with no hotel picked yet.
    anchor_hotel = None
    if payload.hotelId is not None:
        anchor_hotel = next((row for row in rows if row["id"] == payload.hotelId), None)

    if anchor_hotel and anchor_hotel["latitude"] is not None and anchor_hotel["longitude"] is not None:
        center_lat = anchor_hotel["latitude"]
        center_lon = anchor_hotel["longitude"]
        anchor_hotel_name = anchor_hotel["name"]
        anchor_hotel_id = anchor_hotel["id"]
    else:
        coords = [
            (row["latitude"], row["longitude"]) for row in rows
            if row["latitude"] is not None and row["longitude"] is not None
        ]
        if not coords:
            raise HTTPException(
                status_code=422,
                detail=f"No coordinates available yet for '{city_row['name']}' - search this city first.",
            )
        center_lat = sum(c[0] for c in coords) / len(coords)
        center_lon = sum(c[1] for c in coords) / len(coords)
        anchor_hotel_name = None
        anchor_hotel_id = None

    nights = max(1, payload.nights)

    weather_days = None
    weather_error = None
    start_date_raw = payload.startDate.strip()
    if start_date_raw:
        try:
            start = date.fromisoformat(start_date_raw)
            weather_days = weather.get_forecast(center_lat, center_lon, start, nights)
        except ValueError:
            weather_error = "Invalid start date - use YYYY-MM-DD."
        except weather.WeatherError as exc:
            weather_error = f"Couldn't reach the weather service: {exc}"

    poi_groups = None
    poi_error = None
    try:
        poi_groups = poi.get_points_of_interest(center_lat, center_lon)
        # Straight-line distance from the anchor point to every place - cheap
        # (no extra network call) and always available, unlike the real
        # routed walking time from routing.py which is fetched lazily and
        # only for items the traveler has actually added to their itinerary.
        for items in poi_groups.values():
            for item in items:
                item["distanceFromHotelKm"] = round(
                    geocoding.haversine_km(center_lat, center_lon, item["latitude"], item["longitude"]), 1
                )
    except poi.POIError as exc:
        poi_error = f"Couldn't reach the points-of-interest service: {exc}"

    # Piggybacks on the same free weather source rather than a new API -
    # useful jet-lag context (a hard flight-hours number doesn't tell you
    # how far your body clock has to shift).
    destination_timezone = None
    try:
        destination_timezone = weather.get_timezone(center_lat, center_lon)
    except weather.WeatherError:
        pass  # Non-critical - the rest of the trip plan still works without it.

    flight_estimate = None
    flight_error = None
    origin_query = payload.originCity.strip()
    if origin_query:
        resolved = None
        # User-reported: "flying from" resolution went straight to the live
        # Nominatim geocoder every time, so a genuinely flaky free service
        # (already documented elsewhere this session for Overpass) broke
        # the flight estimate even when the traveler typed a major world
        # city StayRank already has real, reliable coordinates for - the
        # exact same ~120-city dataset /api/search itself trusts for hotel
        # lookups. Checking that first is a zero-network, zero-flakiness
        # win for the large majority of real "flying from" inputs (any
        # named world city); only genuinely uncommon origins (a smaller
        # town, a specific address, an airport name) still need to fall
        # back to a live geocoding call at all.
        world_city_match = world_cities.find_world_city(origin_query)
        if world_city_match:
            canonical_name, _country, _continent, origin_lat_wc, origin_lon_wc = world_city_match
            resolved = (origin_lat_wc, origin_lon_wc, canonical_name)
        else:
            try:
                resolved = geocoding.geocode_landmark(origin_query)
            except geocoding.GeocodeError as exc:
                flight_error = f"Couldn't reach the geocoding service: {exc}"
        if resolved:
            origin_lat, origin_lon, origin_name = resolved
            flight_estimate = flights.estimate_flight(origin_lat, origin_lon, center_lat, center_lon)
            flight_estimate["originName"] = origin_name
            try:
                origin_timezone = weather.get_timezone(origin_lat, origin_lon)
                if destination_timezone and origin_timezone.get("utcOffsetSeconds") is not None:
                    diff_seconds = destination_timezone["utcOffsetSeconds"] - origin_timezone["utcOffsetSeconds"]
                    flight_estimate["timeDifferenceHours"] = round(diff_seconds / 3600, 1)
            except weather.WeatherError:
                pass
        elif not flight_error:
            flight_error = f"Couldn't find a location matching '{origin_query}'."

    return {
        "cityName": city_row["name"],
        "centerLatitude": center_lat,
        "centerLongitude": center_lon,
        "anchorHotelName": anchor_hotel_name,
        "anchorHotelId": anchor_hotel_id,
        "nights": nights,
        "weather": weather_days,
        "weatherError": weather_error,
        "destinationTimezone": destination_timezone,
        "pointsOfInterest": poi_groups,
        "poiError": poi_error,
        "flightEstimate": flight_estimate,
        "flightError": flight_error,
    }


@app.post("/api/walking-route")
async def walking_route(payload: WalkingRouteRequest):
    """Real routed walking distance/time (see routing.py) for a single
    hotel -> place pair. Deliberately per-pair rather than batched: called
    lazily as each itinerary card renders, not for the whole POI list, to
    stay a light, considerate caller of OSRM's shared public demo server.
    """
    try:
        route = routing.get_walking_route(
            payload.fromLatitude, payload.fromLongitude, payload.toLatitude, payload.toLongitude
        )
    except routing.RoutingError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the routing service: {exc}") from exc
    return route


@app.get("/api/nearest-transit")
def nearest_transit(latitude: float, longitude: float):
    """Real nearest public-transit stop (see transit.py) for a single hotel's
    detail dialog - called lazily, on demand, not for a whole result list.
    A `null` transit field is a legitimate "nothing mapped nearby" outcome,
    not an error; only a real Overpass failure returns a 502.
    """
    try:
        result = transit.find_nearest_transit(latitude, longitude)
    except transit.TransitError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the transit data service: {exc}") from exc
    return {"transit": result}


@app.get("/api/noise-context")
def noise_context(latitude: float, longitude: float):
    """Real "likely quiet/lively" signal (see noise_context.py) for a
    single hotel's detail dialog - called lazily, on demand, same pattern
    as /api/nearest-transit. A real zero-count result is a legitimate
    "likely quiet" outcome, not an error; only a genuine Overpass failure
    returns a 502.
    """
    try:
        result = noise_context_module.get_noise_context(latitude, longitude)
    except noise_context_module.NoiseContextError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the noise-context data service: {exc}") from exc
    return result


@app.get("/api/best-time-to-visit")
def best_time_to_visit(latitude: float, longitude: float):
    """Real month-by-month historical climate averages (see best_time.py) -
    called lazily once per city search (using the top-ranked hotel's real
    coordinates as the city location), not per hotel and not on every
    re-render, since climate is a city-level fact that doesn't change when
    a traveler tweaks a filter.
    """
    try:
        months = best_time.get_monthly_climate(latitude, longitude)
    except best_time.BestTimeError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the historical climate data service: {exc}") from exc
    return {"months": months}


@app.get("/api/currency-rate")
def get_currency_rate(currency_code: str):
    """USD -> currency_code exchange rate, for showing a trip budget in the
    traveler's home currency alongside (never instead of) the USD figure -
    per Frankfurter/ECB, free and no key.
    """
    try:
        rate = currency.convert_from_usd(1.0, currency_code)
    except currency.CurrencyError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't reach the currency service: {exc}") from exc
    if rate is None:
        raise HTTPException(status_code=404, detail=f"'{currency_code}' isn't a recognized currency code.")
    return {"currency": currency_code.strip().upper(), "rate": rate}


@app.post("/api/itinerary-adjust")
async def adjust_itinerary(payload: ItineraryAdjustRequest):
    """Lets a traveler edit their day-by-day plan in plain language (e.g.
    "day 2 should be more relaxed") instead of only drag/drop editing.
    Reuses the pointsOfInterest the client already has - no new Overpass
    call - and the LLM is constrained to choosing only from those real
    places (see ITINERARY_SYSTEM_PROMPT), never inventing new ones.
    """
    if not config.is_llm_configured():
        raise HTTPException(
            status_code=503,
            detail="AI itinerary adjustment needs LLM_API_KEY configured - see .env.example.",
        )
    if not payload.instruction.strip():
        raise HTTPException(status_code=422, detail="Tell the assistant what you'd like to change.")

    try:
        days = await llm_engine.adjust_itinerary_with_llm(
            payload.instruction.strip(), payload.pointsOfInterest, max(1, payload.nights)
        )
    except llm_engine.LLMResponseError:
        # Real user-reported failure: the raw JSON-parser exception message
        # ("Unterminated string starting at...") got shown verbatim - true
        # to what happened, but meaningless to a traveler who just typed a
        # plain-English request. This specific error class means the
        # response was cut off before finishing (see the max_tokens comment
        # on adjust_itinerary_with_llm), not that anything about the
        # traveler's request was wrong - a plain retry is a reasonable fix.
        raise HTTPException(
            status_code=502,
            detail="The AI assistant's response got cut off unexpectedly - try again, or try a shorter request.",
        )
    except llm_engine.LLMError as exc:
        raise HTTPException(status_code=502, detail=f"AI adjustment failed: {exc}") from exc

    if not days:
        raise HTTPException(
            status_code=502,
            detail="The assistant didn't return a usable plan - try rephrasing your request.",
        )
    return {"days": days}


@app.post("/api/shortlist-summary")
async def shortlist_summary(payload: ShortlistSummaryRequest):
    """Short AI trade-off paragraph across the traveler's shortlisted
    hotels, grounded ONLY in real DB fields re-fetched here by ID - never
    the client's own copy, so a tampered/stale request body can't feed the
    LLM a false "fact" to repeat back as if verified. Same fallback
    contract as every other LLM feature in this app: on any failure (not
    configured, rate limit, bad response), the caller shows nothing rather
    than a fabricated comparison.
    """
    if not config.is_llm_configured():
        raise HTTPException(status_code=503, detail="AI comparison needs LLM_API_KEY configured - see .env.example.")
    if not payload.hotelIds:
        raise HTTPException(status_code=422, detail="No hotels to compare.")

    with get_connection() as conn:
        hotels = []
        for hotel_id in payload.hotelIds[:8]:
            row = conn.execute(
                """
                SELECT hotels.*, neighborhoods.name AS neighborhood_name,
                       neighborhoods.description AS neighborhood_description,
                       cities.name AS city_name
                FROM hotels
                JOIN neighborhoods ON neighborhoods.id = hotels.neighborhood_id
                JOIN cities ON cities.id = neighborhoods.city_id
                WHERE hotels.id = ?
                """,
                (hotel_id,),
            ).fetchone()
            if row:
                hotels.append(_row_to_hotel(row))

    if not hotels:
        raise HTTPException(status_code=404, detail="None of the given hotel IDs were found.")

    try:
        summary = await llm_engine.generate_shortlist_comparison(hotels)
    except llm_engine.LLMError as exc:
        raise HTTPException(status_code=502, detail=f"AI comparison failed: {exc}") from exc

    return {"summary": summary}


@app.post("/api/hotels/{hotel_id}/ask")
async def ask_hotel(hotel_id: int, payload: HotelQuestionRequest):
    """Agoda/Expedia-style "ask this hotel" Q&A, but retrieval-constrained:
    the LLM only ever sees this ONE real hotel's own already-fetched fields
    (re-read from the DB by ID here, never trusting client-supplied hotel
    data) and is instructed to say so plainly when the question can't be
    answered from them, rather than guessing. Errors surface to the
    traveler here (unlike the other LLM features' silent-hide fallback),
    since this is a direct response to a question they just asked, not a
    background bonus insight.
    """
    if not config.is_llm_configured():
        raise HTTPException(status_code=503, detail="Ask this hotel needs LLM_API_KEY configured - see .env.example.")
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Type a question first.")
    if len(question) > 300:
        raise HTTPException(status_code=422, detail="That question is too long - keep it under 300 characters.")

    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT hotels.*, neighborhoods.name AS neighborhood_name,
                   neighborhoods.description AS neighborhood_description,
                   cities.name AS city_name
            FROM hotels
            JOIN neighborhoods ON neighborhoods.id = hotels.neighborhood_id
            JOIN cities ON cities.id = neighborhoods.city_id
            WHERE hotels.id = ?
            """,
            (hotel_id,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"No hotel with id {hotel_id}")
    hotel = _row_to_hotel(row)

    # Same real transit lookup /api/nearest-transit uses, re-fetched here
    # server-side (never trusting client-supplied data, per this endpoint's
    # own rule above) so the LLM can actually answer "how far is the
    # nearest station" - it otherwise has no way to know this, even though
    # the detail dialog right above the Q&A box already shows the answer.
    # A failed/slow lookup just means transit info is omitted, same as the
    # dialog's own silent-on-failure fallback - never blocks the answer.
    try:
        transit_info = await asyncio.to_thread(transit.find_nearest_transit, hotel["latitude"], hotel["longitude"])
    except Exception:
        transit_info = None

    try:
        answer = await llm_engine.answer_hotel_question(hotel, question, transit_info=transit_info)
    except llm_engine.LLMError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't get an answer: {exc}") from exc

    return {"answer": answer}


# --- Trip Planner Pro billing (real Stripe subscription) -----------------
# Trip Planner Pro is gated behind a real, live Stripe subscription when
# STRIPE_SECRET_KEY is configured (see backend/config.py/backend/billing.py) -
# no local-only "unlock" fallback once a key is present, since that would
# mean a traveler could be shown a paid feature as free depending on server
# config, which is exactly the kind of inconsistency this app's honesty
# principle exists to avoid. Without a key configured, /api/config's
# stripeConfigured flag tells the frontend to keep showing the old
# "payments aren't set up yet" state instead of a broken paid button.

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ENTITLED_SUBSCRIPTION_STATUSES = {"active", "trialing"}


def _require_stripe_configured():
    if not config.is_stripe_configured():
        raise HTTPException(
            status_code=503,
            detail="Payments aren't configured on this server yet - add a real STRIPE_SECRET_KEY to .env (see .env.example).",
        )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return normalized


@app.post("/api/billing/checkout-session")
def create_checkout_session(payload: CheckoutSessionRequest):
    """Starts a real Stripe subscription Checkout for Trip Planner Pro and
    returns the hosted checkout URL to redirect the traveler to. Stripe's
    own page collects the card - this backend never sees or stores one.
    """
    _require_stripe_configured()
    email = _normalize_email(payload.email)
    try:
        url = billing.create_checkout_session(email, payload.successUrl, payload.cancelUrl)
    except billing.BillingError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't start checkout: {exc}") from exc
    return {"url": url}


@app.get("/api/billing/verify-session")
def verify_checkout_session(session_id: str):
    """Confirms a Checkout Session actually completed and records the
    resulting subscription. Called right after Stripe redirects the
    traveler back to this app, so Pro unlocks immediately without waiting
    on a webhook - see billing.retrieve_checkout_session's docstring for
    why that matters in a dev sandbox with no public URL for Stripe to
    reach.
    """
    _require_stripe_configured()
    try:
        session = billing.retrieve_checkout_session(session_id)
    except billing.BillingError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't verify payment: {exc}") from exc

    subscription = session.get("subscription")
    subscription = subscription if isinstance(subscription, dict) else {}
    status = subscription.get("status", "active" if session.get("status") == "complete" else "incomplete")
    active = session.get("status") == "complete" and status in _ENTITLED_SUBSCRIPTION_STATUSES
    email = (session.get("customer_details") or {}).get("email") or session.get("customer_email")
    period_end = None
    if subscription.get("current_period_end"):
        period_end = datetime.fromtimestamp(subscription["current_period_end"], tz=timezone.utc).isoformat()

    if email:
        email = email.strip().lower()
        with get_connection() as conn:
            upsert_subscription(conn, email, session.get("customer"), subscription.get("id"), status, period_end)

    return {"active": active, "email": email, "status": status}


@app.get("/api/billing/status")
def billing_status(email: str):
    """Server-side entitlement check - the frontend re-verifies against
    this on load rather than trusting its own local flag alone, so
    clearing localStorage never silently grants (nor a stale flag falsely
    revoke) Pro access; the real answer always lives here, keyed by email.
    """
    normalized = _normalize_email(email)
    with get_connection() as conn:
        row = get_subscription_by_email(conn, normalized)
    if not row:
        return {"active": False, "status": None, "currentPeriodEnd": None}
    return {
        "active": row["status"] in _ENTITLED_SUBSCRIPTION_STATUSES,
        "status": row["status"],
        "currentPeriodEnd": row["current_period_end"],
    }


@app.post("/api/billing/portal-session")
def create_portal_session(payload: PortalSessionRequest):
    """Opens Stripe's own hosted Billing Portal so a subscriber can update
    their card or cancel - this app deliberately never implements its own
    cancel/refund logic, so nothing here can drift out of sync with what
    Stripe actually billed. Requires the Billing Portal to be activated
    once in the Stripe Dashboard (Settings -> Billing -> Customer portal) -
    Stripe returns a clear error otherwise, surfaced here rather than
    guessed at.
    """
    _require_stripe_configured()
    normalized = _normalize_email(payload.email)
    with get_connection() as conn:
        row = get_subscription_by_email(conn, normalized)
    if not row or not row["stripe_customer_id"]:
        raise HTTPException(status_code=404, detail="No subscription found for that email.")
    try:
        url = billing.create_billing_portal_session(row["stripe_customer_id"], payload.returnUrl)
    except billing.BillingError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't open the billing portal: {exc}") from exc
    return {"url": url}


@app.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Second, more durable confirmation path for a real deployment with a
    publicly reachable URL (register this endpoint's full URL - e.g.
    https://yourdomain.com/api/billing/webhook - in the Stripe Dashboard's
    Webhooks settings, then put the signing secret it gives you in
    STRIPE_WEBHOOK_SECRET). Not required for the redirect-based flow above
    to work day-to-day, but this is what keeps Pro access in sync with a
    LATER cancellation or failed renewal - events neither the checkout
    redirect nor a same-session page load would ever otherwise see.
    """
    if not config.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=501, detail="Stripe webhook not configured - set STRIPE_WEBHOOK_SECRET in .env.")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = billing.verify_webhook_signature(payload, sig_header, config.STRIPE_WEBHOOK_SECRET)
    except billing.BillingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        email = (data.get("customer_details") or {}).get("email") or data.get("customer_email")
        if email:
            with get_connection() as conn:
                upsert_subscription(
                    conn, email.strip().lower(), data.get("customer"), data.get("subscription"), "active", None
                )
    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        customer_id = data.get("customer")
        status = data.get("status", "canceled" if event_type.endswith("deleted") else "active")
        period_end = None
        if data.get("current_period_end"):
            period_end = datetime.fromtimestamp(data["current_period_end"], tz=timezone.utc).isoformat()
        with get_connection() as conn:
            row = get_subscription_by_customer_id(conn, customer_id)
            if row:
                upsert_subscription(conn, row["email"], customer_id, data.get("id"), status, period_end)

    return {"received": True}
