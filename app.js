// Found while auditing deploy-readiness (user is deploying tomorrow): this
// used to unconditionally hardcode `:8000`, assuming the frontend and
// backend always share a hostname on different ports - true for local dev
// (static-server on 4173, backend-api on 8000) but wrong for most real
// hosting: split frontend/backend platforms (different domains entirely),
// or any single-domain PaaS/reverse-proxy setup where only 443/80 is
// exposed externally and `:8000` simply isn't reachable from the browser.
// Resolution order:
//   1. window.STAYRANK_API_BASE - an explicit override, set via a small
//      inline <script> in index.html (or injected at deploy time) for
//      split-hosting setups where the backend lives on its own domain.
//   2. localhost/127.0.0.1 - keep the existing `:8000` dev convention so
//      local development is unaffected.
//   3. Otherwise - same-origin relative "" (i.e. call /api/... on whatever
//      domain served this page). This is what makes a single-domain
//      deploy (backend serving the static files itself, or a reverse
//      proxy routing /api/* to the backend) work with zero configuration.
const API_BASE =
  window.STAYRANK_API_BASE ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "");

// Hotel names/cities, guest review text, and POI names all come from external
// sources (live Booking.com sync, Wikipedia/OSM) and get interpolated into
// innerHTML template strings throughout this file. None of that text is
// escaped anywhere - a review comment or hotel name containing HTML would be
// parsed as markup, not shown as text. Real user-generated content (guest
// reviews) is the classic vector for this, so every render site that embeds
// external text needs to run it through this first.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

// Dark mode. index.html has its own tiny synchronous copy of the
// read-saved-or-fall-back-to-system-preference logic (runs before this
// deferred script, so the page never flashes the wrong theme on load) -
// this is the version that actually powers the toggle button afterward.
// Keep THEME_KEY identical to the literal string in index.html's inline
// script if this ever changes.
const THEME_KEY = "stayrank-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Non-fatal - the toggle still works for this page view, it just
    // won't be remembered on the next visit (e.g. privacy mode).
  }
  if (els.themeToggle) {
    const isDark = theme === "dark";
    els.themeToggle.querySelector(".theme-toggle-icon").textContent = isDark ? "☀️" : "🌙";
    els.themeToggle.setAttribute("aria-pressed", String(isDark));
    const label = isDark ? t("themeToggleLight") : t("themeToggleDark");
    els.themeToggle.setAttribute("aria-label", label);
    els.themeToggle.title = label;
  }
}

function initTheme() {
  if (!els.themeToggle) return;
  // index.html's inline script already set data-theme before this ran -
  // read that back rather than re-deriving it, so both stay in agreement.
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current);
  els.themeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

const TOAST_ICONS = { success: "✅", error: "⚠️", info: "ℹ️" };
const TOAST_AUTO_DISMISS_MS = 5000;

// Non-blocking replacement for this app's old alert() calls (sync
// results, export confirmations, "build a plan first" guards) - alert()
// freezes the whole page and reads like a browser error even for a
// success message, which isn't how a polished travel app should confirm
// "your plan was copied to clipboard."
function showToast(message, type = "info") {
  const container = document.querySelector("#toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button type="button" class="toast-dismiss" aria-label="Dismiss notification">×</button>
  `;
  const dismiss = () => {
    if (!toast.isConnected) return; // already removed - avoid a double-remove race
    toast.classList.add("toast-leaving");
    // Not just animationend: found live that a toast dismissed while its
    // leave animation can't actually play (prefers-reduced-motion sets
    // animation: none in CSS specifically so it never fires this event,
    // and this sandboxed test browser doesn't composite frames either,
    // which turned out to be the same failure mode) never got removed -
    // it just sat in the DOM forever, still taking up layout space. A
    // fallback timeout longer than the animation guarantees removal
    // either way; whichever fires first wins, the other is a no-op.
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector(".toast-dismiss").addEventListener("click", dismiss);
  const timer = setTimeout(dismiss, TOAST_AUTO_DISMISS_MS);
  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  container.appendChild(toast);
}

const DEFAULTS = {
  prompt: "I am going to Tokyo with my girlfriend for 5 nights. Budget under $190 per night. I want a quiet, clean hotel close to subway, good for first-time visitors, not in a loud nightlife area, with rooms that do not feel tiny.",
  city: "Tokyo",
  budget: "190",
  nights: "5",
  guests: "2",
  persona: "first-time",
  filter: "all",
  sort: "match",
  minRating: 0,
  minStarRating: 0,
  accessibleOnly: false,
  budgetOnly: false,
  petFriendlyOnly: false,
  landmark: "",
  neighborhoodFilter: ""
};

const defaultWeights = {
  quiet: 20,
  cleanliness: 18,
  transit: 18,
  roomSize: 12,
  value: 14,
  couple: 8,
  family: 4,
  breakfast: 3,
  wifi: 3
};

// A function, not a static object, so it always reflects the currently
// selected language (see i18n.js) rather than freezing in whatever
// language was active when app.js first loaded.
function metricLabels() {
  return {
    quiet: t("mustQuiet"),
    cleanliness: t("metricCleanliness"),
    transit: t("metricTransitAccess"),
    roomSize: t("metricRoomSize"),
    value: t("metricValue"),
    couple: t("metricCoupleFit"),
    family: t("metricFamilyFit"),
    breakfast: t("metricBreakfast"),
    wifi: t("metricWifi"),
    nightlife: t("metricNightlife")
  };
}

// Translates the backend's `intent.found` reason keys (see backend/nlp.py
// and backend/ranking.py's get_search_intent - both emit stable English
// keys, never display text, specifically so this function is the only
// place that turns them into language-appropriate prose). Found via live
// testing: switching to Spanish and searching "quiet hotel near the
// subway" translated every OTHER label on the page (metricLabels() below
// included) but left the "DETECTED INTENT" line itself stuck in English -
// traced to els.intentSummary.textContent rendering the backend's found[]
// strings directly, with no translation step at all.
function foundReasonLabels() {
  return {
    quiet: t("reasonQuiet"),
    transit: t("reasonTransit"),
    cleanliness: t("reasonCleanliness"),
    premium: t("reasonPremium"),
    roomSize: t("reasonRoomSize"),
    value: t("reasonValue"),
    couple: t("reasonCouple"),
    family: t("reasonFamily"),
    wifi: t("reasonWifi"),
    breakfast: t("reasonBreakfast"),
    nightlife: t("reasonNightlife"),
    firstTime: t("reasonFirstTime")
  };
}

function mustHaveLabels() {
  return {
    quiet: t("mustQuiet"),
    transit: t("mustTransit"),
    space: t("mustSpace"),
    family: t("mustFamily"),
    breakfast: t("mustBreakfast"),
    wifi: t("mustWifi")
  };
}

function loadShortlist() {
  try {
    const raw = JSON.parse(localStorage.getItem("stayrank-shortlist") || "[]");
    return new Map(raw.map((hotel) => [hotel.id, hotel]));
  } catch {
    return new Map();
  }
}

// Full search/filter state persistence - not just the shortlist. Losing
// filters and search criteria on reload is a common travel-site UX
// complaint (see Baymard's travel-site UX research); this is the fix.
const SEARCH_STATE_KEY = "stayrank-search-state";

function saveSearchState() {
  const snapshot = {
    prompt: els.prompt.value,
    city: els.city.value,
    budget: els.budget.value,
    nights: els.nights.value,
    checkInDate: els.checkInDate.value,
    guests: els.guests.value,
    persona: state.persona,
    filter: state.filter,
    sort: state.sort,
    minRating: state.minRating,
    minStarRating: state.minStarRating,
    accessibleOnly: state.accessibleOnly,
    budgetOnly: state.budgetOnly,
    petFriendlyOnly: state.petFriendlyOnly,
    neighborhoodFilter: state.neighborhoodFilter,
    musts: [...state.musts],
    suppressedMusts: [...state.suppressedMusts],
    weights: state.weights,
    landmark: els.landmark.value
  };
  try {
    localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable (e.g. private browsing) - persistence is a
    // nice-to-have, never worth failing the search over.
  }
}

function loadSearchState() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_STATE_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSearchState() {
  try {
    localStorage.removeItem(SEARCH_STATE_KEY);
  } catch {
    // ignore
  }
}

// Kayak/Booking.com/Google Hotels searches are all shareable by URL alone -
// this app's full search state was already persisted (see above), but only
// ever to THIS browser's localStorage, with no way to hand a specific
// search to a travel companion, or bookmark one, without re-typing every
// field. Reuses applySearchState()'s exact snapshot shape (see below) so
// there's one restore code path, not two - a URL-derived "saved state" and
// a localStorage one are otherwise indistinguishable to the rest of the app.
const SHARE_URL_KEYS = [
  "prompt", "city", "budget", "nights", "checkInDate", "guests", "landmark",
  "persona", "filter", "sort", "minRating", "minStarRating",
  "accessibleOnly", "budgetOnly", "petFriendlyOnly"
];

function buildShareSearchUrl() {
  const params = new URLSearchParams();
  if (els.prompt.value.trim()) params.set("prompt", els.prompt.value);
  if (els.city.value.trim()) params.set("city", els.city.value);
  params.set("budget", els.budget.value);
  params.set("nights", els.nights.value);
  if (els.checkInDate.value) params.set("checkInDate", els.checkInDate.value);
  params.set("guests", els.guests.value);
  if (els.landmark.value.trim()) params.set("landmark", els.landmark.value);
  params.set("persona", state.persona);
  params.set("filter", state.filter);
  params.set("sort", state.sort);
  if (state.minRating) params.set("minRating", state.minRating);
  if (state.minStarRating) params.set("minStarRating", state.minStarRating);
  if (state.accessibleOnly) params.set("accessibleOnly", "1");
  if (state.budgetOnly) params.set("budgetOnly", "1");
  if (state.petFriendlyOnly) params.set("petFriendlyOnly", "1");
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

// Returns null (not an empty object) when the URL has none of these params,
// so applySearchState() below is a genuine no-op on a plain visit instead
// of overwriting every restored field with defaults.
function parseSearchStateFromUrl() {
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].some((key) => SHARE_URL_KEYS.includes(key))) return null;
  const parsed = {};
  if (params.has("prompt")) parsed.prompt = params.get("prompt");
  if (params.has("city")) parsed.city = params.get("city");
  if (params.has("budget")) parsed.budget = params.get("budget");
  if (params.has("nights")) parsed.nights = params.get("nights");
  if (params.has("checkInDate")) parsed.checkInDate = params.get("checkInDate");
  if (params.has("guests")) parsed.guests = params.get("guests");
  if (params.has("landmark")) parsed.landmark = params.get("landmark");
  if (params.has("persona")) parsed.persona = params.get("persona");
  if (params.has("filter")) parsed.filter = params.get("filter");
  if (params.has("sort")) parsed.sort = params.get("sort");
  if (params.has("minRating")) parsed.minRating = Number(params.get("minRating"));
  if (params.has("minStarRating")) parsed.minStarRating = Number(params.get("minStarRating"));
  if (params.has("accessibleOnly")) parsed.accessibleOnly = true;
  if (params.has("budgetOnly")) parsed.budgetOnly = true;
  if (params.has("petFriendlyOnly")) parsed.petFriendlyOnly = true;
  return parsed;
}

// Recently searched cities - research found 54% of travelers plan
// multi-city trips, and this app's shortlist is already deliberately
// cross-city (see toggleShortlist), so a fast way to jump back to a city
// already searched this session directly supports that pattern. Purely a
// record of the user's own actions - no fabricated "trending" or
// "popular" claims about places they never searched.
const RECENT_CITIES_KEY = "stayrank-recent-cities";
const MAX_RECENT_CITIES = 6;

function loadRecentCities() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_CITIES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function addRecentCity(cityName) {
  if (!cityName) return;
  const existing = loadRecentCities().filter((name) => name.toLowerCase() !== cityName.toLowerCase());
  const updated = [cityName, ...existing].slice(0, MAX_RECENT_CITIES);
  try {
    localStorage.setItem(RECENT_CITIES_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal - this is a convenience list, not core state.
  }
  renderRecentCities();
}

function renderRecentCities() {
  if (!els.recentCitiesRow) return;
  const cities = loadRecentCities().filter((name) => name.toLowerCase() !== els.city.value.trim().toLowerCase());
  els.recentCitiesRow.hidden = cities.length === 0;
  els.recentCitiesRow.innerHTML = cities
    .map((name) => `<button type="button" class="recent-city-chip" data-city="${name}">${name}</button>`)
    .join("");
}

// Same pattern as recently-searched cities just above, applied to
// individual hotels - a common competitor pattern (Booking.com, Kayak, and
// Google Hotels all show a "recently viewed"/"continue browsing" strip).
// Built entirely from this browser's own real detail-dialog opens, so a
// hotel can only appear here because the traveler actually looked at it -
// never a fabricated "trending" or "popular" claim.
const RECENTLY_VIEWED_KEY = "stayrank-recently-viewed";
const MAX_RECENTLY_VIEWED = 6;

function loadRecentlyViewed() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function recordRecentlyViewed(hotel) {
  const entry = { id: hotel.id, name: hotel.name, city: hotel.city, price: hotel.price, image: hotel.image };
  const existing = loadRecentlyViewed().filter((item) => item.id !== hotel.id);
  const updated = [entry, ...existing].slice(0, MAX_RECENTLY_VIEWED);
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal - this is a convenience strip, not core state.
  }
  renderRecentlyViewed();
}

function renderRecentlyViewed() {
  if (!els.recentlyViewedRow) return;
  const viewed = loadRecentlyViewed();
  els.recentlyViewedRow.hidden = viewed.length === 0;
  els.recentlyViewedRow.innerHTML = viewed
    .map(
      (hotel) => `
        <button type="button" class="recently-viewed-card" data-hotel-id="${hotel.id}">
          <img src="${hotel.image}" alt="" loading="lazy" />
          <span class="recently-viewed-name">${escapeHtml(hotel.name)}</span>
          <span class="recently-viewed-meta">${escapeHtml(hotel.city)} &middot; $${hotel.price}/night</span>
        </button>
      `
    )
    .join("");
}

function activateByData(groupSelector, dataAttr, value) {
  const buttons = [...document.querySelectorAll(groupSelector)];
  const match = buttons.find((btn) => btn.dataset[dataAttr] === value);
  if (match) setActiveToggle(groupSelector, match);
}

function applySearchState(saved) {
  if (!saved) return;
  if (typeof saved.prompt === "string") els.prompt.value = saved.prompt;
  if (typeof saved.city === "string" && saved.city.trim()) els.city.value = saved.city;
  if (saved.budget != null) els.budget.value = saved.budget;
  if (saved.nights != null) els.nights.value = saved.nights;
  if (typeof saved.checkInDate === "string") els.checkInDate.value = saved.checkInDate;
  if (saved.guests != null) els.guests.value = saved.guests;
  if (typeof saved.landmark === "string") els.landmark.value = saved.landmark;
  if (typeof saved.persona === "string") state.persona = saved.persona;
  if (typeof saved.filter === "string") state.filter = saved.filter;
  if (typeof saved.sort === "string") state.sort = saved.sort;
  if (typeof saved.minRating === "number") state.minRating = saved.minRating;
  if (typeof saved.minStarRating === "number") state.minStarRating = saved.minStarRating;
  if (typeof saved.accessibleOnly === "boolean") state.accessibleOnly = saved.accessibleOnly;
  if (typeof saved.budgetOnly === "boolean") state.budgetOnly = saved.budgetOnly;
  if (typeof saved.petFriendlyOnly === "boolean") state.petFriendlyOnly = saved.petFriendlyOnly;
  // Not applied to the <select> here - its options don't exist yet until
  // the first search returns real neighborhood names (see
  // renderNeighborhoodFilterOptions), which re-reads this same state value
  // once they do.
  if (typeof saved.neighborhoodFilter === "string") state.neighborhoodFilter = saved.neighborhoodFilter;
  if (Array.isArray(saved.musts)) state.musts = new Set(saved.musts);
  if (Array.isArray(saved.suppressedMusts)) state.suppressedMusts = new Set(saved.suppressedMusts);
  if (saved.weights && typeof saved.weights === "object") {
    state.weights = { ...defaultWeights, ...saved.weights };
  }

  // Sync the restored state onto the actual controls so the visible UI
  // (chip/filter active states, checkboxes, selects) matches what's stored.
  activateByData(".chip", "persona", state.persona);
  activateByData(".filter", "filter", state.filter);
  els.mustHaves.forEach((checkbox) => {
    checkbox.checked = state.musts.has(checkbox.value);
  });
  els.sortSelect.value = state.sort;
  els.ratingSelect.value = String(state.minRating);
  els.starRatingSelect.value = String(state.minStarRating);
  els.accessibleToggle?.setAttribute("aria-pressed", String(state.accessibleOnly));
  els.accessibleToggle?.classList.toggle("active", state.accessibleOnly);
  els.budgetOnlyToggle?.setAttribute("aria-pressed", String(state.budgetOnly));
  els.budgetOnlyToggle?.classList.toggle("active", state.budgetOnly);
  els.petFriendlyToggle?.setAttribute("aria-pressed", String(state.petFriendlyOnly));
  els.petFriendlyToggle?.classList.toggle("active", state.petFriendlyOnly);
}

// Found via testing: emphatic prompt language ("quiet", "not tiny", "close
// to subway") gets promoted to hard must-have filters server-side
// (nlp.infer_dynamic_musts) - which can silently shrink a 15-hotel result
// set down to 1 with nothing in the UI explaining why. This surfaces which
// "Hard requirements" checkboxes the app enforced on the traveler's behalf,
// and lets them uncheck one to send it back as suppressMusts so unchecking
// actually loosens the search instead of being cosmetic.
function renderAutoMusts(dynamicMusts) {
  const autoSet = new Set((dynamicMusts || []).filter((must) => !state.suppressedMusts.has(must)));
  els.mustHaves.forEach((checkbox) => {
    const tag = checkbox.parentElement.querySelector(".auto-must-tag");
    const isAuto = autoSet.has(checkbox.value) && !state.musts.has(checkbox.value);
    if (isAuto) checkbox.checked = true;
    if (tag) tag.hidden = !isAuto;
  });
  if (!els.autoMustsNote) return;
  const autoLabels = [...autoSet].filter((must) => !state.musts.has(must)).map((must) => mustHaveLabels()[must] || must);
  if (autoLabels.length) {
    els.autoMustsNote.textContent = `Your description made these hard requirements, not just preferences: ${autoLabels.join(", ")}. Uncheck any below if you don't want them required.`;
    els.autoMustsNote.hidden = false;
  } else {
    els.autoMustsNote.hidden = true;
  }
}

function autoFilterLabels() {
  return {
    petFriendly: t("petFriendlyToggle"),
    accessible: t("accessibleToggle"),
    starRating: t("autoFilterStarClass"),
    minRating: t("autoFilterGuestRating"),
  };
}

// Same rationale as renderAutoMusts() above, but for the 4 sync*FromPromptMention()
// filter toggles/selects (task #141 pattern extended) - those only ever showed a
// 5-second toast when they fired, with no lasting on-page trace, so a traveler who
// glanced away mid-search had no way to tell WHY "Pet friendly" or a star-class
// filter was suddenly on. Reads state.autoAppliedFilters (kept in sync by the 4
// sync functions below and cleared by each control's manual handler).
//
// Found via testing every recently-shipped feature against live language
// switching (not just the two panels window.onLanguageChanged already
// covered): this whole function was hardcoded English - both the per-filter
// labels AND the sentence template - so wiring a call into
// onLanguageChanged (a real, necessary fix on its own) still wasn't
// sufficient on its own; re-running a function that never translated
// anything just re-renders the same English text. Now reads every label
// and the template itself through t(), matching the pattern
// mustHaveLabels()/foundReasonLabels() already use elsewhere in this file.
function renderAutoFiltersNote() {
  if (!els.autoFiltersNote) return;
  const currentLabels = autoFilterLabels();
  const labels = [...state.autoAppliedFilters].map((key) => currentLabels[key] || key);
  if (labels.length) {
    els.autoFiltersNote.textContent = t("autoFiltersNoteText").replace("{filters}", labels.join(", "));
    els.autoFiltersNote.hidden = false;
  } else {
    els.autoFiltersNote.hidden = true;
  }
}

const state = {
  weights: { ...defaultWeights },
  persona: "first-time",
  filter: "all",
  sort: "match",
  minRating: 0,
  minStarRating: 0,
  // Only ever INCLUDES a hotel with a real, positively-reported
  // accessibility facility (backend/ranking.py's passes_accessible_filter)
  // - never excludes one for missing data, since that's not evidence of
  // inaccessibility. See the accessibleToggle button in index.html.
  accessibleOnly: false,
  // Hard-excludes hotels priced above els.budget.value, distinct from the
  // budget input's existing soft-scoring role (see budgetOnlyToggle in
  // index.html and SearchRequest.budgetOnly in backend/schemas.py). Added
  // because "budget filter" usage is one of the fastest-growing filters on
  // real travel-search platforms in 2026 (Hotels.com/Expedia reporting),
  // and the existing budget field only ever nudged score, never hid a
  // result that blew the budget.
  budgetOnly: false,
  // Same never-excludes-for-missing-data caution as accessibleOnly: only
  // ever INCLUDES a hotel with a real, positively-reported "Pets allowed"
  // Hotelbeds facility (see ranking.passes_pet_friendly_filter). Pet-
  // friendly is reportedly the 5th most popular search filter on
  // Hilton.com - a real, high-demand filter this app had real data for
  // but no way to actually filter by.
  petFriendlyOnly: false,
  // Kayak/Google Hotels-style neighborhood filter - exact match against a
  // real neighborhood name (see renderNeighborhoodFilterOptions), "" means
  // no filter. Repopulated (and re-validated) after every search, since
  // the set of real neighborhoods differs per city.
  neighborhoodFilter: "",
  // Conversational result refinement (see refineBar in index.html): each
  // entry is a short phrase the traveler typed after seeing results ("cheaper",
  // "closer to downtown") - appended to the base prompt sent to /api/search
  // so the same LLM intent-parsing already run on the base prompt picks up
  // the adjustment too, re-ranking the SAME already-fetched real hotel set
  // rather than triggering a new Booking.com/Hotelbeds fetch. Capped at 4:
  // past that, restart with "Reset all" rather than layering indefinitely.
  refinements: [],
  musts: new Set(),
  // Auto-detected must-haves (from emphatic prompt language, see
  // nlp.infer_dynamic_musts) that the traveler explicitly unchecked after
  // seeing them called out - see renderAutoMusts().
  suppressedMusts: new Set(),
  // Which of the 4 sync*FromPromptMention() filters (petFriendly, accessible,
  // starRating, minRating) are CURRENTLY active because the prompt text
  // triggered them, not because the traveler clicked/selected them manually -
  // drives the persistent #autoFiltersNote (see renderAutoFiltersNote()),
  // mirroring the existing #autoMustsNote pattern above. Cleared per-filter
  // the moment the traveler manually touches that control, so the note never
  // claims credit for a choice the traveler actually made themselves.
  autoAppliedFilters: new Set(),
  shortlist: loadShortlist(),
  cities: [],
  worldCities: [],
  currentResults: [],
  currentIntent: { found: [], boosts: {}, dynamicMusts: [] },
  currentScoringModel: [],
  currentNeighborhoods: [],
  currentBudget: 190,
  currentCitySource: "curated",
  proUnlocked: false,
  // The email a real Stripe subscription is tied to (see backend's
  // pro_subscriptions table) - not a login system, just the identifier
  // used to re-verify entitlement server-side and to restore access on
  // another device or after localStorage is cleared.
  proEmail: "",
  // Populated from GET /api/config on bootstrap - lets the billing widget
  // know whether real Stripe keys are configured before it renders.
  stripeConfig: { stripeConfigured: false, stripeLiveMode: false, proPriceCents: 999 },
  tripPlan: null,
  itinerary: {},
  poiActiveCategory: "nature",
  // Populated once each day's real walking-route chain resolves (see
  // renderItinerary's day-total enrichment) - separate from `itinerary`
  // since it's derived/async data, not something a rebuild or AI-adjust
  // should need to touch. Lets tripPlanExportLines() include the same
  // real total shown on screen when it's already resolved, best-effort,
  // without making the export function itself async.
  dayWalkTotals: {}
};

const els = {
  prompt: document.querySelector("#tripPrompt"),
  rankButton: document.querySelector("#rankButton"),
  budget: document.querySelector("#budgetInput"),
  nights: document.querySelector("#nightsInput"),
  checkInDate: document.querySelector("#checkInDateInput"),
  checkInCountdown: document.querySelector("#checkInCountdown"),
  guests: document.querySelector("#guestsInput"),
  city: document.querySelector("#citySelect"),
  recentCitiesRow: document.querySelector("#recentCitiesRow"),
  recentlyViewedRow: document.querySelector("#recentlyViewedRow"),
  themeToggle: document.querySelector("#themeToggle"),
  photoLightbox: document.querySelector("#photoLightbox"),
  lightboxImage: document.querySelector("#lightboxImage"),
  lightboxCounter: document.querySelector("#lightboxCounter"),
  lightboxPrev: document.querySelector("#lightboxPrev"),
  lightboxNext: document.querySelector("#lightboxNext"),
  landmark: document.querySelector("#landmarkInput"),
  landmarkStatus: document.querySelector("#landmarkStatus"),
  weights: document.querySelector("#weights"),
  results: document.querySelector("#results"),
  intentSummary: document.querySelector("#intentSummary"),
  vibeCallout: document.querySelector("#vibeCallout"),
  refineBar: document.querySelector("#refineBar"),
  refineChips: document.querySelector("#refineChips"),
  refineForm: document.querySelector("#refineForm"),
  refineInput: document.querySelector("#refineInput"),
  hotelCount: document.querySelector("#hotelCount"),
  bestFit: document.querySelector("#bestFit"),
  shortlistCount: document.querySelector("#shortlistCount"),
  tripEstimate: document.querySelector("#tripEstimate"),
  sortSelect: document.querySelector("#sortSelect"),
  ratingSelect: document.querySelector("#ratingSelect"),
  starRatingSelect: document.querySelector("#starRatingSelect"),
  neighborhoodFilterSelect: document.querySelector("#neighborhoodFilterSelect"),
  accessibleToggle: document.querySelector("#accessibleToggle"),
  budgetOnlyToggle: document.querySelector("#budgetOnlyToggle"),
  petFriendlyToggle: document.querySelector("#petFriendlyToggle"),
  mustHaves: document.querySelectorAll('#mustHaves input[type="checkbox"]'),
  clearMusts: document.querySelector("#clearMusts"),
  autoMustsNote: document.querySelector("#autoMustsNote"),
  autoFiltersNote: document.querySelector("#autoFiltersNote"),
  neighborhoodInsights: document.querySelector("#neighborhoodInsights"),
  bestTimeSection: document.querySelector("#bestTimeSection"),
  bestTimeSummary: document.querySelector("#bestTimeSummary"),
  bestTimeGrid: document.querySelector("#bestTimeGrid"),
  scoringModel: document.querySelector("#scoringModel"),
  founderDashboard: document.querySelector("#founderDashboard"),
  mapCityLabel: document.querySelector("#mapCityLabel"),
  mapImage: document.querySelector(".map-card img"),
  hotelMap: document.querySelector("#hotelMap"),
  citySourceBadge: document.querySelector("#citySourceBadge"),
  syncButton: document.querySelector("#syncButton"),
  viewMapButton: document.querySelector("#viewMapButton"),
  resetAllButton: document.querySelector("#resetAllButton"),
  compareDialog: document.querySelector("#compareDialog"),
  compareTable: document.querySelector("#compareTable"),
  priceWatchesButton: document.querySelector("#priceWatchesButton"),
  priceWatchesCount: document.querySelector("#priceWatchesCount"),
  priceWatchesDialog: document.querySelector("#priceWatchesDialog"),
  priceWatchesList: document.querySelector("#priceWatchesList"),
  detailDialog: document.querySelector("#detailDialog"),
  detailTitle: document.querySelector("#detailTitle"),
  detailBody: document.querySelector("#detailBody"),
  unlockProButton: document.querySelector("#unlockProButton"),
  proBillingWidget: document.querySelector("#proBillingWidget"),
  proSubscribeForm: document.querySelector("#proSubscribeForm"),
  proEmailInput: document.querySelector("#proEmailInput"),
  proSubscribeButton: document.querySelector("#proSubscribeButton"),
  proPriceLabel: document.querySelector("#proPriceLabel"),
  proRestoreButton: document.querySelector("#proRestoreButton"),
  proActiveBadgeRow: document.querySelector("#proActiveBadgeRow"),
  manageSubscriptionButton: document.querySelector("#manageSubscriptionButton"),
  proBillingNote: document.querySelector("#proBillingNote"),
  tripPlannerLocked: document.querySelector("#tripPlannerLocked"),
  tripPlannerUnlocked: document.querySelector("#tripPlannerUnlocked"),
  tripStartDate: document.querySelector("#tripStartDate"),
  tripPlanNightsInput: document.querySelector("#tripPlanNightsInput"),
  tripPlanDestinationDisplay: document.querySelector("#tripPlanDestinationDisplay"),
  originCityInput: document.querySelector("#originCityInput"),
  tripPlanHotelSelect: document.querySelector("#tripPlanHotelSelect"),
  buildTripPlanButton: document.querySelector("#buildTripPlanButton"),
  printPlanButton: document.querySelector("#printPlanButton"),
  exportIcsButton: document.querySelector("#exportIcsButton"),
  printHeader: document.querySelector("#printHeader"),
  tripPlanStatus: document.querySelector("#tripPlanStatus"),
  tripPlanAnchorNote: document.querySelector("#tripPlanAnchorNote"),
  tripPlanStaleNote: document.querySelector("#tripPlanStaleNote"),
  flightEstimateCard: document.querySelector("#flightEstimateCard"),
  weatherPanel: document.querySelector("#weatherPanel"),
  weatherDays: document.querySelector("#weatherDays"),
  destinationTimezoneLine: document.querySelector("#destinationTimezoneLine"),
  poiPanel: document.querySelector("#poiPanel"),
  poiTabs: document.querySelector("#poiTabs"),
  poiList: document.querySelector("#poiList"),
  itineraryPanel: document.querySelector("#itineraryPanel"),
  itineraryDays: document.querySelector("#itineraryDays"),
  regenerateItineraryButton: document.querySelector("#regenerateItineraryButton"),
  itineraryAiInput: document.querySelector("#itineraryAiInput"),
  itineraryAiButton: document.querySelector("#itineraryAiButton"),
  itineraryAiStatus: document.querySelector("#itineraryAiStatus"),
  budgetPanel: document.querySelector("#budgetPanel"),
  dailySpendInput: document.querySelector("#dailySpendInput"),
  homeCurrencyInput: document.querySelector("#homeCurrencyInput"),
  budgetBreakdown: document.querySelector("#budgetBreakdown"),
  packingPanel: document.querySelector("#packingPanel"),
  packingList: document.querySelector("#packingList"),
  copyAdvertiseEmailButton: document.querySelector("#copyAdvertiseEmailButton")
};

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Our own HTTPException(detail="...") calls always send a plain string,
// but FastAPI's *own* validation errors (a request body field that fails
// Pydantic's type coercion, e.g. nights sent as 2.5 for an int field -
// reachable for real since #nightsInput has no `step` attribute stopping
// someone from typing a decimal) send `detail` as an array of
// {loc, msg, type} objects instead. Passed straight to `new Error(...)`,
// that array stringifies to the literal text "[object Object]" wherever
// the message is shown - reproduced live via the real trip-plan build
// flow. Handle both shapes here, once, rather than at every call site.
function extractErrorDetail(detail, status) {
  if (typeof detail?.detail === "string") return detail.detail;
  if (Array.isArray(detail?.detail)) {
    return detail.detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null;
        return field ? `${field}: ${item.msg}` : item.msg;
      })
      .filter(Boolean)
      .join("; ") || `API error ${status}`;
  }
  return `API error ${status}`;
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(extractErrorDetail(detail, response.status));
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(extractErrorDetail(detail, response.status));
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function showBackendError(err) {
  console.error("StayRank API error:", err);
  // API_BASE is "" (same-origin) outside local dev - showing that literal
  // empty string in the message would read like a rendering bug, so only
  // name a specific address when there actually is one (the local dev
  // case); the production case just says "the API" instead of naming a
  // location that doesn't exist as a separate string.
  els.results.innerHTML = `
    <div class="panel">
      <h2>Backend unavailable</h2>
      <p>Could not reach ${API_BASE ? `the StayRank API at ${API_BASE}` : "the StayRank API"}.${API_BASE ? " Start it with:" : ""}</p>
      ${API_BASE ? `<p><code>uvicorn backend.main:app --reload</code></p>` : ""}
    </div>
  `;
}

function showCityNotFound(message) {
  els.results.innerHTML = `
    <div class="panel">
      <h2>City not recognized</h2>
      <p>${message}</p>
    </div>
  `;
}

async function loadWorldCities() {
  const worldCities = await apiGet("/api/world-cities");
  state.worldCities = worldCities;
  const cityOptions = document.querySelector("#cityOptions");
  cityOptions.innerHTML = worldCities
    .map((city) => `<option value="${city.name}">${city.name}, ${city.country}</option>`)
    .join("");
}

