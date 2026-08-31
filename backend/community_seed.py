"""Example traveler reviews (with photos) seeded onto a handful of curated
hotels, purely so the new community-reviews feature has something to show
before any real traveler has posted - see database.seed_sample_community_reviews.

Every entry here is inserted with is_sample=1 and the frontend badges it
"Sample review" - this app's own pitch is "never invented reviews" (see the
trust list in index.html), so passing these off as real guest submissions
would contradict that. For the same reason the photos below are generated
placeholder tiles (an inline SVG data URI, built by _placeholder_photo),
not real photographs hotlinked from the internet and presented as if a
traveler took them - that would misattribute a real photographer's image
to a fictional guest at a specific hotel, which is a step further into
fabrication than this app is willing to take even for demo content.
"""

from urllib.parse import quote

# (background-start, background-end, emoji, category label) - one entry per
# photo "kind" a hotel review photo commonly shows. Colors are decorative
# only; the SVG itself has no external dependency (same inline-SVG-data-URI
# pattern index.html already uses for the favicon).
_PHOTO_KINDS = {
    "room": ("#cdb3ff", "#8a63f0", "🛏️", "Room"),
    "view": ("#a8d8ff", "#3d8bd6", "🌆", "View"),
    "breakfast": ("#ffe2a8", "#e0a13a", "🍳", "Breakfast"),
    "bathroom": ("#a8f0e0", "#2fa88f", "🚿", "Bathroom"),
    "lobby": ("#e3c6ff", "#9a5fd6", "🛋️", "Lobby"),
    "street": ("#ffc9c2", "#e2645a", "🚶", "Neighborhood"),
    "garden": ("#c8f0a8", "#5fa83a", "🌿", "Garden"),
}


def _placeholder_photo(kind: str) -> dict:
    """Builds a self-contained inline-SVG "photo" data URI - a soft gradient
    tile with an emoji + label - standing in for a real traveler photo.
    Never fetched from a URL, so it can never 404 or hotlink someone else's
    real picture.
    """
    start, end, emoji, label = _PHOTO_KINDS[kind]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{start}"/><stop offset="1" stop-color="{end}"/>'
        f'</linearGradient></defs>'
        f'<rect width="480" height="360" fill="url(#g)"/>'
        f'<text x="240" y="175" font-size="88" text-anchor="middle" dominant-baseline="middle">{emoji}</text>'
        f'<text x="240" y="255" font-size="26" font-family="sans-serif" font-weight="700" '
        f'fill="rgba(0,0,0,0.55)" text-anchor="middle">{label}</text>'
        f'<text x="240" y="290" font-size="15" font-family="sans-serif" '
        f'fill="rgba(0,0,0,0.4)" text-anchor="middle">Sample photo (illustrative)</text>'
        f'</svg>'
    )
    return {"url": f"data:image/svg+xml;utf8,{quote(svg)}", "caption": label}


