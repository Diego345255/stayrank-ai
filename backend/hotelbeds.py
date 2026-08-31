"""Hotelbeds Content API integration: a second, independent real-hotel-
identity source used when the Booking.com/RapidAPI live sync (api_fetcher.py)
fails for a city - most commonly because the free RapidAPI tier's rate limit
was hit (see the README entry "Fixed: a live-sync failure for a new city
fell back to generated hotels with zero explanation").

What this gives us that's REAL: hotel name, exact coordinates, street
address, a real star category, and real photos - verified live against the
actual API (see README) that a fetched image path resolves to a genuine
JPEG, not a placeholder.

What this does NOT give us, and never fabricates: live pricing, guest
review scores, or per-category amenity ratings. The Content API is a
hotel *directory* (name/photos/facts), not a booking/availability search -
getting real live rates would need Hotelbeds' separate Booking API, which
needs actual stay dates/occupancy and is out of scope here. So price,
guest rating, and the quiet/transit/value-style metric bars for hotels
built here reuse the exact same archetype-based estimation already used by
backend/generator.py for fully-fictional hotels (deterministically seeded
by the hotel's real Hotelbeds code, so a given real hotel always gets the
same estimated numbers on repeat searches) - it's the same "computed
estimate, clearly disclosed" pattern this app already uses, just paired
with a real hotel identity instead of an invented one. Callers must use
source="content" (not "live") when inserting hotels built here, and the
frontend's source badge must disclose the estimate, exactly like the
"generated" tier's badge already does.

Synchronous by design (httpx.Client, not AsyncClient): backend/database.py's
get_or_create_city() - the only caller - and backend/api_fetcher.py's
sync_city() it already calls are both synchronous too, so this matches
that existing, working pattern rather than introducing a new async/sync
boundary into one function.
"""

import hashlib
import json
import random
import re
import time
import unicodedata
from pathlib import Path

import httpx

from backend import circuit_breaker, config
from backend.generator import ARCHETYPES, _slugify
from backend.placeholder import generate_placeholder

CONTENT_BASE_URL = "https://api.test.hotelbeds.com/hotel-content-api/1.0"
REQUEST_TIMEOUT = 20
# "bigger" is one of Hotelbeds' fixed image-size folders (others: small,
# medium, original) - see the "Use of images" doc. Verified live: a
# constructed URL in this form resolved to a real 200 OK image/jpeg
# response during development.
IMAGE_BASE_URL = "https://photos.hotelbeds.com/giata/bigger"
MAX_PHOTOS_PER_HOTEL = 8


class HotelbedsError(Exception):
    """Base class for all Hotelbeds failures. Callers should catch this and fall back."""


class HotelbedsAuthError(HotelbedsError):
    pass


class HotelbedsRateLimitError(HotelbedsError):
    pass


class HotelbedsNetworkError(HotelbedsError):
    pass


def _signature() -> str:
    # Hotelbeds' documented auth scheme: SHA256(ApiKey + Secret + unix
    # timestamp in seconds), hex digest, sent as the X-Signature header
    # alongside the plain Api-key header. Verified live against the real
    # /status endpoint before building anything on top of this.
    timestamp = str(int(time.time()))
    raw = f"{config.HOTELBEDS_API_KEY}{config.HOTELBEDS_SECRET}{timestamp}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


PROVIDER = "hotelbeds"


