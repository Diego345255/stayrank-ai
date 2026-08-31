# StayRank AI: Visual Redesign + Declutter — Design Spec

Date: 2026-08-30
Status: Draft, pending user review

## Context

StayRank AI (clearstay.online) is a solo-built hotel-ranking prototype whose
core differentiator is radical honesty: real data vs. disclosed estimates,
zero paid placement, zero fake urgency. The site has grown feature-by-feature
(search, map, neighborhood insights, shortlist/compare, Trip Planner Pro,
community reviews, an advertise panel, a methodology page, 10 SEO guides) and
now reads as visually generic and structurally dense — a lot competes for
attention on the main search page.

The user asked for a redesign covering three goals (confirmed via
multi-select): **visual polish**, **simplify & declutter**, and **fresh brand
identity**. This spec covers both together, since the layout changes and the
visual identity change are meant to land as one coherent pass.

## Decisions made during brainstorming (with the user)

1. **Visual direction: "Editorial Trust."** Chosen unanimously (9/9 browser
   clicks + explicit terminal confirmation "A") over two alternatives — a
   refined version of the current purple/Plus Jakarta Sans identity, and a
   bolder dark "Documented Proof" direction with serif+mono. Editorial Trust
   reads like a documented report rather than a marketing page — the
   strongest fit for "here's the receipts, not the pitch."
2. **What's cluttered:** user confirmed (multi-select) that the left sidebar,
   the trust-list + founder-dashboard block, and the entire stacked
   right-hand column all feel cluttered — not one specific section.