function foldCityText(text) {
  return (text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Recognizes an explicit travel-intent phrase ("going to X", "trip to X", ...)
// followed by a name from our bundled world-city list, so a traveler who
// only ever types the destination into the free-text prompt (never
// touching the separate City field above it) doesn't silently get results
// for whatever city was previously left in that field. Reproduced live:
// typing "I am going to toronto" with City still on "Tokyo" returned a
// full Tokyo hotel list while the AI trip-read banner claimed to
// understand "Traveling to Toronto" - the two fields were never
// reconciled. Deliberately requires a travel-phrase trigger rather than a
// bare city-name match: several bundled city names double as ordinary
// English words (e.g. "Nice"), so matching any occurrence of "nice" in a
// prompt like "a nice hotel" would misfire.
const CITY_MENTION_RE =
  /\b(?:going to|travel(?:l?ing)? to|trip to|heading to|fly(?:ing)? to|move to|moving to|visiting|stay(?:ing)? in)\s+([a-z][a-z .'-]{1,28})/gi;

function detectCityMention(promptText) {
  if (!state.worldCities.length || !promptText || !promptText.trim()) return null;
  const byFoldedName = new Map(state.worldCities.map((city) => [foldCityText(city.name), city]));
  let match;
  CITY_MENTION_RE.lastIndex = 0;
  while ((match = CITY_MENTION_RE.exec(promptText))) {
    const words = match[1].trim().split(/\s+/);
    // Try longest word-count first so multi-word cities ("Cape Town") win
    // over an accidental shorter prefix match, then shrink down to a
    // single word so "toronto" alone (with trailing prose after it) still
    // resolves once the longer candidates fail.
    for (let n = Math.min(words.length, 4); n >= 1; n--) {
      const candidate = words.slice(0, n).join(" ").replace(/[.,!?;:]+$/, "");
      const hit = byFoldedName.get(foldCityText(candidate));
      if (hit) return hit;
    }
  }
  return null;
}

// Runs before every search: if the free-text prompt names a destination
// that differs from the City field, the prompt wins - it's the traveler's
// most explicit, most recent signal - and the field is synced (with a
// toast explaining why) rather than silently searching the stale city.
//
// Bug found via testing the new budgetOnly filter (see syncBudgetFromPromptMention
// below for the full story): this used to compare the prompt's mention
// against whatever the field currently held, which meant ANY manual edit
// to the field got silently reverted back to the prompt's mention on the
// very next render - and nearly everything (every filter click, sort
// change, toggle) triggers a render. Now tracks the last mention actually
// synced FROM, so a manual edit sticks until the prompt text itself
// names something new.
let lastSyncedCityMention = null;
function syncCityFromPromptMention() {
  const mentioned = detectCityMention(els.prompt.value);
  if (!mentioned) {
    lastSyncedCityMention = null;
    return;
  }
  const folded = foldCityText(mentioned.name);
  if (folded === lastSyncedCityMention) return;
  lastSyncedCityMention = folded;
  if (folded === foldCityText(els.city.value)) return;
  els.city.value = mentioned.name;
  showToast(`Detected "${mentioned.name}" in your trip description - switched the city to match.`, "info");
}

// Same pattern as syncCityFromPromptMention(): a plain "4 nights" / "5-night
// stay" / "for 3 nights" mention in the free-text prompt is an explicit,
// unambiguous signal - deterministic regex extraction of a number the
// traveler literally typed, not an inferred guess, so it's safe to sync
// without any AI call. Caps at 30 so a stray large number (a phone number,
// a budget figure) can't silently blow out the nights field.
const NIGHTS_MENTION_RE = /\b(\d{1,2})[\s-]*nights?\b/i;

let lastSyncedNightsMention = null;
function syncNightsFromPromptMention() {
  const match = NIGHTS_MENTION_RE.exec(els.prompt.value);
  if (!match) {
    lastSyncedNightsMention = null;
    return;
  }
  const mentioned = Number(match[1]);
  if (!mentioned || mentioned < 1 || mentioned > 30) return;
  if (mentioned === lastSyncedNightsMention) return;
  lastSyncedNightsMention = mentioned;
  if (mentioned === Number(els.nights.value)) return;
  els.nights.value = String(mentioned);
  showToast(`Detected "${mentioned} night${mentioned === 1 ? "" : "s"}" in your trip description - updated the nights field to match.`, "info");
}

// Same reasoning again, but requires an explicit budget/per-night context
// word right next to the number (not just any number in the prompt) so a
// stray figure - a landmark's opening year, a room count - can't get
// misread as a nightly budget. Matches "$220 per night", "220/night",
// "budget of $200", "budget around 220".
const BUDGET_MENTION_RE =
  /(?:\$\s?(\d{2,5})\s*(?:usd)?\s*(?:\/|a |per )\s*night)|(?:budget\s*(?:is|of|around|about|~)?\s*\$?\s?(\d{2,5}))/i;

// Bug found live while testing the new "Within budget only" filter: set
// the budget field to $150, turned the filter on, and it still showed
// hotels priced well above $150. Root cause was here, not in the filter -
// this function (and its city/nights siblings above) ran on EVERY
// rankAndRender() call (i.e. on every filter/sort/toggle click, not just
// prompt edits) and compared the prompt's mentioned budget against
// whatever the field currently held. The default prompt says "$190 per
// night", so the instant anything re-rendered after a manual edit, this
// silently snapped the field back to 190 - the traveler's own typed value
// never had a chance to take effect. Now tracks the last mention actually
// synced FROM (lastSyncedBudgetMention) so a manual edit sticks until the
// PROMPT TEXT ITSELF names a new budget, not just whenever the field
// happens to differ from it.
let lastSyncedBudgetMention = null;
function syncBudgetFromPromptMention() {
  const match = BUDGET_MENTION_RE.exec(els.prompt.value);
  if (!match) {
    lastSyncedBudgetMention = null;
    return;
  }
  const mentioned = Number(match[1] || match[2]);
  if (!mentioned || mentioned < 10 || mentioned > 10000) return;
  if (mentioned === lastSyncedBudgetMention) return;
  lastSyncedBudgetMention = mentioned;
  if (mentioned === Number(els.budget.value)) return;
  els.budget.value = String(mentioned);
  showToast(`Detected a $${mentioned}/night budget in your trip description - updated the budget field to match.`, "info");
}

// Same "explicit, unambiguous, deterministic regex" pattern as the nights
// and budget syncs above, extended to the two hard filters that already
// exist for exactly these situations (task #151's Accessible filter, the
// Pet friendly filter) but had no path from free text to the toggle - a
// traveler who typed "traveling with my dog" or "need a wheelchair
// accessible room" got zero benefit from either filter unless they also
// separately noticed and clicked the matching chip below the results.
// Guards against re-forcing a toggle the traveler manually turned back off
// (lastSyncedXMention only updates on a NEW distinct mention, same
// anti-fight design as the budget sync's fix above), and only ever turns a
// filter ON from text - never off, so this can't fight a manual toggle in
// the other direction either.
const PET_MENTION_RE =
  /\bpet[\s-]?friendly\b|\b(?:traveling|travelling|coming|going)\s+with\s+(?:my|a|our)\s+(?:dog|cat|pet)\b|\bbringing\s+(?:my|a|our)\s+(?:dog|cat|pet)\b/i;
const PET_NEGATION_RE = /\b(?:no|not|without|n't)\b[^.!?]{0,15}(?:pet|dog|cat)/i;

let lastSyncedPetMention = null;
function syncPetFriendlyFromPromptMention() {
  const text = els.prompt.value;
  const match = PET_MENTION_RE.exec(text);
  if (!match || PET_NEGATION_RE.test(text)) {
    lastSyncedPetMention = null;
    return;
  }
  if (match[0] === lastSyncedPetMention) return;
  lastSyncedPetMention = match[0];
  if (state.petFriendlyOnly) return;
  state.petFriendlyOnly = true;
  els.petFriendlyToggle?.setAttribute("aria-pressed", "true");
  els.petFriendlyToggle?.classList.add("active");
  state.autoAppliedFilters.add("petFriendly");
  renderAutoFiltersNote();
  showToast('Detected you’re traveling with a pet - turned on the "Pet friendly" filter to match.', "info");
}

const ACCESSIBLE_MENTION_RE = /\bwheelchair\b|\bmobility[\s-]?impair(?:ed|ment)\b|\baccessible room\b|\bstep-?free\b|\broll-?in shower\b/i;

let lastSyncedAccessibleMention = null;
function syncAccessibleFromPromptMention() {
  const match = ACCESSIBLE_MENTION_RE.exec(els.prompt.value);
  if (!match) {
    lastSyncedAccessibleMention = null;
    return;
  }
  if (match[0] === lastSyncedAccessibleMention) return;
  lastSyncedAccessibleMention = match[0];
  if (state.accessibleOnly) return;
  state.accessibleOnly = true;
  els.accessibleToggle?.setAttribute("aria-pressed", "true");
  els.accessibleToggle?.classList.add("active");
  state.autoAppliedFilters.add("accessible");
  renderAutoFiltersNote();
  showToast('Detected an accessibility need - turned on the "Accessible" filter to match.', "info");
}

// Third field extended with this same auto-sync pattern: the star-class
// filter (task #139, a real hard filter on `hotel.starRating`) had no path
// from a plain "5 star hotel" or "4-star or better" mention either. Only
// syncs 3-5 (the filter's own valid range - "Any star class" isn't
// something a prompt would ever name, so there's nothing to detect there).
const STAR_MENTION_RE = /\b([3-5])\s*\+?[\s-]*stars?\b/i;

let lastSyncedStarMention = null;
function syncStarRatingFromPromptMention() {
  const match = STAR_MENTION_RE.exec(els.prompt.value);
  if (!match) {
    lastSyncedStarMention = null;
    return;
  }
  if (match[0] === lastSyncedStarMention) return;
  lastSyncedStarMention = match[0];
  const mentioned = Number(match[1]);
  if (mentioned === state.minStarRating) return;
  state.minStarRating = mentioned;
  els.starRatingSelect.value = String(mentioned);
  state.autoAppliedFilters.add("starRating");
  renderAutoFiltersNote();
  showToast(`Detected "${mentioned}+ star" in your trip description - updated the star-class filter to match.`, "info");
}

// Fourth field, same pattern: the guest-rating filter's three thresholds
// are the app's own exact dropdown values (4.3/4.5/4.7 - not any decimal),
// so this only ever syncs on an exact match to one of them rather than
// rounding some other mentioned number to the "nearest" option, which
// would risk quietly asking for something looser OR stricter than what
// was actually typed. "4.5 star" is deliberately NOT matched here (that's
// the star-class sync's job, integers only) - the trailing "rating"/
// "rated" word is what disambiguates a guest-rating mention from a
// star-class one.
const RATING_MENTION_RE = /\b(4\.3|4\.5|4\.7)\s*\+?\s*(?:rating|rated)\b/i;

let lastSyncedRatingMention = null;
function syncMinRatingFromPromptMention() {
  const match = RATING_MENTION_RE.exec(els.prompt.value);
  if (!match) {
    lastSyncedRatingMention = null;
    return;
  }
  if (match[0] === lastSyncedRatingMention) return;
  lastSyncedRatingMention = match[0];
  const mentioned = Number(match[1]);
  if (mentioned === state.minRating) return;
  state.minRating = mentioned;
  els.ratingSelect.value = String(mentioned);
  state.autoAppliedFilters.add("minRating");
  renderAutoFiltersNote();
  showToast(`Detected "${mentioned}+ rating" in your trip description - updated the guest-rating filter to match.`, "info");
}

async function refreshCachedCities() {
  try {
    state.cities = await apiGet("/api/cities");
  } catch {
    // Non-fatal: founder dashboard stats just stay at their last known values.
  }
}

const SOURCE_BADGE_TEXT = {
  live: "Live Booking.com data",
  generated: "AI-generated preview data",
  curated: "Curated demo data",
  content: "Real hotels, estimated pricing"
};

// Found via auditing the guest-count fix above for the same class of gap:
// backend/api_fetcher.py's search_hotels() syncs a city's Booking.com
// prices ONCE, with a fixed 2-adults/1-room search ~45 days out for a
// 3-night stay - not the traveler's actual nights/guests/dates, which
// this "Live" badge gives no hint of. Building a real per-search sync
// matching exact trip params is real infrastructure work (see "Next
// production steps" in the README), out of scope to build right now, but
// at minimum the badge shouldn't imply a precision it doesn't have -
// added a tooltip stating the real basis rather than leaving "Live
// Booking.com data" to read as "priced for your exact trip."
const SOURCE_BADGE_TITLE = {
  live: "Synced from Booking.com's real search results for 2 adults, 1 room, a ~3-night stay ~45 days out - not necessarily your exact dates, guest count, or nights.",
  content: "Hotel names, photos, and coordinates are real (Hotelbeds' hotel directory or Wikidata's notable-hotel listings) - Booking.com's live pricing wasn't available for this city right now, so price, guest rating, and the metric bars below are estimated, not live."
};

function updateMapCard(cityName, heroImage, citySource) {
  if (els.mapCityLabel) els.mapCityLabel.textContent = cityName;
  if (els.mapImage && heroImage) {
    els.mapImage.src = heroImage;
    els.mapImage.alt = `${cityName} skyline`;
  }
  if (els.citySourceBadge) {
    els.citySourceBadge.textContent = SOURCE_BADGE_TEXT[citySource] || "";
    els.citySourceBadge.className = `source-badge source-${citySource || "curated"}`;
    els.citySourceBadge.title = SOURCE_BADGE_TITLE[citySource] || "";
  }
  if (citySource === "generated") enrichCityHeroPhoto(cityName);
}

// Curated cities ship a real hand-picked Unsplash photo, and live-synced
// ones use Booking.com's own city hero image, but a procedurally generated
// city (one not in the curated 4, and not live-sync-able right now - e.g.
// the Booking.com API key is rate-limited) only ever had
// backend/placeholder.py's gradient-plus-initials SVG to show, since there
// was no real photo of the city on hand. There IS one, though: Wikipedia
// already has a real lead photo for essentially every city in this app's
// bundled world_cities list, and the same free wikipedia.org REST API this
// app already uses for POI/itinerary photos (fetchWikipediaSummaryFor)
// works just as well for a bare city name. This never touches the hotel
// data itself - the hotels shown for a generated city are still honestly
// labeled "AI-generated preview data" via the source badge - it only
// replaces the illustrative skyline photo at the top of the map card with
// a real one, since the city itself is real even when its hotel list is a
// placeholder. Fire-and-forget from updateMapCard rather than awaited:
// the placeholder paints instantly, then quietly gets replaced if a real
// photo turns up, matching the same progressive-enhancement pattern this
// app already uses for POI photos.
// Surfaces the honest reason a city fell back to generated preview
// hotels/photos instead of real Booking.com ones - see get_or_create_city's
// docstring in backend/database.py. Deliberately shown at most once per
// city per page load (repeatedly re-searching the same rate-limited city
// while typing, thanks to the debounced live search, would otherwise pop a
// new toast on every keystroke pause).
const notifiedLiveSyncErrorCities = new Set();
function notifyLiveSyncError(cityName, liveSyncError) {
  if (!liveSyncError || notifiedLiveSyncErrorCities.has(cityName)) return;
  notifiedLiveSyncErrorCities.add(cityName);
  showToast(`Live Booking.com data unavailable for ${cityName} right now (${liveSyncError}) - showing AI-generated preview hotels instead.`, "error");
}

let heroPhotoToken = 0;
async function enrichCityHeroPhoto(cityName) {
  const token = ++heroPhotoToken;
  let summary;
  try {
    summary = await fetchWikipediaSummaryFor("en", cityName);
  } catch {
    return;
  }
  // The city switched again (or a new search re-ran) while this was in
  // flight, or a curated/live photo has since taken over the img element -
  // don't let a stale fetch stomp on whatever's showing now.
  if (token !== heroPhotoToken || !els.mapImage) return;
  if (summary?.thumbnailUrl) {
    els.mapImage.src = summary.thumbnailUrl;
    els.mapImage.alt = `${cityName} - real photo via Wikipedia`;
  }
}

let leafletMap = null;
let mapMarkersLayer = null;
// Card <-> marker "data brushing" (Kayak/Google Hotels pattern): hovering
// either highlights the other. Keyed by hotel id so both directions can
// look each other up without re-querying the DOM/map on every event.
let mapMarkersById = new Map();

function highlightCard(hotelId, isActive) {
  const card = document.querySelector(`.hotel-card[data-hotel-id="${hotelId}"]`);
  if (card) card.classList.toggle("map-highlighted", isActive);
}

// Hover highlight (.map-highlighted) is transient and clears on mouseout.
// A pin click needs to stay obvious after the mouse moves away and the
// list scrolls, so it gets its own persistent class + state, cleared only
// when a different pin is clicked or the results re-render.
let selectedHotelId = null;

function selectHotelOnMap(hotelId) {
  if (selectedHotelId != null) {
    document.querySelector(`.hotel-card[data-hotel-id="${selectedHotelId}"]`)?.classList.remove("map-selected");
  }
  selectedHotelId = hotelId;
  const card = document.querySelector(`.hotel-card[data-hotel-id="${hotelId}"]`);
  if (card) {
    card.classList.add("map-selected");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

let landmarkMarker = null;

const LANDMARK_ICON = typeof L !== "undefined"
  ? L.divIcon({ className: "landmark-marker-icon", html: "&#128205;", iconSize: [28, 28], iconAnchor: [14, 26] })
  : null;

const ANCHOR_HOTEL_ICON = typeof L !== "undefined"
  ? L.divIcon({ className: "anchor-hotel-marker-icon", html: "&#127968;", iconSize: [30, 30], iconAnchor: [15, 28] })
  : null;

// Places added to the itinerary get their own marker layer on the SAME
// hotel map, so a user can see the whole day's plan relative to where
// they'd actually be staying - previously the map only ever showed hotels
// and the landmark, never the itinerary the user spent time building.
let itineraryMarkersLayer = null;
// Real routed walking paths (see fetchWalkingRoute/routing.py) drawn from
// the anchor hotel to each itinerary place - a real "how do I get there"
// map, not just pins - added incrementally as each route resolves since
// they're fetched lazily per card, same as the itinerary cards' own text.
let routeLinesLayer = null;
const POI_MAP_ICONS = { nature: "🏞️", culture: "🏛️", entertainment: "🎭", family: "🎡", food: "🍽️" };

function renderItineraryMapMarkers() {
  if (!leafletMap) return;
  if (!itineraryMarkersLayer) itineraryMarkersLayer = L.layerGroup().addTo(leafletMap);
  itineraryMarkersLayer.clearLayers();
  if (!routeLinesLayer) routeLinesLayer = L.layerGroup().addTo(leafletMap);
  routeLinesLayer.clearLayers();

  // A POI can be added to more than one day - group by identity so it gets
  // one pin, not a stack of overlapping duplicates, with all its assigned
  // days listed in the popup.
  const byKey = new Map();
  Object.entries(state.itinerary).forEach(([dayNum, items]) => {
    (items || []).forEach((item) => {
      const key = `${item.latitude},${item.longitude},${item.name}`;
      if (!byKey.has(key)) byKey.set(key, { item, days: [] });
      byKey.get(key).days.push(dayNum);
    });
  });

  byKey.forEach(({ item, days }) => {
    if (item.latitude == null || item.longitude == null) return;
    const icon = L.divIcon({
      className: "itinerary-marker-icon",
      html: POI_MAP_ICONS[item.category] || "&#128205;",
      iconSize: [26, 26],
      iconAnchor: [13, 24]
    });
    // Every POI now has a real link via sourceLink() (Wikipedia/Wikidata
    // when available, a real Google Maps search otherwise - see the fix
    // above) - this popup was the one remaining place that link never
    // reached, so a marker click gave a name and nothing to act on.
    const source = sourceLink(item);
    L.marker([item.latitude, item.longitude], { icon })
      .addTo(itineraryMarkersLayer)
      .bindPopup(
        `<strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.categoryLabel)} &middot; Day ${days.join(", ")}` +
          (source ? `<br><a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>` : "")
      );
  });
}

function renderMap(hotels, landmark) {
  if (!els.hotelMap) return;

  if (typeof L === "undefined") {
    els.hotelMap.innerHTML = `<p class="subline">Map requires the Leaflet library (unpkg.com) to load.</p>`;
    return;
  }

  if (!leafletMap) {
    leafletMap = L.map(els.hotelMap, { scrollWheelZoom: false }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }).addTo(leafletMap);
    mapMarkersLayer = L.layerGroup().addTo(leafletMap);
  }

  mapMarkersLayer.clearLayers();
  mapMarkersById = new Map();
  selectedHotelId = null;
  if (landmarkMarker) {
    leafletMap.removeLayer(landmarkMarker);
    landmarkMarker = null;
  }

  // Itinerary pins are only meaningful for the city they were planned in -
  // if the results just re-rendered for a different city (or a re-sort of
  // the same one), keep them only when the trip plan still matches what's
  // on screen, otherwise clear the now-irrelevant pins rather than leaving
  // stale markers from a different city silently on the map.
  if (state.tripPlan && state.tripPlan.cityName === hotels[0]?.city) {
    renderItineraryMapMarkers();
  } else if (itineraryMarkersLayer) {
    itineraryMarkersLayer.clearLayers();
  }

  const points = hotels.filter((hotel) => hotel.latitude != null && hotel.longitude != null);
  const boundsPoints = points.map((hotel) => [hotel.latitude, hotel.longitude]);

  if (landmark) {
    // Same gap, same fix as the itinerary markers above: a plain name with
    // no link. Nominatim (the landmark search's own source) doesn't supply
    // wikipedia/wikidata tags, so sourceLink() falls straight through to
    // the real Google Maps search - still real, still fabricates nothing.
    const landmarkSource = sourceLink(landmark);
    landmarkMarker = L.marker([landmark.latitude, landmark.longitude], {
      icon: L.divIcon({ className: "landmark-marker-icon", html: "&#128205;", iconSize: [28, 28], iconAnchor: [14, 26] })
    })
      .addTo(leafletMap)
      .bindPopup(
        `<strong>&#128205; ${escapeHtml(landmark.name)}</strong>` +
          (landmarkSource ? `<br><a href="${landmarkSource.url}" target="_blank" rel="noreferrer">${landmarkSource.label}</a>` : "")
      );
    boundsPoints.push([landmark.latitude, landmark.longitude]);
  }

  if (!boundsPoints.length) {
    leafletMap.setView([20, 0], 2);
    return;
  }

  // Marks whichever hotel the trip plan is actually anchored to (see the
  // hotel-anchoring work above) so it's visually obvious which pin every
  // POI distance and walking route on this map is measured from.
  const anchorHotelId = state.tripPlan?.cityName === hotels[0]?.city ? state.tripPlan?.anchorHotelId : null;

  points.forEach((hotel) => {
    const isAnchor = hotel.id === anchorHotelId;
    // Found via testing: passing `icon: undefined` in Leaflet's marker
    // options doesn't fall back to the default icon the way omitting the
    // key does - it overwrites it, leaving the marker with no real icon
    // object at all. That crashes later, inside Leaflet itself, the next
    // time the layer is cleared (`Cannot read properties of undefined
    // (reading '_leaflet_events')`), which silently aborted this whole
    // loop partway through on every re-render. Only pass `icon` at all
    // when there's a real one to use.
    const marker = L.marker([hotel.latitude, hotel.longitude], isAnchor ? { icon: ANCHOR_HOTEL_ICON } : {})
      .addTo(mapMarkersLayer)
      .bindPopup(
        isAnchor
          ? `<strong>&#127968; ${escapeHtml(hotel.name)}</strong><br>Your trip plan is anchored here`
          : `<strong>${escapeHtml(hotel.name)}</strong><br>$${hotel.price}/night &middot; Score ${hotel.score}`
      );
    marker.on("mouseover", () => {
      marker.openPopup();
      highlightCard(hotel.id, true);
    });
    marker.on("mouseout", () => {
      marker.closePopup();
      highlightCard(hotel.id, false);
    });
    marker.on("click", () => {
      marker.openPopup();
      selectHotelOnMap(hotel.id);
    });
    mapMarkersById.set(hotel.id, marker);
  });

  leafletMap.fitBounds(L.latLngBounds(boundsPoints), { padding: [24, 24], maxZoom: 15 });
  setTimeout(() => leafletMap && leafletMap.invalidateSize(), 60);
}

function starRatingHtml(hotel) {
  const stars = Math.round(hotel.starRating || 0);
  if (!stars) return "";
  return `<span class="star-rating" title="${stars}-star property">${"&#9733;".repeat(stars)}${"&#9734;".repeat(5 - stars)}</span>`;
}

// TripAdvisor Travelers' Choice / Airbnb Guest Favorite-style badge, but
// grounded only in real Booking.com review data already fetched for this
// hotel - never our own derived score (that's the separate Top Match badge)
// and never shown for generated/curated hotels, since those have no real
// review count to threshold against.
function guestFavoriteBadge(hotel) {
  if (!hotel.reviewCount || hotel.reviewCount < 20) return "";
  if (!hotel.realRating || hotel.realRating < 9) return "";
  return `<span class="guest-favorite-badge" title="${hotel.reviewCount} real Booking.com reviews averaging ${hotel.realRating}/10">&#11088; Guest Favorite</span>`;
}

// Booking.com/Expedia both flag breakfast right in the list view, not
// just after clicking into the property - this app already had the real
// board-plan codes (see mealPlansSection below, Hotelbeds' `boardCodes`)
// but only surfaced them buried in the detail dialog.
//
// Deliberately says "available", not "included": Hotelbeds' `boardCodes`
// lists every board plan the property offers, not which one the
// displayed price maps to - and "RO" (Room only) shows up alongside "BB"
// (Bed & breakfast) for real Barcelona listings, meaning breakfast is
// most likely a paid upgrade over the room-only rate actually being
// priced here, not something bundled into the number shown. Verified via
// testing (real API response) before wording this - see README.
function breakfastAvailableBadge(hotel) {
  if (!hotel.boardCodes || !hotel.boardCodes.some((code) => code !== "RO")) return "";
  return `<span class="tag amenity" title="This property offers a breakfast board plan (Hotelbeds data) - may be a paid upgrade over the room-only rate priced here, not necessarily included at this price.">🍳 Breakfast available</span>`;
}

// Kayak/Booking.com both treat "Free cancellation" as one of the most-
// scanned-for trip-flexibility signals, shown as its own distinct colored
// badge rather than buried in a long gray amenity-tag list - real
// travelers specifically filter for this because it lets them book now
// without losing the ability to change plans later. This app's own
// api_fetcher.py already parses "free cancellation" out of Booking.com's
// raw policy text into the amenities array (line ~287) but nothing ever
// gave it special treatment - it rendered as just another identical gray
// ".tag.amenity" pill alongside "Free Wi-Fi" or "Parking", easy to miss.
// Promoted to the same visual weight as the Guest Favorite badge since,
// unlike most amenities, this is real, already-fetched, un-fabricated
// data - never shown for generated/curated hotels, which have no real
// cancellation-policy text to parse in the first place.
function freeCancellationBadge(hotel) {
  if (!hotel.amenities || !hotel.amenities.includes("Free cancellation")) return "";
  return `<span class="free-cancel-badge" title="Detected from this property's real Booking.com cancellation policy text">&#10003; ${t("freeCancellation")}</span>`;
}

function dealBadge(hotel) {
  if (!hotel.originalPrice || hotel.originalPrice <= hotel.price) return "";
  const pct = Math.round((1 - hotel.price / hotel.originalPrice) * 100);
  return `<span class="deal-badge">${pct}% off &middot; <s>$${hotel.originalPrice}</s></span>`;
}

// Google Hotels-style "Price Insights" - only the market-comparison part
// (computed server-side from this city's own dataset, not a historical
// trend - see ranking.compute_price_insights). Only shown when it's
// actually informative: hidden for "typical" prices so it doesn't add
// noise to every single card.
function priceInsightBadge(hotel) {
  const insight = hotel.priceInsight;
  if (!insight || Math.abs(insight.comparisonPercent) < 10) return "";
  const cls = insight.comparisonPercent < 0 ? "price-insight-good" : "price-insight-high";
  return `<span class="price-insight-badge ${cls}">${insight.label}</span>`;
}

const PRICE_WATCH_KEY = "stayrank-price-watch";

function loadPriceWatch() {
  try {
    return JSON.parse(localStorage.getItem(PRICE_WATCH_KEY)) || {};
  } catch {
    return {};
  }
}

// Kayak-style price watch, adapted to what this app can honestly support:
// there's no historical price database or forecasting model here, so instead
// of predicting future prices, this just remembers the price the first time
// *this browser* saw the hotel and reports how today's live price compares -
// a real observed change, never a guessed one.
// Records every DISTINCT price this browser has actually observed for this
// hotel (never a guess, never a fabricated trend) - the badge above still
// only ever compares current vs. the original first-seen price (unchanged
// behavior), but this separate log is what lets priceHistorySparkline()
// draw a real Google Hotels Price Trends-style chart later, once there's
// enough real data. Capped at 8 points - a browser revisiting a hotel
// weekly for months doesn't need to keep the entire history, and this is
// observed-on-this-device data, never meant to be a long-term price
// database this prototype was never built to be.
const MAX_PRICE_HISTORY = 8;
// Returns true only if it actually appended a new point (i.e. localStorage
// genuinely needs re-saving) - keeps every other card render, where the
// price hasn't moved since last checked, a cheap no-op read instead of a
// write, since this runs once per hotel card on every re-render.
function recordPriceHistory(watch, key, hotel) {
  const entry = watch[key];
  if (!entry.history) entry.history = [{ price: entry.price, seenAt: entry.seenAt }];
  const last = entry.history[entry.history.length - 1];
  if (last.price === hotel.price) return false;
  entry.history.push({ price: hotel.price, seenAt: Date.now() });
  if (entry.history.length > MAX_PRICE_HISTORY) entry.history.shift();
  return true;
}

function priceWatchBadge(hotel) {
  const watch = loadPriceWatch();
  const key = `${hotel.city}:${hotel.id}`;
  const seen = watch[key];
  if (!seen) {
    watch[key] = { price: hotel.price, seenAt: Date.now(), history: [{ price: hotel.price, seenAt: Date.now() }] };
    localStorage.setItem(PRICE_WATCH_KEY, JSON.stringify(watch));
    return "";
  }
  if (recordPriceHistory(watch, key, hotel)) {
    localStorage.setItem(PRICE_WATCH_KEY, JSON.stringify(watch));
  }
  if (seen.price === hotel.price) return "";
  const diff = hotel.price - seen.price;
  const cls = diff < 0 ? "price-insight-good" : "price-insight-high";
  const arrow = diff < 0 ? "&#9660;" : "&#9650;";
  // Self-detected via the same i18n pass that found the best-time-to-visit
  // month names bug just above: plain toLocaleDateString() with no locale
  // argument follows the browser/OS locale, not the app's own language
  // selector - the exact bug already fixed once this session for the
  // trip-plan summary. MONTH_LOCALE_MAP is defined later in this file but
  // already initialized by the time this function actually runs (it's
  // only ever called while rendering hotel cards after a search, well
  // after the whole script has loaded).
  const seenDate = new Date(seen.seenAt).toLocaleDateString(MONTH_LOCALE_MAP[getCurrentLang()] || "en-US");
  const title = t("priceWatchBadgeTitle").replace("{price}", seen.price).replace("{date}", seenDate);
  const suffix = diff < 0 ? t("priceWatchCheaperThan") : t("priceWatchPricierThan");
  return `<span class="price-insight-badge ${cls}" title="${escapeHtml(title)}">${arrow} $${Math.abs(diff)} ${escapeHtml(suffix)}</span>`;
}

// Small inline SVG sparkline from real observed prices for this hotel on
// this device (see recordPriceHistory above) - never a forecast, never
// fabricated between two real points. Needs at least 2 distinct prices
// actually seen, or there's nothing honest to chart yet.
function priceHistorySparkline(hotel) {
  const watch = loadPriceWatch();
  const key = `${hotel.city}:${hotel.id}`;
  const history = watch[key]?.history;
  if (!history || history.length < 2) return "";

  const prices = history.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = 220;
  const height = 44;
  const pad = 6;
  const xStep = prices.length > 1 ? (width - pad * 2) / (prices.length - 1) : 0;
  const yFor = (price) =>
    max === min ? height / 2 : height - pad - ((price - min) / (max - min)) * (height - pad * 2);
  const points = prices.map((price, index) => `${pad + index * xStep},${yFor(price)}`).join(" ");
  const last = history[history.length - 1];
  // Same locale fix as priceWatchBadge() above.
  const lastDate = new Date(last.seenAt).toLocaleDateString(MONTH_LOCALE_MAP[getCurrentLang()] || "en-US");

  return `
    <div class="evidence">
      <strong>${t("priceHistory")}:</strong>
      <svg viewBox="0 0 ${width} ${height}" class="price-sparkline" role="img" aria-label="Price observed over ${prices.length} visits, from $${min} to $${max}">
        <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        ${prices
          .map((price, index) => `<circle cx="${pad + index * xStep}" cy="${yFor(price)}" r="3" fill="var(--accent)" />`)
          .join("")}
      </svg>
      <p class="subline">$${min}&ndash;$${max} across ${prices.length} visit${prices.length === 1 ? "" : "s"} to this page - last seen $${last.price} on ${lastDate}. Not a forecast, just what this browser has actually observed.</p>
    </div>
  `;
}

// A dedicated "My price watches" dashboard - the same passive tracking
// behind priceWatchBadge()/priceHistorySparkline() above, just surfaced as
// its own view (Kayak has a "Watched trips" list; this is the honest
// version this app can actually back). Deliberately pull-only, never a
// push notification or re-engagement email - this app's own trust panel
// already promises "no push notifications, no re-engagement emails, ever"
// (see trust4 in the sidebar), so a real price-alert feature here has to
// be something the traveler comes back and checks, not something that
// pings them.
const MAX_PRICE_WATCHES_SHOWN = 40;

function updatePriceWatchesCount() {
  if (!els.priceWatchesCount) return;
  const count = Object.keys(loadPriceWatch()).length;
  els.priceWatchesCount.textContent = String(count);
  els.priceWatchesCount.hidden = count === 0;
}

function priceWatchRow({ hotelId, city, seen, hotel }) {
  const diff = hotel.price - seen.price;
  const cls = diff === 0 ? "" : diff < 0 ? "price-insight-good" : "price-insight-high";
  const arrow = diff === 0 ? "" : diff < 0 ? "&#9660;" : "&#9650;";
  const seenDate = new Date(seen.seenAt).toLocaleDateString(MONTH_LOCALE_MAP[getCurrentLang()] || "en-US");
  const deltaLine =
    diff === 0
      ? t("priceWatchNoChange")
      : `${arrow} $${Math.abs(diff)} ${diff < 0 ? t("priceWatchCheaperThan") : t("priceWatchPricierThan")}`;
  return `
    <div class="price-watch-row">
      <img class="price-watch-thumb" src="${hotel.image}" alt="" onerror="this.style.display='none'" />
      <div class="price-watch-info">
        <button type="button" class="link-button" data-open-hotel="${hotelId}">${escapeHtml(hotel.name)}</button>
        <span class="subline">${escapeHtml(city)} &middot; ${escapeHtml(t("priceWatchFirstSeen").replace("{price}", seen.price).replace("{date}", seenDate))}</span>
      </div>
      <div class="price-watch-delta ${cls}">
        <strong>$${hotel.price}</strong>
        <span>${escapeHtml(deltaLine)}</span>
      </div>
    </div>
  `;
}

async function renderPriceWatchesList() {
  const watch = loadPriceWatch();
  const allKeys = Object.keys(watch);
  updatePriceWatchesCount();
  if (!allKeys.length) {
    els.priceWatchesList.innerHTML = `<p class="subline">${escapeHtml(t("priceWatchesEmpty"))}</p>`;
    return;
  }

  // Capped and most-recently-seen-first before the network round trip, not
  // after - a browser that's searched dozens of cities over time shouldn't
  // fire off dozens of parallel requests just to open this panel; the
  // oldest, least-likely-to-matter entries are the ones left out.
  const keys = allKeys
    .sort((a, b) => (watch[b].history?.slice(-1)[0]?.seenAt || watch[b].seenAt) - (watch[a].history?.slice(-1)[0]?.seenAt || watch[a].seenAt))
    .slice(0, MAX_PRICE_WATCHES_SHOWN);

  els.priceWatchesList.innerHTML = `<p class="subline">${escapeHtml(t("priceWatchesLoading"))}</p>`;

  const entries = await Promise.all(
    keys.map(async (key) => {
      const separatorIndex = key.lastIndexOf(":");
      const city = key.slice(0, separatorIndex);
      const hotelId = Number(key.slice(separatorIndex + 1));
      try {
        const hotel = await apiGet(`/api/hotels/${hotelId}`);
        return { hotelId, city, seen: watch[key], hotel, missing: false };
      } catch {
        // Same honest self-healing as Recently Viewed (see task #143) -
        // a hotel row that no longer exists (stale generated-city data
        // replaced by a later real sync) is skipped, not shown broken.
        return { hotelId, city, seen: watch[key], hotel: null, missing: true };
      }
    })
  );

  const valid = entries.filter((entry) => !entry.missing);
  // Biggest real price drop first - the whole point of a watch list is
  // surfacing "this one got cheaper," so that's the headline, not
  // whatever order localStorage happened to store keys in.
  valid.sort((a, b) => (a.hotel.price - a.seen.price) - (b.hotel.price - b.seen.price));
  const missingCount = entries.length - valid.length;

  if (!valid.length) {
    els.priceWatchesList.innerHTML = `<p class="subline">${escapeHtml(t("priceWatchesEmpty"))}</p>`;
    return;
  }

  els.priceWatchesList.innerHTML =
    valid.map(priceWatchRow).join("") +
    (missingCount ? `<p class="subline">${escapeHtml(t("priceWatchesMissingNote").replace("{n}", missingCount))}</p>` : "");

  els.priceWatchesList.querySelectorAll("[data-open-hotel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.priceWatchesDialog.close();
      showDetail(Number(btn.dataset.openHotel));
    });
  });
}

function bookingLink(hotel) {
  return hotel.bookingUrl || `https://www.google.com/search?q=${encodeURIComponent(hotel.name + " hotel booking")}`;
}

function findSimilarHotels(hotel, limit = 3) {
  return state.currentResults
    .filter((item) => item.id !== hotel.id && item.city === hotel.city)
    .map((item) => {
      const sharedTags = item.tags.filter((tag) => hotel.tags.includes(tag)).length;
      const priceDiff = Math.abs(item.price - hotel.price);
      return { item, sharedTags, similarity: sharedTags * 20 - priceDiff / 5 };
    })
    .filter((entry) => entry.sharedTags > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function similarHotelsSection(hotel) {
  const similar = findSimilarHotels(hotel);
  if (!similar.length) return "";
  return `
    <div class="similar-hotels">
      <h3>Similar hotels from this search</h3>
      <div class="similar-hotels-grid">
        ${similar
          .map(
            (item) => `
          <button class="similar-hotel-card" type="button" data-detail="${item.id}">
            <img src="${item.image}" alt="" loading="lazy" />
            <span class="similar-hotel-name">${escapeHtml(item.name)}</span>
            <span class="similar-hotel-meta">$${item.price}/night &middot; Match ${item.score}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

// Real hotel photo CDNs (Hotelbeds, Booking.com) occasionally list a URL
// that itself 404s or serves a broken asset - a genuine third-party data
// gap, not something to fabricate a replacement for. The 'error' event
// doesn't bubble, so it can't be caught by the existing click-delegation
// listener on the dialog body - it needs this inline handler on the <img>
// itself. Hiding just the one broken thumbnail (not the whole gallery)
// keeps every other real photo visible instead of showing the browser's
// broken-image icon.
function photoGallery(hotel) {
  if (!hotel.photos || hotel.photos.length < 2) return "";
  return `
    <div class="photo-gallery">
      ${hotel.photos.slice(0, 8).map((url, i) => `
        <button type="button" class="photo-gallery-thumb" data-photo-index="${i}" aria-label="View photo ${i + 1} of ${hotel.photos.length} full-size">
          <img src="${url}" alt="${escapeHtml(hotel.name)} photo" onerror="this.closest('.photo-gallery-thumb').style.display='none'" />
        </button>
      `).join("")}
    </div>
  `;
}

// Full-screen photo viewer for the detail dialog's gallery - clicking a
// small 110x80 thumbnail used to be a dead end (no way to see the photo
// any larger). Every competitor hotel site (Booking.com, Airbnb, Google
// Hotels) treats this as table stakes. Built entirely from photos this
// app already fetched for the hotel - no new data source, no fabrication,
// just a real way to look at what's already there.
let lightboxPhotos = [];
let lightboxIndex = 0;
let lightboxAlt = "";
// Separate from lightboxPhotos/lightboxAlt above, which get temporarily
// repointed at a traveler photo's own (much shorter) array when a
// community-review photo is opened (see communityReviewCard below) - these
// two stay fixed for the life of the open detail dialog, so the main
// photo-gallery-thumb handler can always restore the right array/title
// even after a community photo was viewed in between.
let detailHotelPhotos = [];
let detailHotelName = "";
// Counts consecutive auto-skips from a broken source photo (see onerror
// below) - resets on every real load so a single bad URL doesn't get
// mistaken for "every photo is broken" after the user has since moved on.
let lightboxBrokenSkips = 0;

function renderLightboxPhoto() {
  if (!lightboxPhotos.length) return;
  // A broken photo URL (real CDN gaps happen - Hotelbeds/Booking.com photo
  // links do occasionally 404) would otherwise show the browser's broken-
  // image icon in a full-screen viewer, which reads as this app being
  // broken rather than the source data. Skip forward automatically instead.
  // The skip counter guards against every remaining photo also being
  // broken, which would otherwise loop stepLightbox() forever.
  els.lightboxImage.onload = () => {
    lightboxBrokenSkips = 0;
  };
  els.lightboxImage.onerror = () => {
    lightboxBrokenSkips += 1;
    if (lightboxBrokenSkips >= lightboxPhotos.length) {
      els.lightboxImage.onerror = null;
      els.lightboxImage.removeAttribute("src");
      els.lightboxCounter.textContent = t("photoUnavailable");
      return;
    }
    stepLightbox(1);
  };
  els.lightboxImage.src = lightboxPhotos[lightboxIndex];
  els.lightboxImage.alt = `${lightboxAlt} photo ${lightboxIndex + 1} of ${lightboxPhotos.length}`;
  els.lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
  const hasMultiple = lightboxPhotos.length > 1;
  els.lightboxPrev.hidden = !hasMultiple;
  els.lightboxNext.hidden = !hasMultiple;
}

function openLightbox(startIndex) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = startIndex;
  lightboxBrokenSkips = 0;
  renderLightboxPhoto();
  els.photoLightbox.showModal();
}

function stepLightbox(delta) {
  if (!lightboxPhotos.length) return;
  lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
  renderLightboxPhoto();
}

function renderWeights() {
  const currentLabels = metricLabels();
  els.weights.innerHTML = Object.entries(state.weights)
    .map(([key, value]) => `
      <div class="weight-row">
        <div class="weight-head">
          <span>${currentLabels[key]}</span>
          <span>${value}</span>
        </div>
        <input aria-label="${currentLabels[key]}" data-weight="${key}" type="range" min="0" max="30" value="${value}" />
      </div>
    `)
    .join("");

  els.weights.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      state.weights[input.dataset.weight] = Number(input.value);
      renderWeights();
      rankAndRender();
    });
  });
}

// The traveler's own textarea text stays exactly what they typed - never
// silently rewritten - while this is the text actually sent to /api/search,
// so a refinement chip visibly layers on top instead of vanishing into a
// rewritten prompt the traveler never asked for.
function effectiveSearchPrompt() {
  const base = els.prompt.value.trim();
  if (!state.refinements.length) return base;
  return `${base}. ${state.refinements.join(". ")}`;
}

const MAX_REFINEMENTS = 4;

function renderRefineChips() {
  if (!els.refineChips) return;
  els.refineChips.innerHTML = state.refinements
    .map(
      (text, index) => `
        <span class="refine-chip">
          ${escapeHtml(text)}
          <button type="button" class="refine-chip-remove" data-index="${index}" aria-label="Remove refinement: ${escapeHtml(text)}">&times;</button>
        </span>
      `
    )
    .join("");
}

// Google AI Mode/Mindtrip-style conversational refinement, built honestly:
// no new data source, just a UX restructuring of the search this app
// already runs. A follow-up like "cheaper" or "closer to the station" gets
// appended to the base prompt (see effectiveSearchPrompt) and the SAME
// /api/search endpoint re-parses/re-ranks the same real, already-fetched
// hotel set through the intent-weighting it already does for the base
// prompt - not a second, different code path, and not a new fetch from
// Booking.com/Hotelbeds for a city that's already cached.
els.refineForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = els.refineInput.value.trim();
  if (!text) return;
  if (state.refinements.length >= MAX_REFINEMENTS) {
    showToast(`Up to ${MAX_REFINEMENTS} refinements at a time - remove one or use "Reset all" to start over.`, "error");
    return;
  }
  state.refinements.push(text);
  els.refineInput.value = "";
  renderRefineChips();
  rankAndRender();
});

