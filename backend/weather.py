"""Daily forecast via Open-Meteo - free, no API key, no signup, matching the
same "free public data source" pattern already used for the map (Leaflet/
OSM tiles) and landmark search (Nominatim). Verified live against the real
API during development (see forecast/geocoding modules for the same
discipline): https://api.open-meteo.com/v1/forecast

Open-Meteo's forecast horizon is ~15 days out. A trip planned further in
advance than that has no real forecast to show - rather than fabricate one,
days beyond the horizon fall back to real historical averages (same free
Open-Meteo archive, see _get_historical_climate) for the matching calendar
dates in past years, clearly flagged isHistorical so callers never present
them as an actual forecast for this specific trip.
"""

from datetime import date, timedelta

import httpx

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Open-Meteo's free historical archive (ERA5 reanalysis, 1940-present, same
# no-key/no-signup terms as the forecast endpoint - verified live). Used
# only as a fallback for trip days beyond MAX_FORECAST_DAYS_OUT, where the
# alternative is showing nothing at all: real past-year averages for the
# same calendar dates, clearly labeled as historical, never presented as a
# forecast for this specific trip.
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HISTORICAL_YEARS_BACK = 5
# A day counts as having "historically rained" if it cleared this much
# measured precipitation - low enough to catch real rainy days, high
# enough that a trace reading doesn't count as "it rained".
HISTORICAL_RAIN_THRESHOLD_MM = 1.0
REQUEST_TIMEOUT = 10
# Re-verified live (this cutoff has moved before, so treat it as something
# to re-check, not a permanent constant): requesting end_date=today+15 now
# gets {"reason":"Parameter 'end_date' is out of allowed range from ... to
# <today+14>"} - the real cutoff is 14 days out. Getting this wrong in
# either direction has a real cost: too high and the whole request 400s,
# discarding every day's forecast including the ones well inside the real
# horizon (reproduced live with a 20-night trip); too low and real
# available forecast days get marked "not available yet" for no reason.
MAX_FORECAST_DAYS_OUT = 14


class WeatherError(Exception):
    """Raised only on network/response failure - a date outside the
    forecast horizon is an expected outcome, not an error."""


# WMO weather interpretation codes (the table Open-Meteo's `weathercode`
# field uses) - condensed to the groupings relevant to a trip-planning UI.
_WMO_CODES = {
    0: ("Clear sky", "☀️"),
    1: ("Mostly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"),
    48: ("Fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Drizzle", "🌦️"),
    55: ("Dense drizzle", "🌦️"),
    56: ("Freezing drizzle", "🌧️"),
    57: ("Freezing drizzle", "🌧️"),
    61: ("Light rain", "🌧️"),
    63: ("Rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🌧️"),
    67: ("Freezing rain", "🌧️"),
    71: ("Light snow", "🌨️"),
    73: ("Snow", "🌨️"),
    75: ("Heavy snow", "🌨️"),
    77: ("Snow grains", "🌨️"),
    80: ("Light showers", "🌦️"),
    81: ("Showers", "🌦️"),
    82: ("Violent showers", "⛈️"),
    85: ("Snow showers", "🌨️"),
    86: ("Snow showers", "🌨️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with hail", "⛈️"),
    99: ("Thunderstorm with hail", "⛈️"),
}


def describe_code(code: int | None) -> tuple[str, str]:
    if code is None:
        return ("Unknown", "❓")
    return _WMO_CODES.get(code, ("Unknown", "❓"))


