"""Flight ESTIMATES only - not live pricing.

Researched before building this: every free/low-cost flight-price API
option (Amadeus Self-Service, Kiwi Tequila, Aviationstack, AeroDataBox) is
either being discontinued, now requires a commercial partnership (Kiwi
Tequila now needs 50k+ monthly active users to get API access), or offers
too few free calls to be usable per-search. Rather than wire up a "live"
integration that would silently break, or fabricate realistic-looking fake
fares, this module only ever produces a labeled estimate: great-circle
distance -> a rough flight-time and fare-band heuristic. The frontend must
never present this as a live quote.
"""

from backend.geocoding import haversine_km

CRUISE_SPEED_KMH = 800
GROUND_OVERHEAD_HOURS = 1.0  # taxi, takeoff/climb, descent/landing, on average

# (max distance km, label, USD-per-km band used for the rough fare estimate)
_HAUL_BANDS = [
    (1500, "short-haul", (0.10, 0.22)),
    (4500, "medium-haul", (0.07, 0.15)),
    (float("inf"), "long-haul", (0.05, 0.11)),
]


def estimate_flight(origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float) -> dict:
    distance_km = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    flight_hours = distance_km / CRUISE_SPEED_KMH + GROUND_OVERHEAD_HOURS

    haul, low_rate, high_rate = "long-haul", 0.05, 0.11
    for max_km, label, (low, high) in _HAUL_BANDS:
        if distance_km <= max_km:
            haul, low_rate, high_rate = label, low, high
            break

    # Found via testing a near-zero distance (origin same as/very close to the
    # destination): the $20 floor above used to add to the *raw* fare_low
    # (before its own $35 floor was applied), not the floor actually shown as
    # estimatedFareLowUsd. For any distance short enough that both raw fares
    # round to $0 (roughly under 25km at the short-haul rate), that produced
    # a displayed range of "$35-$20" - a high estimate below the low one,
    # reproduced live via a real /api/trip-plan call with originCity=city.
    # Deriving the high floor from the already-clamped low value guarantees
    # high >= low for every distance, not just realistic ones.
    fare_low = max(round(distance_km * low_rate / 5) * 5, 35)
    fare_high = max(round(distance_km * high_rate / 5) * 5, fare_low + 20)

    return {
        "distanceKm": round(distance_km),
        "estimatedFlightHours": round(flight_hours, 1),
        "haul": haul,
        "estimatedFareLowUsd": fare_low,
        "estimatedFareHighUsd": fare_high,
        "isEstimate": True,
    }