SAMPLE_COMMUNITY_REVIEWS = [
    # Tokyo
    {
        "hotel_slug": "ueno-nest",
        "author_name": "Priya M.",
        "rating": 5,
        "trip_type": "Solo",
        "created_at": "2026-05-12T10:00:00+00:00",
        "body": "Stayed 4 nights in April. The room was small like the listing says, but it's genuinely two minutes from Ueno station, which mattered more than square footage by day two. Staff printed a subway map for me unprompted on my first morning.",
        "photos": [_placeholder_photo("room"), _placeholder_photo("street")],
    },
    {
        "hotel_slug": "asakusa-river",
        "author_name": "Daniel K.",
        "rating": 4,
        "trip_type": "Couple",
        "created_at": "2026-04-02T09:30:00+00:00",
        "body": "Lovely river-facing room, breakfast was simple but fresh (rice, miso, grilled fish). Only knock: the walls are thin enough to hear the hallway. Would still book again for the location alone - Senso-ji is a 10 minute walk.",
        "photos": [_placeholder_photo("view"), _placeholder_photo("breakfast")],
    },
    {
        "hotel_slug": "shinjuku-pulse",
        "author_name": "Aiko T.",
        "rating": 3,
        "trip_type": "Business",
        "created_at": "2026-03-20T18:15:00+00:00",
        "body": "Convenient for a work trip - fast wifi, desk actually usable. Fair warning if you're sensitive to noise: Shinjuku doesn't really quiet down until late. Ask for a room on a higher floor away from the main street if you can.",
        "photos": [_placeholder_photo("room")],
    },
    # Kyoto
    {
        "hotel_slug": "gion-machiya-retreat",
        "author_name": "Lars B.",
        "rating": 5,
        "trip_type": "Couple",
        "created_at": "2026-05-28T08:45:00+00:00",
        "body": "This is a real converted machiya, not a themed hotel pretending to be one - wooden beams, a tiny courtyard, the whole thing. Slower pace than a normal hotel (futon setup each night) but that was the point for us.",
        "photos": [_placeholder_photo("garden"), _placeholder_photo("room")],
    },
    {
        "hotel_slug": "karasuma-station-hotel",
        "author_name": "Mei C.",
        "rating": 4,
        "trip_type": "Family",
        "created_at": "2026-02-10T12:00:00+00:00",
        "body": "Straightforward, clean, right by the station which made day-tripping to Nara and Osaka painless with two kids in tow. Nothing fancy, but everything worked and check-in was fast even with our stroller and bags.",
        "photos": [_placeholder_photo("lobby")],
    },
    # London
    {
        "hotel_slug": "shoreditch-loft-rooms",
        "author_name": "Owen F.",
        "rating": 4,
        "trip_type": "Friends",
        "created_at": "2026-06-05T20:00:00+00:00",
        "body": "Exposed brick, high ceilings, genuinely stylish for the price point. Shoreditch nightlife is loud on weekends though - pack earplugs if that's not your scene. Great coffee shop right downstairs.",
        "photos": [_placeholder_photo("room"), _placeholder_photo("street")],
    },
    {
        "hotel_slug": "south-kensington-garden-house",
        "author_name": "Charlotte R.",
        "rating": 5,
        "trip_type": "Couple",
        "created_at": "2026-01-18T11:20:00+00:00",
        "body": "Quiet residential street, five minutes from the museums. Felt like staying in an actual London townhouse rather than a hotel block. Breakfast room is small so go early if you want a table.",
        "photos": [_placeholder_photo("breakfast"), _placeholder_photo("garden")],
    },
    # New York
    {
        "hotel_slug": "chelsea-gallery-row-hotel",
        "author_name": "Marcus D.",
        "rating": 4,
        "trip_type": "Solo",
        "created_at": "2026-05-01T14:10:00+00:00",
        "body": "Walked to the High Line every morning of my trip. Rooms are compact by American standards (this is NYC after all) but the location saved me a fortune in subway fares I'd have otherwise spent.",
        "photos": [_placeholder_photo("street")],
    },
    {
        "hotel_slug": "williamsburg-waterfront-inn",
        "author_name": "Sofia N.",
        "rating": 5,
        "trip_type": "Friends",
        "created_at": "2026-04-22T19:45:00+00:00",
        "body": "Skyline view of Manhattan from the room was worth it alone. Williamsburg itself has better food than half of Manhattan for less money - just budget extra time for the L train on weekends, it's not always reliable.",
        "photos": [_placeholder_photo("view"), _placeholder_photo("room")],
    },
    {
        "hotel_slug": "midtown-central-tower",
        "author_name": "James O.",
        "rating": 3,
        "trip_type": "Business",
        "created_at": "2026-03-08T09:00:00+00:00",
        "body": "Exactly what you'd expect from a big Midtown tower - efficient, central, a little impersonal. Perfect if you're there for meetings and just need a bed near everything. Elevators get slow at peak checkout time.",
        "photos": [_placeholder_photo("lobby")],
    },
]