def _get(path: str, params: dict) -> dict:
    if not config.is_hotelbeds_configured():
        raise HotelbedsError("HOTELBEDS_API_KEY/HOTELBEDS_SECRET not configured")

    open_now, retry_after = circuit_breaker.is_open(PROVIDER)
    if open_now:
        raise HotelbedsRateLimitError(
            f"Hotelbeds is temporarily paused after a recent failure - retrying automatically in "
            f"{circuit_breaker.format_retry_after(retry_after)}"
        )

    headers = {"Api-key": config.HOTELBEDS_API_KEY, "X-Signature": _signature(), "Accept": "application/json"}
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(f"{CONTENT_BASE_URL}{path}", headers=headers, params=params)
    except httpx.TimeoutException as exc:
        circuit_breaker.record_failure(PROVIDER, "request timed out")
        raise HotelbedsNetworkError("Hotelbeds request timed out") from exc
    except httpx.RequestError as exc:
        circuit_breaker.record_failure(PROVIDER, f"network error: {exc}")
        raise HotelbedsNetworkError(f"Hotelbeds network error: {exc}") from exc

    # Verified live: Hotelbeds' Evaluation Plan returns 403 (not 429) for a
    # genuinely exhausted quota, with a body of {"error": "Quota exceeded"}
    # - the exact same HTTP status a rejected API key also uses. Checking
    # the body distinguishes them, since the two have completely different
    # remediations (wait for a backoff window vs. a key that needs fixing)
    # and only one of them means "this API key/secret is fine, try again
    # later" - conflating them would have this circuit breaker firing on,
    # or a user needlessly re-checking, credentials that were never wrong.
    if response.status_code == 403 and "quota" in response.text.lower():
        circuit_breaker.record_failure(PROVIDER, "quota exceeded")
        raise HotelbedsRateLimitError("Hotelbeds API rate limit hit (quota exceeded)")
    if response.status_code in (401, 403):
        circuit_breaker.record_failure(PROVIDER, f"key rejected ({response.status_code})")
        raise HotelbedsAuthError(f"Hotelbeds API key rejected ({response.status_code})")
    if response.status_code == 429:
        circuit_breaker.record_failure(PROVIDER, "rate limited (429)")
        raise HotelbedsRateLimitError("Hotelbeds API rate limit hit (429)")
    if response.status_code >= 400:
        circuit_breaker.record_failure(PROVIDER, f"HTTP {response.status_code}")
        raise HotelbedsError(f"Hotelbeds API error {response.status_code}: {response.text[:200]}")

    circuit_breaker.record_success(PROVIDER)
    return response.json()


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower().strip()


# The full destination list is ~7,300 entries and Hotelbeds' own docs cap
# each response page at 1,000, so building the cache from scratch costs 8
# paginated requests - trivial against a real production quota, but not
# against the free Evaluation Plan's quota, which turned out to be tight
# enough that a handful of dev-loop restarts exhausted it entirely
# (confirmed live: a `/locations/destinations` call started returning a
# real "Quota exceeded" 403 partway through this integration's own
# testing). An in-memory-only cache re-pays that 8-request cost on every
# single process restart, which `uvicorn --reload` triggers on every code
# edit during development - a purely in-process cache would make this
# integration actively hostile to the exact quota that broke it. Persisted
# to disk instead, so the cost is paid once ever (per TTL window), not
# once per restart. Destination names/codes are near-static reference
# data, so a long TTL is appropriate - this isn't live inventory.
_DESTINATIONS_CACHE_PATH = Path(__file__).resolve().parent.parent / "data" / "hotelbeds_destinations_cache.json"
_DESTINATIONS_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days

_destination_cache: list[dict] | None = None


