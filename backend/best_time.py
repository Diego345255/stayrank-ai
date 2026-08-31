"""Real month-by-month climate averages via Open-Meteo's free historical
archive (same no-key/no-signup endpoint weather.py's historical fallback
already uses) - a "best time to visit [city]" signal a traveler can act on
immediately when browsing hotels, before ever picking specific trip dates
or unlocking Trip Planner Pro.

Researched gap: dedicated "best time to visit" tools (Travelyric and
similar, seen researching 2026 travel apps) blend weather with crowd
levels, flight/hotel prices, and event calendars into one score. This app
has no real data source for crowd density or event calendars, and hotel
price here is a single current snapshot, not a real seasonal price
history - fabricating those dimensions would be exactly the kind of
invented "insight" this app avoids everywhere else. So this only ever
surfaces the one dimension it can back with real data: actual historical
temperature and rainfall, aggregated by calendar month across full past
years. No overall "best month" verdict is computed - two honest,
independently-reproducible superlatives (driest month, mildest month) are
called out, but the full 12-month table is always shown alongside so a
traveler can judge for themselves by whatever criteria matters to them.
"""

from datetime import date

import httpx

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
REQUEST_TIMEOUT = 20
# Fewer years than weather.py's day-specific historical fallback
# (HISTORICAL_YEARS_BACK=5) - this aggregates a FULL YEAR per request
# rather than a handful of days, so 3 years is already ~1,095 real daily
# readings per location, plenty for a stable monthly average, at half the
# request count (this runs once per city search, lazily, not per hotel).
YEARS_BACK = 3
RAIN_THRESHOLD_MM = 1.0

_climate_cache: dict[tuple[float, float], list[dict]] = {}


class BestTimeError(Exception):
    """Raised only on network/response failure - a location genuinely
    having no archive coverage would surface as an empty per-month
    'available: False' list instead, not this."""


def get_monthly_climate(latitude: float, longitude: float) -> list[dict]:
    """Returns 12 entries (month 1-12), each either
    {month, available: True, avgTempMaxC, avgTempMinC, rainyDaysPercent,
    yearsUsed} or {month, available: False} for a month with no usable
    data across every year tried. Cached per rounded coordinate - climate
    doesn't meaningfully change search to search.
    """
    key = (round(latitude, 2), round(longitude, 2))
    if key in _climate_cache:
        return _climate_cache[key]

    this_year = date.today().year
    # Only full past years, same reasoning as weather.py's historical
    # fallback: this year's data for months that haven't happened yet
    # doesn't exist and would skew the average toward a partial year.
    candidate_years = [this_year - offset for offset in range(1, YEARS_BACK + 1)]

    by_month: dict[int, list[dict]] = {month: [] for month in range(1, 13)}
    years_fetched = 0
    for year in candidate_years:
        try:
            response = httpx.get(
                ARCHIVE_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                    "timezone": "auto",
                    "start_date": f"{year}-01-01",
                    "end_date": f"{year}-12-31",
                },
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            daily = response.json().get("daily", {})
        except httpx.HTTPError:
            continue  # One year failing shouldn't drop every other year.
        except ValueError:
            continue

        got_any = False
        for day_str, temp_max, temp_min, precip in zip(
            daily.get("time", []),
            daily.get("temperature_2m_max", []),
            daily.get("temperature_2m_min", []),
            daily.get("precipitation_sum", []),
        ):
            if temp_max is None or temp_min is None:
                continue
            month = int(day_str.split("-")[1])
            by_month[month].append({"tempMax": temp_max, "tempMin": temp_min, "precip": precip or 0})
            got_any = True
        if got_any:
            years_fetched += 1

    if years_fetched == 0:
        raise BestTimeError("Couldn't fetch any historical climate years for this location")

    results = []
    for month in range(1, 13):
        entries = by_month[month]
        if not entries:
            results.append({"month": month, "available": False})
            continue
        rainy_days = sum(1 for entry in entries if entry["precip"] >= RAIN_THRESHOLD_MM)
        results.append({
            "month": month,
            "available": True,
            "avgTempMaxC": round(sum(entry["tempMax"] for entry in entries) / len(entries), 1),
            "avgTempMinC": round(sum(entry["tempMin"] for entry in entries) / len(entries), 1),
            "rainyDaysPercent": round(100 * rainy_days / len(entries)),
            "yearsUsed": years_fetched,
        })

    _climate_cache[key] = results
    return results
