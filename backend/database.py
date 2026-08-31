import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend import config, generator, world_cities
from backend.seed_data import CITIES

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "hotels.db"

LIVE_DATA_STALE_AFTER = timedelta(hours=24)

# Real city names, even long compound ones ("Ho Chi Minh City", "Rio de
# Janeiro"), stay well under this. Anything longer is never a legitimate
# search - just a cheap floor so junk/spam input (found via testing: a
# 5000-character garbage string) doesn't burn a real Booking.com API call
# in the non-curated-city live-sync path below before failing anyway.
MAX_CITY_NAME_LENGTH = 80

SCHEMA = """
CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL,
    hero_image TEXT,
    source TEXT NOT NULL DEFAULT 'curated',
    last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS neighborhoods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    UNIQUE(city_id, name)
);

CREATE TABLE IF NOT EXISTS hotels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    neighborhood_id INTEGER NOT NULL REFERENCES neighborhoods(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    rating REAL NOT NULL,
    image TEXT,
    tags TEXT NOT NULL,
    strengths TEXT NOT NULL,
    risk TEXT,
    evidence TEXT,
    quiet INTEGER NOT NULL,
    cleanliness INTEGER NOT NULL,
    transit INTEGER NOT NULL,
    room_size INTEGER NOT NULL,
    value INTEGER NOT NULL,
    family INTEGER NOT NULL,
    couple INTEGER NOT NULL,
    nightlife INTEGER NOT NULL,
    breakfast INTEGER NOT NULL,
    wifi INTEGER NOT NULL,
    external_id TEXT,
    real_rating REAL,
    review_count INTEGER NOT NULL DEFAULT 0,
    amenities_json TEXT NOT NULL DEFAULT '[]',
    star_rating REAL,
    latitude REAL,
    longitude REAL,
    photos_json TEXT NOT NULL DEFAULT '[]',
    original_price INTEGER,
    booking_url TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    author TEXT,
    rating REAL,
    comment TEXT,
    created_at TEXT
);

-- One row per email that has ever started a real Stripe subscription for
-- Trip Planner Pro. Keyed by email (not a user account - this app has no
-- login system) so a returning traveler on any device can restore access
-- by re-entering the same email they subscribed with, rather than losing
-- a paid subscription just because localStorage got cleared.
CREATE TABLE IF NOT EXISTS pro_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT NOT NULL DEFAULT 'inactive',
    current_period_end TEXT,
    updated_at TEXT NOT NULL
);

-- Traveler-submitted reviews with optional photos, shown on a hotel's
-- detail page alongside (but visually separated from) the `reviews` table
-- above, which is real Booking.com/Hotelbeds guest-review data. Same
-- no-login philosophy as pro_subscriptions: author_email identifies the
-- poster (and is never returned by the API) without requiring a password
-- or account. is_sample marks the handful of example rows this app seeds
-- itself (see backend/community_seed.py) so the UI can badge them
-- honestly as demo content rather than pass them off as real travelers.
CREATE TABLE IF NOT EXISTS community_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hotel_id INTEGER NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    rating INTEGER NOT NULL,
    trip_type TEXT,
    body TEXT NOT NULL,
    photos_json TEXT NOT NULL DEFAULT '[]',
    is_sample INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
"""

# Columns added after the initial release, kept here so existing hotels.db
# files on disk get migrated in place instead of requiring a manual reset.
_MIGRATIONS = {
    "cities": [
        ("source", "TEXT NOT NULL DEFAULT 'curated'"),
        ("last_synced_at", "TEXT"),
    ],
    "hotels": [
        ("external_id", "TEXT"),
        ("real_rating", "REAL"),
        ("review_count", "INTEGER NOT NULL DEFAULT 0"),
        ("amenities_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("star_rating", "REAL"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("photos_json", "TEXT NOT NULL DEFAULT '[]'"),
        ("original_price", "INTEGER"),
        ("booking_url", "TEXT"),
        ("address", "TEXT"),
        ("official_description", "TEXT"),
        ("phone", "TEXT"),
        ("nearby_landmarks_json", "TEXT"),
        ("website", "TEXT"),
        ("board_codes_json", "TEXT"),
        ("sustainability_certifications_json", "TEXT"),
    ],
}


@contextmanager
def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate_columns(conn):
    for table, columns in _MIGRATIONS.items():
        existing_columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column_name, column_def in columns:
            if column_name not in existing_columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_def}")


