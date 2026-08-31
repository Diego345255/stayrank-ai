"""A bundled list of major world cities used for search autocomplete and to
validate which city names the procedural hotel generator is allowed to
create data for. No external geocoding API required.

Each entry: (name, country, continent, latitude, longitude). Coordinates are
approximate city centers, used to place map pins for procedurally generated
hotels (which jitter a little around the center) - curated and live-synced
hotels use their own real per-hotel coordinates instead.
"""

import unicodedata

WORLD_CITIES = [
    # North America
    ("New York", "United States", "North America", 40.7128, -74.0060),
    ("Los Angeles", "United States", "North America", 34.0522, -118.2437),
    ("Chicago", "United States", "North America", 41.8781, -87.6298),
    ("San Francisco", "United States", "North America", 37.7749, -122.4194),
    ("Miami", "United States", "North America", 25.7617, -80.1918),
    ("Boston", "United States", "North America", 42.3601, -71.0589),
    ("Seattle", "United States", "North America", 47.6062, -122.3321),
    ("Las Vegas", "United States", "North America", 36.1699, -115.1398),
    ("Washington D.C.", "United States", "North America", 38.9072, -77.0369),
    ("New Orleans", "United States", "North America", 29.9511, -90.0715),
    ("Austin", "United States", "North America", 30.2672, -97.7431),
    ("Toronto", "Canada", "North America", 43.6532, -79.3832),
    ("Vancouver", "Canada", "North America", 49.2827, -123.1207),
    ("Montreal", "Canada", "North America", 45.5019, -73.5674),
    ("Mexico City", "Mexico", "North America", 19.4326, -99.1332),
    ("Cancun", "Mexico", "North America", 21.1619, -86.8515),
    ("Honolulu", "United States", "North America", 21.3069, -157.8583),

    # South America
    ("Rio de Janeiro", "Brazil", "South America", -22.9068, -43.1729),
    ("Sao Paulo", "Brazil", "South America", -23.5505, -46.6333),
    ("Buenos Aires", "Argentina", "South America", -34.6037, -58.3816),
    ("Santiago", "Chile", "South America", -33.4489, -70.6693),
    ("Lima", "Peru", "South America", -12.0464, -77.0428),
    ("Bogota", "Colombia", "South America", 4.7110, -74.0721),
    ("Cartagena", "Colombia", "South America", 10.3910, -75.4794),
    ("Quito", "Ecuador", "South America", -0.1807, -78.4678),
    ("Montevideo", "Uruguay", "South America", -34.9011, -56.1645),
    ("La Paz", "Bolivia", "South America", -16.5000, -68.1500),

    # Europe
    ("London", "United Kingdom", "Europe", 51.5074, -0.1278),
    ("Edinburgh", "United Kingdom", "Europe", 55.9533, -3.1883),
    ("Paris", "France", "Europe", 48.8566, 2.3522),
    ("Nice", "France", "Europe", 43.7102, 7.2620),
    ("Rome", "Italy", "Europe", 41.9028, 12.4964),
    ("Milan", "Italy", "Europe", 45.4642, 9.1900),
    ("Venice", "Italy", "Europe", 45.4408, 12.3155),
    ("Florence", "Italy", "Europe", 43.7696, 11.2558),
    ("Naples", "Italy", "Europe", 40.8518, 14.2681),
    ("Barcelona", "Spain", "Europe", 41.3851, 2.1734),
    ("Madrid", "Spain", "Europe", 40.4168, -3.7038),
    ("Seville", "Spain", "Europe", 37.3891, -5.9845),
    ("Lisbon", "Portugal", "Europe", 38.7223, -9.1393),
    ("Porto", "Portugal", "Europe", 41.1579, -8.6291),
    ("Amsterdam", "Netherlands", "Europe", 52.3676, 4.9041),
    ("Rotterdam", "Netherlands", "Europe", 51.9244, 4.4777),
    ("Brussels", "Belgium", "Europe", 50.8503, 4.3517),
    ("Berlin", "Germany", "Europe", 52.5200, 13.4050),
    ("Munich", "Germany", "Europe", 48.1351, 11.5820),
    ("Frankfurt", "Germany", "Europe", 50.1109, 8.6821),
    ("Hamburg", "Germany", "Europe", 53.5511, 9.9937),
    ("Vienna", "Austria", "Europe", 48.2082, 16.3738),
    ("Zurich", "Switzerland", "Europe", 47.3769, 8.5417),
    ("Geneva", "Switzerland", "Europe", 46.2044, 6.1432),
    ("Prague", "Czechia", "Europe", 50.0755, 14.4378),
    ("Budapest", "Hungary", "Europe", 47.4979, 19.0402),
    ("Warsaw", "Poland", "Europe", 52.2297, 21.0122),
    ("Krakow", "Poland", "Europe", 50.0647, 19.9450),
    ("Copenhagen", "Denmark", "Europe", 55.6761, 12.5683),
    ("Stockholm", "Sweden", "Europe", 59.3293, 18.0686),
    ("Oslo", "Norway", "Europe", 59.9139, 10.7522),
    ("Helsinki", "Finland", "Europe", 60.1699, 24.9384),
    ("Reykjavik", "Iceland", "Europe", 64.1466, -21.9426),
    ("Dublin", "Ireland", "Europe", 53.3498, -6.2603),
    ("Athens", "Greece", "Europe", 37.9838, 23.7275),
    ("Santorini", "Greece", "Europe", 36.3932, 25.4615),
    ("Istanbul", "Turkey", "Europe", 41.0082, 28.9784),
    ("Moscow", "Russia", "Europe", 55.7558, 37.6173),

    # Middle East
    ("Dubai", "United Arab Emirates", "Middle East", 25.2048, 55.2708),
    ("Abu Dhabi", "United Arab Emirates", "Middle East", 24.4539, 54.3773),
    ("Doha", "Qatar", "Middle East", 25.2854, 51.5310),
    ("Tel Aviv", "Israel", "Middle East", 32.0853, 34.7818),
    ("Jerusalem", "Israel", "Middle East", 31.7683, 35.2137),
    ("Amman", "Jordan", "Middle East", 31.9454, 35.9284),
    ("Riyadh", "Saudi Arabia", "Middle East", 24.7136, 46.6753),
    ("Muscat", "Oman", "Middle East", 23.5880, 58.3829),

    # Africa
    ("Cairo", "Egypt", "Africa", 30.0444, 31.2357),
    ("Marrakech", "Morocco", "Africa", 31.6295, -7.9811),
    ("Casablanca", "Morocco", "Africa", 33.5731, -7.5898),
    ("Cape Town", "South Africa", "Africa", -33.9249, 18.4241),
    ("Johannesburg", "South Africa", "Africa", -26.2041, 28.0473),
    ("Nairobi", "Kenya", "Africa", -1.2921, 36.8219),
    ("Lagos", "Nigeria", "Africa", 6.5244, 3.3792),
    ("Accra", "Ghana", "Africa", 5.6037, -0.1870),
    ("Zanzibar City", "Tanzania", "Africa", -6.1659, 39.2026),
    ("Tunis", "Tunisia", "Africa", 36.8065, 10.1815),

    # South Asia
    ("Mumbai", "India", "South Asia", 19.0760, 72.8777),
    ("Delhi", "India", "South Asia", 28.7041, 77.1025),
    ("Bangalore", "India", "South Asia", 12.9716, 77.5946),
    ("Jaipur", "India", "South Asia", 26.9124, 75.7873),
    ("Goa", "India", "South Asia", 15.2993, 74.1240),
    ("Colombo", "Sri Lanka", "South Asia", 6.9271, 79.8612),
    ("Kathmandu", "Nepal", "South Asia", 27.7172, 85.3240),
    ("Dhaka", "Bangladesh", "South Asia", 23.8103, 90.4125),

    # East Asia
    ("Tokyo", "Japan", "East Asia", 35.6762, 139.6503),
    ("Kyoto", "Japan", "East Asia", 35.0116, 135.7681),
    ("Osaka", "Japan", "East Asia", 34.6937, 135.5023),
    ("Sapporo", "Japan", "East Asia", 43.0618, 141.3545),
    ("Seoul", "South Korea", "East Asia", 37.5665, 126.9780),
    ("Busan", "South Korea", "East Asia", 35.1796, 129.0756),
    ("Shanghai", "China", "East Asia", 31.2304, 121.4737),
    ("Beijing", "China", "East Asia", 39.9042, 116.4074),
    ("Hong Kong", "China", "East Asia", 22.3193, 114.1694),
    ("Taipei", "Taiwan", "East Asia", 25.0330, 121.5654),
    ("Macau", "China", "East Asia", 22.1987, 113.5439),
    ("Ulaanbaatar", "Mongolia", "East Asia", 47.8864, 106.9057),

    # Southeast Asia
    ("Bangkok", "Thailand", "Southeast Asia", 13.7563, 100.5018),
    ("Chiang Mai", "Thailand", "Southeast Asia", 18.7883, 98.9853),
    ("Phuket", "Thailand", "Southeast Asia", 7.8804, 98.3923),
    ("Singapore", "Singapore", "Southeast Asia", 1.3521, 103.8198),
    ("Kuala Lumpur", "Malaysia", "Southeast Asia", 3.1390, 101.6869),
    ("Bali", "Indonesia", "Southeast Asia", -8.6500, 115.2167),
    ("Jakarta", "Indonesia", "Southeast Asia", -6.2088, 106.8456),
    ("Manila", "Philippines", "Southeast Asia", 14.5995, 120.9842),
    ("Cebu", "Philippines", "Southeast Asia", 10.3157, 123.8854),
    ("Hanoi", "Vietnam", "Southeast Asia", 21.0285, 105.8542),
    ("Ho Chi Minh City", "Vietnam", "Southeast Asia", 10.8231, 106.6297),
    ("Phnom Penh", "Cambodia", "Southeast Asia", 11.5564, 104.9282),
    ("Vientiane", "Laos", "Southeast Asia", 17.9757, 102.6331),
    ("Yangon", "Myanmar", "Southeast Asia", 16.8409, 96.1735),

    # Oceania
    ("Sydney", "Australia", "Oceania", -33.8688, 151.2093),
    ("Melbourne", "Australia", "Oceania", -37.8136, 144.9631),
    ("Brisbane", "Australia", "Oceania", -27.4698, 153.0251),
    ("Perth", "Australia", "Oceania", -31.9505, 115.8605),
    ("Auckland", "New Zealand", "Oceania", -36.8485, 174.7633),
    ("Wellington", "New Zealand", "Oceania", -41.2865, 174.7762),
    ("Nadi", "Fiji", "Oceania", -17.7765, 177.4356),
]