def _read_disk_cache() -> list[dict] | None:
    if not _DESTINATIONS_CACHE_PATH.exists():
        return None
    try:
        payload = json.loads(_DESTINATIONS_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    fetched_at = payload.get("fetched_at")
    destinations = payload.get("destinations")
    if not isinstance(fetched_at, (int, float)) or not isinstance(destinations, list):
        return None
    if time.time() - fetched_at > _DESTINATIONS_CACHE_TTL_SECONDS:
        return None
    return destinations


def _write_disk_cache(destinations: list[dict]) -> None:
    try:
        _DESTINATIONS_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _DESTINATIONS_CACHE_PATH.write_text(
            json.dumps({"fetched_at": time.time(), "destinations": destinations}), encoding="utf-8"
        )
    except OSError:
        pass  # best-effort - an in-memory-only cache for this run is still correct, just not persisted


def _load_destinations() -> list[dict]:
    global _destination_cache
    if _destination_cache is not None:
        return _destination_cache

    from_disk = _read_disk_cache()
    if from_disk is not None:
        _destination_cache = from_disk
        return from_disk

    all_destinations: list[dict] = []
    page_from = 1
    page_size = 1000  # Hotelbeds' own documented max per page
    total = None
    while True:
        data = _get(
            "/locations/destinations",
            {"fields": "all", "language": "ENG", "from": page_from, "to": page_from + page_size - 1},
        )
        page = data.get("destinations", [])
        total = data.get("total", total)
        all_destinations.extend(page)
        if not page or len(all_destinations) >= (total or 0):
            break
        page_from += page_size

    _write_disk_cache(all_destinations)
    _destination_cache = all_destinations
    return all_destinations


_REGION_QUALIFIER_RE = re.compile(r"[-–]")


def find_destination_code(city_name: str) -> str | None:
    """Hotelbeds identifies destinations by its own codes (e.g. "PMI" for
    Palma de Mallorca, "NRT" for Tokyo - verified live), not free-text city
    names, so a lookup is needed before any hotel content can be fetched.
    Many entries carry a region qualifier (e.g. "Toronto-ON", "Sydney -
    NSW") rather than a bare city name, so an exact match is tried first
    and a qualifier-stripped match second. Returns None (not an error) when
    this city genuinely has no Hotelbeds destination - a real "not
    covered" outcome the caller should fall back on, not a failure to
    report as broken.
    """
    destinations = _load_destinations()
    target = _fold(city_name)

    for destination in destinations:
        name = _fold((destination.get("name") or {}).get("content", ""))
        if name == target:
            return destination.get("code")

    for destination in destinations:
        raw_name = (destination.get("name") or {}).get("content", "")
        base = _fold(_REGION_QUALIFIER_RE.split(raw_name)[0])
        if base == target:
            return destination.get("code")

    return None


def _image_url(path: str) -> str:
    return f"{IMAGE_BASE_URL}/{path}"


# Hotelbeds' per-hotel `facilities` array is a list of numeric
# (facilityCode, facilityGroupCode) pairs with no embedded label - the
# human-readable name only exists in a separate, ~450-entry type catalog
# (`/types/facilities`). Rather than fetch and cache that whole catalog at
# runtime, this is a small, hand-verified allowlist built by actually
# querying that catalog once during development and reading the real
# `description.content` for each pair below - e.g. confirmed live that
# code=261/group=60 really is "Wi-fi" and code=200/group=71 really is
# "Restaurant", not guessed from the numbers. IMPORTANT: codes are only
# meaningful paired with their group - code=10 alone means "hotel" under
# group 20, "American Express" under group 30, and "Bathroom" under group
# 60, so this is keyed on the full (code, group) tuple, never code alone.
# Several codes map to the same label on purpose (Hotelbeds has separate
# codes for "outdoor pool"/"outdoor freshwater pool"/"outdoor heated pool"
# etc.) - consolidated here since a traveler doesn't need that granularity,
# only "yes, there's a pool."
_FACILITY_LABELS: dict[tuple[int, int], str] = {
    (261, 60): "Wi-Fi",
    (550, 70): "Wi-Fi",
    (250, 70): "Wired internet",
    (306, 60): "Outdoor pool",
    (313, 60): "Indoor pool",
    (360, 73): "Indoor pool",
    (361, 73): "Indoor pool",
    (362, 73): "Indoor pool",
    (363, 73): "Outdoor pool",
    (364, 73): "Outdoor pool",
    (365, 73): "Outdoor pool",
    (615, 73): "Rooftop pool",
    (470, 70): "Gym",
    (295, 90): "Fitness centre",
    (308, 60): "Fitness room",
    (500, 70): "Parking",
    (560, 70): "Valet parking",
    (562, 70): "Airport shuttle",
    (620, 74): "Spa",
    (460, 74): "Spa treatments",
    (307, 60): "Sauna",
    (420, 74): "Sauna",
    (200, 71): "Restaurant",
    (535, 70): "Pets allowed",
    (540, 70): "Pets allowed",
    (170, 60): "Air conditioning",
    (180, 60): "Air conditioning",
    (70, 70): "Elevator",
    (270, 70): "Room service",
    (280, 70): "Laundry service",
    (250, 60): "Wheelchair accessible",
    # Real bug found while researching an accessibility filter feature and
    # re-checking every accessibility-related code against Hotelbeds' own
    # /types/facilities master data: (295, 60) is NOT "Wheelchair
    # accessible" - per that master list, code 295 means three completely
    # different things depending on its group ("Room size (sqm)" under
    # group 60, "Wheelchair-accessible" under group 70, "Fitness" under
    # group 90 - group 90 already correctly mapped just below). The old
    # (295, 60) entry would have silently mislabeled any hotel reporting
    # its room size as "Wheelchair accessible" - the exact kind of false
    # accessibility claim that could send a wheelchair user to a hotel
    # that isn't actually accessible. Fixed to the real pairing, (295, 70).
    (295, 70): "Wheelchair accessible",
    (124, 10): "Accessible rooms",
    (260, 60): "Disability-friendly bathroom",
    (579, 85): "Universal accessibility",
    # Real, practical eco-amenities (distinct from the third-party
    # CERTIFICATION_LABELS below) - verified against the same master
    # /types/facilities list. (579, 70) is a different real pairing than
    # (579, 85) above - Hotelbeds reuses code numbers across groups, so
    # every addition here was checked against the full master list first,
    # not assumed from the code number alone (see the (295, 60) bug above).
    (300, 70): "Bicycle storage",
    (310, 70): "Bicycle hire service",
    (321, 70): "EV charging station",
    (579, 70): "Hotel's own bike shop/workshop",
}

# Real, third-party sustainability certifications this specific property
# actually holds (facilityGroupCode 75) - fetched and verified live against
# Hotelbeds' own /types/facilities master data (30+ real certifying
# bodies), not a list this app invented. Deliberately keyed by facilityCode
# only (group 75 is a closed, single-purpose group in Hotelbeds' schema -
# unlike the ambiguous codes above, nothing else uses group 75 for a
# different meaning) so a hotel's actual certificationLevel (e.g. "4 Green
# Keys") can be attached as real data alongside the name, never guessed.
CERTIFICATION_LABELS: dict[int, str] = {
    902: "TourCert Certification",
    904: "Green Key (FEE)",
    905: "GreenSign Hotel",
    906: "Bioscore Sustainability Certification",
    907: "Green Tourism",
    908: "Austrian Ecolabel",
    909: "Biosphere Certified",
    910: "EarthCheck Certified",
    911: "Ecotourism Australia ECO Certification",
    912: "Green Growth 2050",
    913: "Green Star Hotel Programme",
    914: "GreenStep Sustainable Tourism",
    915: "Travelife for Accommodation",
    917: "Costa Rica Certification for Sustainable Tourism (CST)",
    919: "Green Key Global Eco-Rating",
    922: "Hoteles mas Verdes",
    923: "Sakura Quality An ESG Practice",
    924: "SERNATUR Sello S",
    926: "Sustainable Seychelles Certified",
    927: "Preferred by Nature",
    928: "The Long Run's Global Ecosphere Retreats (GER) standard",
    929: "TOFT PUG certification",
    930: "TOFT Footprint certification",
    931: "Green Hospitality Certified",
    932: "Good Travel Seal",
    933: "Green Globe Certification",
    934: "Ecostars ESG AI",
    935: "Sustainable Berlin",
    938: "ARC360",
    940: "Ecotourism Australia Sustainable Tourism Certification",
    941: "Hotel Sustainability Basics",
    942: "GSTC Criteria",
    943: "Türkiye Sustainable Tourism Program",
    949: "Sustainable Tourism Network Certification",
}


def _real_amenities(facilities: list[dict]) -> list[str]:
    labels = []
    for facility in facilities:
        code = facility.get("facilityCode")
        group = facility.get("facilityGroupCode")
        label = _FACILITY_LABELS.get((code, group))
        if label and label not in labels:
            labels.append(label)
    return labels


def _parse_star_category(category_code: str | None) -> int | None:
    # Hotelbeds category codes are things like "3EST" (3 estrellas/stars) or
    # "3LL" (3 llaves/keys, used for apartments/rural lodging) - the
    # leading digit is a reasonable star-equivalent regardless of suffix.
    if not category_code:
        return None
    match = re.match(r"(\d)", category_code)
    return int(match.group(1)) if match else None


def _pick_archetype(rng: random.Random, star: int | None) -> dict:
    # Prefer an archetype whose price/star range is actually consistent
    # with the REAL parsed star category, so a real 5-star hotel doesn't
    # get handed the "value_local" archetype's $60-140 price band - known
    # real facts should never be contradicted by an estimated one.
    candidates = [a for a in ARCHETYPES if star is not None and a["star_range"][0] <= star <= a["star_range"][1]]
    return rng.choice(candidates or ARCHETYPES)


def fetch_city_hotels(city_name: str, limit: int = 15) -> tuple[list[dict], str | None] | None:
    """Returns (neighborhoods, hero_image) in the exact shape
    backend/generator.py's generate_city_data() produces, so
    database._insert_city() needs no changes to accept it - just built from
    real Hotelbeds hotel records instead of invented ones. Returns None if
    this city has no Hotelbeds destination match, or that destination has
    no hotel content - both real "not covered" outcomes, not errors; the
    HotelbedsError subclasses are for actual failures (auth, rate limit,
    network) and are left to propagate so the caller can distinguish
    "genuinely not covered" from "the API is down right now".
    """
    destination_code = find_destination_code(city_name)
    if not destination_code:
        return None

    data = _get(
        "/hotels",
        {"fields": "all", "language": "ENG", "from": 1, "to": limit, "destinationCode": destination_code},
    )
    raw_hotels = data.get("hotels", [])
    if not raw_hotels:
        return None

    # Grouped by neighborhood_name, not one dict per hotel, on purpose: the
    # `neighborhoods` table has a UNIQUE(city_id, name) constraint, and
    # Hotelbeds hotels within the same destination often share the exact
    # same `city` field value - reproduced live, a real
    # sqlite3.IntegrityError 500 on /api/search the moment two hotels in
    # one destination returned the same neighborhood_name (the second
    # insert for that name violated the constraint). Still preserves real
    # variation when Hotelbeds' data actually does distinguish
    # sub-areas (e.g. "Santa Ponsa" vs "Palma" within one destination) -
    # this only merges hotels that would have collided anyway, the same
    # fix applied to wikidata_hotels.py's identical bug.
    neighborhoods_by_name: dict[str, dict] = {}
    hero_image = None
    for raw in raw_hotels:
        code = raw.get("code")
        # Hotelbeds' own "content" field occasionally carries stray leading/
        # trailing whitespace (seen live: "Scheuble " for a Zurich hotel,
        # which then doubled up wherever the name gets concatenated with a
        # suffix, e.g. the photo gallery's alt text reading "Scheuble  photo").
        name = ((raw.get("name") or {}).get("content") or f"Hotel {code}").strip()
        # Seeded by the real, stable Hotelbeds hotel code (not the city
        # name) so a given real hotel's estimated numbers stay the same
        # across repeat searches, the same determinism guarantee
        # generator.py already gives fully-fictional hotels.
        rng = random.Random(f"hotelbeds-{code}")
        star = _parse_star_category(raw.get("categoryCode"))
        archetype = _pick_archetype(rng, star)

        images = raw.get("images") or []
        photo_urls = [_image_url(image["path"]) for image in images if image.get("path")][:MAX_PHOTOS_PER_HOTEL]
        if not hero_image and photo_urls:
            hero_image = photo_urls[0]

        metrics = {key: rng.randint(low, high) for key, (low, high) in archetype["metric_ranges"].items()}
        price = rng.randint(*archetype["price_range"])
        rating = round(rng.uniform(4.0, 4.7), 1)
        slug = _slugify(f"hotelbeds-{code}-{name}")
        coordinates = raw.get("coordinates") or {}
        neighborhood_name = ((raw.get("city") or {}).get("content") or city_name).title()
        # Real fields Hotelbeds' Content API already returns in the same
        # response we're already fetching - the hotel's own actual street
        # address and its own official description, previously fetched and
        # silently discarded even though every other field on this dict is
        # real. Deliberately kept SEPARATE from strengths/risk/evidence
        # (which stay archetype-based estimates, clearly disclosed as such)
        # rather than replacing them - this is a second, genuinely real
        # source of hotel-specific text, not a replacement for the honest
        # "here's our estimate" framing the rest of this module already
        # uses for pricing/metrics.
        address = ((raw.get("address") or {}).get("content") or "").strip() or None
        # Real front-desk phone number, when Hotelbeds has one on file -
        # PHONEHOTEL (front desk) preferred over PHONEBOOKING (a call
        # center, not this specific property); PHONEMANAGEMENT/FAXNUMBER
        # entries are skipped as not useful for a traveler wanting to call
        # the actual hotel.
        phones_by_type = {p.get("phoneType"): p.get("phoneNumber") for p in (raw.get("phones") or [])}
        phone = phones_by_type.get("PHONEHOTEL") or phones_by_type.get("PHONEBOOKING")
        amenities = _real_amenities(raw.get("facilities") or [])
        # Real named landmarks near THIS specific hotel, with real
        # Hotelbeds-curated distances in meters - e.g. "CN Tower, 600m" for
        # a real Toronto hotel. Distinct from (and more specific than) the
        # OSM/Overpass-derived POI list used elsewhere in this app, which is
        # centered on the search city generally, not curated per-property.
        # Verified live: distances are honest, not padded (e.g. one hotel
        # correctly lists "Niagara Falls, 140 km" rather than omitting or
        # rounding a genuinely-far landmark down to look closer).
        raw_points = raw.get("interestPoints") or []
        nearby_landmarks = []
        seen_landmark_names = set()
        for point in raw_points:
            landmark_name = (point.get("poiName") or "").strip()
            distance_raw = point.get("distance")
            if not landmark_name or distance_raw is None or landmark_name in seen_landmark_names:
                continue
            try:
                distance_m = int(float(distance_raw))
            except (TypeError, ValueError):
                continue
            seen_landmark_names.add(landmark_name)
            nearby_landmarks.append({"name": landmark_name, "distanceMeters": distance_m})
        nearby_landmarks.sort(key=lambda item: item["distanceMeters"])
        nearby_landmarks = nearby_landmarks[:6]
        # Real official hotel website, when Hotelbeds has one on file - a
        # bare domain in their data (e.g. "www.example.com"), so a scheme
        # is added since that's not renderable as a link on its own.
        website_raw = (raw.get("web") or "").strip()
        website = f"https://{website_raw}" if website_raw and not website_raw.startswith("http") else (website_raw or None)
        # Ground the wifi metric in the real facilities data just parsed,
        # rather than leaving it purely to the archetype dice roll above.
        # Found via testing: the "Work-ready Wi-Fi" must-have filter
        # requires metrics.wifi >= 80 (see ranking.py), but this hotel's
        # wifi score was a pure rng.randint() with zero connection to the
        # real Wi-Fi confirmation now available from _real_amenities() -
        # a hotel with genuinely confirmed Wi-Fi could still fail that
        # filter purely by unlucky roll, and vice versa a hotel with no
        # real confirmation either way could clear it on a lucky one. Only
        # ever raises the floor on a real "yes" - never lowers it on a
        # merely-unconfirmed "we don't know", since Hotelbeds not listing a
        # facility isn't proof of its absence.
        if "Wi-Fi" in amenities:
            metrics["wifi"] = max(metrics["wifi"], 85)
        official_description = ((raw.get("description") or {}).get("content") or "").strip()
        if official_description and len(official_description) > 600:
            cut = official_description[:600]
            last_space = cut.rfind(" ")
            official_description = f"{cut[:last_space if last_space > 400 else 600]}…"
        official_description = official_description or None

        # Real meal-plan options this specific property actually offers
        # (from Hotelbeds' own /types/boards master data, fetched live and
        # cross-checked against the codes seen in practice - see
        # BOARD_CODE_LABELS below) - not what THIS search happened to
        # select, since board/rate selection needs the separate Booking API
        # this app doesn't call. Still genuinely useful before booking: a
        # traveler wanting all-inclusive can see upfront whether it's even
        # an option here, the same "is AI offered" fact Booking.com/Expedia
        # surface via their board-type filters.
        board_codes = []
        for code_raw in raw.get("boardCodes") or []:
            code_clean = (code_raw or "").strip().upper()
            if code_clean and code_clean not in board_codes:
                board_codes.append(code_clean)

        # Real, third-party sustainability certifications - facilityGroupCode
        # 75 in Hotelbeds' own /types/facilities master data, cross-checked
        # against CERTIFICATION_LABELS below (fetched and verified live: 30+
        # real bodies - Green Key, EarthCheck, GSTC Criteria, Ecostars ESG AI,
        # etc. - not a made-up list). Researched competitor "trust and
        # safety" UI patterns for this: 2026 booking platforms lean hard into
        # sustainability signals, but the honest way to do it without a real
        # carbon-footprint data source is to surface only genuine third-party
        # certifications this specific property actually holds - never
        # synthesize an own-brand "eco score" with nothing real behind it.
        # certificationLevel (e.g. "4 Green Keys", "Certified Gold") is
        # itself part of the real Hotelbeds record when present, not
        # inferred - shown as-is or omitted, never guessed.
        sustainability_certifications = []
        seen_cert_names = set()
        for facility in raw.get("facilities") or []:
            if facility.get("facilityGroupCode") != 75:
                continue
            cert_name = CERTIFICATION_LABELS.get(facility.get("facilityCode"))
            if not cert_name or cert_name in seen_cert_names:
                continue
            seen_cert_names.add(cert_name)
            sustainability_certifications.append(
                {"name": cert_name, "level": facility.get("certificationLevel")}
            )

        hotel = {
            "slug": slug,
            "name": name,
            "price": price,
            "original_price": None,
            "rating": rating,
            "star_rating": star or archetype["star_range"][0],
            "latitude": coordinates.get("latitude"),
            "longitude": coordinates.get("longitude"),
            "image": photo_urls[0] if photo_urls else generate_placeholder(slug, name),
            "photos": photo_urls,
            "tags": archetype["tags"],
            "metrics": metrics,
            "strengths": archetype["strengths"],
            "risk": archetype["risk"],
            "evidence": archetype["evidence"],
            # Deliberately NOT a real Booking.com/Hotelbeds ID meant for a
            # booking flow - this only needs to be truthy so the frontend's
            # existing PROXY_METRIC_TITLE tooltip (see app.js) correctly
            # applies to these hotels too: their quiet/transit/cleanliness
            # bars ARE computed estimates, same disclosure the "live"
            # tier's proxy metrics already get, for the same reason.
            "external_id": f"hb-{code}",
            "address": address,
            "official_description": official_description,
            "phone": phone,
            "amenities": amenities,
            "nearby_landmarks": nearby_landmarks,
            "website": website,
            "board_codes": board_codes,
            "sustainability_certifications": sustainability_certifications,
        }
        if neighborhood_name not in neighborhoods_by_name:
            neighborhoods_by_name[neighborhood_name] = {
                "name": neighborhood_name,
                "description": (
                    f"Real hotel directory listings near {neighborhood_name}, sourced from Hotelbeds' hotel "
                    "content database - pricing, guest rating, and category-fit metrics shown here are "
                    "estimated, not live (see the source badge)."
                ),
                "hotels": [],
            }
        neighborhoods_by_name[neighborhood_name]["hotels"].append(hotel)

    return list(neighborhoods_by_name.values()), hero_image