def init_db():
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        _migrate_columns(conn)


def _insert_city(
    conn,
    name: str,
    country: str,
    hero_image: str,
    neighborhoods: list[dict],
    source: str = "curated",
    last_synced_at: str | None = None,
) -> int:
    cursor = conn.execute(
        "INSERT INTO cities (name, country, hero_image, source, last_synced_at) VALUES (?, ?, ?, ?, ?)",
        (name, country, hero_image, source, last_synced_at),
    )
    city_id = cursor.lastrowid

    for neighborhood in neighborhoods:
        cursor = conn.execute(
            "INSERT INTO neighborhoods (city_id, name, description) VALUES (?, ?, ?)",
            (city_id, neighborhood["name"], neighborhood["description"]),
        )
        neighborhood_id = cursor.lastrowid

        for hotel in neighborhood["hotels"]:
            metrics = hotel["metrics"]
            cursor = conn.execute(
                """
                INSERT INTO hotels (
                    slug, neighborhood_id, name, price, rating, image,
                    tags, strengths, risk, evidence,
                    quiet, cleanliness, transit, room_size, value,
                    family, couple, nightlife, breakfast, wifi,
                    external_id, real_rating, review_count, amenities_json,
                    star_rating, latitude, longitude, photos_json, original_price, booking_url,
                    address, official_description, phone, nearby_landmarks_json, website, board_codes_json,
                    sustainability_certifications_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    hotel["slug"],
                    neighborhood_id,
                    hotel["name"],
                    hotel["price"],
                    hotel["rating"],
                    hotel["image"],
                    json.dumps(hotel["tags"]),
                    json.dumps(hotel["strengths"]),
                    hotel["risk"],
                    hotel["evidence"],
                    metrics["quiet"],
                    metrics["cleanliness"],
                    metrics["transit"],
                    metrics["roomSize"],
                    metrics["value"],
                    metrics["family"],
                    metrics["couple"],
                    metrics["nightlife"],
                    metrics["breakfast"],
                    metrics["wifi"],
                    hotel.get("external_id"),
                    hotel.get("real_rating"),
                    hotel.get("review_count", 0),
                    json.dumps(hotel.get("amenities", [])),
                    hotel.get("star_rating"),
                    hotel.get("latitude"),
                    hotel.get("longitude"),
                    json.dumps(hotel.get("photos") or ([hotel["image"]] if hotel.get("image") else [])),
                    hotel.get("original_price"),
                    hotel.get("booking_url"),
                    hotel.get("address"),
                    hotel.get("official_description"),
                    hotel.get("phone"),
                    json.dumps(hotel.get("nearby_landmarks") or []),
                    hotel.get("website"),
                    json.dumps(hotel.get("board_codes") or []),
                    json.dumps(hotel.get("sustainability_certifications") or []),
                ),
            )
            hotel_id = cursor.lastrowid

            for review in hotel.get("reviews", []):
                conn.execute(
                    "INSERT INTO reviews (hotel_id, author, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
                    (hotel_id, review.get("author"), review.get("rating"), review.get("comment"), review.get("created_at")),
                )

    return city_id


def ensure_curated_cities():
    """Insert the hand-authored cities from seed_data.py, skipping any that
    are already present. Safe to call on every startup.
    """
    with get_connection() as conn:
        for city in CITIES:
            existing = conn.execute(
                "SELECT id FROM cities WHERE LOWER(name) = LOWER(?)", (city["name"],)
            ).fetchone()
            if existing:
                continue
            _insert_city(conn, city["name"], city["country"], city["hero_image"], city["neighborhoods"], source="curated")


def find_city_row(conn, city_name: str):
    return conn.execute(
        "SELECT * FROM cities WHERE LOWER(name) = LOWER(?)", (city_name,)
    ).fetchone()


def _is_stale(last_synced_at: str | None, window: timedelta = LIVE_DATA_STALE_AFTER) -> bool:
    if not last_synced_at:
        return True
    try:
        synced = datetime.fromisoformat(last_synced_at)
    except ValueError:
        return True
    return datetime.now(timezone.utc) - synced > window


# "generated" and "content" are both fallback tiers reached only because a
# real source failed at the time - unlike the 24h LIVE_DATA_STALE_AFTER
# window (which just keeps already-real data fresh), these should retry
# for a real upgrade much sooner. Reproduced live: searching "Toronto"
# repeatedly after Booking.com's rate limit and Hotelbeds' free-tier quota
# had both failed once kept silently re-serving the same stale generated
# row forever - `existing["source"] == "live"` was the *only* retry
# condition, so a city that fell back to "generated" had no path back to
# real data even after both providers recovered, without an operator
# manually deleting its row. An hour is short enough that a traveler
# genuinely benefits from Booking.com's rate limit or Hotelbeds' quota
# window resetting mid-session, not so short that ordinary repeat searches
# of the same city re-hit both external APIs on every request.
FALLBACK_RETRY_AFTER = timedelta(hours=1)


def replace_city_with_live_data(conn, city_name: str, country: str, hero_image: str, neighborhoods: list[dict]) -> int:
    """Used by api_fetcher's sync flow: replaces whatever is cached for this
    city (if anything) with freshly fetched live data. ON DELETE CASCADE
    takes care of the old neighborhoods/hotels/reviews.
    """
    existing = find_city_row(conn, city_name)
    if existing:
        conn.execute("DELETE FROM cities WHERE id = ?", (existing["id"],))
    now_iso = datetime.now(timezone.utc).isoformat()
    return _insert_city(conn, city_name, country, hero_image, neighborhoods, source="live", last_synced_at=now_iso)


def get_or_create_city(conn, city_name: str):
    """Look up a city by name. Returns (city_row, live_sync_error).

    - If cached and fresh (or not live-sourced), return it as-is.
    - If cached but from a stale live sync, try to refresh it; on failure,
      serve the stale cached copy rather than failing the search.
    - If not cached at all but in our curated world_cities list: try the
      live API first (when configured), and fall back to procedural
      generation if that fails or isn't configured.
    - If not cached and not in world_cities either, but a live API key is
      configured: still attempt a real Booking.com sync using the raw
      typed name before giving up. world_cities is a small curated list
      (~124 cities) kept only to give the procedural generator a real
      lat/lon center to place hotels around - it was never meant to be the
      full universe of searchable cities, but until this fix it silently
      *was* one, even for travelers with a live API key who could
      genuinely search any city Booking.com itself recognizes. Booking's
      own destination search handles fuzzy/alternate spellings far better
      than this list ever could, so this is a strictly wider net, not a
      replacement for it - procedural generation still needs world_cities'
      coordinates and has no fallback of its own.
    - city_row is None only if the city isn't recognized anywhere.
    - live_sync_error is None unless a live sync was actually attempted
      (live API configured, and this city wasn't already cached fresh) and
      it failed - e.g. "Booking.com API rate limit hit: ... (429)". Callers
      can surface this so a traveler sees *why* they're getting generated
      preview data for a city the app would otherwise have fetched real
      hotels (and real photos) for, instead of a silent, unexplained
      fallback. Reproduced live: with a real, correctly configured
      HOTEL_API_KEY, searching a brand-new city returned generated
      placeholder hotels with no indication anywhere that a live sync had
      even been tried, let alone that it failed on a 429 from Booking.com's
      own rate limit - looked indistinguishable from the key just not
      being configured at all.
    """
    # local imports: avoid a circular import at module load time
    from backend import api_fetcher, hotelbeds

    # world_cities.find_world_city() normalizes diacritics (see that
    # module), so "Sao Paulo" and its real spelling now both resolve to
    # the same canonical entry. But this DB lookup didn't get the same
    # treatment: it only ever checked the *raw* input against `cities.name`
    # (which is an exact-string column, not diacritic-folded). Once the
    # world_cities fix let a second spelling of an already-cached city
    # through, this find_city_row(conn, city_name) call still missed the
    # existing row (different string), fell through to the "not cached"
    # branch, and tried to _insert_city() the same canonical name a second
    # time - a real sqlite3.IntegrityError (UNIQUE constraint on
    # cities.name), reproduced live: searching "Sao Paulo" (real spelling)
    # right after "Sao Paulo" (plain) had already been searched and cached
    # crashed the request with a 500. Checking the canonical name too
    # (when world_cities recognizes the input) finds that existing row
    # instead of trying to recreate it.
    existing = find_city_row(conn, city_name)
    if not existing:
        match = world_cities.find_world_city(city_name)
        if match:
            existing = find_city_row(conn, match[0])
    if existing:
        if existing["source"] == "live" and _is_stale(existing["last_synced_at"]):
            try:
                api_fetcher.sync_city(conn, existing["name"])
                return find_city_row(conn, existing["name"]), None
            except api_fetcher.BookingAPIError as exc:
                # serve the stale row below rather than failing the search
                return existing, f"Couldn't refresh live data for {existing['name']}: {exc}"
        if existing["source"] in ("generated", "content") and _is_stale(
            existing["last_synced_at"], FALLBACK_RETRY_AFTER
        ):
            match = world_cities.find_world_city(existing["name"])
            if match:
                _canonical_name, country, _continent, center_lat, center_lon = match
                # _sync_or_generate() deletes the existing row before
                # inserting its result (see that function's own comment on
                # why) regardless of which tier it lands on - `existing`
                # above is now a dangling reference to a deleted row even
                # when the retry doesn't improve anything, so its result
                # must always be returned here, never `existing` itself.
                # Reproduced live: returning `existing` on a same-tier
                # retry handed the caller a city_row["id"] that no longer
                # existed in the database.
                return _sync_or_generate(conn, existing["name"], country, center_lat, center_lon)
        return existing, None

    match = world_cities.find_world_city(city_name)
    if not match:
        # Not in the curated list at all - a live API key means this isn't
        # necessarily a dead end. Reproduced live: with HOTEL_API_KEY
        # configured, searching "Dubrovnik" (a real, well-known city just
        # not in our ~124-city list) 404'd as "not a recognized city"
        # without ever trying the live sync that could have found it for
        # real, because this whole function returned None before the
        # is_live_api_configured() check further down was ever reached.
        stripped = (city_name or "").strip()
        if stripped and len(stripped) <= MAX_CITY_NAME_LENGTH and config.is_live_api_configured():
            try:
                api_fetcher.sync_city(conn, stripped)
                return find_city_row(conn, stripped), None
            except api_fetcher.BookingAPIError:
                pass  # genuinely not recognized by Booking.com either - not a live-sync failure worth surfacing
        return None, None
    canonical_name, country, _continent, center_lat, center_lon = match
    return _sync_or_generate(conn, canonical_name, country, center_lat, center_lon)


def _sync_or_generate(conn, canonical_name: str, country: str, center_lat: float, center_lon: float):
    """Tries Booking.com live sync, then Hotelbeds' real hotel directory,
    then falls back to fully procedural data - the shared fallback chain
    used both for a brand-new city and for retrying an already-cached
    generated/content-tier city once FALLBACK_RETRY_AFTER has passed (see
    get_or_create_city). Returns (city_row, live_sync_error).
    """
    from backend import api_fetcher, hotelbeds, wikidata_hotels  # local import: avoids a circular import at module load time

    # Only matters for the retry path (get_or_create_city calling this on
    # an already-cached generated/content row): api_fetcher.sync_city
    # already deletes-then-inserts internally (replace_city_with_live_data),
    # but the Hotelbeds and generated-fallback _insert_city() calls below
    # don't - without this, retrying a city whose Booking.com sync also
    # failed again would hit cities.name's UNIQUE constraint the moment
    # either of those tries to insert a row that name already has.
    existing = find_city_row(conn, canonical_name)
    if existing:
        conn.execute("DELETE FROM cities WHERE id = ?", (existing["id"],))

    # Found via testing: this used to keep only the FIRST source's failure
    # reason (`if not live_sync_error: live_sync_error = ...`) - so when
    # ALL THREE real sources genuinely failed (reproduced live for Cusco:
    # Booking.com rate-limited, Hotelbeds has no destination code for it,
    # Wikidata's circuit breaker was open from an unrelated earlier
    # failure), the traveler only ever saw the Booking.com reason and had
    # no way to know the other two were tried and also failed, for
    # completely different reasons - an incomplete, not-quite-honest
    # picture of what was actually attempted. Collects every real reason
    # instead, joined into one message only when every source has failed.
    sync_errors: list[str] = []
    if config.is_live_api_configured():
        try:
            api_fetcher.sync_city(conn, canonical_name, country_hint=country)
            return find_city_row(conn, canonical_name), None
        except api_fetcher.BookingAPIError as exc:
            sync_errors.append(f"Booking.com: {exc}")  # try Hotelbeds next, then procedural generation

    # Second real-data attempt before giving up on real data entirely: the
    # Booking.com sync above just failed (often the free RapidAPI tier's
    # rate limit), but that doesn't mean no real source is available -
    # Hotelbeds' Content API is an independent provider with its own key,
    # so its rate limit (or lack of coverage for this city) is unrelated.
    # See backend/hotelbeds.py's module docstring for exactly what's real
    # here (name/photos/coordinates) vs. estimated (price/rating/metrics).
    if config.is_hotelbeds_configured():
        try:
            hotelbeds_result = hotelbeds.fetch_city_hotels(canonical_name)
            if not hotelbeds_result:
                sync_errors.append(f"Hotelbeds: no destination match for {canonical_name}")
        except hotelbeds.HotelbedsError as exc:
            hotelbeds_result = None
            sync_errors.append(f"Hotelbeds: {exc}")
        if hotelbeds_result:
            neighborhoods, hero_image = hotelbeds_result
            hero_image = hero_image or generator.generate_city_data(canonical_name, center_lat, center_lon)[1]
            now_iso = datetime.now(timezone.utc).isoformat()
            _insert_city(conn, canonical_name, country, hero_image, neighborhoods, source="content", last_synced_at=now_iso)
            # A real hotel directory was found even though live *pricing*
            # wasn't (that's what live_sync_error above described) - the
            # traveler is getting real hotels now, so that specific error
            # about Booking.com no longer describes what they're seeing.
            return find_city_row(conn, canonical_name), None

    # Third real-data attempt: unlike the two above, Wikidata's SPARQL
    # query service has no API key and no request quota that can run out -
    # it can't fail the same way Booking.com's and Hotelbeds' free tiers
    # both did, repeatedly, this session. Coverage is narrower (only
    # hotels notable enough to have their own Wikidata entry), so this is
    # deliberately tried last, not first - see wikidata_hotels.py's module
    # docstring for exactly what's real vs. estimated here.
    try:
        wikidata_result = wikidata_hotels.fetch_city_hotels(canonical_name, center_lat, center_lon)
        if not wikidata_result:
            sync_errors.append(f"Wikidata: fewer than {wikidata_hotels.MIN_HOTELS_TO_USE} notable hotels found nearby")
    except wikidata_hotels.WikidataError as exc:
        wikidata_result = None
        sync_errors.append(f"Wikidata: {exc}")
    if wikidata_result:
        neighborhoods, hero_image = wikidata_result
        now_iso = datetime.now(timezone.utc).isoformat()
        _insert_city(conn, canonical_name, country, hero_image, neighborhoods, source="content", last_synced_at=now_iso)
        return find_city_row(conn, canonical_name), None

    neighborhoods, hero_image = generator.generate_city_data(canonical_name, center_lat, center_lon)
    now_iso = datetime.now(timezone.utc).isoformat()
    _insert_city(conn, canonical_name, country, hero_image, neighborhoods, source="generated", last_synced_at=now_iso)
    live_sync_error = f"All 3 real sources failed for {canonical_name} - " + "; ".join(sync_errors) if sync_errors else None
    return find_city_row(conn, canonical_name), live_sync_error


def upsert_subscription(
    conn,
    email: str,
    stripe_customer_id: str | None,
    stripe_subscription_id: str | None,
    status: str,
    current_period_end: str | None,
):
    """Records the latest known state of one email's Stripe subscription.
    Called both right after a Checkout redirect (see /api/billing/verify-
    session) and from the webhook handler, so status stays current whether
    or not a publicly reachable webhook URL is configured for this
    deployment - the redirect path alone is enough to unlock/track Pro.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO pro_subscriptions (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            stripe_customer_id = excluded.stripe_customer_id,
            stripe_subscription_id = excluded.stripe_subscription_id,
            status = excluded.status,
            current_period_end = excluded.current_period_end,
            updated_at = excluded.updated_at
        """,
        (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, now_iso),
    )


def get_subscription_by_email(conn, email: str):
    return conn.execute("SELECT * FROM pro_subscriptions WHERE email = ?", (email,)).fetchone()


def get_subscription_by_customer_id(conn, stripe_customer_id: str):
    return conn.execute(
        "SELECT * FROM pro_subscriptions WHERE stripe_customer_id = ?", (stripe_customer_id,)
    ).fetchone()


def insert_community_review(
    conn,
    hotel_id: int,
    author_name: str,
    author_email: str,
    rating: int,
    body: str,
    trip_type: str | None,
    photos: list,
    is_sample: bool = False,
    created_at: str | None = None,
):
    created_at = created_at or datetime.now(timezone.utc).isoformat()
    cursor = conn.execute(
        """
        INSERT INTO community_reviews
            (hotel_id, author_name, author_email, rating, trip_type, body, photos_json, is_sample, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (hotel_id, author_name, author_email, rating, trip_type, body, json.dumps(photos), int(is_sample), created_at),
    )
    return cursor.lastrowid


def get_community_reviews_by_hotel(conn, hotel_id: int):
    return conn.execute(
        "SELECT * FROM community_reviews WHERE hotel_id = ? ORDER BY id DESC", (hotel_id,)
    ).fetchall()


def hotel_id_by_slug(conn, slug: str) -> int | None:
    row = conn.execute("SELECT id FROM hotels WHERE slug = ?", (slug,)).fetchone()
    return row["id"] if row else None


def seed_sample_community_reviews():
    """Populates a handful of example traveler reviews (photos included) on
    curated hotels so the community-reviews feature doesn't launch showing
    an empty state. Every seeded row is flagged is_sample=1 so the frontend
    can badge it honestly as example content - this app's whole brand is
    "never invented reviews" (see index.html's trust list), so a fabricated
    review posing as a real traveler would directly contradict that. Safe
    to call on every startup: skipped per-hotel once that hotel already has
    at least one is_sample row, so it never duplicates on restart and never
    overwrites a real traveler's review that happens to land on the same
    hotel afterward.
    """
    from backend.community_seed import SAMPLE_COMMUNITY_REVIEWS

    with get_connection() as conn:
        for entry in SAMPLE_COMMUNITY_REVIEWS:
            hotel_id = hotel_id_by_slug(conn, entry["hotel_slug"])
            if hotel_id is None:
                continue  # curated hotel not loaded yet/renamed - skip rather than fail startup
            already_seeded = conn.execute(
                "SELECT 1 FROM community_reviews WHERE hotel_id = ? AND author_name = ? AND is_sample = 1",
                (hotel_id, entry["author_name"]),
            ).fetchone()
            if already_seeded:
                continue
            insert_community_review(
                conn,
                hotel_id=hotel_id,
                author_name=entry["author_name"],
                author_email="sample@stayrank.example",
                rating=entry["rating"],
                body=entry["body"],
                trip_type=entry.get("trip_type"),
                photos=entry.get("photos", []),
                is_sample=True,
                created_at=entry.get("created_at"),
            )
