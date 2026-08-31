"""Deterministic procedural generation of neighborhoods + hotels for any
city in world_cities.WORLD_CITIES that isn't already in the database.

Generation is seeded from the city name, so searching the same city twice
always produces the same result (and the first result is cached in SQLite,
so this only ever runs once per city).
"""

import random
import re

from backend.placeholder import generate_placeholder

ARCHETYPES = [
    {
        "key": "quiet_residential",
        "neighborhood_names": ["{city} Residential Quarter", "Green Quarter, {city}", "{city} Garden District"],
        "description": "Quiet, residential streets away from the crowds, popular with couples and families.",
        "hotel_names": ["{city} Garden Residences", "Quiet Quarter Hotel", "{city} Home House"],
        "tags": ["quiet", "family", "clean"],
        "metric_ranges": {
            "quiet": (80, 93), "cleanliness": (85, 95), "transit": (55, 75), "roomSize": (70, 88),
            "value": (70, 85), "family": (75, 90), "couple": (78, 90), "nightlife": (15, 35),
            "breakfast": (75, 90), "wifi": (70, 85),
        },
        "price_range": (110, 210),
        "star_range": (3, 4),
        "strengths": ["calm residential streets", "away from the tourist crowds", "comfortable, larger-than-average rooms"],
        "risk": "Fewer restaurants and nightlife options within walking distance.",
        "evidence": "Review pattern: guests consistently praise the calm atmosphere and room comfort; those wanting nightlife nearby prefer a more central base.",
    },
    {
        "key": "transit_hub",
        "neighborhood_names": ["{city} Central Station District", "{city} Transit Quarter", "Central {city}"],
        "description": "The city's best-connected transit hub, efficient and popular with business travelers.",
        "hotel_names": ["{city} Central Hotel", "Grand Station Inn", "{city} Transit Suites"],
        "tags": ["transit", "business", "value"],
        "metric_ranges": {
            "quiet": (40, 60), "cleanliness": (82, 92), "transit": (90, 99), "roomSize": (58, 72),
            "value": (75, 90), "family": (55, 70), "couple": (70, 82), "nightlife": (45, 65),
            "breakfast": (65, 80), "wifi": (82, 95),
        },
        "price_range": (95, 190),
        "star_range": (3, 4),
        "strengths": ["steps from the main station", "every line reachable without a taxi", "efficient, modern rooms"],
        "risk": "Station-adjacent noise, especially on lower floors.",
        "evidence": "Review pattern: business travelers and short layovers love the speed and connectivity; light sleepers flag street and station noise.",
    },
    {
        "key": "nightlife_trendy",
        "neighborhood_names": ["{city} Arts Quarter", "Old Town, {city}", "{city} Nightlife District"],
        "description": "A high-energy, trendy district with strong transit links and a lively night scene.",
        "hotel_names": ["The {city} Loft", "{city} Nightowl Hotel", "Downtown {city} Rooms"],
        "tags": ["nightlife", "transit", "couple"],
        "metric_ranges": {
            "quiet": (35, 55), "cleanliness": (78, 90), "transit": (70, 90), "roomSize": (62, 78),
            "value": (60, 78), "family": (40, 58), "couple": (75, 90), "nightlife": (75, 93),
            "breakfast": (60, 78), "wifi": (85, 96),
        },
        "price_range": (130, 260),
        "star_range": (3, 5),
        "strengths": ["best food and bar scene in the city", "walkable to live music and nightlife", "fast Wi-Fi for remote work"],
        "risk": "Street noise late into the night, especially on weekends.",
        "evidence": "Review pattern: younger travelers and nightlife seekers rate it highly; quiet-focused guests recommend a different base.",
    },
    {
        "key": "business_modern",
        "neighborhood_names": ["{city} Business District", "{city} Financial Quarter", "New {city}"],
        "description": "A modern business district with spacious, work-ready rooms and quieter evenings.",
        "hotel_names": ["{city} Executive Suites", "The {city} Tower Hotel", "{city} Riverside Suites"],
        "tags": ["business", "space", "value"],
        "metric_ranges": {
            "quiet": (65, 80), "cleanliness": (88, 95), "transit": (75, 88), "roomSize": (80, 92),
            "value": (60, 78), "family": (60, 75), "couple": (72, 85), "nightlife": (30, 50),
            "breakfast": (72, 85), "wifi": (88, 97),
        },
        "price_range": (140, 280),
        "star_range": (4, 5),
        "strengths": ["spacious modern suites", "strong desk setup and Wi-Fi for remote work", "quieter after office hours"],
        "risk": "Fewer casual dining options within walking distance.",
        "evidence": "Review pattern: business travelers highlight space and connectivity; leisure travelers note it feels quiet in the evenings.",
    },
    {
        "key": "value_local",
        "neighborhood_names": ["{city} Old Town", "{city} Market Quarter", "Local {city}"],
        "description": "A value-friendly, local neighborhood popular with budget-conscious travelers.",
        "hotel_names": ["{city} Value Inn", "The Local {city} House", "{city} Traveler's Rest"],
        "tags": ["value", "local", "family"],
        "metric_ranges": {
            "quiet": (60, 78), "cleanliness": (78, 90), "transit": (65, 85), "roomSize": (65, 82),
            "value": (85, 97), "family": (65, 82), "couple": (68, 82), "nightlife": (35, 58),
            "breakfast": (62, 78), "wifi": (72, 88),
        },
        "price_range": (60, 140),
        "star_range": (2, 3),
        "strengths": ["excellent price for the area", "authentic local food scene nearby", "friendly, low-key streets"],
        "risk": "Slightly older buildings and simpler room finishes.",
        "evidence": "Review pattern: value and authenticity dominate the praise; travelers wanting more polish note the simpler decor.",
    },
]