els.refineChips?.addEventListener("click", (event) => {
  const button = event.target.closest(".refine-chip-remove");
  if (!button) return;
  state.refinements.splice(Number(button.dataset.index), 1);
  renderRefineChips();
  rankAndRender();
});

async function searchHotels() {
  const body = {
    prompt: effectiveSearchPrompt(),
    city: els.city.value,
    // A negative budget isn't just cosmetically wrong - score_hotel() and
    // compute_confidence() (backend/ranking.py) both divide by budget to
    // work out the over/under-budget adjustment, and a negative divisor
    // flips that adjustment's sign. Every hotel's score/confidence then
    // gets inflated toward the 99 ceiling regardless of actual fit,
    // collapsing the whole ranking to identical numbers (verified live:
    // typing "-50" made all 7 Tokyo hotels show score 99, confidence 99).
    // Clamped the same way nights/guests already are just below.
    budget: Math.max(1, Number(els.budget.value) || 190),
    persona: state.persona,
    tagFilter: state.filter,
    minRating: state.minRating,
    minStarRating: state.minStarRating,
    accessibleOnly: state.accessibleOnly,
    budgetOnly: state.budgetOnly,
    petFriendlyOnly: state.petFriendlyOnly,
    neighborhoodFilter: state.neighborhoodFilter,
    mustHaves: [...state.musts],
    suppressMusts: [...state.suppressedMusts],
    sort: state.sort,
    weights: state.weights,
    landmark: els.landmark.value
  };
  return apiPost("/api/search", body);
}

function metricBar(label, value, title) {
  return `
    <div class="reason-box"${title ? ` title="${escapeHtml(title)}"` : ""}>
      <span>${label}</span>
      <strong>${value}/100</strong>
    </div>
  `;
}

// backend/api_fetcher.py's own _derive_metrics() comment is explicit that
// Booking.com's search response has no direct quiet/transit/nightlife
// dimensions, so these three are a distance-to-city-center heuristic, and
// cleanliness is the overall review score, not a per-category one - real
// signals, but not what "Cleanliness: 92/100" would normally imply a user
// is seeing (many OTAs do show genuine per-category sub-scores). That was
// honestly commented in the backend but never disclosed anywhere in the
// UI itself. Same fix shape as the existing "Live Booking.com data" badge
// tooltip (SOURCE_BADGE_TITLE above) - a tooltip on exactly the bars this
// applies to, not a new banner every card has to carry.
const PROXY_METRIC_TITLE = "Estimated from Booking.com's overall review score and distance to the city center - not a separate per-category rating from Booking.com.";
// Real bug found via testing: this tooltip was shown on EVERY hotel with a
// truthy externalId, including Hotelbeds/Wikidata "content"-tier hotels
// (external_id "hb-..."/"wd-...") that have never touched Booking.com at
// all - so a real Hotelbeds hotel's Quiet/Transit/Cleanliness bars falsely
// claimed to be "Estimated from Booking.com's overall review score."
// Reproduced live: Montecassino Suites (a genuine Hotelbeds hotel, Toronto)
// showed exactly that text. For content-tier hotels these bars are
// star-category/archetype estimates (see hotelbeds.py/wikidata_hotels.py),
// not derived from any review score at all - a different, real reason to
// disclose, so it needs its own honest text rather than reusing this one.
const CONTENT_PROXY_METRIC_TITLE = "Estimated from this hotel's star category - not a live per-category rating (this hotel has no live pricing/review source; see the source badge).";
const PROXY_METRIC_KEYS = new Set(["quiet", "transit", "cleanliness", "nightlife"]);

// externalId prefixes are assigned per-source (see hotelbeds.py/
// wikidata_hotels.py: "hb-"/"wd-"; api_fetcher.py: a bare numeric Booking.com
// ID with no prefix) - enough to tell which honest tooltip text applies
// without needing a new field on every hotel record.
function proxyMetricTitle(hotel) {
  if (!hotel.externalId) return null;
  const isContentTier = hotel.externalId.startsWith("hb-") || hotel.externalId.startsWith("wd-");
  return isContentTier ? CONTENT_PROXY_METRIC_TITLE : PROXY_METRIC_TITLE;
}

function mustHaveTags() {
  const combined = new Set([...state.musts, ...(state.currentIntent.dynamicMusts || [])]);
  const labels = mustHaveLabels();
  return [...combined]
    .map((must) => (labels[must] ? `<span class="tag good">&check; ${labels[must]}</span>` : ""))
    .join("");
}

function amenitiesRow(hotel) {
  if (!hotel.amenities || !hotel.amenities.length) return "";
  // "Free cancellation" gets its own distinct badge (see freeCancellationBadge)
  // rather than appearing twice - once prominently, once buried in this list.
  const rest = hotel.amenities.filter((item) => item !== "Free cancellation");
  if (!rest.length) return "";
  return `<div class="match-row amenities-row">${rest.map((item) => `<span class="tag amenity">${item}</span>`).join("")}</div>`;
}

// Real find via testing: this hotel's own official listing text (from
// Hotelbeds' Content API - see hotelbeds.py) was already being fetched for
// every content-tier hotel and silently discarded, while the card showed
// only archetype-based FICTIONAL "Best reasons"/"Tradeoff" text for a
// hotel that has real, genuine copy available. Shown as its own clearly-
// labeled block, deliberately separate from (not replacing) the computed
// strengths/tradeoff/evidence list below it - those stay honestly framed
// as this app's own estimate, while this is a direct quote from the
// property itself.
// Researched competitor "trust and safety" UI patterns (2025-2026 travel
// sites increasingly show data provenance/freshness per fact, not just an
// overall trust score) and built the honest version with data this app
// already tracks: backend/database.py stamps every city sync with a real
// source tier (live/content/generated/curated) and a real last-synced
// timestamp on every insert/refresh - already used for the card-level
// SOURCE_BADGE_TEXT/TITLE, but never surfaced fact-by-fact. This panel
// doesn't invent new granularity: presence of a Hotelbeds-only field
// (address/phone/website/amenities/meal plans/nearby landmarks - see
// hotelbeds.py, api_fetcher.py never sets these) IS the honest signal that
// specific fact is real, and hotel.citySource (same source SOURCE_BADGE_
// TEXT already reads) is the honest signal for whether price/guest rating
// are live or estimated - reusing existing facts, not adding a second
// source of truth that could drift from the badges already shown.
function dataSourcesSection(hotel) {
  const rows = [];
  const priceIsLive = hotel.citySource === "live";
  rows.push({
    label: t("dataSourcePriceRating"),
    real: priceIsLive,
    note: priceIsLive ? t("dataSourceLiveBooking") : t("dataSourceEstimated")
  });
  if (hotel.address || hotel.phone || hotel.website) {
    rows.push({ label: t("dataSourceContactInfo"), real: true, note: t("dataSourceHotelbeds") });
  }
  if (hotel.amenities && hotel.amenities.length) {
    // Real bug found while adding the "Free cancellation" badge above:
    // unlike address/phone/website/meal plans/nearby landmarks (genuinely
    // Hotelbeds-only fields), `amenities` is populated by TWO different
    // backend files depending on citySource - hotelbeds.py's
    // _real_amenities() for content-tier hotels, but ALSO api_fetcher.py's
    // _derive_amenities() for live Booking.com-tier hotels (see the "Free
    // cancellation"/"Wi-Fi"/"Family friendly" tags parsed straight from
    // Booking's own accessibility-label text). This panel exists
    // specifically to give an honest per-fact source, so unconditionally
    // labeling every hotel's amenities "from Hotelbeds" was itself a false
    // attribution for every live-tier hotel - the exact class of bug this
    // panel was built to prevent, just introduced by a later feature that
    // added a second real source for the same field name.
    rows.push({ label: t("dataSourceAmenities"), real: true, note: priceIsLive ? t("dataSourceBookingAmenities") : t("dataSourceHotelbeds") });
  }
  if (hotel.boardCodes && hotel.boardCodes.length) {
    rows.push({ label: t("dataSourceMealPlans"), real: true, note: t("dataSourceHotelbeds") });
  }
  if (hotel.nearbyLandmarks && hotel.nearbyLandmarks.length) {
    rows.push({ label: t("dataSourceLandmarks"), real: true, note: t("dataSourceHotelbeds") });
  }
  if (!rows.some((row) => row.real)) return "";

  // Same browser-locale-vs-app-language bug already fixed elsewhere this
  // session (price-watch badge, price-history sparkline, best-time-to-
  // visit month names) - plain toLocaleString() with no locale argument
  // followed the browser/OS locale instead of the app's own language.
  const syncedNote = hotel.citySyncedAt
    ? t("dataSourceSyncedOn").replace("{date}", new Date(hotel.citySyncedAt).toLocaleString(MONTH_LOCALE_MAP[getCurrentLang()] || "en-US"))
    : "";

  return `
    <details class="data-sources">
      <summary>${t("dataSourcesTitle")}</summary>
      <ul class="review-list">
        ${rows
          .map(
            (row) => `<li>${row.real ? "&#9989;" : "&#8776;"} <strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.note)}</li>`
          )
          .join("")}
      </ul>
      ${syncedNote ? `<p class="subline">${escapeHtml(syncedNote)}</p>` : ""}
    </details>
  `;
}

function officialDescriptionSection(hotel) {
  if (!hotel.officialDescription) return "";
  return `
    <p class="evidence review-quote">
      <strong>From the hotel's own listing:</strong>
      "${escapeHtml(hotel.officialDescription)}"
    </p>
  `;
}

// Real named landmarks near THIS specific hotel with real distances (see
// hotelbeds.py) - e.g. "CN Tower - 600 m" for a real Toronto hotel, more
// specific than the city-wide OSM/Overpass POI list used elsewhere. Only
// ever shown when Hotelbeds actually has this data for the property -
// never invented for hotels that don't (generated/Wikidata tiers).
function nearbyLandmarksSection(hotel) {
  if (!hotel.nearbyLandmarks || !hotel.nearbyLandmarks.length) return "";
  return `
    <div class="evidence">
      <strong>${t("nearbyLandmarks")}:</strong>
      <ul class="review-list">
        ${hotel.nearbyLandmarks
          .map(
            (landmark) => `<li>${escapeHtml(landmark.name)} - ${formatDistanceKm(landmark.distanceMeters / 1000)}</li>`
          )
          .join("")}
      </ul>
    </div>
  `;
}

// Labels straight from Hotelbeds' own /types/boards master data (fetched
// live and verified - see README), not guessed: which meal plans this
// SPECIFIC property actually offers (e.g. can you book All Inclusive here
// at all), not what today's search selected - getting a live per-rate
// board selection needs Hotelbeds' separate Booking API, out of scope here,
// so this is deliberately framed as "offered," not "included in this
// price." An unrecognized code (the master list has 54 entries, mostly
// Disney-resort-specific ones unlikely to appear elsewhere) still renders
// as its raw code rather than being silently dropped - an unlabeled real
// fact beats a fabricated-looking omission.
const BOARD_CODE_LABELS = {
  RO: "Room only",
  BB: "Bed & breakfast",
  HB: "Half board",
  FB: "Full board",
  AI: "All inclusive",
  AS: "All inclusive premium",
  CB: "Continental breakfast",
  DB: "Buffet breakfast",
  AB: "American breakfast",
  GB: "English breakfast",
  IB: "Irish breakfast",
  SB: "Scottish breakfast",
  LB: "Light breakfast",
  KO: "Kosher breakfast",
  SC: "Self catering",
  TL: "All inclusive (soft)",
  MB: "Half board + drinks",
  PB: "Full board + drinks",
  B1: "Breakfast (1 guest)",
  B2: "Breakfast (2 guests)",
  CE: "Dinner included",
  CO: "Lunch included",
};

function mealPlansSection(hotel) {
  if (!hotel.boardCodes || !hotel.boardCodes.length) return "";
  return `
    <div class="evidence match-row amenities-row">
      <strong>${t("mealPlansOffered")}:</strong>
      ${hotel.boardCodes
        .map((code) => `<span class="tag amenity">${escapeHtml(BOARD_CODE_LABELS[code] || code)}</span>`)
        .join("")}
    </div>
  `;
}

// Researched competitor "trust and safety"/sustainability UI patterns
// again and found this app's honest gap: 2025-2026 booking platforms lean
// hard into eco-signals, but almost always via a fabricated own-brand
// score. Built the honest version with real data Hotelbeds already
// returns and this app had been discarding: `sustainabilityCertifications`
// is a real third-party certification (Green Key, EarthCheck, GSTC
// Criteria, etc. - see CERTIFICATION_LABELS in backend/hotelbeds.py, ~30
// real certifying bodies fetched from Hotelbeds' own master data, not
// invented) this SPECIFIC property actually holds, with its real level
// (e.g. "4 Green Keys") shown as-is when present - never synthesized into
// a single "eco score" this app has no honest way to compute. Practical
// eco-amenities (EV charging, bike storage/hire) reuse the same real
// `amenities` array already rendered elsewhere - filtered here, not a
// second data source.
const ECO_AMENITY_LABELS = new Set(["EV charging station", "Bicycle storage", "Bicycle hire service", "Hotel's own bike shop/workshop"]);

function sustainabilitySection(hotel) {
  const certifications = hotel.sustainabilityCertifications || [];
  const ecoAmenities = (hotel.amenities || []).filter((item) => ECO_AMENITY_LABELS.has(item));
  if (!certifications.length && !ecoAmenities.length) return "";

  return `
    <div class="evidence sustainability-section">
      <strong>${t("sustainabilityTitle")}:</strong>
      ${
        certifications.length
          ? `<div class="match-row amenities-row">${certifications
              .map(
                (cert) =>
                  `<span class="tag sustainability-cert">🌿 ${escapeHtml(cert.name)}${cert.level ? ` — ${escapeHtml(cert.level)}` : ""}</span>`
              )
              .join("")}</div>`
          : ""
      }
      ${
        ecoAmenities.length
          ? `<div class="match-row amenities-row">${ecoAmenities.map((item) => `<span class="tag amenity">${escapeHtml(item)}</span>`).join("")}</div>`
          : ""
      }
    </div>
  `;
}

function reviewPreview(hotel) {
  if (!hotel.reviews || !hotel.reviews.length) return "";
  const [first] = hotel.reviews;
  return `
    <p class="evidence review-quote">
      <strong>Guest review${hotel.reviewCount ? ` (${hotel.reviewCount} total)` : ""}:</strong>
      "${first.comment}" &mdash; ${first.author}
    </p>
  `;
}

function aiMatchInsight(hotel) {
  if (!hotel.aiMatchReason) return "";
  return `
    <div class="ai-insight">
      <span class="ai-insight-label">&#129302; AI Match Insight</span>
      <p>${escapeHtml(hotel.aiMatchReason)}</p>
    </div>
  `;
}

// The backend has always computed this (semanticMatch: a TF-IDF
// similarity between the free-text prompt and this hotel's tags,
// amenities, strengths, and review text - see vector_search.py) but it
// never actually reached the page anywhere - a real signal, silently
// computed on every single search, then discarded. Found via testing:
// searching "family-friendly hotel with a pool" - "pool" has no
// dedicated category anywhere in the structured intent system (the LLM
// and rule-based parsers both only ever recognize a fixed, small set of
// metrics - see llm_engine.py/nlp.py - none of them "pool"), so there was
// no way to tell whether "pool" was understood at all versus silently
// dropped. It partially is, through this exact score, which just never
// surfaced. Shown as a plain percentage rather than gated behind a "good
// match" threshold: real TF-IDF scores run low (0-16% was typical in
// testing) even for a genuinely relevant hotel, so the point isn't to
// look impressive - it's letting a traveler compare which of their
// results actually echoes their own wording, so a request with no
// dedicated filter (like "pool") is at least visibly addressed or not,
// instead of a total guess.
function semanticMatchLine(hotel) {
  if (!els.prompt.value.trim() || hotel.semanticMatch == null) return "";
  return `<p class="subline semantic-match-line" title="How closely your exact wording matches this hotel's tags, amenities, strengths, and reviews - a text-similarity signal, separate from the score above. A request with no dedicated filter (e.g. &quot;pool&quot;) only ever shows up here, not as its own checkbox.">&#128269; ${hotel.semanticMatch}% text match for your description</p>`;
}

