"""Live USD exchange rates via Frankfurter - free, no API key, backed by
the European Central Bank's daily reference rates (same "free public data"
pattern as weather.py, poi.py, geocoding.py). Verified live during
development: https://api.frankfurter.dev

Rates update once a day on ECB's side, so a same-day in-memory cache avoids
re-fetching on every request without ever serving stale-across-days data.
"""

from datetime import date

import httpx

FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
REQUEST_TIMEOUT = 10

_rate_cache: dict[str, tuple[str, float]] = {}  # currency -> (date, rate)


class CurrencyError(Exception):
    """Raised only on network/response failure. An unrecognized currency
    code is not an error - it just returns None, since ECB only covers a
    fixed list of real-world currencies."""


def convert_from_usd(amount_usd: float, target_currency: str) -> float | None:
    """Converts a USD amount to target_currency (ISO 4217, e.g. "EUR").
    Returns None if the currency code isn't one ECB publishes a rate for.
    Raises CurrencyError only on an actual request failure.
    """
    code = target_currency.strip().upper()
    if not code or code == "USD":
        return amount_usd if code == "USD" else None

    today = date.today().isoformat()
    cached = _rate_cache.get(code)
    if cached and cached[0] == today:
        return amount_usd * cached[1]

    try:
        response = httpx.get(
            FRANKFURTER_URL,
            params={"base": "USD", "symbols": code},
            timeout=REQUEST_TIMEOUT,
        )
        # Verified live: Frankfurter returns 404 for an unrecognized symbol
        # (e.g. "ZZZ"), not a service failure - that's an expected "not a
        # real currency" outcome, same category as a landmark that doesn't
        # geocode, not something that should read as "couldn't reach it."
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        raise CurrencyError(f"Currency request failed: {exc}") from exc
    except ValueError as exc:
        raise CurrencyError(f"Currency response was not valid JSON: {exc}") from exc

    rate = payload.get("rates", {}).get(code)
    if rate is None:
        return None

    _rate_cache[code] = (today, rate)
    return amount_usd * rate