# How far (in degrees) a generated hotel's pin can jitter from the city center,
# roughly 1-2.5km depending on latitude - enough to spread pins across a map
# without needing real per-neighborhood geocoding.
COORD_JITTER = 0.02


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "hotel"


def generate_city_data(city_name: str, center_lat: float | None = None, center_lon: float | None = None) -> tuple[list[dict], str]:
    """Returns (neighborhoods, hero_image) for a city, seeded deterministically
    by the city name so repeated searches produce identical results.

    Uses all 5 archetypes, and all 3 neighborhood/hotel-name template pairs
    per archetype (rather than picking one at random), so every generated
    city gets 15 hotels across 15 distinct neighborhoods instead of just 4 -
    each pair still gets independently randomized metrics/price/star rating,
    so they aren't literal duplicates within an archetype.

    center_lat/center_lon (from world_cities.py) let generated hotels get a
    plausible (jittered) map pin even though we don't have real per-hotel
    geocoding for them - omit to leave hotels without map coordinates.
    """
    rng = random.Random(city_name.lower())

    neighborhoods = []
    for archetype in ARCHETYPES:
        name_pairs = list(zip(archetype["neighborhood_names"], archetype["hotel_names"]))
        for neighborhood_template, hotel_template in name_pairs:
            neighborhood_name = neighborhood_template.format(city=city_name)
            hotel_name = hotel_template.format(city=city_name)
            metrics = {
                key: rng.randint(low, high)
                for key, (low, high) in archetype["metric_ranges"].items()
            }
            price = rng.randint(*archetype["price_range"])
            rating = round(rng.uniform(4.1, 4.8), 1)
            star_rating = rng.randint(*archetype["star_range"])
            slug = _slugify(f"{city_name}-{neighborhood_name}-{hotel_name}-{archetype['key']}")

            # Found via a real-vs-fabricated data audit: this used to roll a
            # random "deal" price 30% of the time purely "so the price-drop
            # badge has something to demo even without live data" - a
            # fabricated struck-through "was" price with an invented %-off,
            # rendered by the exact same .deal-badge as a genuine Booking.com
            # strikethrough discount, with nothing distinguishing the two.
            # That's precisely the fake-discount dark pattern this app's own
            # trust panel promises never to do ("No fake urgency..."), just
            # inflicted on generated-tier cities instead of scarcity language.
            # hotelbeds.py and wikidata_hotels.py already leave this honestly
            # null since they have no real former-price data either - this
            # tier gets the same honest treatment now.
            original_price = None

            latitude = longitude = None
            if center_lat is not None and center_lon is not None:
                latitude = round(center_lat + rng.uniform(-COORD_JITTER, COORD_JITTER), 5)
                longitude = round(center_lon + rng.uniform(-COORD_JITTER, COORD_JITTER), 5)

            hotel = {
                "slug": slug,
                "name": hotel_name,
                "price": price,
                "original_price": original_price,
                "rating": rating,
                "star_rating": star_rating,
                "latitude": latitude,
                "longitude": longitude,
                "image": generate_placeholder(slug, hotel_name),
                "tags": archetype["tags"],
                "metrics": metrics,
                "strengths": archetype["strengths"],
                "risk": archetype["risk"],
                "evidence": archetype["evidence"],
            }

            neighborhoods.append({
                "name": neighborhood_name,
                "description": archetype["description"].format(city=city_name),
                "hotels": [hotel],
            })

    hero_image = generate_placeholder(f"city-{city_name.lower()}", city_name, width=900, height=500)
    return neighborhoods, hero_image
