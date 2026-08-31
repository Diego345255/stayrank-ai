"""A small, disk-persisted circuit breaker shared by every external hotel
data provider this app calls (Booking.com/RapidAPI in api_fetcher.py,
Hotelbeds in hotelbeds.py).

Why this exists: without it, every city search independently rediscovers
"this provider is currently rate-limited/quota-exhausted" by making its own
doomed API call - reproduced live, repeatedly, during development: a
Hotelbeds "Quota exceeded" 403 got re-triggered by later, unrelated test
calls that had no way of knowing the previous call had already confirmed
the provider was down, each one spending more of an already-exhausted
quota just to learn the same thing again. A circuit breaker remembers a
failure (per provider, on disk - so this survives `uvicorn --reload`
restarts and applies across every city, not just the one that tripped it)
and skips the real network call entirely until a backoff window passes,
following the standard pattern (see README's "Fixed: repeated wasted
requests..." entry for the sources this was researched against): fail
fast once a service is known to be down, rather than queueing requests
that will never succeed.

This does NOT and cannot make an exhausted quota available sooner - only
the provider controls that. What it guarantees is that this app stops
contributing to the problem once it already knows the answer.
"""

import json
import random
import time
from pathlib import Path

_STATE_PATH = Path(__file__).resolve().parent.parent / "data" / "circuit_breaker_state.json"

# Exponential backoff, indexed by consecutive-failure count (capped at the
# last entry so a persistently-down provider settles at a 12h retry
# cadence rather than growing unbounded). Deliberately starts short (a
# single network blip shouldn't lock a provider out for hours) but grows
# fast, since both providers this app has actually hit in practice
# (Booking.com's RapidAPI free tier, Hotelbeds' Evaluation Plan) turned out
# to have quota/rate-limit windows measured in a substantial fraction of a
# day, not seconds - confirmed live: four Hotelbeds retries spaced 10
# seconds apart all failed identically, ruling out a short cooldown.
_BACKOFF_SCHEDULE_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 4 * 60 * 60, 12 * 60 * 60]


def _load_state() -> dict:
    if not _STATE_PATH.exists():
        return {}
    try:
        return json.loads(_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save_state(state: dict) -> None:
    try:
        _STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _STATE_PATH.write_text(json.dumps(state), encoding="utf-8")
    except OSError:
        pass  # best-effort - worst case this provider's breaker just doesn't persist across a restart


def format_retry_after(seconds: float) -> str:
    minutes = round(seconds / 60)
    if minutes < 1:
        return "under a minute"
    if minutes < 60:
        return f"~{minutes} min"
    return f"~{round(minutes / 60, 1)}h"


def is_open(provider: str) -> tuple[bool, float | None]:
    """Returns (is_open, retry_after_seconds). is_open=True means a real
    call to this provider was tried recently, failed, and the backoff
    window hasn't passed yet - callers should skip the network call
    entirely and treat this the same as any other provider failure.
    """
    state = _load_state().get(provider)
    if not state:
        return False, None
    remaining = state.get("open_until", 0) - time.time()
    if remaining <= 0:
        return False, None
    return True, remaining


def record_failure(provider: str, reason: str) -> None:
    all_state = _load_state()
    failure_count = all_state.get(provider, {}).get("failure_count", 0) + 1
    index = min(failure_count - 1, len(_BACKOFF_SCHEDULE_SECONDS) - 1)
    # Jitter avoids every city's next request landing at the exact same
    # instant the window reopens and re-tripping the breaker in a burst.
    wait_seconds = _BACKOFF_SCHEDULE_SECONDS[index] * random.uniform(0.85, 1.15)
    all_state[provider] = {
        "failure_count": failure_count,
        "open_until": time.time() + wait_seconds,
        "last_reason": reason,
    }
    _save_state(all_state)


def record_success(provider: str) -> None:
    all_state = _load_state()
    if provider in all_state:
        del all_state[provider]
        _save_state(all_state)