function hotelCard(hotel, index, allHotels) {
  const budget = state.currentBudget;
  const overBudget = hotel.price > budget;
  const shortlistClass = state.shortlist.has(hotel.id) ? "shortlisted" : "";
  const shortlistText = state.shortlist.has(hotel.id) ? t("shortlisted") : t("shortlist");
  const cardNights = Math.max(1, Number(els.nights.value) || 1);
  const totalForStay =
    cardNights > 1
      ? ` (${t("totalForStay").replace("{amount}", (hotel.price * cardNights).toLocaleString()).replace("{n}", cardNights)})`
      : "";
  const dateRangeNote = checkInDateRangeText(cardNights);

  // Not a sold placement or editorial pick - just whichever hotel our own,
  // inspectable scoring model (see "Decision model" panel) ranks highest.
  // Gated on a quality floor so a weak result set never gets crowned.
  const topScore = Math.max(...(allHotels || []).map((h) => h.score));
  const isTopMatch = hotel.score === topScore && hotel.score >= 60 && hotel.confidence >= 60;
  const topMatchBadge = isTopMatch
    ? `<span class="top-match-badge" title="Highest score (${hotel.score}/100) from our own transparent scoring model - not a paid placement.">${t("topMatch")}</span>`
    : "";
  // The bare "#N" overlay had no explanation of what it counts - easy to
  // misread as some external authority ranking (TripAdvisor-style) rather
  // than just this search's current sort position, which changes the
  // moment "Sort by" changes. Named explicitly, same honesty pattern as
  // the Top Match badge's own title above.
  const currentSortLabel = els.sortSelect.selectedOptions[0]?.textContent.trim() || "current sort";
  const rankTitle = `Position #${index + 1} of ${(allHotels || []).length} in this search, sorted by "${currentSortLabel}" - not an outside ranking.`;

  return `
    <article class="hotel-card" data-hotel-id="${hotel.id}">
      <div class="hotel-photo">
        ${
          hotel.photos && hotel.photos.length > 1
            ? `<button type="button" class="photo-cycle-btn" data-hotel-id="${hotel.id}" data-photo-index="0" aria-label="Show next photo of ${escapeHtml(hotel.name)} (photo 1 of ${hotel.photos.length})">
                 <img src="${hotel.image}" alt="${escapeHtml(hotel.name)} hotel room, photo 1 of ${hotel.photos.length}" onerror="this.style.display='none'" onload="this.style.display=''" />
               </button>`
            : `<img src="${hotel.image}" alt="${escapeHtml(hotel.name)} hotel room" onerror="this.style.display='none'" onload="this.style.display=''" />`
        }
        <div class="rank-badge" title="${escapeHtml(rankTitle)}" aria-label="${escapeHtml(rankTitle)}">#${index + 1}</div>
        ${hotel.photos && hotel.photos.length > 1 ? `<div class="photo-count" aria-hidden="true">&#128247; ${hotel.photos.length}</div>` : ""}
      </div>
      <div class="hotel-body">
        <div class="hotel-head">
          <div>
            <h3>${escapeHtml(hotel.name)} ${starRatingHtml(hotel)} ${topMatchBadge} ${guestFavoriteBadge(hotel)}</h3>
            <p class="subline">${escapeHtml(hotel.neighborhood)} · $${hotel.price}/night${totalForStay}${dateRangeNote} ${dealBadge(hotel)} ${breakfastAvailableBadge(hotel)} ${freeCancellationBadge(hotel)} · ${hotel.rating} guest rating ${overBudget ? "· over budget" : ""}${hotel.distanceFromLandmark != null ? ` · ${hotel.distanceFromLandmark} km from landmark` : ""}</p>
            ${priceInsightBadge(hotel)}
            ${priceWatchBadge(hotel)}
          </div>
          <div class="score-stack">
            <div class="score-ring">${hotel.score}</div>
            <span class="confidence-pill">${hotel.confidence}% confidence</span>
          </div>
        </div>
        <div class="match-row">
          ${hotel.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
          ${mustHaveTags()}
        </div>
        ${semanticMatchLine(hotel)}
        ${aiMatchInsight(hotel)}
        <div class="reason-grid">
          ${metricBar(t("metricQuiet"), hotel.metrics.quiet, proxyMetricTitle(hotel))}
          ${metricBar(t("metricTransit"), hotel.metrics.transit, proxyMetricTitle(hotel))}
          ${metricBar(t("metricRoomSize"), hotel.metrics.roomSize)}
        </div>
        <div class="reason-grid">
          ${metricBar(t("metricCleanliness"), hotel.metrics.cleanliness, proxyMetricTitle(hotel))}
          ${metricBar(t("metricValue"), hotel.metrics.value)}
          ${metricBar(t("metricPersonaFit"), state.persona === "family" ? hotel.metrics.family : hotel.metrics.couple)}
        </div>
        <p><strong>Best reasons:</strong> ${hotel.strengths.join("; ")}.</p>
        <p class="risk"><strong>Tradeoff:</strong> ${hotel.risk}</p>
        <p class="evidence">${hotel.evidence}</p>
        ${amenitiesRow(hotel)}
        ${reviewPreview(hotel)}
        <div class="card-actions">
          <button class="${shortlistClass}" data-shortlist="${hotel.id}" type="button">${shortlistText}</button>
          <button data-detail="${hotel.id}" type="button">${t("details")}</button>
          <a class="book" href="${bookingLink(hotel)}" target="_blank" rel="noreferrer">${t("checkBooking")}</a>
        </div>
      </div>
    </article>
  `;
}

// Kayak/Google Hotels both let a traveler narrow results down to one named
// neighborhood, not just eyeball the map - this app already had every
// neighborhood's real name and hotel count on hand for the insights panel
// above, just no way to actually filter by one. Options come from `rows`
// (built from EVERY hotel in the city, unfiltered - see
// ranking.build_neighborhood_insights) rather than from the current
// result set, so the list of choices doesn't shrink just because another
// filter (e.g. Accessible) is also active.
function renderNeighborhoodFilterOptions(rows) {
  const select = els.neighborhoodFilterSelect;
  if (!select) return;
  const previousValue = state.neighborhoodFilter;
  const sorted = [...rows].sort((a, b) => a.neighborhood.localeCompare(b.neighborhood));
  select.innerHTML =
    `<option value="">${escapeHtml(t("neighborhoodAny"))}</option>` +
    sorted.map((row) => `<option value="${escapeHtml(row.neighborhood)}">${escapeHtml(row.neighborhood)} (${row.count})</option>`).join("");
  // A neighborhood filter chosen for one city obviously doesn't carry over
  // to a different one - if it's no longer a real option here, reset
  // rather than silently keep it selected against a country that removed
  // it from the visible <select> (which would show "All neighborhoods" in
  // the UI while state.neighborhoodFilter still held a stale value).
  const stillValid = previousValue && sorted.some((row) => row.neighborhood === previousValue);
  select.value = stillValid ? previousValue : "";
  state.neighborhoodFilter = select.value;
}

function renderNeighborhoodInsights(rows) {
  els.neighborhoodInsights.innerHTML = rows
    .map(
      (row) => `
        <div class="insight-item">
          <strong>${row.neighborhood}</strong>
          <span>${row.vibe} · Quiet ${row.quiet} · Transit ${row.transit} · Nightlife ${row.nightlife} · ${row.count} option${row.count > 1 ? "s" : ""} analyzed</span>
        </div>
      `
    )
    .join("");
}

function renderScoringModel(rows) {
  const currentLabels = metricLabels();
  els.scoringModel.innerHTML = rows
    .map(
      (row) => `
        <div class="model-item">
          <strong>${currentLabels[row.metric] || row.metric}</strong>
          <span>${row.sharePercent}${t("ofRankingWeight")}${row.boostedByPrompt ? t("boostedByPrompt") : ""}</span>
        </div>
      `
    )
    .join("");
}

function renderFounderDashboard(data) {
  // #founderDashboard lived on index.html until the About-page redesign
  // moved founder stats to about.html/about.js - guard rather than
  // remove the call site, since it costs nothing and protects against
  // any future page that calls rankAndRender() without that element.
  if (!els.founderDashboard) return;
  const totalHotels = state.cities.reduce((sum, city) => sum + city.hotelCount, 0);
  const cities = state.cities.length;
  const liveCities = state.cities.filter((city) => city.source === "live").length;
  const ranked = data.hotels;
  const avgConfidence = ranked.length
    ? Math.round(ranked.reduce((sum, hotel) => sum + hotel.confidence, 0) / ranked.length)
    : 0;
  // The shortlist is deliberately cross-city (so comparisons survive
  // switching cities), but that means dividing its total size by only the
  // *current* city's hotel count silently mixes two different cities'
  // data into one percentage - e.g. 2 hotels shortlisted from Tokyo while
  // browsing Kyoto rendered as "25% of Kyoto shortlisted", which is false.
  // Scope the numerator to the current city too, so both sides match.
  const shortlistedInThisCity = [...state.shortlist.values()].filter((hotel) => hotel.city === data.cityName).length;
  const conversion = data.cityHotelCount ? Math.round((shortlistedInThisCity / data.cityHotelCount) * 100) : 0;
  const shortlistValue = [...state.shortlist.values()].reduce((sum, hotel) => sum + hotel.price, 0);

  const cards = [
    { label: "Hotels indexed", value: totalHotels },
    { label: "Cities live", value: cities },
    { label: "Live Booking.com cities", value: liveCities },
    { label: "Avg match confidence", value: `${avgConfidence}%` },
    { label: "Shortlist conversion", value: `${conversion}%` },
    { label: "Top detected intent", value: (data.intent.found[0] && foundReasonLabels()[data.intent.found[0]]) || data.intent.found[0] || "General" },
    { label: "Shortlist nightly value", value: `$${shortlistValue}` }
  ];

  els.founderDashboard.innerHTML = cards
    .map(
      (card) => `
        <div class="founder-item">
          <strong>${card.value}</strong>
          <span>${card.label}</span>
        </div>
      `
    )
    .join("");
}

function updateTripEstimateDisplay() {
  const nights = Math.max(1, Number(els.nights.value) || 1);
  if (!state.currentResults.length) {
    els.tripEstimate.textContent = "$0";
    return;
  }
  const top = state.currentResults[0];
  const total = top.price * nights;
  const budgetTotal = state.currentBudget * nights;
  const diff = budgetTotal - total;
  const diffText = diff >= 0 ? `$${diff} under trip budget` : `$${Math.abs(diff)} over trip budget`;
  els.tripEstimate.textContent = `$${total} (${nights}n) · ${diffText}`;
}

function toggleShortlist(hotel) {
  if (state.shortlist.has(hotel.id)) state.shortlist.delete(hotel.id);
  else state.shortlist.set(hotel.id, hotel);
  localStorage.setItem("stayrank-shortlist", JSON.stringify([...state.shortlist.values()]));
}

let requestToken = 0;

// Shimmering placeholder cards shaped like the real hotel-card grid
// (same 172px photo column, a title/subline pair, a round score-ring
// placeholder) so the results area looks alive the instant a search
// starts, rather than sitting blank - or, worse, showing whatever the
// *previous* search returned, faded, while an LLM call that can take
// anywhere from ~1s to 10+s runs in the background. Every major
// competitor (Kayak, Google Hotels, Airbnb, Booking.com) does some
// version of this; this app only ever dimmed stale results before.
function skeletonCards(count = 4) {
  return Array.from({ length: count }, () => `
    <article class="hotel-card hotel-card-skeleton" aria-hidden="true">
      <div class="skeleton-block skeleton-photo"></div>
      <div class="hotel-body">
        <div class="hotel-head">
          <div class="skeleton-lines">
            <div class="skeleton-block skeleton-line skeleton-line-title"></div>
            <div class="skeleton-block skeleton-line skeleton-line-sub"></div>
          </div>
          <div class="skeleton-block skeleton-ring"></div>
        </div>
        <div class="reason-grid">
          <div class="skeleton-block skeleton-reason"></div>
          <div class="skeleton-block skeleton-reason"></div>
          <div class="skeleton-block skeleton-reason"></div>
        </div>
      </div>
    </article>
  `).join("");
}

// The LLM call this triggers can take anywhere from ~1s to 10+s depending
// on how much "reasoning" the model does for a given prompt - with no
// visible state change, a slow response reads as a frozen/broken app.
function setLoading(isLoading) {
  els.rankButton.disabled = isLoading;
  els.rankButton.textContent = isLoading ? "Ranking…" : "Rank hotels";
  els.results.classList.toggle("is-loading", isLoading);
  if (isLoading) els.results.innerHTML = skeletonCards();
}

async function rankAndRender() {
  syncCityFromPromptMention();
  syncNightsFromPromptMention();
  syncBudgetFromPromptMention();
  syncPetFriendlyFromPromptMention();
  syncAccessibleFromPromptMention();
  syncStarRatingFromPromptMention();
  syncMinRatingFromPromptMention();

  const token = ++requestToken;

  if (!els.city.value.trim()) return;

  saveSearchState();
  setLoading(true);

  let data;
  try {
    data = await searchHotels();
  } catch (err) {
    if (token !== requestToken) return;
    setLoading(false);
    if (err.status === 404) {
      showCityNotFound(err.message);
    } else {
      showBackendError(err);
    }
    return;
  }
  if (token !== requestToken) return;
  setLoading(false);

  // Third-party name fields can carry stray whitespace (seen live: a
  // Zurich hotel row written before backend/hotelbeds.py's own .strip()
  // fix, showing as "Scheuble  " with a doubled space wherever the name
  // gets concatenated). Normalized once here so every render site (card
  // title, detail dialog, compare table, export text) gets a clean name
  // without needing the same fix at each call site.
  data.hotels.forEach((hotel) => {
    if (typeof hotel.name === "string") hotel.name = hotel.name.trim();
  });

  state.currentResults = data.hotels;
  state.currentIntent = data.intent;
  state.currentScoringModel = data.scoringModel;
  state.currentBudget = data.budget;
  state.currentCitySource = data.citySource;

  els.city.value = data.cityName;
  updateMapCard(data.cityName, data.cityHeroImage, data.citySource);
  addRecentCity(data.cityName);
  notifyLiveSyncError(data.cityName, data.cityLiveSyncError);

  if (data.hotels[0]) {
    // Bug found live via testing (switched Tokyo -> Sydney and the panel
    // kept showing Tokyo's climate): this fetch has no staleness guard, so
    // when rankAndRender fires again before an earlier city's request
    // resolves - true on page load (fires several times in quick
    // succession) and true any time a traveler changes city then a filter
    // before the first best-time request lands - an OLDER city's response
    // could resolve AFTER a newer one and overwrite the panel with the
    // wrong city's climate. Same class of race the main search already
    // guards against with `requestToken`; reusing that exact token here.
    fetchBestTimeToVisit(data.hotels[0].latitude, data.hotels[0].longitude).then((result) => {
      if (result && token === requestToken) renderBestTimeToVisit(result.months);
    });
  } else if (els.bestTimeSection) {
    els.bestTimeSection.hidden = true;
  }

  els.results.innerHTML = data.hotels.length
    ? data.hotels.map(hotelCard).join("")
    : `<div class="panel"><h2>No matches</h2><p>Try a broader city, higher budget, fewer must-haves, a lower rating filter${state.minStarRating > 0 ? `, a lower star-class requirement than ${state.minStarRating}+` : ""}${state.budgetOnly ? ", turn off &quot;Within budget only&quot; below" : ""}${state.accessibleOnly ? ", or turn off &quot;Accessible&quot; below (few hotels here have reported accessibility data either way)" : ""}${state.petFriendlyOnly ? ", or turn off &quot;Pet friendly&quot; below (most hotels here haven't reported a pet policy either way)" : ""}.</p></div>`;
  // hotelCard() calls priceWatchBadge() per card, which is what actually
  // records new localStorage entries - the header count button needs a
  // refresh right after, not just at bootstrap, or it stays at 0 through
  // a traveler's entire first search.
  updatePriceWatchesCount();

  els.hotelCount.textContent = String(data.cityHotelCount);
  els.bestFit.textContent = data.hotels[0] ? `${data.hotels[0].name} (${data.hotels[0].score})` : "No match";
  const currentFoundLabels = foundReasonLabels();
  els.intentSummary.textContent = data.intent.found.length
    ? data.intent.found.map((key) => currentFoundLabels[key] || key).join(", ")
    : t("generalBalancedRanking");
  renderAutoMusts(data.intent.dynamicMusts);
  els.shortlistCount.textContent = String(state.shortlist.size);
  if (state.proUnlocked) populateTripPlanHotelSelect();

  if (data.summaryVibe) {
    els.vibeCallout.innerHTML = `<span class="ai-insight-label">&#129302; AI trip read</span><p>${escapeHtml(data.summaryVibe)}</p>`;
    els.vibeCallout.hidden = false;
  } else {
    els.vibeCallout.hidden = true;
  }

  if (els.refineBar) els.refineBar.hidden = !data.hotels.length;

  updateTripEstimateDisplay();
  if (state.tripPlan) renderBudgetBreakdown();
  state.currentLandmark = data.landmark || null;
  renderMap(data.hotels, data.landmark);
  if (els.landmarkStatus) {
    if (data.landmark) {
      els.landmarkStatus.textContent = `Showing distance from: ${data.landmark.name}`;
      els.landmarkStatus.classList.remove("landmark-status-error");
    } else if (data.landmarkError) {
      els.landmarkStatus.textContent = data.landmarkError;
      els.landmarkStatus.classList.add("landmark-status-error");
    } else if (els.landmark.value.trim()) {
      els.landmarkStatus.textContent = "No match found for that landmark - showing unsorted results.";
      els.landmarkStatus.classList.add("landmark-status-error");
    } else {
      els.landmarkStatus.textContent = "";
      els.landmarkStatus.classList.remove("landmark-status-error");
    }
  }
  renderNeighborhoodInsights(data.neighborhoods);
  // Cached so window.onLanguageChanged can re-translate the "All
  // neighborhoods" option and rebuild it on a live language switch
  // without needing a fresh search just to get the same data again.
  state.currentNeighborhoods = data.neighborhoods;
  renderNeighborhoodFilterOptions(data.neighborhoods);
  renderScoringModel(data.scoringModel);
  await refreshCachedCities();
  if (token !== requestToken) return;
  renderFounderDashboard(data);

  // Scoped to els.results (not document) on purpose: this re-runs on every
  // render, and els.results.innerHTML is freshly replaced each time so its
  // own buttons and their listeners are always garbage-collected together -
  // safe. Querying the whole *document* used to also match the "Details"
  // buttons inside an open hotel-detail dialog's "Similar hotels" grid
  // (similarHotelsSection(), rendered into els.detailBody, which persists
  // across a background re-render since opening a dialog doesn't reset it).
  // Those buttons already have their own permanent delegated listener (see
  // els.detailBody's own click listener below) - re-matching them here
  // bolted on a second, independent listener every single time a search
  // completed while the dialog happened to still be open, so one click
  // could fire showDetail() (and its network fetch) multiple times.
  // Reproduced live: opening a detail dialog, triggering one background
  // rankAndRender(), then clicking a "Similar hotels" card fired 2 fetches
  // to /api/hotels/{id} for a single click - confirmed via a temporary
  // window.fetch wrapper counting calls.
  els.results.querySelectorAll("[data-shortlist]").forEach((button) => {
    button.addEventListener("click", () => {
      const hotel = state.currentResults.find((item) => item.id === Number(button.dataset.shortlist));
      if (!hotel) return;
      toggleShortlist(hotel);
      rankAndRender();
    });
  });

  els.results.querySelectorAll("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => showDetail(Number(button.dataset.detail)));
  });

  // Scoped to els.results for the same reason as the two blocks above -
  // .hotel-card only ever renders inside els.results today, so this isn't
  // currently reachable from outside it, but querying the whole document
  // here was still one document.querySelectorAll away from the exact bug
  // just fixed above if this class name is ever reused elsewhere.
  els.results.querySelectorAll(".hotel-card[data-hotel-id]").forEach((card) => {
    const hotelId = Number(card.dataset.hotelId);
    const marker = mapMarkersById.get(hotelId);
    if (!marker) return;
    card.addEventListener("mouseenter", () => marker.openPopup());
    card.addEventListener("mouseleave", () => marker.closePopup());
  });
}

// Researched gap: modern guest-sentiment tools (GuestRevu and similar)
// break reviews down by topic - cleanliness, noise, staff, value, location -
// rather than one blended star rating. This app only ever has a handful of
// real review comments per hotel (REVIEWS_PER_HOTEL=5 for live-synced
// hotels, see backend/api_fetcher.py) - too few to responsibly classify as
// positive/negative per topic without the classification itself becoming
// the kind of fabricated-nuance judgment this app avoids everywhere else
// (see the disabled per-review rating in api_fetcher.py's own comment, for
// the same reason). So this deliberately stays a neutral MENTION count, not
// a sentiment score: literally which of these hotel's own real review texts
// contain a topic's keywords, counted, nothing inferred about tone.
// "39% of travelers want scam/safety-issue detection" (2026 travel-AI trend
// research, see README changelog) - real hotel booking sites can't detect
// an actual scam, but this app already has real guest review text on hand,
// and pest/security keywords are exactly the kind of concrete, factual
// signal a neutral keyword count CAN honestly surface, same as every other
// category here. Deliberately narrow (bed bugs, pests, theft, safety) -
// not a general "bad review" catch-all, which would just double up on the
// cleanliness/staff categories above with vaguer signal.
const REVIEW_THEME_KEYWORDS = {
  cleanliness: { labelKey: "reviewThemeCleanliness", words: ["clean", "dirty", "dust", "stain", "spotless", "hygien"] },
  noise: { labelKey: "reviewThemeNoise", words: ["noise", "noisy", "loud", "quiet", "silent"] },
  staff: { labelKey: "reviewThemeStaff", words: ["staff", "service", "friendly", "reception", "helpful", "rude"] },
  value: { labelKey: "reviewThemeValue", words: ["value", "price", "expensive", "cheap", "worth", "overpriced"] },
  location: { labelKey: "reviewThemeLocation", words: ["location", "walk", "central", "convenient"] },
  wifi: { labelKey: "reviewThemeWifi", words: ["wifi", "wi-fi", "internet", "connection"] },
  breakfast: { labelKey: "reviewThemeBreakfast", words: ["breakfast", "buffet"] },
  safety: {
    labelKey: "reviewThemeSafety",
    words: ["bed bug", "bedbug", "mold", "mould", "cockroach", "roach", "infestat", "theft", "stolen", "unsafe", "scam", "broken lock"]
  }
};

function reviewThemes(hotel) {
  // Needs at least 2 real reviews - a "theme" built from a single review
  // isn't a pattern, it's just that one guest's comment restated. (This
  // also means `total` is always >= 2 below, so the heading never needs
  // English's singular "1 review" case.)
  if (!hotel.reviews || hotel.reviews.length < 2) return "";
  const total = hotel.reviews.length;
  const counts = Object.entries(REVIEW_THEME_KEYWORDS)
    .map(([key, { labelKey, words }]) => {
      const matches = hotel.reviews.filter((review) => {
        const text = (review.comment || "").toLowerCase();
        return words.some((word) => text.includes(word));
      }).length;
      return { key, label: t(labelKey), matches };
    })
    .filter((entry) => entry.matches > 0)
    .sort((a, b) => b.matches - a.matches);
  if (!counts.length) return "";
  return `
    <div class="review-themes">
      <strong>${escapeHtml(t("reviewThemesHeading").replace("{n}", total))}</strong>
      <div class="chip-row">
        ${counts
          .map((entry) => {
            const title = t("reviewThemeMatchTitle").replace("{matches}", entry.matches).replace("{total}", total);
            return `<span class="tag review-theme-tag" title="${escapeHtml(title)}">${escapeHtml(entry.label)} &middot; ${entry.matches}</span>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function guestReviewsSection(hotel) {
  if (!hotel.reviews || !hotel.reviews.length) {
    return hotel.reviewCount
      ? `<p class="subline">${escapeHtml(t("guestReviewsUncachedNote").replace("{count}", hotel.reviewCount))}</p>`
      : "";
  }
  return `
    <div>
      ${reviewThemes(hotel)}
      <strong>${escapeHtml(t("guestReviewsHeading"))}${hotel.reviewCount ? ` ${escapeHtml(t("guestReviewsTotalSuffix").replace("{count}", hotel.reviewCount))}` : ""}:</strong>
      <ul class="review-list">
        ${hotel.reviews
          .map(
            (review) => `
              <li>
                <strong>${escapeHtml(review.author)}</strong>${review.createdAt ? ` · ${review.createdAt.slice(0, 10)}` : ""}
                <p>${escapeHtml(review.comment)}</p>
              </li>
            `
          )
          .join("")}
      </ul>
    </div>
  `;
}

// --- Community reviews & photos --------------------------------------
// Traveler-submitted reviews on THIS app (backend/database.py's
// community_reviews table) - separate from guestReviewsSection above,
// which is real Booking.com/Hotelbeds review data. Posting is free and
// needs only a name + email (no password/account - same lightweight
// identity pattern Trip Planner Pro's billing already uses), so anyone
// can share their own stay and photos.

// reviewId -> flat array of that review's photo URLs, so a community
// photo thumbnail click can hand the shared lightbox a small, correct
// array without re-deriving it from the DOM. Rebuilt every time
// communityReviewCard() renders a card, so a stale hotel's entries just
// get overwritten (ids are globally unique across all hotels, so there's
// no cross-hotel collision risk in letting old entries linger either).
const communityReviewPhotosById = {};

function communityReviewSampleNotice(reviews) {
  if (!reviews.length || !reviews.some((review) => review.isSample)) return "";
  return `<p class="subline community-sample-notice">🧪 ${escapeHtml(t("communitySampleNotice"))}</p>`;
}

function communityReviewCard(review) {
  const photos = review.photos || [];
  communityReviewPhotosById[review.id] = photos.map((photo) => photo.url || photo);
  const stars = Math.max(0, Math.min(5, Math.round(review.rating || 0)));
  return `
    <li class="community-review-card" data-review-id="${review.id}">
      <div class="community-review-head">
        <strong>${escapeHtml(review.author)}</strong>
        <span class="star-rating" title="${stars}/5">${"&#9733;".repeat(stars)}${"&#9734;".repeat(5 - stars)}</span>
        ${review.tripType ? `<span class="tag">${escapeHtml(review.tripType)}</span>` : ""}
        ${review.isSample ? `<span class="tag warning community-sample-tag">${escapeHtml(t("sampleTag"))}</span>` : ""}
        ${review.createdAt ? `<span class="subline community-review-date">${escapeHtml(review.createdAt.slice(0, 10))}</span>` : ""}
      </div>
      <p>${escapeHtml(review.body)}</p>
      ${photos.length ? `
        <div class="community-photo-row">
          ${photos
            .map(
              (photo, i) => `
                <button type="button" class="community-photo-thumb" data-community-review-id="${review.id}" data-photo-index="${i}" aria-label="View photo ${i + 1} of ${photos.length} full-size">
                  <img src="${escapeHtml(photo.url || photo)}" alt="${escapeHtml(photo.caption || `${review.author}'s photo`)}" loading="lazy" onerror="this.closest('.community-photo-thumb').style.display='none'" />
                </button>
              `
            )
            .join("")}
        </div>
      ` : ""}
    </li>
  `;
}

function communityReviewForm(hotel) {
  return `
    <div class="community-review-form-wrap">
      <strong>${escapeHtml(t("communityReviewFormTitle"))}</strong>
      <p class="subline">${escapeHtml(t("communityReviewFormIntro"))}</p>
      <form id="communityReviewForm" class="community-review-form" data-hotel-id="${hotel.id}">
        <div class="field-grid">
          <label><span>${escapeHtml(t("yourName"))}</span><input type="text" id="communityReviewName" maxlength="80" required /></label>
          <label><span>${escapeHtml(t("yourEmail"))}</span><input type="email" id="communityReviewEmail" required /></label>
          <label>
            <span>${escapeHtml(t("tripType"))}</span>
            <select id="communityReviewTripType">
              <option value="">${escapeHtml(t("tripTypeUnspecified"))}</option>
              <option value="Solo">Solo</option>
              <option value="Couple">Couple</option>
              <option value="Family">Family</option>
              <option value="Friends">Friends</option>
              <option value="Business">Business</option>
            </select>
          </label>
        </div>
        <div class="star-picker" id="communityReviewStarPicker" role="radiogroup" aria-label="${escapeHtml(t("yourRating"))}">
          ${[1, 2, 3, 4, 5]
            .map((n) => `<button type="button" class="star-picker-btn" data-value="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">&#9734;</button>`)
            .join("")}
        </div>
        <input type="hidden" id="communityReviewRating" value="0" />
        <label><span>${escapeHtml(t("yourReview"))}</span><textarea id="communityReviewBody" rows="4" maxlength="3000" required placeholder="${escapeHtml(t("communityReviewPlaceholder"))}"></textarea></label>
        <label><span>${escapeHtml(t("photoLinksLabel"))}</span><textarea id="communityReviewPhotos" rows="2" maxlength="1000" placeholder="${escapeHtml(t("photoLinksPlaceholder"))}"></textarea></label>
        <button type="submit" class="primary-button">${escapeHtml(t("postReviewButton"))}</button>
        <p id="communityReviewStatus" class="landmark-status" aria-live="polite"></p>
      </form>
    </div>
  `;
}

function communityReviewsSection(hotel) {
  const reviews = hotel.communityReviews || [];
  return `
    <div class="community-reviews">
      <strong>${escapeHtml(t("communityReviewsHeading"))}</strong>
      <p class="subline">${escapeHtml(t("communityReviewsIntro"))}</p>
      ${communityReviewSampleNotice(reviews)}
      <ul class="review-list community-review-list" id="communityReviewsList">
        ${reviews.length ? reviews.map(communityReviewCard).join("") : `<li class="subline community-reviews-empty">${escapeHtml(t("communityReviewsEmpty"))}</li>`}
      </ul>
      ${communityReviewForm(hotel)}
    </div>
  `;
}

function setCommunityReviewRating(value) {
  const hidden = document.getElementById("communityReviewRating");
  if (hidden) hidden.value = String(value);
  document.querySelectorAll("#communityReviewStarPicker .star-picker-btn").forEach((btn) => {
    const filled = Number(btn.dataset.value) <= value;
    btn.innerHTML = filled ? "&#9733;" : "&#9734;";
    btn.classList.toggle("active", filled);
  });
}

async function submitCommunityReview(hotelId) {
  const form = document.getElementById("communityReviewForm");
  const status = document.getElementById("communityReviewStatus");
  if (!form || !status) return;

  const name = document.getElementById("communityReviewName").value.trim();
  const email = document.getElementById("communityReviewEmail").value.trim();
  const rating = Number(document.getElementById("communityReviewRating").value || 0);
  const tripType = document.getElementById("communityReviewTripType").value;
  const body = document.getElementById("communityReviewBody").value.trim();
  const photosRaw = document.getElementById("communityReviewPhotos").value.trim();
  const photos = photosRaw
    ? photosRaw.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 5)
    : [];

  if (!name || !email || !body) {
    status.className = "landmark-status landmark-status-error";
    status.textContent = t("communityReviewMissingFields");
    return;
  }
  if (!rating) {
    status.className = "landmark-status landmark-status-error";
    status.textContent = t("communityReviewMissingRating");
    return;
  }

  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  status.className = "landmark-status";
  status.textContent = t("communityReviewSubmitting");

  try {
    const created = await apiPost("/api/community-reviews", {
      hotelId,
      authorName: name,
      authorEmail: email,
      rating,
      body,
      tripType: tripType || null,
      photos,
    });
    // The dialog may have closed/reopened for a different hotel while this
    // was in flight - only touch the DOM if it's still showing this form.
    const stillForm = document.getElementById("communityReviewForm");
    if (stillForm) {
      const list = document.getElementById("communityReviewsList");
      const emptyPlaceholder = list?.querySelector(".community-reviews-empty");
      if (emptyPlaceholder) emptyPlaceholder.remove();
      list?.insertAdjacentHTML("afterbegin", communityReviewCard(created));
      stillForm.reset();
      setCommunityReviewRating(0);
      const stillStatus = document.getElementById("communityReviewStatus");
      if (stillStatus) {
        stillStatus.className = "landmark-status";
        stillStatus.textContent = t("communityReviewSuccess");
      }
    }
  } catch (err) {
    const stillStatus = document.getElementById("communityReviewStatus");
    if (stillStatus) {
      stillStatus.className = "landmark-status landmark-status-error";
      stillStatus.textContent = err.message;
    }
  } finally {
    const stillSubmit = document.getElementById("communityReviewForm")?.querySelector("button[type=submit]");
    if (stillSubmit) stillSubmit.disabled = false;
  }
}

async function showDetail(hotelId) {
  // Only a hotel from the *current* search carries a score/confidence
  // (both computed per-search, against that search's own weights/budget -
  // meaningless outside it). A hotel with neither - e.g. opened from the
  // Recently Viewed strip after switching to a different city's search -
  // used to make this whole function silently no-op, since it required a
  // cache hit to even open the dialog. /api/hotels/{id} already returns a
  // fully self-contained hotel record with no search-context dependency,
  // so there's no real reason this couldn't work standalone too.
  const cached = state.currentResults.find((item) => item.id === hotelId) || [...state.shortlist.values()].find((item) => item.id === hotelId);

  els.detailTitle.textContent = cached ? cached.name : "Hotel details";
  els.detailBody.innerHTML = `<p class="subline">Loading full details&hellip;</p>`;
  els.detailDialog.showModal();

  let hotel = cached || null;
  try {
    hotel = await apiGet(`/api/hotels/${hotelId}`);
    // Same stray-whitespace guard as the search response below - this is a
    // separate fetch with its own raw name field.
    if (typeof hotel.name === "string") hotel.name = hotel.name.trim();
    if (cached) {
      hotel.score = cached.score;
      hotel.confidence = cached.confidence;
    }
  } catch (err) {
    console.error("Failed to load full hotel detail:", err);
    if (!cached) {
      // A Recently Viewed card is the only path that can reach this with no
      // cached fallback (state.currentResults/shortlist both missed above).
      // Its hotel ID can go stale: backend/database.py periodically retries
      // a generated/content-tier city and deletes+reinserts its hotels with
      // fresh IDs (see get_or_create_city's FALLBACK_RETRY_AFTER path) -
      // real behavior, not a bug, but this card's ID was never invalidated
      // for it. Reproduced live: a hotel viewed earlier in this session
      // later 404'd here after Barcelona's content-tier data refreshed,
      // while the stale card stayed in the strip showing this same dead
      // end on every future click. On a 404 specifically (not a network
      // blip - those should still show the retry-worthy error below),
      // prune it so the strip self-heals instead of accumulating dead ends.
      if (err.status === 404) {
        const pruned = loadRecentlyViewed().filter((item) => item.id !== hotelId);
        try {
          localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(pruned));
        } catch {
          // Non-fatal - this is a convenience strip, not core state.
        }
        renderRecentlyViewed();
      }
      els.detailBody.innerHTML = `<p class="subline">Couldn't load this hotel's details (${escapeHtml(err.message)}).</p>`;
      return;
    }
    // Fetch failed but we still have the cached search-result copy - show
    // that rather than leaving the dialog stuck on "Loading...".
  }
  if (!hotel) return;

  els.detailTitle.textContent = hotel.name;
  recordRecentlyViewed(hotel);
  lightboxPhotos = hotel.photos || [];
  lightboxAlt = hotel.name;
  detailHotelPhotos = hotel.photos || [];
  detailHotelName = hotel.name;

  const scoreLine = hotel.score != null
    ? `Match ${hotel.score}/100 · Confidence ${hotel.confidence}%`
    : "";
  const detailNights = Math.max(1, Number(els.nights.value) || 1);
  const detailTotalForStay =
    detailNights > 1
      ? ` (${t("totalForStay").replace("{amount}", (hotel.price * detailNights).toLocaleString()).replace("{n}", detailNights)})`
      : "";

  els.detailBody.innerHTML = `
    <p class="subline">${starRatingHtml(hotel)} ${escapeHtml(hotel.neighborhood)} · $${hotel.price}/night${detailTotalForStay}${checkInDateRangeText(detailNights)} ${dealBadge(hotel)} ${breakfastAvailableBadge(hotel)} ${freeCancellationBadge(hotel)} · ${hotel.rating} guest rating ${hotel.realRating ? `(${hotel.realRating}/10 on Booking.com)` : ""} · ${scoreLine}</p>
    ${hotel.address ? `<p class="subline">📍 ${escapeHtml(hotel.address)}${hotel.phone ? ` · <a href="tel:${escapeHtml(hotel.phone)}">📞 ${escapeHtml(hotel.phone)}</a>` : ""} · <button type="button" class="link-button" id="copyAddressButton" data-address="${escapeHtml(hotel.address)}">📋 ${escapeHtml(t("copyAddress"))}</button></p>` : ""}
    <p class="subline" id="detail-transit-line"></p>
    <p class="subline" id="detail-landmark-walk-line"></p>
    <p class="subline" id="detail-noise-line"></p>
    ${photoGallery(hotel)}
    ${amenitiesRow(hotel)}
    ${officialDescriptionSection(hotel)}
    ${nearbyLandmarksSection(hotel)}
    ${mealPlansSection(hotel)}
    ${sustainabilitySection(hotel)}
    ${priceHistorySparkline(hotel)}
    ${dataSourcesSection(hotel)}
    <div class="breakdown">
      ${Object.entries(hotel.metrics)
        .map(
          ([key, value]) => `
            <div class="breakdown-row"${hotel.externalId && PROXY_METRIC_KEYS.has(key) ? ` title="${escapeHtml(proxyMetricTitle(hotel))}"` : ""}>
              <span>${metricLabels()[key] || key}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
              <span>${value}</span>
            </div>
          `
        )
        .join("")}
    </div>
    <ul class="review-list">
      <li><strong>Strengths:</strong> ${hotel.strengths.join("; ")}.</li>
      <li><strong>Tradeoff:</strong> ${hotel.risk}</li>
      <li><strong>Evidence:</strong> ${hotel.evidence}</li>
    </ul>
    ${guestReviewsSection(hotel)}
    ${communityReviewsSection(hotel)}
    <div class="ask-hotel">
      <strong>${t("askHotelTitle")}</strong>
      <p class="subline">${t("askHotelIntro")}</p>
      <form id="askHotelForm" class="ask-hotel-form">
        <input type="text" id="askHotelInput" maxlength="300" placeholder="${escapeHtml(t("askHotelPlaceholder"))}" aria-label="${escapeHtml(t("askHotelTitle"))}" />
        <button type="submit">${t("askHotelButton")}</button>
      </form>
      <div id="askHotelAnswer" aria-live="polite"></div>
    </div>
    <div class="card-actions">
      <a class="book" href="${bookingLink(hotel)}" target="_blank" rel="noreferrer">${t("checkBooking")}</a>
      ${hotel.website ? `<a href="${escapeHtml(hotel.website)}" target="_blank" rel="noreferrer">${t("officialWebsite")}</a>` : ""}
      <button type="button" class="link-button" id="shareHotelButton" data-name="${escapeHtml(hotel.name)}" data-price="${hotel.price}" data-score="${hotel.score ?? ""}" data-city="${escapeHtml(hotel.city || hotel.neighborhood || "")}" data-link="${escapeHtml(bookingLink(hotel))}">📤 ${escapeHtml(t("shareHotel"))}</button>
    </div>
    ${similarHotelsSection(hotel)}
  `;

  const askForm = document.getElementById("askHotelForm");
  if (askForm) {
    askForm.addEventListener("submit", (event) => {
      event.preventDefault();
      askHotelQuestion(hotel.id);
    });
  }

  const communityForm = document.getElementById("communityReviewForm");
  if (communityForm) {
    communityForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCommunityReview(hotel.id);
    });
    communityForm.querySelectorAll(".star-picker-btn").forEach((btn) => {
      btn.addEventListener("click", () => setCommunityReviewRating(Number(btn.dataset.value)));
    });
  }

  fetchNearestTransit(hotel.latitude, hotel.longitude).then((stop) => {
    const line = document.getElementById("detail-transit-line");
    if (!line) return; // dialog closed or reopened for a different hotel already
    line.textContent = stop
      ? `🚇 Nearest transit: ${stop.name} (${stop.kind}) - ~${stop.walkMinutes} min walk (${stop.distanceKm} km)${stop.wheelchairAccessible ? ", wheelchair accessible" : ""}`
      : "";
  });

  // Upgrades the crow-flies "X km from landmark" already shown on the card
  // (see hotel.distanceFromLandmark) to a real routed walk time, the same
  // "reachability" fact competitor listings lead with - but only computed
  // lazily, once, for whichever single hotel the traveler actually opens,
  // reusing the exact OSRM call the itinerary's per-item walk times already
  // make (see fetchWalkingRoute above). Only when a landmark search is
  // active: with none, there's nothing real to route to.
  if (state.currentLandmark && hotel.latitude != null && hotel.longitude != null) {
    fetchWalkingRoute(hotel.latitude, hotel.longitude, state.currentLandmark.latitude, state.currentLandmark.longitude).then((route) => {
      const line = document.getElementById("detail-landmark-walk-line");
      if (!line) return; // dialog closed or reopened for a different hotel already
      line.textContent = route
        ? `🚶 ${route.walkMinutes} min walk to ${state.currentLandmark.name} (${route.distanceKm} km by real route)`
        : "";
    });
  }

  fetchNoiseContext(hotel.latitude, hotel.longitude).then((context) => {
    const line = document.getElementById("detail-noise-line");
    if (!line) return; // dialog closed or reopened for a different hotel already
    if (!context) {
      line.textContent = "";
      return;
    }
    const reasons = [];
    if (context.nightlifeCount > 0) reasons.push(`${context.nightlifeCount} nightlife venue${context.nightlifeCount === 1 ? "" : "s"} within 200m`);
    if (context.nearMajorRoad) reasons.push("on/near a major road");
    line.textContent = `${NOISE_LABELS[context.label]}${reasons.length ? ` (${reasons.join(", ")})` : " (nothing noisy found nearby on OpenStreetMap)"}`;
  });
}

// "Ask this hotel" - Agoda's AMA bot / Expedia's Property Expert pattern,
// but retrieval-constrained to this one hotel's own real fields (see
// backend/llm_engine.py's ASK_HOTEL_SYSTEM_PROMPT). Unlike the other LLM
// features on this page, this is a direct response to something the
// traveler just typed and clicked "Ask" for, so failures show a clear
// inline message here rather than failing silently.
async function askHotelQuestion(hotelId) {
  const input = document.getElementById("askHotelInput");
  const answerBox = document.getElementById("askHotelAnswer");
  const form = document.getElementById("askHotelForm");
  if (!input || !answerBox || !form) return;
  const question = input.value.trim();
  if (!question) return;

  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  answerBox.className = "ask-hotel-answer-loading";
  answerBox.textContent = t("askHotelLoading");

  try {
    const data = await apiPost(`/api/hotels/${hotelId}/ask`, { question });
    // The dialog may have closed/reopened for a different hotel while this
    // was in flight - only apply the answer if it's still asking about
    // this same hotel's form.
    const stillOpen = document.getElementById("askHotelAnswer");
    if (stillOpen) {
      stillOpen.className = "ask-hotel-answer";
      stillOpen.innerHTML = `<span class="ai-insight-label">&#129302; ${escapeHtml(t("askHotelAnswerLabel"))}</span><p>${escapeHtml(data.answer)}</p>`;
    }
  } catch (err) {
    const stillOpen = document.getElementById("askHotelAnswer");
    if (stillOpen) {
      stillOpen.className = "ask-hotel-answer-error";
      stillOpen.textContent = err.message;
    }
  } finally {
    const stillSubmit = document.getElementById("askHotelForm")?.querySelector("button[type=submit]");
    if (stillSubmit) stillSubmit.disabled = false;
  }
}

