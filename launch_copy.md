# Launch copy — Product Hunt + Hacker News

Ready-to-paste copy for priority stack item #3. Grounded in the actual
scoring logic (see `methodology.html`) and the real data sources in
`backend/` — nothing here claims a feature the code doesn't have.

---

## Product Hunt

**Launch timing:** Tuesday or Wednesday, 12:01am PT, to get the full
24-hour ranking window.

### Tagline (pick one, all under 60 chars)
- `Hotel rankings you can actually audit` (39)
- `Explainable hotel ranking, never a paid placement` (51)
- `See exactly why a hotel ranked #1 - the real math` (51)

### Description (under 260 chars)
> StayRank AI ranks real hotels against what you actually asked for -
> quiet, transit, budget, and more - with a documented, inspectable score
> instead of a black-box pick. No fake urgency, no paid placement, no
> invented reviews. The full formula is public.

(249 characters)

### Gallery screenshots (5-8, in this order)
1. Main ranking view with the score breakdown panel visible (quiet/transit/value bars)
2. The "Best reasons" / "Tradeoff" explanation card on a single hotel
3. Neighborhood fit map + Leaflet map view side by side
4. Compare shortlist (radar chart) view
5. The methodology page's weight table
6. Dark mode side-by-side with light mode
7. Ask This Hotel Anything chat panel (if screenshot-able in current build)
8. Price watch / real price-change view

Capture these directly from `clearstay.online` at real browser width
(not from the marketing video renders — PH reviewers expect actual product
screenshots, not ad creative).

### Maker's first comment (post immediately after launch goes live)
> Hey Product Hunt 👋
>
> I built StayRank AI because every hotel-booking site I used gave me a
> score with no explanation - a 9.2 out of what? Computed how? So I built
> the opposite: every ranking here is a documented weighted formula (quiet,
> cleanliness, transit, room size, value, persona fit) blended with a real
> semantic match against your trip description, and the whole thing is
> written up at [clearstay.online/methodology.html](https://clearstay.online/methodology.html) -
> no black box, no paid placement, no invented reviews.
>
> A few things I'm especially proud of as a solo build:
> - Real nearest-transit-stop and noise-context data pulled live from
>   OpenStreetMap, not a vague score
> - The AI trip-intent parser has a rule-based fallback, so a search never
>   fails even if the LLM call does
> - Zero ad or paid-placement system in the code - a hotel's rank is 100%
>   a function of the formula, published above
>
> It's a solo-built prototype, so I'd genuinely love feedback - especially
> on where the scoring feels off, or a city where the data coverage is
> thin. I'll be in the comments all day.

---

## Hacker News — "Show HN"

### Title
`Show HN: StayRank AI – hotel ranking with a published scoring formula, no paid placement`

(Keep under ~80 chars if trimming: `Show HN: StayRank AI – explainable hotel ranking, no paid placement`)

### Post body
> I got tired of hotel-booking sites giving me a "match score" with zero
> explanation, so I built a ranking engine where the formula is public and
> the same for every hotel.
>
> How it works: each hotel gets a weighted score across metrics (quiet,
> cleanliness, transit, room size, value, persona fit), blended 80/20 with
> a small dependency-free TF-IDF cosine-similarity engine matching your
> free-text trip description against the hotel's real neighborhood data
> and review text. Trip-intent parsing tries an LLM first, but every
> failure mode (no key, rate limit, timeout, bad response) falls back to a
> rule-based parser on the same request - a search never hard-fails
> because of the LLM.
>
> Where I could get a real fact instead of an estimate, I used one:
> nearest transit stop and "likely quiet / likely lively" context both
> come from OpenStreetMap's Overpass API (real named stations, real
> nightlife/road counts, not an invented decibel score), walking routes
> come from OSRM, weather from Open-Meteo (with historical fallback
> clearly flagged when a trip is beyond the ~15-day forecast horizon), and
> exchange rates from the ECB via Frankfurter. Full writeup, including the
> exact weight table, is at [/methodology.html](https://clearstay.online/methodology.html).
>
> No ad system, no paid placement, no fabricated reviews - I'd rather ship
> fewer features than fake a score I can't back up.
>
> It's a solo-built prototype (Python/FastAPI backend, vanilla JS
> frontend, SQLite for now), live at https://clearstay.online. Genuinely
> interested in pushback on the scoring model or the "honest estimate vs.
> real fact" framing - that's the part I'm least sure I've gotten right.

---

## Notes
- Both posts lean on the same core differentiator (transparent, published
  formula; zero paid placement) deliberately - per the growth research,
  Product Hunt, Hacker News, and Reddit audiences overlap more than they
  differ, and all three reward the same honest framing.
- Treat launch day as the start of a push, not the whole push: keep
  replying to comments on both platforms for several days after, not just
  launch morning.
- Do not incentivize upvotes/comments on either platform (against ToS on
  both, and would undercut the "no fake urgency" pitch this launch is
  built on).