# Several entries above are stored in an ASCII-folded form ("Sao Paulo",
# not "Sao Paulo with the accent it actually has; same for Montreal,
# Zurich, and others further up the list) rather than their real spelling.
# A plain .lower() lookup only matched that exact stored form, so a
# traveler typing the city's real, correctly-accented name got "not a
# recognized city" while the simplified form worked - reproduced live via
# a real /api/search call: "Sao Paulo" (accented) 404'd, "Sao Paulo"
# (plain) returned 15 real hotels for the same city. _fold() strips
# diacritics from both the stored keys and every lookup, so either
# spelling of any city here now matches the same entry.
def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


WORLD_CITIES_BY_NAME = {
    _fold(name.lower()): (name, country, continent, lat, lon)
    for name, country, continent, lat, lon in WORLD_CITIES
}

# Found via live testing: "Marrakesh" (the standard English spelling used by
# Wikipedia's English title, Google, and Booking.com's own English-language
# site) 404'd as "not a recognized city," even though "Marrakech" (the
# French spelling this list happens to use) is right there - a real,
# well-known city with an existing curated entry, coordinates, and full
# Booking->Hotelbeds->generated fallback chain, made unreachable purely by
# a spelling mismatch _fold() was never meant to solve (it only strips
# diacritics, not swap an entirely different alternate name). Unlike a
# genuinely-uncurated city (e.g. Dubrovnik), which correctly falls through
# to a live-only sync attempt with no fallback, this class of city has a
# real curated entry sitting unreachable behind a name it doesn't
# recognize - worth closing for the handful of major cities travelers
# commonly know by a different name than this list happens to store.
# Deliberately small and conservative: only well-established, still-in-
# common-use alternate names, not exhaustive historical/former names.
CITY_ALIASES = {
    "marrakesh": "Marrakech",
    "bombay": "Mumbai",
    "saigon": "Ho Chi Minh City",
    "zanzibar": "Zanzibar City",
    "washington dc": "Washington D.C.",
    "washington d c": "Washington D.C.",
}


def find_world_city(city_name: str):
    """Case-insensitive, diacritic-insensitive lookup, including a small
    list of common alternate city names (see CITY_ALIASES above). Returns
    (canonical_name, country, continent, lat, lon) or None."""
    folded = _fold((city_name or "").strip().lower())
    match = WORLD_CITIES_BY_NAME.get(folded)
    if match:
        return match
    alias_target = CITY_ALIASES.get(folded)
    if alias_target:
        return WORLD_CITIES_BY_NAME.get(_fold(alias_target.lower()))
    return None