// Real nearest-transit-stop fact (see backend/transit.py) for the detail
// dialog only - deliberately not fetched for the whole result list, to
// stay a light, considerate caller of a shared public Overpass endpoint.
// A silent no-op on failure/no-coverage is correct here: this is a nice-to-
// have addition to an already-complete detail view, not something worth a
// visible error for.
const transitCache = {};
async function fetchNearestTransit(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  const cacheKey = `${latitude},${longitude}`;
  if (cacheKey in transitCache) return transitCache[cacheKey];
  try {
    const data = await apiGet(`/api/nearest-transit?latitude=${latitude}&longitude=${longitude}`);
    transitCache[cacheKey] = data.transit;
    return data.transit;
  } catch {
    return null;
  }
}

// Researched competitor products again: no major booking platform has
// shipped a noise/quiet-hours signal despite it being a common real
// complaint - genuine whitespace. Built the honest version (see
// backend/noise_context.py): real counted OSM nightlife venues + real
// major-road proximity, never a fabricated decibel score. Same lazy,
// once-per-opened-hotel, silent-on-failure discipline as
// fetchNearestTransit above - a considerate caller of the same shared
// Overpass endpoint, not a second heavier query pattern.
const noiseContextCache = {};
const NOISE_LABELS = {
  likely_quiet: "🤫 Likely quiet",
  somewhat_lively: "🔉 Somewhat lively",
  likely_lively: "🔊 Likely lively"
};

async function fetchNoiseContext(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  const cacheKey = `${latitude},${longitude}`;
  if (cacheKey in noiseContextCache) return noiseContextCache[cacheKey];
  try {
    const data = await apiGet(`/api/noise-context?latitude=${latitude}&longitude=${longitude}`);
    noiseContextCache[cacheKey] = data;
    return data;
  } catch {
    return null;
  }
}

// "Best time to visit" - researched gap: dedicated tools like Travelyric
// blend weather with crowd levels, flight/hotel prices, and event
// calendars into one score. This app has no real data source for crowd
// density or events, so it deliberately only shows the one dimension it
// can honestly back: real historical temperature/rainfall by month (see
// backend/best_time.py). City-level fact, fetched lazily once per city
// search (using the top-ranked hotel's real coordinates as the city
// location) - not per hotel, not re-fetched on every filter re-render.
// Self-detected while doing an i18n pass: this used to be a fixed English
// abbreviation array shown regardless of the app's own language selector -
// the same class of gap already fixed once this session for the trip-plan
// summary's date formatting (see its own comment for the earlier bug:
// relying on the browser/OS locale instead of the app's selected one).
// Intl.DateTimeFormat gives a REAL localized month name for the app's
// current language, not a guessed/hand-translated one.
const MONTH_LOCALE_MAP = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT", zh: "zh-CN" };
function monthName(monthNum) {
  const locale = MONTH_LOCALE_MAP[getCurrentLang()] || "en-US";
  return new Date(2000, monthNum - 1, 1).toLocaleDateString(locale, { month: "short" });
}

// Optional check-in date (els.checkInDate) - every competitor researched
// this session (Kayak, Booking.com, Google Hotels) shows real check-in/
// check-out dates, not just a night count. Purely date arithmetic on a
// value the user typed in themselves - nothing fabricated. Returns "" when
// no date was picked, so this never invents a stay date.
function checkInDateRangeText(nights) {
  const raw = els.checkInDate.value;
  if (!raw) return "";
  const locale = MONTH_LOCALE_MAP[getCurrentLang()] || "en-US";
  const checkIn = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(checkIn.getTime())) return "";
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);
  const fmt = (d) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return ` · ${fmt(checkIn)} → ${fmt(checkOut)}`;
}
const bestTimeCache = {};

async function fetchBestTimeToVisit(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  const cacheKey = `${latitude},${longitude}`;
  if (cacheKey in bestTimeCache) return bestTimeCache[cacheKey];
  try {
    const data = await apiGet(`/api/best-time-to-visit?latitude=${latitude}&longitude=${longitude}`);
    bestTimeCache[cacheKey] = data;
    return data;
  } catch {
    return null;
  }
}

function renderBestTimeToVisit(months) {
  if (!els.bestTimeSection) return;
  const available = (months || []).filter((m) => m.available);
  if (available.length < 3) {
    // Too few real months of data to show anything meaningful - hidden,
    // not a broken-looking near-empty grid.
    els.bestTimeSection.hidden = true;
    return;
  }
  els.bestTimeSection.hidden = false;

  // Purely factual superlatives from the real data - never a subjective
  // "best" verdict. Driest/warmest/coolest are each independently
  // reproducible by anyone looking at the grid below.
  const driest = available.reduce((a, b) => (b.rainyDaysPercent < a.rainyDaysPercent ? b : a));
  const warmest = available.reduce((a, b) => (b.avgTempMaxC > a.avgTempMaxC ? b : a));
  const coolest = available.reduce((a, b) => (b.avgTempMaxC < a.avgTempMaxC ? b : a));
  els.bestTimeSummary.innerHTML = `
    <span class="tag review-theme-tag">☀️ Driest: ${monthName(driest.month)} (${driest.rainyDaysPercent}% rainy days)</span>
    <span class="tag review-theme-tag">🥵 Warmest: ${monthName(warmest.month)} (${warmest.avgTempMaxC}°C avg high)</span>
    <span class="tag review-theme-tag">🥶 Coolest: ${monthName(coolest.month)} (${coolest.avgTempMaxC}°C avg high)</span>
  `;

  els.bestTimeGrid.innerHTML = months
    .map((m) => {
      if (!m.available) {
        return `<div class="best-time-month"><span class="best-time-label">${monthName(m.month)}</span><span class="best-time-temps">No data</span></div>`;
      }
      const highlight = m.month === driest.month || m.month === warmest.month || m.month === coolest.month;
      return `
        <div class="best-time-month${highlight ? " best-time-highlight" : ""}" title="Averaged over the last ${m.yearsUsed} real year${m.yearsUsed === 1 ? "" : "s"} (Open-Meteo historical archive)">
          <span class="best-time-label">${monthName(m.month)}</span>
          <span class="best-time-temps">${m.avgTempMaxC}° / ${m.avgTempMinC}°C</span>
          <span class="best-time-rain">🌧️ ${m.rainyDaysPercent}%</span>
        </div>
      `;
    })
    .join("");
}

// The five metrics the app's own scoring model already weights most
// heavily (see the Decision model panel: transit 21%, value 18%,
// quiet 16%, cleanliness 15%, roomSize 10% in a typical search) - not an
// arbitrary pick, the same dimensions the ranking itself cares about
// most. Colors are fixed, developer-chosen constants (not hotel data),
// reused from elsewhere in this app's own palette (accent purple, the
// green/amber/rose status colors, the walking-route blue) rather than
// picked freehand, so they stay legible against both themes.
// labelKey (not a fixed label string) so the chart's axis text reflects
// whichever language is currently selected (see i18n.js) when rendered,
// rather than freezing in whatever language was active at page load.
const RADAR_METRICS = [
  { key: "transit", labelKey: "metricTransit" },
  { key: "value", labelKey: "metricValue" },
  { key: "quiet", labelKey: "metricQuiet" },
  { key: "cleanliness", labelKey: "radarClean" },
  { key: "roomSize", labelKey: "radarRoom" }
];
const RADAR_COLORS = ["#8a63f0", "#138a62", "#e3a008", "#b42318", "#1d6fd3"];
const RADAR_MAX_HOTELS = 5;

function radarPoint(cx, cy, radius, angleRad, value) {
  const r = radius * (Math.max(0, Math.min(100, value)) / 100);
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

// Real, computed-from-actual-scoring-data comparison chart - not a new
// data source, just a visual read on hotel.metrics values every card
// already shows as plain numbers. Hand-rolled SVG (no charting library)
// to match this app's dependency-free approach elsewhere (TF-IDF search,
// print view, etc).
function radarChartSvg(hotels) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 108;
  const angleStep = (Math.PI * 2) / RADAR_METRICS.length;
  const startAngle = -Math.PI / 2;

  const shown = hotels.slice(0, RADAR_MAX_HOTELS);
  const overflowNote = hotels.length > RADAR_MAX_HOTELS
    ? `<p class="subline">Showing the top ${RADAR_MAX_HOTELS} by score of ${hotels.length} shortlisted - more would overlap unreadably.</p>`
    : "";

  const rings = [0.25, 0.5, 0.75, 1]
    .map((frac) => {
      const points = RADAR_METRICS.map((_, i) => {
        const [x, y] = radarPoint(cx, cy, radius, startAngle + i * angleStep, frac * 100);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      return `<polygon points="${points}" class="radar-grid-ring" />`;
    })
    .join("");

  const axes = RADAR_METRICS.map((metric, i) => {
    const angle = startAngle + i * angleStep;
    const [x, y] = radarPoint(cx, cy, radius, angle, 100);
    const [lx, ly] = radarPoint(cx, cy, radius + 20, angle, 100);
    const cos = Math.cos(angle);
    const anchor = Math.abs(cos) < 0.15 ? "middle" : cos > 0 ? "start" : "end";
    return `
      <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis-line" />
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" class="radar-axis-label">${t(metric.labelKey)}</text>
    `;
  }).join("");

  const polygons = shown.map((hotel, hi) => {
    const color = RADAR_COLORS[hi % RADAR_COLORS.length];
    const points = RADAR_METRICS.map((metric, i) => {
      const value = hotel.metrics?.[metric.key] ?? 0;
      const [x, y] = radarPoint(cx, cy, radius, startAngle + i * angleStep, value);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${points}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2" />`;
  }).join("");

  const legend = shown
    .map((hotel, hi) => `
      <span class="radar-legend-item">
        <span class="radar-legend-swatch" style="background:${RADAR_COLORS[hi % RADAR_COLORS.length]}"></span>
        ${escapeHtml(hotel.name)}
      </span>
    `)
    .join("");

  return `
    <div class="compare-radar">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar chart comparing shortlisted hotels across transit, value, quiet, cleanliness, and room size">
        ${rings}
        ${axes}
        ${polygons}
      </svg>
      <div class="radar-legend">${legend}</div>
      ${overflowNote}
    </div>
  `;
}

function renderCompare() {
  const selected = [...state.shortlist.values()].sort((a, b) => b.score - a.score);

  if (!selected.length) {
    els.compareTable.innerHTML = `<p class="subline">Add hotels to the shortlist first.</p>`;
    return;
  }

  // The shortlist is deliberately cross-city, but two problems follow from
  // that: (1) hotel names alone don't say which city they're in, and (2)
  // "Score" is computed per-search against that search's own weights,
  // budget, and prompt - a 73 from a Tokyo search and a 61 from a
  // different-weighted Porto search aren't actually on the same scale,
  // even though showing them side by side implies they are.
  const citiesInvolved = new Set(selected.map((hotel) => hotel.city));
  const scoreCaveat = citiesInvolved.size > 1
    ? `<p class="subline"><em>Scores come from each hotel's own search (different city, possibly different weights/budget) - treat them as relative within a city, not directly comparable across cities.</em></p>`
    : "";

  // Found via checking competitor comparison patterns (Kayak/Google
  // Hotels both show a thumbnail in their side-by-side compare views) -
  // this table was pure text/numbers even though every shortlisted hotel
  // already has a real photo fetched for its own card. No new data, just
  // reusing it here too, so a traveler comparing several hotels can tell
  // them apart at a glance instead of by name alone.
  els.compareTable.innerHTML = `
    ${scoreCaveat}
    <div class="vibe-callout" id="compareAiSummary" hidden></div>
    ${radarChartSvg(selected)}
    <div class="compare-row header">
      <span></span><span>Hotel</span><span>City</span><span>Score</span><span>Confidence</span><span>Price/night</span><span>Quiet</span><span>Transit</span>
    </div>
    ${selected
      .map((hotel) => {
        const compareNights = Math.max(1, Number(els.nights.value) || 1);
        const compareTotal = compareNights > 1 ? `<small class="compare-total-note">$${(hotel.price * compareNights).toLocaleString()} total, ${compareNights} nights</small>` : "";
        return `
      <div class="compare-row">
        <img class="compare-thumb" src="${hotel.image}" alt="" loading="lazy" />
        <strong>${escapeHtml(hotel.name)}</strong>
        <span>${escapeHtml(hotel.city)}</span>
        <span>${hotel.score}</span>
        <span>${hotel.confidence}%</span>
        <span class="compare-price-cell">$${hotel.price}${compareTotal}${priceWatchBadge(hotel)}</span>
        <span>${hotel.metrics.quiet}</span>
        <span>${hotel.metrics.transit}</span>
      </div>
    `;
      })
      .join("")}
  `;

  fetchShortlistSummary(selected);
}

// Lazily fetches a short AI trade-off paragraph across the shortlist (see
// backend/llm_engine.py's generate_shortlist_comparison - grounded ONLY in
// real DB fields the backend re-fetches by ID, never invented). Cached per
// exact shortlist composition so reopening Compare without changing the
// shortlist doesn't re-call the LLM. Silent on any failure - no LLM key
// configured is the common case for this prototype, and a "couldn't load"
// error here would be noise on top of an already-complete comparison
// table; this is a bonus insight, not a feature the dialog depends on.
const shortlistSummaryCache = new Map();
function renderShortlistSummary(text) {
  const box = document.getElementById("compareAiSummary");
  if (!box) return;
  if (!text) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<span class="ai-insight-label">&#129302; AI Comparison</span><p>${escapeHtml(text)}</p>`;
  box.hidden = false;
}

async function fetchShortlistSummary(selected) {
  if (selected.length < 2) {
    renderShortlistSummary("");
    return;
  }
  const cacheKey = selected.map((hotel) => hotel.id).sort((a, b) => a - b).join(",");
  if (shortlistSummaryCache.has(cacheKey)) {
    renderShortlistSummary(shortlistSummaryCache.get(cacheKey));
    return;
  }
  try {
    const data = await apiPost("/api/shortlist-summary", { hotelIds: selected.map((hotel) => hotel.id) });
    shortlistSummaryCache.set(cacheKey, data.summary || "");
    // The dialog may have closed/reopened for a different shortlist by the
    // time this resolves - only apply it if the box is still asking for
    // this exact composition.
    if (document.getElementById("compareAiSummary")) renderShortlistSummary(data.summary || "");
  } catch {
    // Not configured / rate-limited / network blip - leave blank.
  }
}

async function exportPlan() {
  if (!state.currentResults.length) {
    showToast("No ranked hotels yet.", "error");
    return;
  }

  const nights = Math.max(1, Number(els.nights.value) || 1);
  const guests = Math.max(1, Number(els.guests.value) || 1);
  const exportDateRange = checkInDateRangeText(nights).replace(/^ · /, "");

  const lines = [
    "StayRank AI hotel plan",
    `City: ${els.city.value}`,
    `Trip: ${nights} night${nights > 1 ? "s" : ""} · ${guests} guest${guests > 1 ? "s" : ""}${exportDateRange ? ` · ${exportDateRange}` : ""}`,
    `Budget: $${state.currentBudget}/night`,
    `Intent: ${(() => {
      const labels = foundReasonLabels();
      return state.currentIntent.found.map((key) => labels[key] || key).join(", ") || t("generalBalancedRanking");
    })()}`,
    "",
    ...state.currentResults.slice(0, 5).flatMap((hotel, index) => [
      `${index + 1}. ${hotel.name} - ${hotel.score}/100 (confidence ${hotel.confidence}%) - $${hotel.price}/night - est. $${hotel.price * nights} total`,
      `   Area: ${hotel.neighborhood}`,
      `   Reasons: ${hotel.strengths.join("; ")}`,
      `   Tradeoff: ${hotel.risk}`,
      ""
    ]),
    ...tripPlanExportLines()
  ];
  const text = lines.join("\n");

  // Mobile browsers (where competitors lean heavily - Booking Holdings
  // reported a high-fifties percent of room nights booked via mobile app
  // this year) mostly support the native Web Share sheet, letting a
  // traveler send the plan straight to Messages/WhatsApp/etc. instead of
  // pasting from the clipboard. Desktop browsers mostly don't implement
  // it, so this falls back to the existing clipboard copy there.
  if (navigator.share) {
    try {
      await navigator.share({ title: "StayRank AI hotel plan", text });
      return;
    } catch (err) {
      if (err.name === "AbortError") return; // User closed the share sheet - not an error.
      // Any other failure (e.g. share target rejected the payload) falls
      // through to the clipboard copy below rather than leaving the user
      // with nothing.
    }
  }

  const copied = await copyTextToClipboard(text);
  showToast(
    copied ? "Top hotel plan copied to clipboard." : "Couldn't copy automatically - please copy the plan text manually.",
    copied ? "success" : "error"
  );
}

// Found via testing: `navigator.clipboard.writeText(text)` was called
// without `await` or a `.catch()`, and the "copied to clipboard" success
// toast fired unconditionally right after it - so a failed copy (denied
// permission, or Safari's stricter rule that the document must be
// currently focused) still told the traveler it worked, and also left a
// real unhandled promise rejection in the console. Now awaits the async
// Clipboard API and only reports success when it actually succeeds; falls
// back to the older `execCommand("copy")` trick (broader browser/focus
// tolerance) before giving up and honestly reporting failure, rather than
// leaving the traveler with nothing AND a false "it worked."
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback below
    }
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function tripPlanExportLines() {
  if (!state.proUnlocked || !state.tripPlan) return [];
  const lines = ["", "--- Trip Planner Pro ---"];

  if (state.tripPlan.flightEstimate) {
    const f = state.tripPlan.flightEstimate;
    // Same bug as the budget breakdown had (see describeReturnLeg call
    // there): this only ever showed the one-way fare, silently missing the
    // return leg whenever one applies. Reuse the same helper so this, the
    // flight card, and the budget breakdown all agree.
    //
    // Also same second-round fix as the budget breakdown: the fare here is
    // per-person, so a party total belongs alongside it whenever there's
    // more than one traveler on the trip.
    const returnInfo = describeReturnLeg(f);
    const exportGuestCount = Math.max(1, Number(els.guests.value) || 1);
    const partyNote =
      exportGuestCount > 1 && returnInfo
        ? ` | ~$${returnInfo.totalLow * exportGuestCount}-$${returnInfo.totalHigh * exportGuestCount} total for ${exportGuestCount} travelers`
        : "";
    lines.push(
      returnInfo
        ? `Flight, round-trip (estimate, not a live quote): from ${f.originName}, ~${f.estimatedFlightHours}h each way, ` +
            `~$${returnInfo.totalLow}-$${returnInfo.totalHigh} per person (${f.haul})${partyNote}`
        : `Flight (estimate, not a live quote): from ${f.originName}, ~${f.estimatedFlightHours}h, ` +
            `~$${f.estimatedFareLowUsd}-$${f.estimatedFareHighUsd} per person (${f.haul})`,
      ""
    );
  } else if (state.tripPlan.flightError) {
    lines.push(`Flight estimate: ${state.tripPlan.flightError}`, "");
  }

  const nights = state.tripPlan.nights || 1;
  const weatherByDay = state.tripPlan.weather || [];
  for (let i = 0; i < nights; i++) {
    const dayNum = i + 1;
    const weatherDay = weatherByDay[i];
    const weatherText = weatherDay
      ? weatherDay.isHistorical
        ? ` - ~${Math.round(weatherDay.avgTempMinC)}-${Math.round(weatherDay.avgTempMaxC)}C avg (${weatherDay.yearsUsed}-yr historical, not a forecast)`
        : weatherDay.available
        ? ` - ${weatherDay.icon} ${weatherDay.summary}, ${Math.round(weatherDay.tempMinC)}-${Math.round(weatherDay.tempMaxC)}C${weatherDay.sunset ? `, sunset ${weatherDay.sunset.slice(11)}` : ""}`
        : ` - forecast not available yet (${weatherDay.date})`
      : "";
    lines.push(`Day ${dayNum}${weatherText}`);
    const items = state.itinerary[dayNum] || [];
    if (items.length) {
      items.forEach((item) => lines.push(`   - ${item.name} (${item.categoryLabel})`));
      // Best-effort: only present once the real walking-route chain for
      // this day has actually resolved (see renderItinerary) - exporting
      // right after building a plan, before the async routes come back,
      // just omits it rather than blocking export on a live OSRM round-trip.
      const dayTotal = state.dayWalkTotals?.[dayNum];
      if (dayTotal) {
        lines.push(`   (~${Math.round(dayTotal.totalMin)} min, ${dayTotal.totalKm.toFixed(1)} km real walking today)`);
      }
    } else {
      lines.push("   - (nothing added yet)");
    }
  }
  // Same gap as the on-screen itinerary (see renderReturnDayCard): the day
  // loop above ends after the last night, with nothing marking that
  // checkout and the flight home fall on the day after it.
  const returnDate = computeReturnDate(nights);
  if (returnDate) {
    lines.push(`Travel home - ${returnDate}`, "   - Check out and head to the airport");
  }
  return lines;
}

// Real gap this app hadn't filled: competitors increasingly let a traveler
// drop a booked stay/itinerary straight into their own calendar app rather
// than just reading a text summary. A .ics (iCalendar) file is a plain
// open text format every major calendar (Google/Apple/Outlook) already
// knows how to import - zero new API, pure client-side generation from
// data already on this page. Deliberately does NOT invent a flight time:
// flights.py only ever produces an hours-long duration estimate, never a
// specific departure/arrival clock time, so a flight VEVENT would have to
// fabricate one to exist at all - skipped entirely rather than guess.
function icsEscape(text) {
  return String(text).replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\n/g, "\\n");
}

// All-day events use DATE (not DATE-TIME) values with VALUE=DATE - the
// correct iCalendar way to say "this whole day," not a specific time no
// data here actually supports.
function icsDateStamp(dateStr) {
  return dateStr.replace(/-/g, "");
}

function buildTripIcs() {
  if (!state.tripPlan || !els.tripStartDate.value) return null;
  const nights = state.tripPlan.nights || Math.max(1, Number(els.nights.value) || 1);
  const startDate = els.tripStartDate.value;
  const returnDate = computeReturnDate(nights);
  const city = els.city.value.trim();
  const hotelName = state.tripPlan.anchorHotelName;
  const stamp = icsDateStamp(new Date().toISOString().slice(0, 10)) + "T000000Z";

  const events = [];
  let uidCounter = 0;
  const nextUid = () => `stayrank-${Date.now()}-${uidCounter++}@stayrank.local`;

  events.push(
    [
      "BEGIN:VEVENT",
      `UID:${nextUid()}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDateStamp(startDate)}`,
      returnDate ? `DTEND;VALUE=DATE:${icsDateStamp(returnDate)}` : "",
      `SUMMARY:${icsEscape(hotelName ? `Stay at ${hotelName}` : `Hotel stay in ${city}`)}`,
      city ? `LOCATION:${icsEscape(city)}` : "",
      "END:VEVENT"
    ]
      .filter(Boolean)
      .join("\r\n")
  );

  for (let day = 1; day <= nights; day++) {
    const items = state.itinerary[day] || [];
    if (!items.length) continue;
    const [year, month, dayNum] = startDate.split("-").map(Number);
    const dayDate = new Date(Date.UTC(year, month - 1, dayNum + (day - 1)));
    const dayDateStr = dayDate.toISOString().slice(0, 10);
    const nextDateStr = new Date(dayDate.getTime() + 86400000).toISOString().slice(0, 10);
    const description = items.map((item) => icsEscape(`${item.name} (${item.categoryLabel})`)).join("\\n");
    events.push(
      [
        "BEGIN:VEVENT",
        `UID:${nextUid()}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDateStamp(dayDateStr)}`,
        `DTEND;VALUE=DATE:${icsDateStamp(nextDateStr)}`,
        `SUMMARY:${icsEscape(`Day ${day}: ${items.map((item) => item.name).join(", ")}`)}`,
        `DESCRIPTION:${description}`,
        city ? `LOCATION:${icsEscape(city)}` : "",
        "END:VEVENT"
      ]
        .filter(Boolean)
        .join("\r\n")
    );
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StayRank AI//Trip Planner//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR"
  ].join("\r\n");
}

// Companion to the .ics export above, same reasoning: Google Maps has no
// native "export my saved list" button, so a KML file - a plain open
// format both Google My Maps and Apple Maps already import as a pinned
// list - built from real hotel/POI coordinates already on this page (no
// new API call) fills a real gap. Exports the traveler's own shortlist
// (their curated picks, not just whatever this search happened to rank
// first) plus, when a trip plan exists, the real itinerary places too.
function xmlEscape(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
}

function kmlPlacemark(name, description, latitude, longitude) {
  return [
    "<Placemark>",
    `<name>${xmlEscape(name)}</name>`,
    description ? `<description>${xmlEscape(description)}</description>` : "",
    `<Point><coordinates>${longitude},${latitude},0</coordinates></Point>`,
    "</Placemark>"
  ]
    .filter(Boolean)
    .join("");
}

function buildShortlistKml() {
  const hotels = [...state.shortlist.values()];
  const placemarks = [];

  hotels.forEach((hotel) => {
    if (hotel.latitude == null || hotel.longitude == null) return;
    placemarks.push(kmlPlacemark(hotel.name, `$${hotel.price}/night · ${hotel.neighborhood}`, hotel.latitude, hotel.longitude));
  });

  // Real itinerary places, when a trip plan exists - same data the map and
  // day-by-day cards already render, not a second source of truth.
  if (state.proUnlocked && state.tripPlan) {
    Object.values(state.itinerary).forEach((items) => {
      (items || []).forEach((item) => {
        if (item.latitude == null || item.longitude == null) return;
        placemarks.push(kmlPlacemark(item.name, item.categoryLabel, item.latitude, item.longitude));
      });
    });
  }

  if (!placemarks.length) return null;

  const city = els.city.value.trim() || "StayRank AI trip";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "<Document>",
    `<name>${xmlEscape(city)} - StayRank AI</name>`,
    ...placemarks,
    "</Document>",
    "</kml>"
  ].join("");
}

function downloadShortlistKml() {
  const kml = buildShortlistKml();
  if (!kml) {
    showToast("Shortlist a hotel first - that's what this exports as pins.", "error");
    return;
  }
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stayrank-map-${(els.city.value || "trip").trim().toLowerCase().replace(/\s+/g, "-")}.kml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Map file downloaded - import it into Google My Maps or Apple Maps as a saved list.", "success");
}

function downloadTripIcs() {
  const ics = buildTripIcs();
  if (!ics) {
    showToast("Build a trip plan with a start date first.", "error");
    return;
  }
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stayrank-trip-${(els.city.value || "trip").trim().toLowerCase().replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Calendar file downloaded - import it into Google/Apple/Outlook Calendar.", "success");
}

// --- Trip Planner Pro -------------------------------------------------
// A paid-tier feature set (weather, points of interest, a flight-time/fare
// estimate, and a day-by-day itinerary builder) gated behind a prototype
// "Unlock Pro" toggle. Per this app's honesty-about-scope principle, that
// toggle does NOT process any real payment - no credit-card field exists
// anywhere in this codebase, intentionally: building fake payment UI would
// be actively misleading, not just an unfinished feature.

const POI_CATEGORIES = [
  { key: "nature", label: "Nature & Scenery", icon: "🏞️" },
  { key: "culture", label: "Culture & History", icon: "🏛️" },
  { key: "entertainment", label: "Entertainment & Nightlife", icon: "🎭" },
  { key: "family", label: "Family & Parks", icon: "🎡" },
  { key: "food", label: "Food & Dining", icon: "🍽️" }
];

// backend/poi.py's CATEGORIES dict (used to build every poiItem.categoryLabel)
// has the exact same 5 fixed English strings as POI_CATEGORIES.label above -
// a closed enum keyed by the same `category` value every POI item already
// carries, so this translates both the tab strip and each item's own
// category line from one lookup, same safe-enum pattern as HAUL_LABEL_KEYS/
// WEATHER_SUMMARY_KEYS above.
function poiCategoryLabels() {
  return {
    nature: t("poiCategoryNature"),
    culture: t("poiCategoryCulture"),
    entertainment: t("poiCategoryEntertainment"),
    family: t("poiCategoryFamily"),
    food: t("poiCategoryFood")
  };
}

const TRIP_PLAN_KEY = "stayrank-trip-plan";

function saveTripPlanState() {
  try {
    localStorage.setItem(TRIP_PLAN_KEY, JSON.stringify({
      proUnlocked: state.proUnlocked,
      proEmail: state.proEmail,
      startDate: els.tripStartDate.value,
      originCity: els.originCityInput.value,
      homeCurrency: els.homeCurrencyInput.value,
      tripPlan: state.tripPlan,
      itinerary: state.itinerary
    }));
  } catch {
    // Storage full/unavailable - not worth failing the plan over.
  }
}

function loadTripPlanState() {
  try {
    return JSON.parse(localStorage.getItem(TRIP_PLAN_KEY) || "null");
  } catch {
    return null;
  }
}

function setProUnlocked(unlocked) {
  state.proUnlocked = unlocked;
  els.tripPlannerLocked.hidden = unlocked;
  els.tripPlannerUnlocked.hidden = !unlocked;
  if (unlocked) {
    populateTripPlanHotelSelect();
    // Carries over the optional check-in date already picked in the main
    // search (see checkInDateRangeText) so unlocking Pro doesn't make the
    // traveler re-enter a date they already gave once - only when the trip
    // planner's own date is still blank, so it never overwrites a value
    // they deliberately set there.
    if (!els.tripStartDate.value && els.checkInDate.value) {
      els.tripStartDate.value = els.checkInDate.value;
    }
  }
  renderProBillingWidget();
  saveTripPlanState();
}

// --- Real Stripe subscription billing --------------------------------
// Trip Planner Pro used to be a local-only "prototype" toggle, honestly
// labeled as never charging anything (see git history). Once a real
// STRIPE_SECRET_KEY is configured server-side, it becomes an actual
// recurring subscription: Stripe's own hosted Checkout page collects the
// card (this app never sees it), and entitlement is re-verified against
// the backend - keyed by email, since there's no login system - rather
// than trusted from a local flag alone, so clearing localStorage can't
// silently grant free access to something a real card is being charged
// for.

function formatProPrice(cents) {
  return `$${(cents / 100).toFixed(2)}${t("proPriceSuffix")}`;
}

function renderProBillingWidget() {
  const { stripeConfigured } = state.stripeConfig;
  els.proPriceLabel.textContent = formatProPrice(state.stripeConfig.proPriceCents);

  if (!stripeConfigured) {
    // No real key configured on this server - keep the old, honest
    // "prototype toggle, nothing is charged" behavior exactly as before,
    // never a broken paid button.
    els.unlockProButton.hidden = false;
    els.unlockProButton.textContent = state.proUnlocked ? t("proUnlockedPrototype") : t("unlockPro");
    els.unlockProButton.disabled = state.proUnlocked;
    els.proSubscribeForm.hidden = true;
    els.proRestoreButton.hidden = true;
    els.proActiveBadgeRow.hidden = true;
    if (els.proBillingNote) els.proBillingNote.hidden = false;
    return;
  }

  els.unlockProButton.hidden = true;
  if (els.proBillingNote) els.proBillingNote.hidden = true;

  if (state.proUnlocked && state.proEmail) {
    els.proSubscribeForm.hidden = true;
    els.proRestoreButton.hidden = true;
    els.proActiveBadgeRow.hidden = false;
  } else {
    els.proSubscribeForm.hidden = false;
    els.proRestoreButton.hidden = false;
    els.proActiveBadgeRow.hidden = true;
    if (state.proEmail) els.proEmailInput.value = state.proEmail;
  }
}

async function checkProStatus(email) {
  const result = await apiGet(`/api/billing/status?email=${encodeURIComponent(email)}`);
  // Always the definitive answer, in both directions - corrects a stale
  // "unlocked" flag left over from a since-canceled subscription just as
  // readily as it confirms a real active one, rather than only ever
  // trusting this check when it happens to say yes.
  state.proEmail = email;
  setProUnlocked(Boolean(result.active));
  return result.active;
}

async function startProCheckout(email) {
  els.proSubscribeButton.disabled = true;
  try {
    const origin = window.location.origin + window.location.pathname;
    const { url } = await apiPost("/api/billing/checkout-session", {
      email,
      successUrl: `${origin}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}?billing=cancel`
    });
    // A real, external redirect to Stripe's own hosted Checkout page -
    // this app never builds its own card-entry form (see module comment
    // above for why), so leaving the page here is the correct next step,
    // not an error.
    window.location.href = url;
  } catch (err) {
    els.proSubscribeButton.disabled = false;
    showToast(err.message || t("proCheckoutError"), "error");
  }
}

async function openBillingPortal(email) {
  try {
    const origin = window.location.origin + window.location.pathname;
    const { url } = await apiPost("/api/billing/portal-session", { email, returnUrl: origin });
    window.location.href = url;
  } catch (err) {
    showToast(err.message || t("proPortalError"), "error");
  }
}

// Handles the redirect back from Stripe Checkout (?billing=success or
// ?billing=cancel, plus &session_id=... on success) - verifies the
// session server-side rather than trusting the query string alone, since
// a URL param is trivially forgeable and this gates a real paid feature.
async function handleBillingRedirect() {
  const params = new URLSearchParams(window.location.search);
  const billingResult = params.get("billing");
  if (!billingResult) return;

  const sessionId = params.get("session_id");
  history.replaceState(null, "", window.location.pathname);

  if (billingResult === "cancel") {
    showToast(t("proCheckoutCanceled"), "info");
    return;
  }
  if (billingResult === "success" && sessionId) {
    try {
      const result = await apiGet(`/api/billing/verify-session?session_id=${encodeURIComponent(sessionId)}`);
      if (result.active && result.email) {
        state.proEmail = result.email;
        setProUnlocked(true);
        showToast(t("proSubscribeSuccess"), "success");
      } else {
        showToast(t("proCheckoutError"), "error");
      }
    } catch (err) {
      showToast(err.message || t("proCheckoutError"), "error");
    }
  }
}

// Real walking distances only mean something relative to a specific hotel -
// lets the traveler pick which one to anchor the trip plan to.
//
// User-reported: the dropdown only ever let them pick "the first one" -
// true by design, not a rendering glitch. This used to add every
// shortlisted hotel, then bail out after adding only
// `state.currentResults[0]` (a single "top match" fallback) rather than
// the rest of the current search results, so anyone who hadn't
// shortlisted anything could only ever anchor to whichever hotel happened
// to be first in the list. Now offers every hotel from the current
// search, shortlisted or not, so "anchor to hotel" actually means picking
// any hotel, not just the top-ranked or explicitly-shortlisted ones.
function populateTripPlanHotelSelect() {
  if (!els.tripPlanHotelSelect) return;
  const previousValue = els.tripPlanHotelSelect.value;
  const candidates = [];
  const seen = new Set();
  // Found via testing: the shortlist persists across different-city
  // searches (by design - see #99 Recently Viewed / shortlist persistence),
  // but this dropdown anchors walking distances and POI lookups to a real
  // set of coordinates for the CURRENT trip's city. Without this filter, a
  // Tokyo search with an old Toronto hotel still shortlisted offered that
  // Toronto hotel as a valid anchor for a Tokyo itinerary - every distance/
  // walking-time number below would have been computed from the wrong
  // city's coordinates while showing Tokyo POIs, with nothing on screen to
  // explain the mismatch.
  const currentCity = state.currentResults[0]?.city || els.city.value.trim();
  const addCandidate = (hotel) => {
    if (!hotel || seen.has(hotel.id)) return;
    if (currentCity && hotel.city && hotel.city !== currentCity) return;
    seen.add(hotel.id);
    candidates.push(hotel);
  };
  state.shortlist.forEach(addCandidate);
  state.currentResults.forEach(addCandidate);

  if (!candidates.length) {
    els.tripPlanHotelSelect.innerHTML = `<option value="">City center (search hotels first for an exact anchor)</option>`;
    els.tripPlanHotelSelect.disabled = true;
    checkTripPlanStale();
    return;
  }
  els.tripPlanHotelSelect.disabled = false;
  // The real highest-scoring hotel, not just whichever one is first in
  // the list - currentResults can be sorted by price/rating/distance
  // instead of match score, so list position alone isn't a reliable
  // "top match" signal (the same distinction hotelCard()'s own Top Match
  // badge already has to make).
  const topScore = state.currentResults.length ? Math.max(...state.currentResults.map((hotel) => hotel.score)) : null;
  els.tripPlanHotelSelect.innerHTML = candidates
    .map((hotel) => {
      const suffix = state.shortlist.has(hotel.id) ? " (shortlisted)" : hotel.score === topScore ? " (top match)" : "";
      return `<option value="${hotel.id}">${escapeHtml(hotel.name)} - ${escapeHtml(hotel.neighborhood)}${suffix}</option>`;
    })
    .join("");
  if (candidates.some((hotel) => String(hotel.id) === previousValue)) {
    els.tripPlanHotelSelect.value = previousValue;
  }
  // Found via testing: unshortlisting the hotel a plan is anchored to
  // silently drops it from these options, and the browser then defaults
  // the select to whatever option is now first - a real value change with
  // no "change" event (it's programmatic), so checkTripPlanStale's change
  // listener never sees it. Call it directly here so that silent swap
  // still surfaces the same warning a manual switch would.
  checkTripPlanStale();
}

function renderTripPlanAnchorNote(tripPlan) {
  if (!els.tripPlanAnchorNote) return;
  els.tripPlanAnchorNote.hidden = false;
  const base = tripPlan.anchorHotelName
    ? `Built around ${tripPlan.anchorHotelName} - distances and walking times below are measured from there.`
    : `Built around central ${tripPlan.cityName} - no specific hotel picked, so distances are approximate. Shortlist a hotel and rebuild for exact numbers.`;
  // Real count from the same Overpass query already fetched for the Food &
  // Dining tab below - not a new lookup, just surfacing a number that was
  // previously only visible after clicking into that tab. Skipped when the
  // POI fetch itself failed/is still loading rather than implying "zero
  // restaurants nearby" for what's really "we don't know yet".
  const foodCount = tripPlan.pointsOfInterest?.food?.length;
  // backend/poi.py's MAX_PER_CATEGORY caps this list at 10 even when more
  // exist - showing "10" as if it were the full real count would be
  // misleading the exact way this app's honesty principle exists to avoid,
  // so a count that hits the cap gets a "+" rather than presented as exact.
  const FOOD_LIST_CAP = 10;
  const foodNote =
    foodCount != null
      ? ` ${foodCount}${foodCount >= FOOD_LIST_CAP ? "+" : ""} real restaurant${foodCount === 1 ? "" : "s"}/cafe${foodCount === 1 ? "" : "s"} found within ~900m (OpenStreetMap).`
      : "";
  els.tripPlanAnchorNote.textContent = base + foodNote;
}

// Found via testing: changing the nights input after a trip plan is built
// updates the always-visible "Hotel cost" header stat immediately (it reads
// the live input), but the itinerary/weather/budget panels below keep
// showing data fetched for the OLD night count - two different night counts
// visible on the same page at once, with nothing telling the traveler why.
// Same class of issue as the flight-total bugs, different mechanism. Origin
// city and start date have the identical gap (they drive the flight
// estimate and weather/return-date respectively but had no change listener
// at all), so this checks all three, not just nights. The anchor-hotel
// select had the exact same gap (found via the same audit): switching it
// after building silently left every distance/walking-route/anchor-marker
// on the map showing the OLD hotel with no indication anything was stale.
// User-reported real gap: the Trip Planner's own input row only asks for
// "Trip start date" and "Flying from" - nights and destination are read
// silently from the search form above (never re-shown here), and the
// return date/round-trip framing only ever appeared buried inside the
// flight estimate card AFTER a full ~15s plan build (weather + POIs +
// routing all chained). A traveler filling out just these two fields had
// no way to confirm what they were about to build a plan for. This live
// summary line answers all four questions ("how long, fly from where, fly
// to where, both directions") up front, using only values already on the
// page - no new fields, no new backend call.
function updateTripPlanSummary() {
  const line = document.getElementById("tripPlanSummaryLine");
  if (!line) return;
  const city = els.city.value.trim();
  const nights = Math.max(1, Number(els.nights.value) || 1);
  const start = els.tripStartDate.value;
  const origin = els.originCityInput.value.trim();

  // User-reported: the Trip Planner panel asked for a start date and a
  // departure city but never explicitly asked how many nights or showed
  // the destination it was actually planning for - both were only ever
  // set on the OTHER hotel-search panel elsewhere on the page, with
  // nothing here to tell a traveler that's where "nights" was coming
  // from. Nights is now a real input in THIS panel (two-way synced with
  // els.nights, the single source of truth, so it never drifts out of
  // sync with the main search); destination isn't independently editable
  // here (it would just be a second, potentially-desynced copy of the
  // same city search everything else on the page already depends on) but
  // is now shown explicitly, not left implicit in the anchor-hotel
  // dropdown's option text.
  if (els.tripPlanNightsInput && document.activeElement !== els.tripPlanNightsInput) {
    els.tripPlanNightsInput.value = String(nights);
  }
  if (els.tripPlanDestinationDisplay) {
    els.tripPlanDestinationDisplay.value = city || "";
  }

  const parts = [];
  if (city) {
    if (start) {
      const startDate = new Date(`${start}T00:00:00`);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + nights);
      // Uses the app's own selected language (not the browser/OS locale
      // via toLocaleDateString(undefined, ...)) - found by testing with a
      // browser locale that didn't match the app's language selector: the
      // dates rendered in the browser's locale instead of whichever
      // language the traveler had actually picked in the app, a mismatch
      // nothing else on this page has (every other piece of UI text
      // follows the language selector, not the OS).
      const localeMap = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT", zh: "zh-CN" };
      const locale = localeMap[getCurrentLang()] || "en-US";
      const fmt = (d) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });
      parts.push(`${nights} night${nights === 1 ? "" : "s"} in ${city}: ${fmt(startDate)} → ${fmt(endDate)} (arrive/depart)`);
    } else {
      parts.push(`${nights} night${nights === 1 ? "" : "s"} in ${city} - pick a start date above to see exact arrival/departure dates`);
    }
  }
  parts.push(
    origin
      ? `round-trip flights: ${origin} → ${city || "your destination"} → ${origin}`
      : "add a departure city above to include round-trip flight estimates"
  );
  line.textContent = parts.join(" · ");
}