3. **Declutter approach:** user approved (via wireframe review + "keep
   going") moving trust/about content off the main search page into a
   dedicated page, and collapsing the sidebar's secondary controls by
   default. A tabbed-panel alternative was proposed and explicitly not
   chosen (trades content-discoverability for scroll savings the other two
   moves already mostly capture).

## Visual identity: Editorial Trust

**Typography**
- Headings: **Newsreader** (serif) — weights 500/600/700, italic for the
  `<em>` prototype-note usages already in the markup.
- Body/UI: **Roboto** — weights 400/500/700.
- Both loaded via Google Fonts, replacing the current Plus Jakarta Sans
  single-family setup in `index.html`, `methodology.html`, and all
  `guides/*.html` pages for consistency across the whole site.

**Color tokens** (mapped onto the existing CSS custom-property names in
`styles.css`/`methodology.html`/guide pages, so this is a value swap, not a
new token system):

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--ink` | `#0F172A` | `#F1F5F9` | primary text |
| `--muted` | `#475569` | `#94A3B8` | secondary text |
| `--line` | `#CBD5E1` | `#334155` | borders |
| `--soft` | `#F1F5F9` | `#1E293B` | panel backgrounds |
| `--paper` | `#FFFFFF` | `#111C33` | card backgrounds |
| `--cream` | `#F8FAFC` | `#0B1220` | page background |
| `--accent-solid` (primary CTA) | `#1E3A8A` (navy) | `#D4A017` (gold) | **flips role by theme** — navy leads in light mode, gold leads in dark mode, both from the same "authority + trust" family found in the style-search data (Legal Services navy, trust-gold pairing) |
| `--accent-ink` (text on solid accent) | `#FFFFFF` | `#1C1400` | |
| `--accent-tint` | `#E7ECF9` | `#2A2410` | |
| `--accent-text` | `#1E3A8A` | `#E8C25C` | must re-verify 4.5:1 contrast once implemented |
| `--green` / `--green-tint` / `--green-text` | keep close to current | | "Real fact" badge — unchanged in spirit, retuned to sit well next to navy |
| `--amber` / `--amber-tint` | keep close to current | | "Disclosed estimate" badge |
| `--rose` | keep close to current | | destructive/error text |

Exact hex values above are anchors, not final — normal implementation-time
tuning (esp. re-verifying WCAG AA contrast pairs) is expected and doesn't
need a design-doc round-trip.

**Rollout surface:** `index.html`, `methodology.html`, `guides/index.html`,
all 10 `guides/*.html` pages, and the new `about.html` (below) — one shared
visual language, not just the homepage.

## Layout: declutter

**Left sidebar** — trip description + city/budget/nights/dates stay
always-visible (core, every-search inputs). "Hard requirements" and "Ranking
priorities" collapse into a single `<details>`-based accordion, closed by
default, labeled something like "Hard requirements & priorities ▸" with a
one-line summary of anything already active (e.g. "2 active" ) so a
returning user can tell at a glance whether they've set anything without
opening it.

**Right-hand column** — Map view, Neighborhood read, and Decision model stay
in the main search flow (they're genuinely tied to the current search
result). Trust list ("Why this beats a typical booking site"), Founder
dashboard, and the Advertise panel move to a new dedicated page.

**"Best time to visit" panel** — moves from its own always-reserved slot at
the top of the right column to a new position directly above the results
grid in the main (left) column, using the same `.panel` card styling it has
today, still populated by the existing `fetchBestTimeToVisit`/
`renderBestTimeToVisit` functions and still hidden via the same
`els.bestTimeSection.hidden` toggle when a city has too few real months of
data. This is a DOM-position change only, not a new component. Flagged
during the wireframe review; no objection raised, proceeding with this
unless the user says otherwise in spec review.

**New `about.html` page** (replaces the two separate current header links —
"How the ranking works" and "Hotel search guides" — with one "About
StayRank AI" link; the About page itself surfaces both as clear cards, so
neither gets buried):
1. Short mission/honesty statement (why this app exists, the no-fake-urgency
   /no-paid-placement stance, in the new Editorial Trust voice)
2. Trust list (moved verbatim from `index.html`, 8 items)
3. Founder dashboard (moved verbatim, live stats)
4. Advertise panel (moved verbatim)
5. "Go deeper" section: cards linking to `methodology.html` and
   `guides/index.html`

## Technical notes (why this isn't just a copy-paste)

- `methodology.html` and every `guides/*.html` page are fully static —
  no shared JS, by design. `about.html` can't be, because the Founder
  dashboard needs live stats and the Advertise panel's "Copy email" button
  needs `copyTextToClipboard`/`showToast`. **Do not load the full `app.js`
  on `about.html`** — it wires dozens of `document.querySelector(...)`
  calls without optional chaining (e.g.
  `document.querySelector("#exportButton").addEventListener(...)`) that
  will throw on a page missing those elements, silently killing every
  listener registration after the throw point in that script. Instead,
  extract a small dedicated `about.js` with just: the founder-dashboard
  fetch + render call, and the copy-email handler (copied/adapted, not
  imported, to keep `about.html` genuinely standalone like its siblings).
- `index.html` needs a real `<details>`/accordion component for the
  sidebar (native `<details>` is enough — no new JS framework needed) and
  the removal of the trust-list/founder-dashboard/advertise markup (moved,
  not deleted) plus the "Best time to visit" panel's repositioning in the
  DOM (CSS/HTML move, the JS that populates it — `fetchBestTimeToVisit`/
  `renderBestTimeToVisit` — is unaffected since it targets it by ID).
- Every page's cache-busting query strings (`styles.css?v=`, `app.js?v=`,
  `i18n.js?v=`) bump as usual on this scale of change.
- Dark mode must be re-verified for every changed token, not just light
  mode — this app already supports a light/dark toggle and that has to keep
  working, including the flipped navy/gold accent role described above.

## Testing plan

- Local preview via existing `static-server` + `backend-api` launch
  configs (no new tooling needed).
- Verify: no console errors on `index.html`, `about.html`, `methodology.html`,
  and a sample of `guides/*.html`; sidebar accordion opens/closes and
  reflects active-filter count; all internal links resolve (header nav,
  About page's cards to Methodology/Guides, every guide's existing
  cross-links); Founder dashboard stats and Advertise panel's copy-email
  still work on `about.html`; light and dark mode both checked on at least
  `index.html` and `about.html`.
- No backend/API changes in this pass — purely HTML/CSS/JS restructuring
  and a new static-ish page — so no `py_compile`/backend test pass is
  needed, only the frontend checks above.

## Explicitly out of scope for this pass

- No changes to the ranking algorithm, backend endpoints, or database
  schema.
- No changes to Trip Planner Pro's internal panels (weather/POI/itinerary/
  budget/packing) beyond inheriting the new color/type tokens.
- No new pages beyond `about.html` — the 10 guide pages get re-themed, not
  restructured.
- TikTok/Reddit/Product-Hunt launch work (separate, already-tracked
  workstream) is untouched by this spec.
