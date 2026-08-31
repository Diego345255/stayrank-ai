"""Real Stripe subscription billing for Trip Planner Pro.

Calls Stripe's REST API directly via httpx (same pattern as every other
external integration in this app - weather.py, currency.py, poi.py) rather
than pulling in the stripe-python SDK, since the full flow only needs four
well-documented calls: create a Checkout Session, look one up after
redirect, verify a webhook signature, and open a Billing Portal session.

This module never sees a customer's card number - Stripe's own hosted
Checkout and Billing Portal pages collect payment details directly, which
keeps this app entirely out of PCI scope, the same reason Stripe itself
recommends hosted Checkout over building a custom card form.
"""

import hashlib
import hmac
import json
import time

import httpx

from backend import config

STRIPE_API_BASE = "https://api.stripe.com/v1"
REQUEST_TIMEOUT = 15
PRODUCT_NAME = "StayRank Trip Planner Pro"


class BillingError(Exception):
    """Raised only on a real Stripe API/network failure - never for a
    declined card, which Stripe's own hosted Checkout page handles and
    reports to the shopper directly, without this backend ever seeing it.
    """


def _auth() -> tuple[str, str]:
    return (config.STRIPE_SECRET_KEY, "")


def _stripe_error_message(response: httpx.Response) -> str:
    try:
        return response.json().get("error", {}).get("message") or response.text
    except ValueError:
        return response.text


def create_checkout_session(email: str, success_url: str, cancel_url: str) -> str:
    """Creates a Stripe Checkout Session for the recurring Trip Planner Pro
    subscription and returns the hosted checkout URL to redirect to. The
    price is defined inline (price_data) rather than requiring a
    pre-created Stripe Product/Price in the dashboard, so this works the
    moment a secret key is dropped into .env with no extra Stripe setup.
    """
    body = {
        "mode": "subscription",
        "customer_email": email,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": str(config.STRIPE_PRO_PRICE_CENTS),
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][product_data][name]": PRODUCT_NAME,
        "line_items[0][quantity]": "1",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": "true",
    }
    try:
        response = httpx.post(f"{STRIPE_API_BASE}/checkout/sessions", data=body, auth=_auth(), timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise BillingError(_stripe_error_message(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise BillingError(f"Couldn't reach Stripe: {exc}") from exc
    return response.json()["url"]


def retrieve_checkout_session(session_id: str) -> dict:
    """Fetches a Checkout Session's current status - used right after the
    traveler is redirected back from Stripe, so Pro unlocks immediately
    without waiting on a webhook. A webhook needs a public URL Stripe can
    reach, which a local dev sandbox doesn't have, so this synchronous
    check is the primary confirmation path; the webhook below is a second,
    more durable path for a real deployment (e.g. it also catches a later
    subscription cancellation, which this one-time check can't).
    """
    try:
        response = httpx.get(
            f"{STRIPE_API_BASE}/checkout/sessions/{session_id}",
            params={"expand[]": "subscription"},
            auth=_auth(),
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise BillingError(_stripe_error_message(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise BillingError(f"Couldn't reach Stripe: {exc}") from exc
    return response.json()


def get_subscription(subscription_id: str) -> dict:
    try:
        response = httpx.get(
            f"{STRIPE_API_BASE}/subscriptions/{subscription_id}",
            auth=_auth(),
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise BillingError(_stripe_error_message(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise BillingError(f"Couldn't reach Stripe: {exc}") from exc
    return response.json()


def create_billing_portal_session(customer_id: str, return_url: str) -> str:
    """Lets a subscriber manage or cancel their own subscription on
    Stripe's own hosted page - this app deliberately never implements its
    own cancel/refund logic, so there's no way for it to drift out of sync
    with what Stripe actually billed.
    """
    try:
        response = httpx.post(
            f"{STRIPE_API_BASE}/billing_portal/sessions",
            data={"customer": customer_id, "return_url": return_url},
            auth=_auth(),
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise BillingError(_stripe_error_message(exc.response)) from exc
    except httpx.HTTPError as exc:
        raise BillingError(f"Couldn't reach Stripe: {exc}") from exc
    return response.json()["url"]


def verify_webhook_signature(payload: bytes, sig_header: str, secret: str, tolerance_seconds: int = 300) -> dict:
    """Verifies a Stripe webhook per Stripe's own documented algorithm
    (https://docs.stripe.com/webhooks#verify-manually) without needing the
    stripe SDK: the header carries `t=<timestamp>,v1=<hex hmac>`, and the
    signed payload is `f"{timestamp}.{raw_body}"` under HMAC-SHA256 keyed
    by the webhook's signing secret. Raises BillingError on any mismatch or
    a timestamp outside the tolerance window (replay-attack guard) -
    never silently accepts an unverified payload as a real Stripe event.
    """
    try:
        pairs = dict(item.split("=", 1) for item in sig_header.split(","))
        timestamp = pairs["t"]
        signature = pairs["v1"]
    except (KeyError, ValueError) as exc:
        raise BillingError("Malformed Stripe-Signature header.") from exc

    if abs(time.time() - int(timestamp)) > tolerance_seconds:
        raise BillingError("Webhook timestamp outside tolerance - possible replay.")

    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise BillingError("Webhook signature verification failed.")

    return json.loads(payload)
