"""Loads HOTEL_API_KEY / HOTEL_API_HOST and LLM_API_KEY / LLM_BASE_URL /
LLM_MODEL from .env (via python-dotenv).

The app must start and function (using curated + procedurally generated
data, and rule-based TF-IDF intent parsing) even if either key is missing
or still a placeholder - live API sync and LLM-backed search are both
enhancements, not hard requirements.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

_PLACEHOLDER_VALUES = {"", "your_api_key_here", "your_llm_api_key_here"}

HOTEL_API_KEY = os.environ.get("HOTEL_API_KEY", "").strip()
HOTEL_API_HOST = os.environ.get("HOTEL_API_HOST", "booking-com15.p.rapidapi.com").strip()

LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini").strip()

# Hotelbeds Content API: a second, independent real-hotel-identity source
# (real names, real photos, real coordinates) used as a fallback when the
# Booking.com/RapidAPI live sync above fails (e.g. rate-limited) - see
# backend/hotelbeds.py for why this exists and what it does and doesn't
# provide (no live pricing/reviews, see that module's docstring).
HOTELBEDS_API_KEY = os.environ.get("HOTELBEDS_API_KEY", "").strip()
HOTELBEDS_SECRET = os.environ.get("HOTELBEDS_SECRET", "").strip()


def is_live_api_configured() -> bool:
    return HOTEL_API_KEY not in _PLACEHOLDER_VALUES and bool(HOTEL_API_KEY)


def is_llm_configured() -> bool:
    return LLM_API_KEY not in _PLACEHOLDER_VALUES and bool(LLM_API_KEY)


def is_hotelbeds_configured() -> bool:
    return (
        HOTELBEDS_API_KEY not in _PLACEHOLDER_VALUES
        and bool(HOTELBEDS_API_KEY)
        and HOTELBEDS_SECRET not in _PLACEHOLDER_VALUES
        and bool(HOTELBEDS_SECRET)
    )


# Real Stripe subscription billing for Trip Planner Pro. Same optional-
# integration pattern as every key above: the app starts and the "Unlock
# Pro" flow still renders without this configured, it just tells the
# traveler honestly that payments aren't set up yet instead of pretending
# to charge them or silently unlocking for free - see backend/billing.py.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
# $9.99/month - defined in cents since that's the unit Stripe's API itself
# expects, avoiding a float-cents rounding bug at the request boundary.
STRIPE_PRO_PRICE_CENTS = int(os.environ.get("STRIPE_PRO_PRICE_CENTS", "999"))


def is_stripe_configured() -> bool:
    return (
        STRIPE_SECRET_KEY not in _PLACEHOLDER_VALUES
        and bool(STRIPE_SECRET_KEY)
        and STRIPE_SECRET_KEY.startswith(("sk_test_", "sk_live_"))
    )


def stripe_is_live_mode() -> bool:
    return STRIPE_SECRET_KEY.startswith("sk_live_")
