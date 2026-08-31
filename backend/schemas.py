from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    prompt: str = ""
    city: str
    budget: float = 190
    persona: str = "first-time"
    tagFilter: str = "all"
    minRating: float = 0
    # Real hotel star/class rating (Hotelbeds categoryCode, Booking.com's own
    # class field, or the generated tier's archetype-consistent star_range) -
    # 0 means no filter. Distinct from minRating, which filters on GUEST
    # review score, not the property's own star class.
    minStarRating: int = 0
    mustHaves: list[str] = Field(default_factory=list)
    # Auto-detected musts (see nlp.infer_dynamic_musts) the traveler explicitly
    # chose to relax after seeing them - subtracted back out server-side so
    # unchecking one actually loosens the search instead of being cosmetic.
    suppressMusts: list[str] = Field(default_factory=list)
    sort: str = "match"
    weights: dict[str, int] | None = None
    landmark: str = ""
    # Only includes hotels with a real, positively-reported accessibility
    # facility (see ranking.passes_accessible_filter) - never excludes a
    # hotel for lacking data, since missing data isn't evidence of
    # inaccessibility.
    accessibleOnly: bool = False
    # Hard-excludes any hotel whose real per-night price exceeds `budget`,
    # rather than just softly penalizing its score the way `budget` already
    # does everywhere else. Distinct control because the two serve different
    # jobs: `budget` alone tells the ranker "prefer near this price" without
    # hiding anything; this flag additionally hides listings a traveler
    # explicitly said they don't want to see at all.
    budgetOnly: bool = False
    # Only includes hotels with a real, positively-reported "Pets allowed"
    # facility (see ranking.passes_pet_friendly_filter) - same
    # never-excludes-for-missing-data caution as accessibleOnly above.
    petFriendlyOnly: bool = False
    # Kayak/Google Hotels both let travelers narrow results to one specific
    # neighborhood - exact match against a real neighborhood name this
    # city's hotels are already grouped under (see neighborhoods table),
    # not free text, so there's no fuzzy-matching ambiguity. "" means no
    # filter.
    neighborhoodFilter: str = ""


class SyncRequest(BaseModel):
    city: str


class TripPlanRequest(BaseModel):
    city: str
    nights: int = 5
    startDate: str = ""  # ISO date (YYYY-MM-DD); blank = weather/dates omitted
    originCity: str = ""  # blank = no flight estimate
    # Which real hotel (from this city's own hotels table) to anchor weather/
    # POI/distance queries to. Blank/not-found falls back to the previous
    # city-hotel-centroid behavior rather than failing the request.
    hotelId: int | None = None


class WalkingRouteRequest(BaseModel):
    fromLatitude: float
    fromLongitude: float
    toLatitude: float
    toLongitude: float


class ItineraryAdjustRequest(BaseModel):
    nights: int
    instruction: str
    # The same pointsOfInterest object /api/trip-plan already returned -
    # sent back rather than re-fetched, so this never re-hits Overpass.
    pointsOfInterest: dict[str, list[dict]]


class ShortlistSummaryRequest(BaseModel):
    # Only IDs, not client-supplied hotel data - the backend re-fetches the
    # real, current DB record for each one, so the LLM prompt is always
    # grounded in genuine server-side facts, never whatever a client
    # happened to send.
    hotelIds: list[int]


class HotelQuestionRequest(BaseModel):
    question: str


class CheckoutSessionRequest(BaseModel):
    # Not a login/account system - just the identifier a returning traveler
    # re-enters to restore Pro access on another device or after clearing
    # localStorage (see backend/database.py's pro_subscriptions table).
    email: str
    # Where Stripe redirects back to after the traveler pays/cancels -
    # sent by the frontend (it knows its own origin) rather than hardcoded
    # here, since this backend is served from a different port/host than
    # the static frontend in local dev and may be too in production.
    successUrl: str
    cancelUrl: str


class PortalSessionRequest(BaseModel):
    email: str
    returnUrl: str


class CommunityReviewCreate(BaseModel):
    hotelId: int
    authorName: str = Field(min_length=2, max_length=80)
    # Same no-account, email-as-identity pattern as CheckoutSessionRequest -
    # this is the "registration" for posting: never displayed publicly,
    # only stored so a repeat spam source is at least identifiable later.
    authorEmail: str
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=10, max_length=3000)
    tripType: str | None = Field(default=None, max_length=40)
    # Pasted image URLs, not an uploaded file - this prototype has nowhere
    # to durably store uploaded binaries yet (see the module docstring on
    # backend/community_seed.py for why seeded photos are inline SVGs
    # instead). Capped at 5 so one submission can't balloon the response
    # payload every future viewer of this hotel has to download.
    photos: list[str] = Field(default_factory=list, max_length=5)