function checkTripPlanStale() {
  updateTripPlanSummary();
  if (!els.tripPlanStaleNote) return;
  if (!state.tripPlan) {
    els.tripPlanStaleNote.hidden = true;
    return;
  }
  const liveNights = Math.max(1, Number(els.nights.value) || 1);
  const reasons = [];
  if (liveNights !== state.tripPlan.nights) reasons.push(`nights to ${liveNights} (built for ${state.tripPlan.nights})`);
  // Plans persisted before this check existed won't have these fields -
  // skip comparing them rather than risk a false "stale" warning on load
  // for a plan nothing has actually changed about.
  if ("builtWithStartDate" in state.tripPlan) {
    if (els.tripStartDate.value !== state.tripPlan.builtWithStartDate) reasons.push("the start date");
    if (els.originCityInput.value.trim() !== state.tripPlan.builtWithOriginCity.trim()) reasons.push("where you're flying from");
  }
  if ("builtWithHotelId" in state.tripPlan && els.tripPlanHotelSelect && !els.tripPlanHotelSelect.disabled) {
    const liveHotelId = els.tripPlanHotelSelect.value || null;
    if (liveHotelId !== state.tripPlan.builtWithHotelId) reasons.push("the anchor hotel");
  }

  if (reasons.length) {
    els.tripPlanStaleNote.textContent = `You changed ${reasons.join(" and ")} since this plan was built - rebuild to update the itinerary, weather, and budget below.`;
    els.tripPlanStaleNote.hidden = false;
  } else {
    els.tripPlanStaleNote.hidden = true;
  }
}

function wikipediaLink(tag) {
  if (!tag || !tag.includes(":")) return "";
  const [lang, ...rest] = tag.split(":");
  const title = rest.join(":");
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

// A verifiable source link for every place that has one, not just those
// with a full Wikipedia article - falls back to the place's own Wikidata
// item (a real, citable record) when that's all that exists, rather than
// giving up and showing nothing.
// Found via user report: most small/local POIs (viewpoints, minor parks,
// neighborhood eateries) never get a Wikipedia or Wikidata entry at all -
// that meant no link rendered for them whatsoever, leaving a name and
// nothing to click to actually learn anything about that specific real
// place. A Google Maps search using the place's own real name plus the
// real coordinates already fetched from OpenStreetMap is always
// available and fabricates nothing - it's just a navigation link to an
// external source, and for small local spots it's usually more useful
// than an encyclopedia entry anyway (photos, hours, reviews).
// User-reported, live, with a screenshot: the Google Maps link for
// "Gardens of Justice" (Toronto) 404'd with "Google Maps couldn't find
// Gardens of Justice @43.6527307,-79.386857" - Google was treating the
// ENTIRE "name @lat,lon" string as one literal search phrase, not as a
// name plus a coordinate bias. Confirmed against Google's own Maps URLs
// documentation before fixing: the `query` parameter accepts a place
// name/address OR comma-separated "lat,lng" coordinates - never a hybrid
// of both crammed into one string, which is exactly what the "@lat,lon"
// suffix was doing (that syntax only means something in the browser's
// own address bar after a live search, not as a query param value).
// Fixed by passing coordinates alone, which reliably drops a real pin at
// the real place's real location every time - the place's actual name is
// already shown right next to this link in the app's own UI, so losing
// it from inside the Google Maps URL itself costs nothing.
function sourceLink(item) {
  const wiki = wikipediaLink(item.wikipedia);
  if (wiki) return { url: wiki, label: "Wikipedia" };
  if (item.wikidata) return { url: `https://www.wikidata.org/wiki/${encodeURIComponent(item.wikidata)}`, label: "Wikidata" };
  if (item.latitude != null && item.longitude != null) {
    const query = encodeURIComponent(`${item.latitude},${item.longitude}`);
    return { url: `https://www.google.com/maps/search/?api=1&query=${query}`, label: t("sourceViewOnGoogleMaps") };
  }
  return null;
}

// `haul` is one of exactly 3 fixed backend-computed values (see
// backend/flights.py's HAUL_THRESHOLDS) - a closed enum, so a plain
// lookup translates it safely without risking a mismatch the way
// free-text backend strings would.
const HAUL_LABEL_KEYS = { "short-haul": "haulShort", "medium-haul": "haulMedium", "long-haul": "haulLong" };

function renderFlightEstimate(flightEstimate, flightError) {
  if (!flightEstimate && !flightError) {
    els.flightEstimateCard.hidden = true;
    els.flightEstimateCard.innerHTML = "";
    return;
  }
  els.flightEstimateCard.hidden = false;
  if (flightError) {
    els.flightEstimateCard.innerHTML = `<h2>${t("flightEstimateHeading")}</h2><p class="subline">${flightError}</p>`;
    return;
  }
  const jetLag = describeJetLag(flightEstimate.timeDifferenceHours);
  const returnInfo = describeReturnLeg(flightEstimate);
  // Found via testing: every fare figure here (and in the budget
  // breakdown below) was a single-passenger price with `guests` sitting
  // right there on the page, unused - correct convention for the
  // per-person numbers themselves (Kayak/Google Flights do the same), but
  // silently misleading as soon as more than one traveler is on the trip
  // and nothing on screen says "per person." Keeps the per-person figures
  // as the primary numbers (still the most directly comparable to a real
  // search) but adds an explicit party total when guests > 1, and the
  // budget breakdown's own flight line - the number meant to answer "what
  // will this trip actually cost" - multiplies for real.
  const guestCount = Math.max(1, Number(els.guests.value) || 1);
  const partyTotal = guestCount > 1 && returnInfo ? { low: returnInfo.totalLow * guestCount, high: returnInfo.totalHigh * guestCount } : null;
  const haulLabel = t(HAUL_LABEL_KEYS[flightEstimate.haul] || "haulLong");
  els.flightEstimateCard.innerHTML = `
    <h2>${t("flightEstimateHeading")}</h2>
    <p class="subline">${t("flightEstimateFrom").replace("{origin}", escapeHtml(flightEstimate.originName)).replace("{km}", flightEstimate.distanceKm.toLocaleString()).replace("{haul}", haulLabel)}</p>
    <div class="flight-estimate-numbers">
      <div><span class="metric-label">${returnInfo ? t("flightOutboundTime") : t("flightEstimatedTime")}</span><strong>${flightEstimate.estimatedFlightHours}h</strong></div>
      <div><span class="metric-label">${returnInfo ? t("flightOutboundFare") : t("flightEstimatedFare")}</span><strong>$${flightEstimate.estimatedFareLowUsd}-$${flightEstimate.estimatedFareHighUsd}</strong></div>
      ${jetLag ? `<div><span class="metric-label">${t("flightTimeDifference")}</span><strong>${jetLag}</strong></div>` : ""}
      ${returnInfo ? `<div><span class="metric-label">${t("flightReturnLeg").replace("{date}", returnInfo.date)}</span><strong>~$${returnInfo.fareLow}-$${returnInfo.fareHigh}</strong></div>` : ""}
      ${returnInfo ? `<div><span class="metric-label">${t("flightRoundTripTotal")}</span><strong>$${returnInfo.totalLow}-$${returnInfo.totalHigh}</strong></div>` : ""}
      ${partyTotal ? `<div><span class="metric-label">${t("flightTotalForTravelers").replace("{n}", guestCount)}</span><strong>$${partyTotal.low}-$${partyTotal.high}</strong></div>` : ""}
    </div>
    <p class="subline"><em>${t("flightEstimateDisclaimer").replace("{extra}", returnInfo ? t("flightReturnLegCaveat") : "")}</em></p>
  `;
}

// Split out of describeReturnLeg so the itinerary can show a real "you fly
// home on this date" entry even when there's no flight estimate to attach
// a fare to (flightError, or the LLM/distance lookup simply not run yet) -
// the date itself only needs the start date and night count, both already
// on the page.
function computeReturnDate(nights) {
  const startDateStr = els.tripStartDate.value;
  if (!startDateStr || !nights) return null;
  // Found via testing: `new Date(startDateStr + "T00:00:00")` parses in
  // local time, but `.toISOString()` reads back in UTC - in any timezone
  // ahead of UTC (most of Asia/Europe/Australia) that silently shows a
  // return date one day earlier than the trip's actual last night. Doing
  // the arithmetic entirely in UTC (never touching local time) avoids it.
  const [year, month, day] = startDateStr.split("-").map(Number);
  const returnDate = new Date(Date.UTC(year, month - 1, day + nights));
  if (Number.isNaN(returnDate.getTime())) return null;
  return returnDate.toISOString().slice(0, 10);
}

// User feedback: the flight card only ever asked/showed the outbound leg -
// a real trip has a "back time" too. Computed client-side from the trip's
// own start date + night count (no new data needed) rather than fabricating
// a genuinely different return fare - real round-trip pricing isn't simply
// 2x one-way, so this is explicitly labeled as an approximation, not hidden
// as if it were a precise number.
function describeReturnLeg(flightEstimate) {
  const date = computeReturnDate(state.tripPlan?.nights);
  if (!date) return null;
  return {
    date,
    fareLow: flightEstimate.estimatedFareLowUsd,
    fareHigh: flightEstimate.estimatedFareHighUsd,
    totalLow: flightEstimate.estimatedFareLowUsd * 2,
    totalHigh: flightEstimate.estimatedFareHighUsd * 2
  };
}

function describeJetLag(hours) {
  if (hours == null) return "";
  if (Math.abs(hours) < 0.5) return t("jetLagSameTimeZone");
  const rounded = Math.round(Math.abs(hours) * 2) / 2;
  return t(hours > 0 ? "jetLagAhead" : "jetLagBehind").replace("{n}", rounded);
}

function renderDestinationTimezone(destinationTimezone) {
  if (!els.destinationTimezoneLine) return;
  if (!destinationTimezone || !destinationTimezone.timezone) {
    els.destinationTimezoneLine.textContent = "";
    return;
  }
  const offsetHours = destinationTimezone.utcOffsetSeconds / 3600;
  const sign = offsetHours >= 0 ? "+" : "";
  let text = t("localTimeZoneLine").replace("{tz}", destinationTimezone.timezone).replace("{offset}", `${sign}${offsetHours}`);
  // Real elevation from the same Open-Meteo response already fetched for
  // timezone - free, no extra call, previously discarded entirely. 2,500m
  // is the altitude commonly cited (WHO/CDC travel health guidance) as
  // where altitude illness risk becomes real for unacclimatized
  // travelers - flagged as a practical heads-up, not medical advice, and
  // only ever shown for destinations that actually clear that real bar.
  const elevationM = destinationTimezone.elevationM;
  if (elevationM != null && elevationM >= 2500) {
    text += t("elevationNote").replace("{m}", Math.round(elevationM));
  }
  els.destinationTimezoneLine.textContent = text;
}

// day.summary is one of exactly 24 fixed backend-computed strings (see
// backend/weather.py's _WMO_CODES, keyed by WMO weather code) - a closed
// enum, same safe-lookup pattern as HAUL_LABEL_KEYS above. Falls back to
// the raw English string for any value not in this map (matches this
// app's existing "unrecognized code still renders as its raw code rather
// than being silently dropped" convention, e.g. meal-plan board codes).
const WEATHER_SUMMARY_KEYS = {
  "Clear sky": "weatherClearSky",
  "Mostly clear": "weatherMostlyClear",
  "Partly cloudy": "weatherPartlyCloudy",
  Overcast: "weatherOvercast",
  Fog: "weatherFog",
  "Light drizzle": "weatherLightDrizzle",
  Drizzle: "weatherDrizzle",
  "Dense drizzle": "weatherDenseDrizzle",
  "Freezing drizzle": "weatherFreezingDrizzle",
  "Light rain": "weatherLightRain",
  Rain: "weatherRain",
  "Heavy rain": "weatherHeavyRain",
  "Freezing rain": "weatherFreezingRain",
  "Light snow": "weatherLightSnow",
  Snow: "weatherSnow",
  "Heavy snow": "weatherHeavySnow",
  "Snow grains": "weatherSnowGrains",
  "Light showers": "weatherLightShowers",
  Showers: "weatherShowers",
  "Violent showers": "weatherViolentShowers",
  "Snow showers": "weatherSnowShowers",
  Thunderstorm: "weatherThunderstorm",
  "Thunderstorm with hail": "weatherThunderstormHail",
  Unknown: "weatherUnknown"
};
function weatherSummaryLabel(summary) {
  const key = WEATHER_SUMMARY_KEYS[summary];
  return key ? t(key) : summary;
}

function renderWeatherStrip(weatherDays, weatherError) {
  if (!weatherDays && !weatherError) {
    els.weatherPanel.hidden = true;
    els.weatherDays.innerHTML = "";
    return;
  }
  els.weatherPanel.hidden = false;
  if (weatherError) {
    els.weatherDays.innerHTML = `<p class="subline">${weatherError}</p>`;
    return;
  }
  els.weatherDays.innerHTML = weatherDays
    .map((day, index) => {
      // Real historical averages (Open-Meteo's archive, past-year same
      // dates) for trip days beyond the ~14-day forecast horizon - always
      // labeled as historical, never as if it were an actual forecast for
      // this trip. Genuinely useful for the huge share of trips booked
      // more than two weeks out, which previously just saw "not available".
      if (day.isHistorical) {
        return `
          <div class="weather-day weather-day-historical">
            <span class="weather-day-label">${t("weatherDayLabel").replace("{n}", index + 1).replace("{date}", day.date)}</span>
            <span class="subline">📊 ${t("weatherHistoricalAvg").replace("{years}", day.yearsUsed)}</span>
            <span>${Math.round(day.avgTempMinC)}&deg;-${Math.round(day.avgTempMaxC)}&deg;C avg</span>
            <span class="subline">${t("weatherRainedHistory").replace("{pct}", day.rainedFractionPercent).replace("{years}", day.yearsUsed)}</span>
          </div>
        `;
      }
      if (!day.available) {
        return `
          <div class="weather-day weather-day-unavailable">
            <span class="weather-day-label">${t("weatherDayLabelShort").replace("{n}", index + 1)}</span>
            <span class="subline">${t("weatherNoData").replace("{date}", day.date)}</span>
          </div>
        `;
      }
      // Real sunset time, same request as the rest of this day's forecast
      // (zero extra cost) - useful for planning how late an evening
      // activity can run before it gets dark, something this app had no
      // real data for at all before. Already local time (timezone=auto on
      // the request), so slicing the ISO string is enough - no Date math.
      const sunsetLine = day.sunset ? `<span class="subline">🌇 ${t("weatherSunset").replace("{time}", day.sunset.slice(11))}</span>` : "";
      return `
        <div class="weather-day">
          <span class="weather-day-label">${t("weatherDayLabel").replace("{n}", index + 1).replace("{date}", day.date)}</span>
          <span class="weather-icon" aria-hidden="true">${day.icon}</span>
          <span>${weatherSummaryLabel(day.summary)}</span>
          <span>${Math.round(day.tempMinC)}&deg;-${Math.round(day.tempMaxC)}&deg;C</span>
          <span class="subline">${t("weatherPrecipChance").replace("{pct}", day.precipitationChance)}</span>
          ${sunsetLine}
        </div>
      `;
    })
    .join("");
}

function renderPoiTabs() {
  // aria-pressed on a plain button group, not role="tab"/aria-selected -
  // matches the existing filter-strip/chip-row pattern elsewhere in this
  // app, which is fully keyboard-operable via Tab+Enter without requiring
  // the arrow-key navigation a real ARIA tablist implies but this doesn't
  // implement.
  const labels = poiCategoryLabels();
  els.poiTabs.innerHTML = POI_CATEGORIES.map(
    (cat) => `
      <button class="poi-tab${cat.key === state.poiActiveCategory ? " active" : ""}" type="button"
        data-category="${cat.key}" aria-pressed="${cat.key === state.poiActiveCategory}">
        ${cat.icon} ${labels[cat.key] || cat.label}
      </button>
    `
  ).join("");
}

function renderPoiList() {
  if (!state.tripPlan) {
    els.poiList.innerHTML = "";
    return;
  }
  // Bug found via user report: this used to check `!pointsOfInterest`
  // FIRST and bail with an empty list - but pointsOfInterest is legitimately
  // null whenever poiError is set (the backend never populates one when the
  // other failed), so a real failure (e.g. the public Overpass server
  // timing out under load) rendered as a silent blank panel, indistinguishable
  // from "still loading" or "nothing here." Check the error first so it's
  // never swallowed, and offer a one-click retry instead of a dead end.
  if (state.tripPlan.poiError) {
    els.poiList.innerHTML = `
      <p class="subline">${state.tripPlan.poiError}</p>
      <button type="button" id="retryPoiButton" class="secondary-button">${t("poiTryAgain")}</button>
    `;
    return;
  }
  if (!state.tripPlan.pointsOfInterest) {
    els.poiList.innerHTML = `<p class="subline">${t("poiPlacesNotLoaded")}</p>`;
    return;
  }
  const items = state.tripPlan.pointsOfInterest[state.poiActiveCategory] || [];
  const nights = state.tripPlan.nights || 1;
  if (!items.length) {
    els.poiList.innerHTML = `<p class="subline">${t("poiNoMappedSpots")}</p>`;
    return;
  }
  const category = state.poiActiveCategory;
  const categoryLabels = poiCategoryLabels();
  els.poiList.innerHTML = items
    .map((poiItem, index) => {
      const source = sourceLink(poiItem);
      const icon = POI_MAP_ICONS[poiItem.category] || "📍";
      const thumbId = `poi-thumb-${category}-${index}`;
      const descId = `poi-desc-${category}-${index}`;
      const distance = formatDistanceKm(poiItem.distanceFromHotelKm);
      const thumbContent = poiItem.photoUrl ? `<img src="${poiItem.photoUrl}" alt="" loading="lazy" />` : icon;
      return `
        <div class="poi-item">
          <div class="itinerary-item-thumb" id="${thumbId}" aria-hidden="true">${thumbContent}</div>
          <div class="itinerary-item-body">
            <strong>${poiItem.name}</strong>
            <span class="subline">${categoryLabels[poiItem.category] || poiItem.categoryLabel}</span>
            ${poiItem.cuisine ? `<span class="subline">${poiItem.cuisine.split(";").join(", ")}</span>` : ""}
            ${distance ? `<span class="subline">📍 ${t("poiDistanceFromHotel").replace("{distance}", distance)}</span>` : ""}
            <p class="itinerary-item-desc" id="${descId}"></p>
            ${source ? `<a href="${source.url}" target="_blank" rel="noreferrer" class="subline">${source.label}</a>` : ""}
          </div>
          <div class="poi-day-buttons">
            ${Array.from(
              { length: nights },
              (_, dayIndex) => `
                <button type="button" class="poi-add-button" data-poi-category="${state.poiActiveCategory}"
                  data-poi-index="${index}" data-day="${dayIndex + 1}">${t("poiAddDay").replace("{n}", dayIndex + 1)}</button>
              `
            ).join("")}
          </div>
        </div>
      `;
    })
    .join("");

  // Same after-render, non-blocking enrichment pattern as the itinerary
  // cards - only for the currently visible category tab, not all ~50
  // fetched places at once.
  items.forEach((poiItem, index) => {
    fetchWikipediaSummary(poiItem.wikipedia, poiItem.wikidata, poiItem.name).then((summary) => {
      if (!summary) return;
      if (summary.thumbnailUrl && !poiItem.photoUrl) {
        const thumbEl = document.getElementById(`poi-thumb-${category}-${index}`);
        if (thumbEl) thumbEl.innerHTML = `<img src="${summary.thumbnailUrl}" alt="" loading="lazy" />`;
      }
      if (summary.extract) {
        const descEl = document.getElementById(`poi-desc-${category}-${index}`);
        if (descEl) descEl.textContent = summary.extract;
      }
    });
  });
}

// Real photo + a real one-line description for places, when available -
// Wikipedia's REST summary endpoint is free, no key, and CORS-open
// (verified live), and its "extract" field is written to be a plain,
// factual summary already - exactly the "comprehensive but not
// complicated" introduction this needs, with zero invention on our part.
// Not every place has a wikipedia tag (most small parks/restaurants won't),
// and this never invents a description or photo for ones that don't - it
// just omits both rather than showing generic stock text pretending to be
// this specific place.
const wikiSummaryCache = {};
const wikidataEntityCache = {};

// This app is English-language throughout, but OSM's `wikipedia` tag often
// points at the LOCAL edition (e.g. `ja:` for a Tokyo museum) - fine for the
// link, useless for an English description. Wikidata's sitelinks are
// language-neutral, so when a wikidata ID is available this resolves the
// real English Wikipedia title first; if there isn't an English article (or
// no wikidata ID at all), it falls back to whatever language the place
// actually has rather than showing nothing.
//
// Also pulls Wikidata's P18 "image" claim - a real photo an editor
// deliberately attached to THIS specific entity, not a location-proximity
// guess (Commons' geosearch-by-coordinate was considered and rejected: it
// returns whatever's geotagged nearby - a bank branch, a passing vehicle -
// with no guarantee the photo is actually of the place in question, which
// would be actively misleading despite being a "real" photo). P18 exists for
// many landscape/viewpoint and smaller building entries that never get a
// full Wikipedia write-up in any language, so this is the broader real-photo
// source for exactly those cases.
async function fetchWikidataEntity(wikidataId) {
  if (!wikidataId) return null;
  if (wikidataId in wikidataEntityCache) return wikidataEntityCache[wikidataId];
  try {
    const response = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(wikidataId)}&props=sitelinks%7Cclaims&format=json&origin=*`
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
    const data = await response.json();
    const entity = data.entities?.[wikidataId];
    const enTitle = entity?.sitelinks?.enwiki?.title || null;
    const imageFilename = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
    const result = {
      enTitle,
      imageUrl: imageFilename
        ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFilename)}?width=330`
        : null
    };
    wikidataEntityCache[wikidataId] = result;
    return result;
  } catch {
    wikidataEntityCache[wikidataId] = null;
    return null;
  }
}

async function fetchWikipediaSummaryFor(lang, title) {
  const response = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!response.ok) throw new Error(`status ${response.status}`);
  const data = await response.json();
  return {
    thumbnailUrl: data.thumbnail?.source || null,
    extract: data.extract ? truncateText(data.extract, 160) : null
  };
}