def get_timezone(latitude: float, longitude: float) -> dict:
    """Destination/origin local time zone - IANA name + UTC offset. Piggy-
    backs on the same forecast endpoint (verified live: `timezone=auto`
    returns this even with no `daily` params requested, so this is a
    minimal-payload call, not a second data-heavy one). Kept separate from
    get_forecast so timezone info is available even when the trip's whole
    date range is beyond the forecast horizon. Raises WeatherError only on
    an actual request failure.

    Also returns elevationM - the same response already includes it at
    zero extra cost (verified live: a La Paz request returned
    elevation: 3767.0), real data this app wasn't using at all despite
    already paying for the request. Used to flag genuinely high-altitude
    destinations where acclimatization is a real, commonly-cited concern.
    """
    try:
        response = httpx.get(
            FORECAST_URL,
            params={"latitude": latitude, "longitude": longitude, "timezone": "auto", "forecast_days": 1},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        raise WeatherError(f"Weather request failed: {exc}") from exc
    except ValueError as exc:
        raise WeatherError(f"Weather response was not valid JSON: {exc}") from exc

    return {
        "timezone": payload.get("timezone"),
        "utcOffsetSeconds": payload.get("utc_offset_seconds"),
        "elevationM": payload.get("elevation"),
    }


def get_forecast(latitude: float, longitude: float, start: date, nights: int) -> list[dict]:
    """Returns one entry per trip day: {date, summary, icon, tempMaxC,
    tempMinC, precipitationChance} for days within the real forecast
    horizon; {date, available: True, isHistorical: True, avgTempMaxC,
    avgTempMinC, rainedFractionPercent, yearsUsed} for days beyond it where
    real historical data exists; {date, available: False} only when neither
    a forecast nor historical data could be found. Raises WeatherError only
    when the actual forecast request itself fails (the historical fallback
    never raises - see _get_historical_climate).
    """
    end = start + timedelta(days=max(nights - 1, 0))
    horizon_end = date.today() + timedelta(days=MAX_FORECAST_DAYS_OUT)

    fetchable_end = min(end, horizon_end)
    results: dict[str, dict] = {}

    if fetchable_end >= start:
        try:
            response = httpx.get(
                FORECAST_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    # uv_index_max, windspeed_10m_max, and sunset all added
                    # at zero extra cost (same request, same payload size
                    # class). UV is null on the historical archive below
                    # (ERA5 doesn't compute it, verified live) so it's
                    # forecast-only; windspeed_10m_max is real on both
                    # (verified live). sunset is real forecast-day-only
                    # here too - genuinely useful mainly for the near-term
                    # days a traveler is actually planning evenings around,
                    # not worth the extra archive-side complexity for
                    # historical-only trips.
                    "daily": "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,windspeed_10m_max,sunset",
                    "timezone": "auto",
                    "start_date": start.isoformat(),
                    "end_date": fetchable_end.isoformat(),
                },
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPError as exc:
            raise WeatherError(f"Weather request failed: {exc}") from exc
        except ValueError as exc:
            raise WeatherError(f"Weather response was not valid JSON: {exc}") from exc

        daily = payload.get("daily", {})
        for day_str, code, temp_max, temp_min, precip, uv_max, wind_max, sunset in zip(
            daily.get("time", []),
            daily.get("weathercode", []),
            daily.get("temperature_2m_max", []),
            daily.get("temperature_2m_min", []),
            daily.get("precipitation_probability_max", []),
            daily.get("uv_index_max", []),
            daily.get("windspeed_10m_max", []),
            daily.get("sunset", []),
        ):
            summary, icon = describe_code(code)
            results[day_str] = {
                "date": day_str,
                "available": True,
                "summary": summary,
                "icon": icon,
                "tempMaxC": temp_max,
                "tempMinC": temp_min,
                "precipitationChance": precip,
                "uvIndexMax": uv_max,
                "windSpeedMaxKmh": wind_max,
                # ISO datetime like "2026-08-09T18:38" - already local time
                # (timezone=auto), just slice off the time portion on the
                # frontend rather than parsing a Date object for a display-
                # only value.
                "sunset": sunset,
            }

    forecast = []
    for offset in range(max(nights, 1)):
        day = start + timedelta(days=offset)
        day_str = day.isoformat()
        forecast.append(results.get(day_str) or {"date": day_str, "available": False})

    missing_offsets = [i for i, day in enumerate(forecast) if not day.get("available")]
    if missing_offsets:
        historical = _get_historical_climate(latitude, longitude, start, nights)
        for offset in missing_offsets:
            hist_day = historical.get(offset)
            if hist_day:
                forecast[offset] = hist_day

    return forecast


def _get_historical_climate(latitude: float, longitude: float, start: date, nights: int) -> dict[int, dict]:
    """Real day-of-trip averages from the last HISTORICAL_YEARS_BACK years
    (Open-Meteo's archive, same calendar dates) - for trip days too far out
    for an actual forecast. Deliberately never raises: a supplementary
    fallback failing shouldn't take down the whole trip plan, so any year
    (or all of them) failing just means less historical data, reported
    honestly via yearsUsed rather than silently averaged over fewer years.
    """
    end = start + timedelta(days=max(nights - 1, 0))
    this_year = date.today().year
    # Only full past years - this year's data for a date that hasn't
    # happened yet doesn't exist, and partial-year data would silently
    # skew the average toward whatever's been recorded so far.
    candidate_years = [this_year - offset for offset in range(1, HISTORICAL_YEARS_BACK + 1)]

    by_offset: dict[int, list[dict]] = {}
    for year in candidate_years:
        try:
            year_start = start.replace(year=year)
        except ValueError:
            continue  # Feb 29 in a non-leap year - skip, don't crash the lookup.
        try:
            response = httpx.get(
                ARCHIVE_URL,
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    # windspeed_10m_max at zero extra cost, same as the
                    # real-forecast branch above - verified live this
                    # archive endpoint returns real values for it (unlike
                    # uv_index_max, which comes back null here).
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
                    "timezone": "auto",
                    "start_date": year_start.isoformat(),
                    "end_date": (year_start + (end - start)).isoformat(),
                },
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            daily = response.json().get("daily", {})
        except (httpx.HTTPError, ValueError):
            continue  # One year's request failing shouldn't drop the rest.

        for day_str, temp_max, temp_min, precip, wind_max in zip(
            daily.get("time", []),
            daily.get("temperature_2m_max", []),
            daily.get("temperature_2m_min", []),
            daily.get("precipitation_sum", []),
            daily.get("windspeed_10m_max", []),
        ):
            if temp_max is None or temp_min is None:
                continue
            offset = (date.fromisoformat(day_str) - year_start).days
            by_offset.setdefault(offset, []).append(
                {"tempMaxC": temp_max, "tempMinC": temp_min, "precipMm": precip, "windKmh": wind_max}
            )

    results: dict[int, dict] = {}
    for offset, entries in by_offset.items():
        rained_years = sum(1 for e in entries if (e["precipMm"] or 0) >= HISTORICAL_RAIN_THRESHOLD_MM)
        wind_values = [e["windKmh"] for e in entries if e["windKmh"] is not None]
        day_str = (start + timedelta(days=offset)).isoformat()
        results[offset] = {
            "date": day_str,
            "available": True,
            "isHistorical": True,
            "yearsUsed": len(entries),
            "avgTempMaxC": round(sum(e["tempMaxC"] for e in entries) / len(entries), 1),
            "avgTempMinC": round(sum(e["tempMinC"] for e in entries) / len(entries), 1),
            "rainedFractionPercent": round(100 * rained_years / len(entries)),
            "avgWindSpeedMaxKmh": round(sum(wind_values) / len(wind_values), 1) if wind_values else None,
        }
    return results