// Live user report: real, notable landmarks (Toronto's Casa Loma - a real
// castle-museum, not a fabricated example) were showing zero description
// because OSM simply never tagged that node with wikipedia= or wikidata=
// (a mapper data-completeness gap, not something wrong with the earlier
// lookups). Verified live before building this: Wikipedia's free, keyless
// opensearch endpoint resolves "Casa Loma" -> the real Casa Loma article,
// while correctly returning NOTHING for generic OSM-derived names like
// "Podium Green Roof" or "Gardens of Justice" that aren't real Wikipedia
// subjects - so this fallback only ever fires when it can, never invents
// a match. Deliberately conservative on the match itself too: opensearch
// is a fuzzy ranked search, not an exact lookup, so a top hit is only
// trusted when the name and article title are (near-)equal - a
// "kinda related" result is treated the same as no result, since showing
// a stranger's landmark description under this place's name would be
// actively misleading, not just incomplete.
async function searchWikipediaByTitle(name) {
  if (!name) return null;
  try {
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=1&namespace=0&format=json&origin=*`
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
    const [, titles] = await response.json();
    const title = titles?.[0];
    if (!title) return null;
    const a = name.toLowerCase().trim();
    const b = title.toLowerCase().trim();
    const closeMatch = a === b || (a.length >= 4 && (a.includes(b) || b.includes(a)));
    return closeMatch ? title : null;
  } catch {
    return null;
  }
}

async function fetchWikipediaSummary(wikipediaTag, wikidataId, fallbackName) {
  if (!wikipediaTag && !wikidataId && !fallbackName) return null;
  const cacheKey = `${wikipediaTag || ""}|${wikidataId || ""}|${fallbackName || ""}`;
  if (cacheKey in wikiSummaryCache) return wikiSummaryCache[cacheKey];

  let summary = null;
  if (wikipediaTag && wikipediaTag.includes(":")) {
    const [lang, ...rest] = wikipediaTag.split(":");
    const title = rest.join(":");
    try {
      if (lang !== "en" && wikidataId) {
        const wd = await fetchWikidataEntity(wikidataId);
        summary = wd?.enTitle ? await fetchWikipediaSummaryFor("en", wd.enTitle) : await fetchWikipediaSummaryFor(lang, title);
      } else {
        summary = await fetchWikipediaSummaryFor(lang, title);
      }
    } catch {
      summary = null;
    }
  } else if (wikidataId) {
    // Found via a live user report of empty descriptions: plenty of real
    // places carry a `wikidata` tag in OSM but no `wikipedia` tag at all
    // (mapped straight to the entity, never to a specific article edition)
    // - this whole function used to only ever look up a description when
    // wikipediaTag was present, so these got NO description whatsoever,
    // even when a real English Wikipedia article exists for them.
    // Reproduced live: Kyoto's "Ryozen Museum of History" has
    // wikipedia=null, wikidata="Q3329667", and a real enwiki article - but
    // fetchWikidataEntity(), already called below purely for its P18
    // photo, was already resolving enTitle="Ryozen Museum of History" and
    // just never using it for anything but the image. Reusing that same
    // lookup here to also fetch the real article summary, not just skip
    // straight to the photo-only fallback.
    try {
      const wd = await fetchWikidataEntity(wikidataId);
      if (wd?.enTitle) summary = await fetchWikipediaSummaryFor("en", wd.enTitle);
    } catch {
      summary = null;
    }
  }

  // No photo yet (either no Wikipedia article at all, or the article had no
  // lead image) - fall back to Wikidata's own per-entity photo. Only ever
  // used for the photo, never the description text.
  if (!summary?.thumbnailUrl && wikidataId) {
    const wd = await fetchWikidataEntity(wikidataId);
    if (wd?.imageUrl) {
      summary = { thumbnailUrl: wd.imageUrl, extract: summary?.extract || null };
    }
  }

  // Last resort when nothing above produced a PHOTO yet: try resolving a
  // real article purely from its name (see searchWikipediaByTitle above
  // for why this is safe from fabrication - a near-exact title match is
  // required, so this can only ever find a real match or nothing).
  //
  // User feedback: itinerary photos matter a lot, so this used to only
  // fire when OSM tagged the place with NEITHER wikipedia= nor wikidata=
  // at all - but plenty of real places DO carry one of those tags and
  // still end up with no photo (a ja: article with no lead image, or a
  // wikidata entity with no enwiki sitelink and no P18 photo claim - both
  // reproduced live this session, e.g. Kanda Yabu Soba's real ja:
  // Wikipedia + wikidata tags). Those cases used to be treated as "already
  // tried, give up" even though the name-based search is a completely
  // independent, equally-safe path that might still find a real photo.
  // Now retries by name whenever a photo is still missing, regardless of
  // what OSM did or didn't tag - strictly additive to photo coverage,
  // never removes a real result already found.
  if (!summary?.thumbnailUrl && fallbackName) {
    try {
      const title = await searchWikipediaByTitle(fallbackName);
      if (title) {
        const nameResult = await fetchWikipediaSummaryFor("en", title);
        summary = {
          thumbnailUrl: summary?.thumbnailUrl || nameResult?.thumbnailUrl || null,
          extract: summary?.extract || nameResult?.extract || null
        };
      }
    } catch {
      // Leave summary as whatever it already was (likely null) - a failed
      // best-effort name search is not a real error worth surfacing.
    }
  }

  wikiSummaryCache[cacheKey] = summary;
  return summary;
}

function truncateText(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxLen)}…`;
}

// Real distances only, never a routed-time guess dressed up as one - shown
// in meters under a km since "0.3 km" reads worse than "300 m" for a short
// walk, which is most of these.
function formatDistanceKm(km) {
  if (km == null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Lazily upgrades a straight-line distance to a real routed walking time via
// OSRM (backend/routing.py) - never blocks the card's initial render, and
// silently keeps the straight-line distance already shown if routing fails
// (a shared public demo server rate-limiting under load is expected, not
// treated as a hard error the traveler needs to see).
async function fetchWalkingRoute(fromLat, fromLon, toLat, toLon) {
  try {
    return await apiPost("/api/walking-route", {
      fromLatitude: fromLat,
      fromLongitude: fromLon,
      toLatitude: toLat,
      toLongitude: toLon
    });
  } catch {
    return null;
  }
}

function itineraryItemCard(item, dayNum, itemIndex) {
  const icon = POI_MAP_ICONS[item.category] || "📍";
  const cuisine = item.cuisine ? `<span class="subline">${item.cuisine.split(";").join(", ")}</span>` : "";
  const source = sourceLink(item);
  const thumbId = `itin-thumb-${dayNum}-${itemIndex}`;
  const descId = `itin-desc-${dayNum}-${itemIndex}`;
  const distanceId = `itin-distance-${dayNum}-${itemIndex}`;
  const initialDistance = formatDistanceKm(item.distanceFromHotelKm);
  // A mapper-curated OSM `image` tag (see poi.py's _resolve_osm_image_tag)
  // is already resolved server-side with zero extra network round-trips -
  // shown immediately rather than waiting on the async Wikipedia/Wikidata
  // lookup below, which only fills in when this isn't available.
  const thumbContent = item.photoUrl ? `<img src="${item.photoUrl}" alt="" loading="lazy" />` : icon;
  return `
    <li class="itinerary-item-card">
      <div class="itinerary-item-thumb" id="${thumbId}" aria-hidden="true">${thumbContent}</div>
      <div class="itinerary-item-body">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="subline">${escapeHtml(item.categoryLabel)}</span>
        ${cuisine}
        ${initialDistance ? `<span class="subline" id="${distanceId}">📍 ${initialDistance} from your hotel (straight-line)</span>` : ""}
        <p class="itinerary-item-desc" id="${descId}"></p>
        ${source ? `<a href="${source.url}" target="_blank" rel="noreferrer" class="subline">${source.label}</a>` : ""}
      </div>
      <button type="button" class="itinerary-remove" data-day="${dayNum}" data-item-index="${itemIndex}"
        aria-label="Remove ${escapeHtml(item.name)} from Day ${dayNum}">&times;</button>
    </li>
  `;
}

// Found via user feedback: with an N-night stay, the itinerary built one
// card per night (Day 1..N) and then just stopped - but checkout and the
// flight home happen on the day AFTER the last night (start date + N),
// which never had a card of its own. The flight estimate card mentioned a
// return leg off to the side, but the day-by-day plan itself gave no hint
// the trip includes a travel day at all. Appends one more card for it,
// with a real fare only when a flight estimate actually exists (flightError
// or no plan-relevant flight data still shows the date on its own rather
// than hiding the day entirely).
function renderReturnDayCard(nights) {
  const returnDate = computeReturnDate(nights);
  if (!returnDate) return "";
  const flightEstimate = state.tripPlan.flightEstimate;
  const returnLeg = flightEstimate ? describeReturnLeg(flightEstimate) : null;
  const fareLine = returnLeg
    ? `<span class="subline">✈️ Return flight estimate: ~$${returnLeg.fareLow}-$${returnLeg.fareHigh} (economy, not a live quote)</span>`
    : "";
  return `
    <div class="itinerary-day itinerary-return-day">
      <div class="itinerary-day-head">
        <strong>Travel home</strong>
        <span class="subline">${returnDate}</span>
      </div>
      <p class="subline">Check out and head to the airport.</p>
      ${fareLine}
    </div>
  `;
}

// Competitor research: Wanderlog's Pro tier includes a "Google Maps
// export" and route optimization for a day's stops - this app already
// matches the optimization half honestly (real nearest-food pairing, real
// walking totals above), but only ever linked out per-place, never as one
// whole-day route. Builds a real multi-stop Google Maps directions URL
// (hotel -> stop 1 -> stop 2 -> ... in the day's actual order) from
// coordinates already on hand - no new data, no live call, just a
// navigation link the traveler can open for real turn-by-turn walking
// directions covering the whole day at once.
function googleMapsDayRouteUrl(anchorLat, anchorLon, items) {
  const stops = items.filter((item) => item.latitude != null && item.longitude != null);
  if (!stops.length || anchorLat == null || anchorLon == null) return null;
  const last = stops[stops.length - 1];
  const params = new URLSearchParams({
    api: "1",
    origin: `${anchorLat},${anchorLon}`,
    destination: `${last.latitude},${last.longitude}`,
    travelmode: "walking"
  });
  const waypoints = stops
    .slice(0, -1)
    .map((item) => `${item.latitude},${item.longitude}`)
    .join("|");
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function renderItinerary() {
  if (!state.tripPlan) {
    els.itineraryPanel.hidden = true;
    return;
  }
  els.itineraryPanel.hidden = false;
  const nights = state.tripPlan.nights || 1;
  const weatherByDay = state.tripPlan.weather || [];
  const routeAnchorLat = state.tripPlan.centerLatitude;
  const routeAnchorLon = state.tripPlan.centerLongitude;
  els.itineraryDays.innerHTML = Array.from({ length: nights }, (_, i) => {
    const dayNum = i + 1;
    const weatherDay = weatherByDay[i];
    const items = state.itinerary[dayNum] || [];
    const dayRouteUrl = items.length ? googleMapsDayRouteUrl(routeAnchorLat, routeAnchorLon, items) : null;
    const dayRouteLink = dayRouteUrl
      ? `<a href="${dayRouteUrl}" target="_blank" rel="noreferrer" class="subline no-print">🗺️ Open today's route in Google Maps</a>`
      : "";
    const weatherLine = !weatherDay
      ? ""
      : weatherDay.isHistorical
      ? `<span class="subline">📊 ${Math.round(weatherDay.avgTempMinC)}&deg;-${Math.round(weatherDay.avgTempMaxC)}&deg;C avg (${weatherDay.yearsUsed}-yr historical)</span>`
      : weatherDay.available
      ? `<span class="subline">${weatherDay.icon} ${weatherSummaryLabel(weatherDay.summary)}, ${Math.round(weatherDay.tempMinC)}&deg;-${Math.round(weatherDay.tempMaxC)}&deg;C</span>`
      : `<span class="subline">${weatherDay.date}</span>`;
    // Same real sunset data as the weather strip above, extended here too
    // (real forecast days only, same reasoning) - the itinerary is where
    // "how late can this evening run" is actually decided, more directly
    // useful here than in the separate weather panel it started in.
    const sunsetLine = weatherDay?.sunset ? `<span class="subline">🌇 Sunset ${weatherDay.sunset.slice(11)}</span>` : "";
    // Connects two already-real data sources (Open-Meteo's actual forecast
    // and the AI itinerary adjuster) rather than a new one: a high real
    // rain chance on a day that currently has an outdoor pick offers a
    // one-click swap, instead of making the traveler notice the forecast
    // and re-type the request themselves.
    //
    // Found via testing the historical-weather fallback added above: this
    // only ever checked precipitationChance, a field that doesn't exist on
    // historical days (they use rainedFractionPercent instead) - so a day
    // 30 days out with an 80% historical rain rate got no swap suggestion
    // at all, while a day 5 days out with a 60% forecast probability did,
    // for the exact same underlying concern. Checks whichever real signal
    // the day actually has, and phrases the prompt/label to match - "N% of
    // years historically had rain" is a different claim than "N% chance of
    // rain" and shouldn't be worded as if it were the same one.
    const hasOutdoorPick = items.some((item) => item.category === "nature" || item.category === "family");
    const rainSignal = weatherDay?.isHistorical
      ? { percent: weatherDay.rainedFractionPercent, label: `historically rained on this date in ${weatherDay.rainedFractionPercent}% of the last ${weatherDay.yearsUsed} years` }
      : weatherDay?.available
      ? { percent: weatherDay.precipitationChance, label: `has a ${weatherDay.precipitationChance}% chance of rain` }
      : null;
    const rainSwapButton =
      rainSignal && rainSignal.percent >= 60 && hasOutdoorPick
        ? `<button type="button" class="secondary-button rain-swap-button no-print" data-day="${dayNum}" data-rain-label="${rainSignal.label}"
             aria-label="Day ${dayNum} ${rainSignal.label} - swap its outdoor picks for indoor ones">🌧️ Swap outdoor picks for indoor ones</button>`
        : "";
    return `
      <div class="itinerary-day">
        <div class="itinerary-day-head">
          <strong>Day ${dayNum}</strong>
          ${weatherLine}
          ${sunsetLine}
          ${items.length ? `<span class="subline" id="day-total-${dayNum}"></span>` : ""}
          ${dayRouteLink}
          ${rainSwapButton}
        </div>
        ${
          items.length
            ? `<ul class="itinerary-items">${items.map((item, itemIndex) => itineraryItemCard(item, dayNum, itemIndex)).join("")}</ul>`
            : `<p class="subline">No places added yet - pick some from the list above.</p>`
        }
      </div>
    `;
  }).join("") + renderReturnDayCard(nights);
  renderItineraryMapMarkers();

  // Fire off enrichment lookups after the synchronous render so a slow or
  // failed Wikipedia/routing call never blocks the itinerary itself from
  // showing - each patches its own small piece of the card in place once
  // (and if) it resolves.
  const anchorLat = state.tripPlan.centerLatitude;
  const anchorLon = state.tripPlan.centerLongitude;
  Object.entries(state.itinerary).forEach(([dayNum, items]) => {
    items.forEach((item, itemIndex) => {
      fetchWikipediaSummary(item.wikipedia, item.wikidata, item.name).then((summary) => {
        if (!summary) return;
        if (summary.thumbnailUrl && !item.photoUrl) {
          const thumbEl = document.getElementById(`itin-thumb-${dayNum}-${itemIndex}`);
          if (thumbEl) thumbEl.innerHTML = `<img src="${summary.thumbnailUrl}" alt="" loading="lazy" />`;
        }
        if (summary.extract) {
          const descEl = document.getElementById(`itin-desc-${dayNum}-${itemIndex}`);
          if (descEl) descEl.textContent = summary.extract;
        }
      });
      if (anchorLat != null && anchorLon != null && item.latitude != null && item.longitude != null) {
        fetchWalkingRoute(anchorLat, anchorLon, item.latitude, item.longitude).then((route) => {
          if (!route) return;
          const distanceEl = document.getElementById(`itin-distance-${dayNum}-${itemIndex}`);
          if (distanceEl) distanceEl.textContent = `🚶 ${route.walkMinutes} min walk (${route.distanceKm} km, routed)`;
          if (route.path?.length > 1 && routeLinesLayer) {
            L.polyline(route.path, { color: "#1d6fd3", weight: 3, opacity: 0.65, dashArray: "1 7" })
              .addTo(routeLinesLayer)
              .bindPopup(`${escapeHtml(item.name)} &middot; ${route.walkMinutes} min walk (${route.distanceKm} km)`);
          }
        });
      }
    });
  });

  // Real day-by-day walking total: hotel -> item 1 -> item 2 -> ... in the
  // order the day's items appear, chained through the same OSRM-backed
  // /api/walking-route endpoint the per-item distances above already use -
  // no new backend work, just a different set of coordinate pairs. Kept as
  // its own pass rather than folded into the per-item one above so a slow
  // or failed leg here can never affect whether an individual item's own
  // distance shows up. Deliberately shows nothing (not a partial number)
  // if any leg in the chain fails - a real day total that's silently
  // missing one leg isn't the real total, and presenting it as one would
  // be exactly the kind of misleading precision this app avoids elsewhere.
  // Cleared and recomputed on every render (regenerate, AI-adjust, rebuild,
  // or a plain re-render all end up here) so a stale total from a
  // different itinerary can never linger into export text for this one.
  state.dayWalkTotals = {};
  Object.entries(state.itinerary).forEach(([dayNum, items]) => {
    if (!items.length || anchorLat == null || anchorLon == null) return;
    const waypoints = [
      [anchorLat, anchorLon],
      ...items.map((item) => [item.latitude, item.longitude])
    ].filter(([lat, lon]) => lat != null && lon != null);
    if (waypoints.length < 2) return;
    const legPromises = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [fromLat, fromLon] = waypoints[i];
      const [toLat, toLon] = waypoints[i + 1];
      legPromises.push(fetchWalkingRoute(fromLat, fromLon, toLat, toLon));
    }
    Promise.all(legPromises).then((legs) => {
      if (legs.some((leg) => !leg)) return;
      const totalKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0);
      const totalMin = legs.reduce((sum, leg) => sum + leg.walkMinutes, 0);
      state.dayWalkTotals[dayNum] = { totalKm, totalMin };
      const totalEl = document.getElementById(`day-total-${dayNum}`);
      if (totalEl) totalEl.textContent = `🚶 ~${Math.round(totalMin)} min, ${totalKm.toFixed(1)} km real walking today`;

      // Leg 0 (hotel -> first item) is already drawn by the per-item pass
      // above - only the item-to-item legs are new to the map. Solid green
      // rather than the spokes' dashed blue, so the day's actual walking
      // order reads as a distinct layer from "distance from hotel."
      if (routeLinesLayer) {
        legs.slice(1).forEach((leg, legIndex) => {
          if (!leg.path?.length) return;
          const fromItem = items[legIndex];
          const toItem = items[legIndex + 1];
          L.polyline(leg.path, { color: "#138a62", weight: 3, opacity: 0.7 })
            .addTo(routeLinesLayer)
            .bindPopup(`${escapeHtml(fromItem.name)} &rarr; ${escapeHtml(toItem.name)} &middot; ${leg.walkMinutes} min walk (${leg.distanceKm} km)`);
        });
      }
    });
  });
}

// Both budget tracking and packing lists were confirmed missing from
// Wanderlog (no built-in budget tracker, no packing list per its own
// competitor comparisons) - built here from data already on the page
// rather than a new API: real hotel price, the flight estimate, and the
// real weather forecast already fetched for the itinerary.
function renderBudgetBreakdown() {
  if (!state.tripPlan) {
    els.budgetPanel.hidden = true;
    return;
  }
  els.budgetPanel.hidden = false;

  const nights = state.tripPlan.nights || 1;
  const guestCount = Math.max(1, Number(els.guests.value) || 1);
  const topHotel = state.currentResults[0];
  const dailySpend = Math.max(0, Number(els.dailySpendInput.value) || 0);
  // Found via testing a 3-guest trip: the flight row above already
  // multiplies by guestCount (see the comment on that row - a family of 4
  // used to see one ticket's price presented as "the" flight cost), but
  // this row didn't, even though the field's own default ($60) reads as a
  // per-person daily estimate, not a flat per-trip one. A 3-traveler group
  // saw $300 for 5 nights of food/activities/transit - the same total a
  // solo traveler would see for an identical trip, silently understating a
  // group's real cost by 3x in a feature whose whole point is "what will
  // this trip actually cost."
  const spendTotal = dailySpend * nights * guestCount;
  const flight = state.tripPlan.flightEstimate;

  // Same gap already found and fixed twice this session (auto-filters
  // note, packing list): this whole panel had never used t() either,
  // despite being one of the most-viewed Trip Planner Pro panels - every
  // row label below was hardcoded English in all 6 supported languages.
  const travelersSuffix = (n) => (n > 1 ? t("budgetTravelersSuffix").replace("{n}", n) : "");

  const rows = [];
  if (topHotel) {
    const hotelTotal = topHotel.price * nights;
    rows.push({ label: t("budgetRowHotel").replace("{name}", escapeHtml(topHotel.name)).replace("{n}", nights), low: hotelTotal, high: hotelTotal });
  }
  if (flight) {
    // Found via testing: this still said "one-way" and only summed the
    // one-way fare even after round-trip support was added to the Flight
    // Estimate card above - the two disagreed on the same page, with the
    // budget total silently missing the return leg's cost. Reuse the same
    // describeReturnLeg() the flight card itself uses, so both agree.
    //
    // Found via a second round of testing: even after that fix, this was
    // still a single-passenger fare with `guests` sitting unused right on
    // the same page - a family of 4 saw the cost of ONE ticket presented
    // as "the" flight line in a total meant to answer "what will this
    // trip cost." Multiplied by the real guest count, same as the Flight
    // Estimate card's own new "Total for N travelers" line above.
    const returnLeg = describeReturnLeg(flight);
    const guestLabel = travelersSuffix(guestCount);
    rows.push(
      returnLeg
        ? {
            label: `${t("budgetRowFlightRoundTrip")}${guestLabel}`,
            low: returnLeg.totalLow * guestCount,
            high: returnLeg.totalHigh * guestCount
          }
        : {
            label: `${t("budgetRowFlightOneWay")}${guestLabel}`,
            low: flight.estimatedFareLowUsd * guestCount,
            high: flight.estimatedFareHighUsd * guestCount
          }
    );
  }
  rows.push({
    label: t("budgetRowFoodActivities").replace("{n}", nights).replace("{amount}", dailySpend).replace("{travelers}", travelersSuffix(guestCount)),
    low: spendTotal,
    high: spendTotal
  });

  const totalLow = rows.reduce((sum, r) => sum + r.low, 0);
  const totalHigh = rows.reduce((sum, r) => sum + r.high, 0);
  state.budgetTotalsUsd = { low: totalLow, high: totalHigh };

  els.budgetBreakdown.innerHTML = `
    <div class="budget-rows">
      ${rows
        .map(
          (r) => `
        <div class="budget-row">
          <span>${r.label}</span>
          <span>${r.low === r.high ? `$${r.low.toLocaleString()}` : `$${r.low.toLocaleString()}-$${r.high.toLocaleString()}`}</span>
        </div>
      `
        )
        .join("")}
    </div>
    <div class="budget-total">
      <span>${t("budgetEstimatedTotal")}</span>
      <span>${totalLow === totalHigh ? `$${totalLow.toLocaleString()}` : `$${totalLow.toLocaleString()}-$${totalHigh.toLocaleString()}`}</span>
    </div>
    ${
      // Researched competitor group-trip features: Airbnb's 2026 shared-
      // itinerary release and several dedicated group-travel apps center on
      // splitting a trip's cost among travelers, not just totaling it. This
      // app already knows the real party size (the same `guests` count
      // already multiplying the flight line above) - a per-person split is
      // just arithmetic on a total already computed, not a new data source.
      // Display only, same as every other number in this budget panel -
      // never moves money or touches a payment method, which stays
      // explicitly out of scope for this prototype.
      guestCount > 1
        ? `<div class="budget-row budget-split">
            <span>${t("budgetPerPerson").replace("{n}", guestCount)}</span>
            <span>${totalLow === totalHigh ? `$${Math.ceil(totalLow / guestCount).toLocaleString()}` : `$${Math.ceil(totalLow / guestCount).toLocaleString()}-$${Math.ceil(totalHigh / guestCount).toLocaleString()}`}</span>
          </div>`
        : ""
    }
    <p id="budgetCurrencyLine" class="subline"></p>
    ${!topHotel ? `<p class="subline">${t("budgetNeedHotelFirst")}</p>` : ""}
  `;
  renderCurrencyConversion();
}

// Cache by currency code - Frankfurter's rates only move once a day, and
// this may be called on every keystroke via debounce, so avoid refetching
// the same code repeatedly within a session.
const currencyRateCache = {};
let currencyRequestToken = 0;

async function fetchCurrencyRate(code) {
  if (code in currencyRateCache) return currencyRateCache[code];
  const data = await apiGet(`/api/currency-rate?currency_code=${encodeURIComponent(code)}`);
  currencyRateCache[code] = data.rate;
  return data.rate;
}

async function renderCurrencyConversion() {
  const line = document.getElementById("budgetCurrencyLine");
  if (!line) return;
  const code = els.homeCurrencyInput.value.trim().toUpperCase();
  if (!code) {
    line.textContent = "";
    return;
  }
  if (!state.budgetTotalsUsd) return;
  const token = ++currencyRequestToken;
  line.textContent = `Converting to ${code}…`;
  try {
    const rate = await fetchCurrencyRate(code);
    if (token !== currencyRequestToken) return;
    const { low, high } = state.budgetTotalsUsd;
    const convLow = Math.round(low * rate).toLocaleString();
    const convHigh = Math.round(high * rate).toLocaleString();
    // Always shown alongside the USD total above, never replacing it - a
    // documented complaint about multi-currency travel apps is losing the
    // original amount once something gets converted.
    line.textContent =
      low === high
        ? `≈ ${convLow} ${code} (live rate)`
        : `≈ ${convLow}-${convHigh} ${code} (live rate)`;
  } catch (err) {
    if (token !== currencyRequestToken) return;
    line.textContent = err.message || `Couldn't fetch a live rate for ${code}.`;
  }
}

// Every item string here now goes through t() - found via testing live
// language switching against this whole panel (not just the note fixed
// moments earlier this session): the entire smart packing list, one of
// this app's original Trip Planner Pro features (task #24), had never
// been translated in ANY of the 5 non-English languages since it shipped
// - every item was a hardcoded English string. Same root cause as the
// auto-filters note fix just above (a feature never wired through t()
// in the first place, not a re-render timing issue), just a much larger
// surface (16 distinct strings) since this function predates the i18n
// pass this session mostly focused on hotel-card/metric labels.
function generatePackingList(weatherDays, nights) {
  const items = [
    t("packingPassport"),
    t("packingCharger"),
    t("packingToiletries"),
    nights > 1 ? t("packingClothingPlural").replace("{n}", nights) : t("packingClothingSingular")
  ];
  // Found via testing: historical-fallback days (see weather.py's archive
  // fallback for trips beyond the real forecast horizon) are `available:
  // true` but use avgTempMaxC/avgTempMinC/rainedFractionPercent instead of
  // tempMaxC/tempMinC/precipitationChance - reading the forecast-only field
  // names straight off them silently fed `undefined` into Math.max/min,
  // turning the whole packing list's weather logic into NaN comparisons
  // (all false) with zero indication anything had gone wrong. Normalizing
  // both shapes to the same field names before the math avoids that.
  const usable = (weatherDays || [])
    .filter((day) => day.available)
    .map((day) =>
      day.isHistorical
        ? {
            tempMaxC: day.avgTempMaxC,
            tempMinC: day.avgTempMinC,
            precipitationChance: day.rainedFractionPercent,
            uvIndexMax: null,
            windSpeedMaxKmh: day.avgWindSpeedMaxKmh
          }
        : {
            tempMaxC: day.tempMaxC,
            tempMinC: day.tempMinC,
            precipitationChance: day.precipitationChance,
            uvIndexMax: day.uvIndexMax,
            windSpeedMaxKmh: day.windSpeedMaxKmh
          }
    );

  if (!usable.length) {
    // Found via testing: this line always blamed the forecast horizon
    // ("this far out"), even when the real reason was that no check-in
    // date had been entered at all - the backend only ever attempts a
    // weather fetch when payload.startDate is set (see main.py), so
    // weatherDays comes back null for both cases and this function
    // couldn't previously tell them apart. Telling a traveler their trip
    // is "too far out" when they simply haven't picked a date yet is a
    // real, confusing false claim - and unlike the genuine horizon case,
    // this one has an obvious, actionable fix (pick a date), so it gets
    // its own honest message instead of reusing the horizon one.
    items.push(els.tripStartDate.value ? t("packingNoForecastFarOut") : t("packingNoDateSet"));
    return items;
  }

  const maxTemp = Math.max(...usable.map((day) => day.tempMaxC));
  const minTemp = Math.min(...usable.map((day) => day.tempMinC));
  const maxPrecip = Math.max(...usable.map((day) => day.precipitationChance));
  // Real UV index (WHO/EPA scale: 3+ is "moderate," where sun protection
  // is recommended) is a direct measure of what "pack sunscreen" is
  // actually about, more accurate than the temperature-only proxy below -
  // a cold, clear, high-altitude day can have real high UV; a hot,
  // overcast day can have low UV. Only ever present on real forecast
  // days (the historical archive doesn't compute it), so it's an
  // addition to the temperature trigger, not a replacement - a
  // historical-only trip still gets the temperature-based suggestion.
  const uvValues = usable.map((day) => day.uvIndexMax).filter((v) => v != null);
  const maxUv = uvValues.length ? Math.max(...uvValues) : null;

  if (maxTemp >= 27) items.push(t("packingLightClothing"));
  if ((maxUv != null && maxUv >= 3) || maxTemp >= 27) items.push(t("packingSunscreen"));
  if ((maxUv != null && maxUv >= 6) || maxTemp >= 30) items.push(t("packingSunHat"));
  if (minTemp <= 12) items.push(t("packingWarmJacket"));
  if (minTemp <= 5) items.push(t("packingThermalLayers"));
  if (maxPrecip >= 40) {
    // Real wind speed (available on both forecast and historical days,
    // unlike UV above) refines what was previously always "umbrella or
    // rain jacket" regardless of conditions - a real, commonly-cited
    // practical fact is that umbrellas become unreliable in strong wind
    // (they invert, blow away), so above a real windy threshold this
    // recommends skipping the umbrella outright rather than presenting it
    // as an equally good option it wouldn't actually be that day.
    const windValues = usable.map((day) => day.windSpeedMaxKmh).filter((v) => v != null);
    const maxWind = windValues.length ? Math.max(...windValues) : null;
    if (maxWind != null && maxWind >= 30) {
      items.push(t("packingRainJacketWindy"));
    } else {
      items.push(t("packingUmbrella"));
    }
    items.push(t("packingWaterproofShoes"));
  }
  if (maxTemp - minTemp >= 12) {
    items.push(t("packingTempSwing").replace("{min}", Math.round(minTemp)).replace("{max}", Math.round(maxTemp)));
  }

  return items;
}

function renderPackingList() {
  if (!state.tripPlan) {
    els.packingPanel.hidden = true;
    return;
  }
  els.packingPanel.hidden = false;
  const list = generatePackingList(state.tripPlan.weather, state.tripPlan.nights || 1);
  els.packingList.innerHTML = list.map((item) => `<li>${item}</li>`).join("");
}

function renderPrintHeader() {
  if (!els.printHeader || !state.tripPlan) return;
  const nights = state.tripPlan.nights || 1;
  const startDate = els.tripStartDate.value;
  els.printHeader.textContent = `${state.tripPlan.cityName} trip plan - ${nights} night${nights > 1 ? "s" : ""}${startDate ? ` starting ${startDate}` : ""}`;
}

// User feedback: an empty "no places added yet" day is a bad default - a
// real trip planner proposes a complete plan first (including somewhere to
// eat, every day) and lets the traveler edit or regenerate from there,
// rather than making them build the whole thing from a blank slate.
// Built entirely from POIs already fetched for this city - no new calls,
// no invented places - one rotating activity category + one food pick per
// day, each place used at most once across the whole trip.
const ACTIVITY_CATEGORIES = ["nature", "culture", "entertainment", "family"];

function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Real great-circle distance between two real coordinates - the same
// formula backend/geocoding.py already uses server-side for
// distanceFromHotelKm, just needed client-side here since this picks
// between two already-fetched POIs rather than a POI and the hotel.
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function autoGenerateItinerary(pointsOfInterest, nights) {
  if (!pointsOfInterest) return {};
  const used = new Set();
  const keyOf = (item) => `${item.latitude},${item.longitude},${item.name}`;
  // Shuffled per call (not the underlying data) so clicking "Regenerate"
  // gives a genuinely different plan instead of the same picks every time.
  const shuffledCategories = Object.fromEntries(
    Object.entries(pointsOfInterest).map(([category, items]) => [category, shuffled(items)])
  );

  function takeNext(category) {
    for (const item of shuffledCategories[category] || []) {
      const key = keyOf(item);
      if (!used.has(key)) {
        used.add(key);
        return item;
      }
    }
    return null;
  }

  // Found via testing: the food pick for each day came from the same
  // shuffled order as everything else, so it could land anywhere in the
  // whole search radius (4 km for the day's activity, 900 m for food) with
  // no regard for the activity it was paired with - a nature spot on one
  // side of the city and a "nearby" restaurant on the other. Every POI
  // already carries its real lat/lon, so picking the geographically
  // closest still-unused food option to the day's actual activity is a
  // real improvement, not a new data source - just a better use of data
  // already on hand.
  function takeNearestFood(refLat, refLon) {
    const candidates = (shuffledCategories.food || []).filter((item) => !used.has(keyOf(item)));
    if (!candidates.length) return null;
    if (refLat == null || refLon == null) {
      const item = candidates[0];
      used.add(keyOf(item));
      return item;
    }
    const nearest = candidates.reduce((best, item) =>
      haversineKm(refLat, refLon, item.latitude, item.longitude) < haversineKm(refLat, refLon, best.latitude, best.longitude)
        ? item
        : best
    );
    used.add(keyOf(nearest));
    return nearest;
  }

  const itinerary = {};
  for (let day = 1; day <= nights; day++) {
    const items = [];
    const preferredCategory = ACTIVITY_CATEGORIES[(day - 1) % ACTIVITY_CATEGORIES.length];
    const activity = takeNext(preferredCategory) || ACTIVITY_CATEGORIES.map(takeNext).find(Boolean);
    if (activity) items.push(activity);
    const food = takeNearestFood(activity?.latitude, activity?.longitude);
    if (food) items.push(food);
    if (items.length) itinerary[day] = items;
  }
  return itinerary;
}

async function buildTripPlan() {
  if (!els.city.value.trim()) return;
  els.buildTripPlanButton.disabled = true;
  els.buildTripPlanButton.textContent = "Building…";
  els.tripPlanStatus.textContent = "";
  try {
    const hotelIdValue = els.tripPlanHotelSelect?.value;
    const data = await apiPost("/api/trip-plan", {
      city: els.city.value,
      nights: Math.max(1, Number(els.nights.value) || 1),
      startDate: els.tripStartDate.value,
      originCity: els.originCityInput.value,
      hotelId: hotelIdValue ? Number(hotelIdValue) : null
    });
    // Snapshot what this plan was actually built with - the backend doesn't
    // echo the raw request back, and checkTripPlanStale() needs something
    // to compare the live inputs against besides nights (see below).
    data.builtWithStartDate = els.tripStartDate.value;
    data.builtWithOriginCity = els.originCityInput.value;
    data.builtWithHotelId = hotelIdValue || null;
    state.tripPlan = data;
    state.itinerary = autoGenerateItinerary(data.pointsOfInterest, data.nights);
    renderFlightEstimate(data.flightEstimate, data.flightError);
    renderWeatherStrip(data.weather, data.weatherError);
    renderDestinationTimezone(data.destinationTimezone);
    renderTripPlanAnchorNote(data);
    checkTripPlanStale();
    els.poiPanel.hidden = false;
    renderPoiTabs();
    renderPoiList();
    renderItinerary();
    renderBudgetBreakdown();
    renderPackingList();
    renderPrintHeader();
    saveTripPlanState();
  } catch (err) {
    els.tripPlanStatus.textContent = `Couldn't build a trip plan: ${err.message}`;
  } finally {
    els.buildTripPlanButton.disabled = false;
    els.buildTripPlanButton.textContent = "Build my trip plan";
  }
}

function restoreTripPlanState() {
  const saved = loadTripPlanState();
  if (!saved) return;
  if (typeof saved.proEmail === "string") state.proEmail = saved.proEmail;
  // Provisional - if Stripe is configured, bootstrap() re-verifies this
  // against the real subscription status right after (see checkProStatus),
  // correcting it either direction. If Stripe isn't configured, this local
  // flag is still the only source of truth, same as the original prototype
  // toggle always was.
  if (saved.proUnlocked) setProUnlocked(true);
  if (typeof saved.startDate === "string") els.tripStartDate.value = saved.startDate;
  if (typeof saved.originCity === "string") els.originCityInput.value = saved.originCity;
  if (typeof saved.homeCurrency === "string") els.homeCurrencyInput.value = saved.homeCurrency;
  if (saved.tripPlan) {
    state.tripPlan = saved.tripPlan;
    // Found via testing: a plan saved before auto-generate existed (or from
    // any other empty state) would restore an empty itinerary forever, since
    // this just loaded whatever was saved instead of re-generating - the
    // days would show "No places added yet" on every reload with no way out
    // except noticing the Regenerate button. Backfill it here instead.
    state.itinerary =
      saved.itinerary && Object.keys(saved.itinerary).length
        ? saved.itinerary
        : autoGenerateItinerary(saved.tripPlan.pointsOfInterest, saved.tripPlan.nights);
    renderFlightEstimate(saved.tripPlan.flightEstimate, saved.tripPlan.flightError);
    renderWeatherStrip(saved.tripPlan.weather, saved.tripPlan.weatherError);
    renderDestinationTimezone(saved.tripPlan.destinationTimezone);
    renderTripPlanAnchorNote(saved.tripPlan);
    checkTripPlanStale();
    if (saved.tripPlan.pointsOfInterest) {
      els.poiPanel.hidden = false;
      renderPoiTabs();
      renderPoiList();
    }
    renderItinerary();
    renderBudgetBreakdown();
    renderPackingList();
    renderPrintHeader();
  }
}

// Only reachable when Stripe isn't configured (see renderProBillingWidget) -
// the original honest "prototype toggle, nothing is charged" behavior.
els.unlockProButton.addEventListener("click", () => setProUnlocked(true));

els.proSubscribeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = els.proEmailInput.value.trim();
  if (!email) return;
  startProCheckout(email);
});

els.proRestoreButton.addEventListener("click", async () => {
  const email = window.prompt(t("proRestorePrompt"));
  if (!email || !email.trim()) return;
  try {
    const active = await checkProStatus(email.trim());
    showToast(active ? t("proRestoreSuccess") : t("proRestoreNotFound"), active ? "success" : "info");
  } catch (err) {
    showToast(err.message || t("proCheckoutError"), "error");
  }
});

els.manageSubscriptionButton.addEventListener("click", () => {
  if (!state.proEmail) return;
  openBillingPortal(state.proEmail);
});

els.buildTripPlanButton.addEventListener("click", buildTripPlan);

els.regenerateItineraryButton.addEventListener("click", () => {
  if (!state.tripPlan?.pointsOfInterest) return;
  state.itinerary = autoGenerateItinerary(state.tripPlan.pointsOfInterest, state.tripPlan.nights);
  renderItinerary();
  saveTripPlanState();
});

function findPoiByName(pointsOfInterest, name) {
  for (const items of Object.values(pointsOfInterest)) {
    const match = items.find((item) => item.name === name);
    if (match) return match;
  }
  return null;
}

async function adjustItineraryWithAi() {
  const instruction = els.itineraryAiInput.value.trim();
  if (!instruction) return;
  // Same silent-failure shape as the POI list bug fixed earlier: this used
  // to just return here with zero feedback, so a missing/stale
  // pointsOfInterest made the button look broken instead of explaining why.
  if (!state.tripPlan?.pointsOfInterest) {
    els.itineraryAiStatus.textContent = "Build a trip plan first so the assistant has real places to work with.";
    els.itineraryAiStatus.classList.add("landmark-status-error");
    return;
  }

  els.itineraryAiButton.disabled = true;
  els.itineraryAiButton.textContent = "Thinking…";
  els.itineraryAiStatus.textContent = "";
  els.itineraryAiStatus.classList.remove("landmark-status-error");
  try {
    const data = await apiPost("/api/itinerary-adjust", {
      nights: state.tripPlan.nights,
      instruction,
      pointsOfInterest: state.tripPlan.pointsOfInterest
    });
    const newItinerary = {};
    Object.entries(data.days || {}).forEach(([day, names]) => {
      const items = names.map((name) => findPoiByName(state.tripPlan.pointsOfInterest, name)).filter(Boolean);
      if (items.length) newItinerary[day] = items;
    });
    if (!Object.keys(newItinerary).length) {
      throw new Error("The assistant's plan didn't match any real places - nothing changed.");
    }
    state.itinerary = newItinerary;
    renderItinerary();
    saveTripPlanState();
    els.itineraryAiStatus.textContent = "Updated your itinerary.";
  } catch (err) {
    els.itineraryAiStatus.textContent = err.message;
    els.itineraryAiStatus.classList.add("landmark-status-error");
  } finally {
    els.itineraryAiButton.disabled = false;
    els.itineraryAiButton.textContent = "Ask AI to adjust";
  }
}

els.itineraryAiButton.addEventListener("click", adjustItineraryWithAi);
els.itineraryAiInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") adjustItineraryWithAi();
});
els.printPlanButton.addEventListener("click", () => {
  if (!state.tripPlan) {
    showToast("Build a trip plan first.", "error");
    return;
  }
  window.print();
});
els.exportIcsButton?.addEventListener("click", downloadTripIcs);
els.dailySpendInput.addEventListener("input", renderBudgetBreakdown);
els.homeCurrencyInput.addEventListener("input", debounce(renderCurrencyConversion, 500));
// Found via testing: neither of these had any change listener at all, so
// editing them after building a trip plan silently left the flight
// estimate/weather stale with no warning - see checkTripPlanStale().
els.tripStartDate.addEventListener("input", checkTripPlanStale);
els.originCityInput.addEventListener("input", checkTripPlanStale);
els.tripPlanHotelSelect?.addEventListener("change", checkTripPlanStale);
// Two-way synced with els.nights (the single source of truth used
// everywhere else - budget math, itinerary length, etc.) rather than a
// second independent field, so entering nights here can never silently
// desync from what the rest of the app actually plans/prices for.
els.tripPlanNightsInput?.addEventListener("input", () => {
  els.nights.value = els.tripPlanNightsInput.value;
  checkTripPlanStale();
  rankAndRender();
});
els.homeCurrencyInput.addEventListener("change", saveTripPlanState);

els.poiTabs.addEventListener("click", (event) => {
  const btn = event.target.closest(".poi-tab");
  if (!btn) return;
  state.poiActiveCategory = btn.dataset.category;
  renderPoiTabs();
  renderPoiList();
});

els.poiList.addEventListener("click", (event) => {
  const retryBtn = event.target.closest("#retryPoiButton");
  if (retryBtn) {
    // The only visible feedback for a click here used to be on the
    // original "Build my trip plan" button elsewhere on the page - easy
    // to miss if a traveler scrolled down to the POI panel first, making
    // a real retry (Overpass can take several seconds to time out) look
    // like a dead click. This button now shows its own loading state too.
    retryBtn.disabled = true;
    retryBtn.textContent = t("poiRetrying");
    buildTripPlan();
    return;
  }
  const btn = event.target.closest(".poi-add-button");
  if (!btn) return;
  const category = btn.dataset.poiCategory;
  const index = Number(btn.dataset.poiIndex);
  const day = Number(btn.dataset.day);
  const poiItem = state.tripPlan?.pointsOfInterest?.[category]?.[index];
  if (!poiItem) return;
  if (!state.itinerary[day]) state.itinerary[day] = [];
  state.itinerary[day].push(poiItem);
  renderItinerary();
  saveTripPlanState();
});

els.itineraryDays.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".itinerary-remove");
  if (removeBtn) {
    const day = Number(removeBtn.dataset.day);
    const itemIndex = Number(removeBtn.dataset.itemIndex);
    state.itinerary[day]?.splice(itemIndex, 1);
    renderItinerary();
    saveTripPlanState();
    return;
  }
  const rainBtn = event.target.closest(".rain-swap-button");
  if (rainBtn) {
    const day = rainBtn.dataset.day;
    const rainLabel = rainBtn.dataset.rainLabel;
    els.itineraryAiInput.value = `Day ${day} ${rainLabel} - swap any outdoor nature or park picks that day for indoor culture, museum, or entertainment ones. Leave the other days as they are.`;
    adjustItineraryWithAi();
  }
});

document.querySelector("#rankButton").addEventListener("click", rankAndRender);
document.querySelector("#resetWeights").addEventListener("click", () => {
  state.weights = { ...defaultWeights };
  renderWeights();
  rankAndRender();
});
document.querySelector("#shareSearchButton")?.addEventListener("click", async () => {
  const url = buildShareSearchUrl();
  // Same Web-Share-first, honest-clipboard-fallback pattern as
  // #shareHotelButton and Export plan - never claims a copy succeeded when
  // it silently didn't (see the real bug this fixed elsewhere, task #127).
  if (navigator.share) {
    try {
      await navigator.share({ title: "StayRank AI search", url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const copied = await copyTextToClipboard(url);
  showToast(copied ? "Search link copied to clipboard." : "Couldn't share or copy automatically - please copy the link manually.", copied ? "success" : "error");
});
els.copyAdvertiseEmailButton?.addEventListener("click", async () => {
  const copied = await copyTextToClipboard(els.copyAdvertiseEmailButton.dataset.email);
  showToast(copied ? t("emailCopied") : t("emailCopyFailed"), copied ? "success" : "error");
});
document.querySelector("#exportButton").addEventListener("click", exportPlan);
document.querySelector("#exportKmlButton").addEventListener("click", downloadShortlistKml);
document.querySelector("#compareButton").addEventListener("click", () => {
  renderCompare();
  els.compareDialog.showModal();
});
document.querySelector("#closeCompare").addEventListener("click", () => els.compareDialog.close());
document.querySelector("#closeDetail").addEventListener("click", () => els.detailDialog.close());

els.priceWatchesButton?.addEventListener("click", () => {
  els.priceWatchesDialog.showModal();
  renderPriceWatchesList();
});
document.querySelector("#closePriceWatches")?.addEventListener("click", () => els.priceWatchesDialog.close());

els.detailBody.addEventListener("click", async (event) => {
  const thumb = event.target.closest(".photo-gallery-thumb");
  if (thumb) {
    // Restores the main gallery's own array/title every time, in case a
    // community-review photo (below) repointed lightboxPhotos/lightboxAlt
    // at its own, much shorter array in between.
    lightboxPhotos = detailHotelPhotos;
    lightboxAlt = detailHotelName;
    openLightbox(Number(thumb.dataset.photoIndex));
    return;
  }
  const communityThumb = event.target.closest(".community-photo-thumb");
  if (communityThumb) {
    const photos = communityReviewPhotosById[communityThumb.dataset.communityReviewId] || [];
    if (!photos.length) return;
    lightboxPhotos = photos;
    lightboxAlt = t("communityReviewsHeading");
    openLightbox(Number(communityThumb.dataset.photoIndex));
    return;
  }
  const copyAddressBtn = event.target.closest("#copyAddressButton");
  if (copyAddressBtn) {
    // Reuses the same tested copyTextToClipboard() helper the Export plan
    // button already relies on (see its own comment above for the real
    // bug that made this worth sharing rather than a plain, unchecked
    // navigator.clipboard.writeText() call) - only claims success when the
    // copy actually happened.
    const copied = await copyTextToClipboard(copyAddressBtn.dataset.address);
    showToast(copied ? "Address copied to clipboard." : "Couldn't copy automatically - please copy the address manually.", copied ? "success" : "error");
    return;
  }
  const shareBtn = event.target.closest("#shareHotelButton");
  if (shareBtn) {
    const { name, price, score, city, link } = shareBtn.dataset;
    const text = `${name}${city ? ` in ${city}` : ""} - $${price}/night${score ? ` (Match ${score}/100)` : ""}\n${link}`;
    // Same Web-Share-first, honest-clipboard-fallback pattern as the
    // Export plan button (see copyTextToClipboard above) - never claims a
    // copy succeeded when it didn't.
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text, url: link });
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    const copied = await copyTextToClipboard(text);
    showToast(copied ? "Hotel details copied to clipboard." : "Couldn't share or copy automatically - please copy the details manually.", copied ? "success" : "error");
    return;
  }
  const btn = event.target.closest("[data-detail]");
  if (!btn) return;
  showDetail(Number(btn.dataset.detail));
});

els.lightboxPrev.addEventListener("click", () => stepLightbox(-1));
els.lightboxNext.addEventListener("click", () => stepLightbox(1));
document.querySelector("#closeLightbox").addEventListener("click", () => els.photoLightbox.close());

// <dialog> already closes on Escape natively - this only adds left/right
// arrow-key navigation between photos while it's open.
els.photoLightbox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") stepLightbox(-1);
  if (event.key === "ArrowRight") stepLightbox(1);
});

// Clicking the dialog's own backdrop (::backdrop is outside the element
// box, so a click landing directly on the <dialog> element itself - not
// one of its children - means the backdrop was clicked) closes it, same
// convention as most photo lightboxes.
els.photoLightbox.addEventListener("click", (event) => {
  if (event.target === els.photoLightbox) els.photoLightbox.close();
});

els.results.addEventListener("click", (event) => {
  // A real <button> (not a bare <img> click target) so this is reachable
  // and operable by keyboard (Tab + Enter/Space), not just mouse.
  const btn = event.target.closest(".photo-cycle-btn");
  if (!btn) return;
  const hotel = state.currentResults.find((item) => item.id === Number(btn.dataset.hotelId));
  if (!hotel || !hotel.photos || hotel.photos.length < 2) return;
  const nextIndex = (Number(btn.dataset.photoIndex || 0) + 1) % hotel.photos.length;
  const img = btn.querySelector("img");
  img.src = hotel.photos[nextIndex];
  img.alt = `${hotel.name} hotel room, photo ${nextIndex + 1} of ${hotel.photos.length}`;
  btn.dataset.photoIndex = String(nextIndex);
  btn.setAttribute(
    "aria-label",
    `Show next photo of ${hotel.name} (photo ${nextIndex + 1} of ${hotel.photos.length})`
  );
});

els.viewMapButton.addEventListener("click", () => {
  // Baymard's own research (already cited above for the side-by-side
  // split view desktop already uses) doesn't cover mobile, where side-by-
  // side isn't possible - measured live: without this, reaching the map
  // meant scrolling past the entire results list first (~2900px for a
  // typical result set). Only shown at mobile widths (see .mobile-only in
  // styles.css) since desktop already shows the map without scrolling.
  els.hotelMap.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.syncButton.addEventListener("click", async () => {
  const city = els.city.value.trim();
  if (!city) return;

  const originalText = els.syncButton.textContent;
  els.syncButton.disabled = true;
  els.syncButton.textContent = "Syncing…";

  try {
    const stats = await apiPost("/api/hotels/sync", { city });
    await rankAndRender();
    // Booking.com is still the only source with real live pricing/reviews
    // (source: "live"); "content" means Hotelbeds or Wikidata found real
    // hotel names/photos instead, with estimated pricing - worth saying
    // which one happened, not just "synced", since they're genuinely
    // different guarantees.
    const message = stats.source === "live"
      ? `Synced ${stats.hotelsSynced} live hotels for ${stats.city}.`
      : `Booking.com wasn't available, but found ${stats.hotelsSynced} real hotels (photos included) for ${stats.city} from a backup source - pricing is estimated, not live.`;
    showToast(message, "success");
  } catch (err) {
    showToast(`Live sync failed: ${err.message}`, "error");
  } finally {
    els.syncButton.disabled = false;
    els.syncButton.textContent = originalText;
  }
});

els.recentCitiesRow.addEventListener("click", (event) => {
  const chip = event.target.closest(".recent-city-chip");
  if (!chip) return;
  els.city.value = chip.dataset.city;
  rankAndRender();
});

els.recentlyViewedRow.addEventListener("click", (event) => {
  const card = event.target.closest(".recently-viewed-card");
  if (!card) return;
  showDetail(Number(card.dataset.hotelId));
});

els.resetAllButton.addEventListener("click", () => {
  // A single escape hatch back to defaults - Baymard's travel-site UX
  // research finds most users want an easy "clear everything" option
  // rather than having to undo each filter/weight one at a time.
  els.prompt.value = DEFAULTS.prompt;
  els.city.value = DEFAULTS.city;
  els.budget.value = DEFAULTS.budget;
  els.nights.value = DEFAULTS.nights;
  els.checkInDate.value = "";
  updateCheckInCountdown();
  els.guests.value = DEFAULTS.guests;
  els.landmark.value = DEFAULTS.landmark;

  state.persona = DEFAULTS.persona;
  state.filter = DEFAULTS.filter;
  state.sort = DEFAULTS.sort;
  state.minRating = DEFAULTS.minRating;
  state.accessibleOnly = DEFAULTS.accessibleOnly;
  els.accessibleToggle?.setAttribute("aria-pressed", "false");
  els.accessibleToggle?.classList.remove("active");
  state.budgetOnly = DEFAULTS.budgetOnly;
  els.budgetOnlyToggle?.setAttribute("aria-pressed", "false");
  els.budgetOnlyToggle?.classList.remove("active");
  state.petFriendlyOnly = DEFAULTS.petFriendlyOnly;
  els.petFriendlyToggle?.setAttribute("aria-pressed", "false");
  els.petFriendlyToggle?.classList.remove("active");
  state.neighborhoodFilter = DEFAULTS.neighborhoodFilter;
  if (els.neighborhoodFilterSelect) els.neighborhoodFilterSelect.value = "";
  state.minStarRating = DEFAULTS.minStarRating;
  state.musts.clear();
  state.suppressedMusts.clear();
  state.autoAppliedFilters.clear();
  renderAutoFiltersNote();
  state.weights = { ...defaultWeights };
  state.refinements = [];
  renderRefineChips();

  activateByData(".chip", "persona", state.persona);
  activateByData(".filter", "filter", state.filter);
  els.mustHaves.forEach((checkbox) => {
    checkbox.checked = false;
  });
  els.sortSelect.value = state.sort;
  els.ratingSelect.value = String(state.minRating);
  els.starRatingSelect.value = String(state.minStarRating);

  // Found via testing: this reset everything ABOVE the trip planner but
  // left it untouched - a built plan (itinerary, weather, budget, packing
  // list) stayed fully visible and populated for whatever city the search
  // had just been reset away from, with nothing in the UI still naming
  // that city. "Reset all" is supposed to be a full return to a blank
  // slate, not a partial one, so clear the plan too - reusing the same
  // render functions the rest of the app already calls to clear each
  // panel (they self-hide when passed null/no trip plan), same as a fresh
  // page load before any plan has been built.
  state.tripPlan = null;
  state.itinerary = {};
  renderFlightEstimate(null, null);
  renderWeatherStrip(null, null);
  renderDestinationTimezone(null);
  els.poiPanel.hidden = true;
  if (els.tripPlanAnchorNote) els.tripPlanAnchorNote.hidden = true;
  renderItinerary();
  renderBudgetBreakdown();
  renderPackingList();
  // renderPrintHeader() itself early-returns without touching the DOM once
  // state.tripPlan is null (it has nothing to render), so it can't be
  // reused to clear this - found by testing the exact print-after-reset
  // path: the print button stays visible with no plan behind it, so
  // clearing this text directly is the only way a since-reset print
  // doesn't carry a stale city/night count from the plan that was just
  // reset away.
  if (els.printHeader) els.printHeader.textContent = "";
  checkTripPlanStale();
  populateTripPlanHotelSelect();
  saveTripPlanState();

  clearSearchState();
  renderWeights();
  rankAndRender();
});

function setActiveToggle(groupSelector, activeButton) {
  document.querySelectorAll(groupSelector).forEach((button) => {
    const isActive = button === activeButton;
    button.classList.toggle("active", isActive);
    // aria-pressed exposes the selected state to screen readers - the
    // .active class alone is visual-only and invisible to assistive tech.
    button.setAttribute("aria-pressed", String(isActive));
  });
}

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveToggle(".chip", button);
    state.persona = button.dataset.persona;
    rankAndRender();
  });
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    setActiveToggle(".filter", button);
    state.filter = button.dataset.filter;
    rankAndRender();
  });
});

els.mustHaves.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.musts.add(checkbox.value);
      state.suppressedMusts.delete(checkbox.value);
    } else {
      state.musts.delete(checkbox.value);
      // Unchecking a box the app auto-checked from prompt language must
      // actually loosen the search, not just look unchecked - see
      // renderAutoMusts() and the matching backend suppressMusts subtraction.
      state.suppressedMusts.add(checkbox.value);
    }
    rankAndRender();
  });
});

els.clearMusts.addEventListener("click", () => {
  state.musts.clear();
  (state.currentIntent.dynamicMusts || []).forEach((must) => state.suppressedMusts.add(must));
  els.mustHaves.forEach((checkbox) => {
    checkbox.checked = false;
  });
  rankAndRender();
});

els.sortSelect.addEventListener("change", () => {
  state.sort = els.sortSelect.value;
  rankAndRender();
});

els.ratingSelect.addEventListener("change", () => {
  state.minRating = Number(els.ratingSelect.value) || 0;
  state.autoAppliedFilters.delete("minRating");
  renderAutoFiltersNote();
  rankAndRender();
});
els.starRatingSelect.addEventListener("change", () => {
  state.minStarRating = Number(els.starRatingSelect.value) || 0;
  state.autoAppliedFilters.delete("starRating");
  renderAutoFiltersNote();
  rankAndRender();
});
els.neighborhoodFilterSelect?.addEventListener("change", () => {
  state.neighborhoodFilter = els.neighborhoodFilterSelect.value;
  rankAndRender();
});
els.accessibleToggle?.addEventListener("click", () => {
  state.accessibleOnly = !state.accessibleOnly;
  els.accessibleToggle.setAttribute("aria-pressed", String(state.accessibleOnly));
  els.accessibleToggle.classList.toggle("active", state.accessibleOnly);
  state.autoAppliedFilters.delete("accessible");
  renderAutoFiltersNote();
  rankAndRender();
});
els.budgetOnlyToggle?.addEventListener("click", () => {
  state.budgetOnly = !state.budgetOnly;
  els.budgetOnlyToggle.setAttribute("aria-pressed", String(state.budgetOnly));
  els.budgetOnlyToggle.classList.toggle("active", state.budgetOnly);
  rankAndRender();
});
els.petFriendlyToggle?.addEventListener("click", () => {
  state.petFriendlyOnly = !state.petFriendlyOnly;
  els.petFriendlyToggle.setAttribute("aria-pressed", String(state.petFriendlyOnly));
  els.petFriendlyToggle.classList.toggle("active", state.petFriendlyOnly);
  state.autoAppliedFilters.delete("petFriendly");
  renderAutoFiltersNote();
  rankAndRender();
});

const debouncedRank = debounce(rankAndRender, 350);
els.prompt.addEventListener("input", debouncedRank);
els.budget.addEventListener("input", debouncedRank);
els.budget.addEventListener("change", rankAndRender);
els.city.addEventListener("input", debouncedRank);
els.city.addEventListener("change", rankAndRender);
els.nights.addEventListener("input", () => {
  updateTripEstimateDisplay();
  saveSearchState();
  checkTripPlanStale();
  // Hotel cards show a "$X total for N nights" line (see hotelCard) that
  // depends on this field - without a re-render it goes stale the moment
  // nights changes without anything else prompting a new search.
  debouncedRank();
});
els.checkInDate.addEventListener("input", () => {
  saveSearchState();
  updateCheckInCountdown();
  // Optional - every competitor (Kayak, Booking.com, Google Hotels) shows
  // actual check-in/check-out dates, not just a night count. Re-renders so
  // hotel cards can show the real date range once one is picked.
  debouncedRank();
});
els.guests.addEventListener("input", saveSearchState);

// Longer debounce than other fields: each search with a landmark set makes
// a real geocoding request (Nominatim), so typing shouldn't fire one per
// keystroke the way an in-memory filter change can.
const debouncedLandmarkRank = debounce(rankAndRender, 800);
els.landmark.addEventListener("input", debouncedLandmarkRank);
els.landmark.addEventListener("change", rankAndRender);

// i18n.js's language <select> calls this after switching languages and
// re-applying the static shell translations - re-renders the handful of
// already-rendered JS templates that also use t() (hotel card buttons,
// the theme toggle label) so the whole visible page updates immediately,
// not just the sidebar/header, without requiring a fresh search.
window.onLanguageChanged = function () {
  applyTheme(document.documentElement.getAttribute("data-theme") || "light");
  if (state.currentResults && state.currentResults.length) {
    els.results.innerHTML = state.currentResults.map(hotelCard).join("");
  }
  // Found in the same pass as the fix that made this panel translatable at
  // all: switching language live re-rendered every hotel card (and thus
  // metricLabels()) but never re-rendered the "DETECTED INTENT" line above
  // them, so it stayed frozen in whatever language was active at search
  // time. state.currentIntent is already cached from the last search -
  // just re-run the same translation used at search time.
  if (els.intentSummary) {
    const currentFoundLabels = foundReasonLabels();
    els.intentSummary.textContent = state.currentIntent.found.length
      ? state.currentIntent.found.map((key) => currentFoundLabels[key] || key).join(", ")
      : t("generalBalancedRanking");
  }
  // Same gap, same fix, one panel over: the "Decision model" weight
  // breakdown below the results also went stale on a live language
  // switch, for the identical reason - nothing re-ran renderScoringModel()
  // with the newly-selected language's labels.
  if (els.scoringModel && state.currentScoringModel.length) {
    renderScoringModel(state.currentScoringModel);
  }
  // Same gap: the neighborhood filter's "All neighborhoods" option and
  // its own <select> rebuild both use t() at render time, same as the
  // panels below - never re-rendered without this.
  if (state.currentNeighborhoods.length) renderNeighborhoodFilterOptions(state.currentNeighborhoods);
  // Same gap, same fix, applied to the newest offender: the persistent
  // "auto-applied filters" note (state.autoAppliedFilters, added this
  // session) hard-coded its label text in English at render time and was
  // never wired into this language-change handler like the two panels
  // above it already were - found by testing live language switching
  // against every recently-shipped feature, not just the ones this
  // handler already covered.
  renderAutoFiltersNote();
  // Same gap, in case the Price watches dialog happens to be open during
  // a live language switch - its delta/first-seen lines are built with
  // t() at render time same as every panel above, not marked up with
  // static data-i18n attributes.
  if (els.priceWatchesDialog?.open) renderPriceWatchesList();
  // Same gap: the real-Stripe billing widget's price label and button/
  // badge text are all set via t() at render time, not marked up with
  // static data-i18n attributes (the price label especially needs the
  // live-computed "$9.99/mo" string, not a fixed key) - never re-rendered
  // without this, same staleness class as every fix in this handler.
  renderProBillingWidget();
  // Same gap, one more panel: the smart packing list (generatePackingList,
  // just made translatable this same tick) is built once at trip-plan-
  // build time and cached nowhere language-specific - without this it
  // would still show whichever language was active when the plan was
  // built, same class of staleness as every fix above it.
  if (state.tripPlan) {
    renderPackingList();
    // Same fix, same tick, one more panel: renderBudgetBreakdown() was
    // just made translatable too (see budgetRow*/budgetEstimatedTotal
    // keys) and has the identical staleness risk as the packing list -
    // an already-built plan's cost breakdown would otherwise stay frozen
    // in whichever language was active when the plan was built.
    renderBudgetBreakdown();
    // Continuing the same audit into the Flight estimate card and the
    // destination-timezone/elevation line just below it - both had the
    // identical never-translated-anywhere gap as the panels above, found
    // by systematically checking every Trip Planner Pro render function.
    renderFlightEstimate(state.tripPlan.flightEstimate, state.tripPlan.flightError);
    renderDestinationTimezone(state.tripPlan.destinationTimezone);
    // Weather strip (day labels, historical-average line, condition
    // summary, precip/sunset lines) and the itinerary day cards' own
    // weather-condition line both just gained the same translation
    // coverage - same staleness risk as every panel above.
    renderWeatherStrip(state.tripPlan.weather, state.tripPlan.weatherError);
    renderItinerary();
    // Last panel in this audit: the POI browse list (category tabs, empty/
    // error states, distance line, "+ Day N" buttons) had the same gap.
    if (state.tripPlan.pointsOfInterest || state.tripPlan.poiError) {
      renderPoiTabs();
      renderPoiList();
    }
  }
  updateCheckInCountdown();
};

// Every competitor date picker (Kayak, Booking.com, Google Hotels) blocks
// picking a past check-in date directly in the calendar UI, rather than
// letting a traveler pick one and only finding out it's nonsensical later.
// Built from local Y/M/D (not toISOString(), which is UTC and can be a day
// off depending on the visitor's timezone - the same class of bug already
// fixed elsewhere in this file for date-string parsing).
function todayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Small honest countdown next to the optional check-in date - "12 days
// until check-in" - matching the anticipation-building convention most
// booking confirmations use (Airbnb, Booking.com), but computed purely
// from a date the traveler picked themselves, not a manufactured urgency
// nudge ("3 people are looking at this room right now" territory, which
// this app deliberately avoids - see the honesty notes throughout this
// README). Handles a stale past date gracefully (e.g. the page was left
// open past the picked date) rather than showing a nonsensical negative
// count.
function updateCheckInCountdown() {
  if (!els.checkInCountdown) return;
  const raw = els.checkInDate.value;
  if (!raw) {
    els.checkInCountdown.textContent = "";
    return;
  }
  const checkIn = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(checkIn.getTime())) {
    els.checkInCountdown.textContent = "";
    return;
  }
  const today = new Date(`${todayDateInputValue()}T00:00:00`);
  const days = Math.round((checkIn - today) / 86400000);
  if (days > 1) els.checkInCountdown.textContent = t("checkInCountdownPlural").replace("{n}", days);
  else if (days === 1) els.checkInCountdown.textContent = t("checkInCountdownSingular");
  else if (days === 0) els.checkInCountdown.textContent = t("checkInCountdownToday");
  else els.checkInCountdown.textContent = t("checkInCountdownPast");
}

async function bootstrap() {
  initTheme();
  updatePriceWatchesCount();
  const today = todayDateInputValue();
  if (els.checkInDate) els.checkInDate.min = today;
  if (els.tripStartDate) els.tripStartDate.min = today;
  applySearchState(loadSearchState());
  // A shared search link (see buildShareSearchUrl/#shareSearchButton) takes
  // priority over this browser's own saved state - applySearchState() only
  // overwrites fields present in whichever object it's given, so calling it
  // twice layers URL params on top of localStorage rather than replacing it
  // wholesale. Only fires on a link that actually has these params - a
  // plain bookmark/reload keeps behaving exactly as before.
  const sharedState = parseSearchStateFromUrl();
  if (sharedState) {
    applySearchState(sharedState);
    history.replaceState(null, "", location.pathname);
  }
  updateCheckInCountdown();
  renderWeights();
  renderRecentCities();
  renderRecentlyViewed();
  restoreTripPlanState();
  try {
    state.stripeConfig = await apiGet("/api/config");
  } catch (err) {
    console.error("Failed to load /api/config (billing widget will assume Stripe isn't configured):", err);
  }
  if (state.stripeConfig.stripeConfigured && state.proEmail) {
    try {
      await checkProStatus(state.proEmail);
    } catch (err) {
      // Network hiccup, not a real "subscription inactive" answer - leaves
      // the provisional local flag from restoreTripPlanState() in place
      // rather than punishing the traveler for a transient failure.
      console.error("Failed to verify Pro subscription status:", err);
    }
  }
  renderProBillingWidget();
  await handleBillingRedirect();
  try {
    await loadWorldCities();
  } catch (err) {
    console.error("Failed to load world city list (autocomplete will be empty):", err);
  }
  await rankAndRender();
}

bootstrap();
