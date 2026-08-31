# StayRank AI Visual Redesign + Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out the approved "Editorial Trust" visual identity (Newsreader + Roboto, navy-in-light/gold-in-dark color tokens) across every page on the site, and declutter the main search page by collapsing secondary sidebar controls and moving trust/about content to a new dedicated `about.html`.

**Architecture:** Pure frontend change — no backend/API/schema changes. Color and typography are CSS-custom-property swaps in the two places they're defined (`styles.css` for `index.html`; an identical embedded `<style>` block copied into `methodology.html` and all 11 files under `guides/`). The declutter work moves three DOM sections out of `index.html` into a new static-ish `about.html` (+ small `about.js` for its one live data need), and wraps two sidebar panels in a native `<details>` accordion.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no build step, no test runner). FastAPI backend is untouched by this plan.

**Spec:** `docs/superpowers/specs/2026-08-30-visual-redesign-declutter-design.md`

## Global Constraints

- No backend, API, or database changes in this plan (spec: "Explicitly out of scope").
- No new pages beyond `about.html` — the 10 guide pages get re-themed (colors/fonts only), not restructured (spec: "Explicitly out of scope").
- This project has **no git repository** (`git status` returns "fatal: not a git repository" — confirmed). **Skip every "commit" step below that a normal plan would include** — there is nothing to commit to. Save files directly; that is the durable record until the user sets up a repo.
- This project has **no test runner and no test files anywhere in the codebase**. "Verify" steps below mean: start the two local preview servers already configured in `.claude/launch.json` (`static-server` on port 4173, `backend-api` on port 8000) and check specific, concrete things in the browser — console errors, computed styles, link hrefs, interaction behavior. This is the same verification method already used to build every prior feature in this codebase this session.
- Every color/typography value below is taken directly from the approved spec. Do not invent new values or "improve" them mid-implementation — if a value looks wrong once rendered, stop and flag it rather than silently picking a different one.
- Bump the cache-busting `?v=N` query string on every `<link>`/`<script>` tag you touch in a file (increment by 1 from whatever is currently there), same convention already used throughout `index.html`.

---

### Task 1: New color + typography tokens in `styles.css`

**Files:**
- Modify: `styles.css:1-92`

**Interfaces:**
- Produces: the CSS custom properties every later task's pages read (`--ink`, `--muted`, `--line`, `--soft`, `--paper`, `--cream`, `--accent`, `--accent-tint`, `--accent-strong`, `--accent-text`, `--accent-solid`, `--accent-ink`, `--shadow`, `--shadow-lift` — `--green`/`--green-tint`/`--green-text`/`--amber`/`--amber-tint`/`--rose` are unchanged, listed here so later tasks know not to touch them).

- [ ] **Step 1: Replace the light-mode `:root` block**

Find (lines 1-48):
```css
:root {
  color-scheme: light;
  --ink: #2a182e;
  --muted: #7a6b7d;
  --line: #d4d1d5;
  --soft: #f3f1ee;
  --paper: #ffffff;
  --cream: #f7f6f3;
  --accent: #cdb3ff;
  --accent-tint: #f2ecff;
  --accent-strong: #8a63f0;
```
Replace the whole `:root { ... }` block (through its closing `}` right before the `/* Dark mode: ... */` comment) with:
```css
:root {
  color-scheme: light;
  --ink: #0f172a;
  --muted: #475569;
  --line: #cbd5e1;
  --soft: #f1f5f9;
  --paper: #ffffff;
  --cream: #f8fafc;
  --accent: #93a9d8;
  --accent-tint: #e7ecf9;
  --accent-strong: #2544a0;
  /* Darker than --accent-strong: used only where the color sits on text
     (confidence pill, AI insight label) - same reasoning as before this
     redesign, re-verify contrast (target 4.5:1 on --accent-tint) once
     rendered rather than trusting this number unchecked. */
  --accent-text: #1e3a8a;
  --accent-solid: #1e3a8a;
  --accent-ink: #ffffff;
  --green: #138a62;
  --amber: #8a5200;
  --rose: #b42318;
  --amber-tint: #fff3d8;
  --green-tint: #ddf7ed;
  --green-text: #075e44;
  --shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
  --shadow-lift: 0 26px 54px rgba(15, 23, 42, 0.18);
}
```

- [ ] **Step 2: Replace the dark-mode `:root[data-theme="dark"]` block**

Find:
```css
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #f1eaf7;
  --muted: #a99bb5;
  --line: #423a4c;
  --soft: #241c2c;
  --paper: #1c1622;
  --cream: #15101a;
  --accent: #cdb3ff;
  --accent-tint: #2f2440;
  --accent-strong: #b79bff;
  --accent-text: #d8c6ff;
  --accent-ink: #1c1622;
  --green: #3ddb9b;
  --amber: #ffb648;
  --rose: #ff8177;
  --amber-tint: #3a2a10;
  --green-tint: #123829;
  --green-text: #3ddb9b;
  --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
  --shadow-lift: 0 26px 54px rgba(0, 0, 0, 0.55);
}
```
Replace with (same structure, navy tokens flip to gold — accent-solid becomes the primary CTA color in dark mode, per spec):
```css
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #f1f5f9;
  --muted: #94a3b8;
  --line: #334155;
  --soft: #1e293b;
  --paper: #111c33;
  --cream: #0b1220;
  --accent: #d4a017;
  --accent-tint: #2a2410;
  --accent-strong: #e8c25c;
  --accent-text: #e8c25c;
  --accent-ink: #1c1400;
  --accent-solid: #d4a017;
  --green: #3ddb9b;
  --amber: #ffb648;
  --rose: #ff8177;
  --amber-tint: #3a2a10;
  --green-tint: #123829;
  --green-text: #3ddb9b;
  --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
  --shadow-lift: 0 26px 54px rgba(0, 0, 0, 0.55);
}
```

- [ ] **Step 3: Swap the body font stack**

Find:
```css
  font-family: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```
Replace with:
```css
  font-family: "Roboto", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

- [ ] **Step 4: Add a heading font rule right after the `body { ... }` block**

Insert immediately after the `body { ... }` rule (before `.skip-link`):
```css
h1, h2, h3, .brand h1, .hotel-head h3, dialog h2 {
  font-family: "Newsreader", Georgia, "Times New Roman", serif;
}
```

- [ ] **Step 5: Verify tokens compile (no browser needed yet)**

Run: `grep -c "accent-solid: #1e3a8a" styles.css` — expect `1`. Run: `grep -c "accent-solid: #d4a017" styles.css` — expect `1`. This just confirms the edits landed; visual verification happens in Task 2 once fonts are wired up too.

---

### Task 2: Wire the new fonts into `index.html` and bump cache-busting

**Files:**
- Modify: `index.html:32-37` (font `<link>` tags), `index.html:35` (`styles.css?v=`) , `index.html:457` (`i18n.js?v=`) , `index.html:458` (`app.js?v=`)

*(Line numbers are as of this plan's writing — if earlier tasks in a different order shifted them, find the tags by content, not line number.)*

**Interfaces:**
- Consumes: nothing from Task 1 directly (CSS file, not JS) — this task just makes the browser actually load the new font families Task 1's CSS references.

- [ ] **Step 1: Replace the Google Fonts `<link>`**

Find:
```html
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
```
Replace with:
```html
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;0,600;0,700;1,400&family=Roboto:wght@400;500;700&display=swap" />
```

- [ ] **Step 2: Bump `styles.css` cache-bust**

Find `styles.css?v=50` (or whatever number is currently there — check the file), replace with the next integer up.

- [ ] **Step 3: Verify fonts load with no console errors**

Start both preview servers (`static-server` name from `.claude/launch.json` on 4173, `backend-api` on 8000). Navigate to `http://localhost:4173/index.html`. Check `read_console_messages` with `onlyErrors: true` — expect none related to font loading. Use `javascript_tool` to run:
```js
getComputedStyle(document.querySelector("h1")).fontFamily
```
Expect the string to start with `"Newsreader"`. Run the same for `document.body` — expect it to start with `"Roboto"`.

- [ ] **Step 4: Verify dark mode still applies the flipped accent correctly**

Via `javascript_tool`:
```js
document.documentElement.setAttribute("data-theme", "dark");
getComputedStyle(document.documentElement).getPropertyValue("--accent-solid").trim();
```
Expect `"#d4a017"`. Set it back: `document.documentElement.setAttribute("data-theme", "light")`.

---

### Task 3: Apply the same token + font swap to `methodology.html` and all 11 files under `guides/`

**Files:**
- Modify: `methodology.html`
- Modify: `guides/index.html`
- Modify: `guides/quiet-hotels-tokyo-near-subway.html`
- Modify: `guides/pet-friendly-hotels-kyoto.html`
- Modify: `guides/wheelchair-accessible-hotels-london.html`
- Modify: `guides/best-time-to-visit-new-york-hotels.html`
- Modify: `guides/business-hotels-new-york-fast-wifi.html`
- Modify: `guides/hotels-near-sensoji-temple-tokyo-walking-time.html`
- Modify: `guides/how-to-search-hotels-plain-english.html`
- Modify: `guides/family-friendly-hotels-london-room-size.html`
- Modify: `guides/verified-guest-rating-vs-star-rating-kyoto.html`
- Modify: `guides/currency-conversion-hotel-prices-tokyo.html`

**Interfaces:**
- Produces: the same navy/gold Editorial Trust look on every static content page, matching Task 1/2's app pages exactly (same hex values).

These 12 files all embed their own copy of the same `<style>` block (this was deliberate when they were built — fully static, zero shared-CSS dependency). `guides/index.html` has a shorter variant (no `--green`/`--amber`, it has no badges); the other 11 have the full variant.

- [ ] **Step 1: `guides/index.html` — replace its short `:root` pair**

Find:
```css
      :root {
        --ink: #2a182e; --muted: #7a6b7d; --line: #d4d1d5; --soft: #f3f1ee; --paper: #ffffff; --cream: #f7f6f3;
        --accent: #cdb3ff; --accent-tint: #f2ecff; --accent-strong: #8a63f0; --accent-text: #6d28d9; --accent-solid: #6d28d9;
        --shadow: 0 18px 42px rgba(42, 24, 46, 0.1);
      }
      :root[data-theme="dark"] {
        --ink: #f1eaf7; --muted: #a99bb5; --line: #423a4c; --soft: #241c2c; --paper: #1c1622; --cream: #15101a;
        --accent: #cdb3ff; --accent-tint: #2f2440; --accent-strong: #b79bff; --accent-text: #d8c6ff; --accent-solid: #cdb3ff;
        --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }
```
Replace with:
```css
      :root {
        --ink: #0f172a; --muted: #475569; --line: #cbd5e1; --soft: #f1f5f9; --paper: #ffffff; --cream: #f8fafc;
        --accent: #93a9d8; --accent-tint: #e7ecf9; --accent-strong: #2544a0; --accent-text: #1e3a8a; --accent-solid: #1e3a8a;
        --shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
      }
      :root[data-theme="dark"] {
        --ink: #f1f5f9; --muted: #94a3b8; --line: #334155; --soft: #1e293b; --paper: #111c33; --cream: #0b1220;
        --accent: #d4a017; --accent-tint: #2a2410; --accent-strong: #e8c25c; --accent-text: #e8c25c; --accent-solid: #d4a017;
        --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }
```

- [ ] **Step 2: The 10 guide detail pages — replace their full `:root` pair**

The 10 guide detail pages (every file in the list above except `guides/index.html`) share this exact compact 4-line form. For **each** of the 10 files, find:
```css
        --ink: #2a182e; --muted: #7a6b7d; --line: #d4d1d5; --soft: #f3f1ee; --paper: #ffffff; --cream: #f7f6f3;
        --accent: #cdb3ff; --accent-tint: #f2ecff; --accent-strong: #8a63f0; --accent-text: #6d28d9; --accent-solid: #6d28d9;
        --green: #138a62; --green-tint: #ddf7ed; --green-text: #075e44;
        --amber: #8a5200; --amber-tint: #fff3d8; --shadow: 0 18px 42px rgba(42, 24, 46, 0.1);
```
Replace with:
```css
        --ink: #0f172a; --muted: #475569; --line: #cbd5e1; --soft: #f1f5f9; --paper: #ffffff; --cream: #f8fafc;
        --accent: #93a9d8; --accent-tint: #e7ecf9; --accent-strong: #2544a0; --accent-text: #1e3a8a; --accent-solid: #1e3a8a;
        --green: #138a62; --green-tint: #ddf7ed; --green-text: #075e44;
        --amber: #8a5200; --amber-tint: #fff3d8; --shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
```

And find:
```css
        --ink: #f1eaf7; --muted: #a99bb5; --line: #423a4c; --soft: #241c2c; --paper: #1c1622; --cream: #15101a;
        --accent: #cdb3ff; --accent-tint: #2f2440; --accent-strong: #b79bff; --accent-text: #d8c6ff; --accent-solid: #cdb3ff;
        --green: #3ddb9b; --green-tint: #123829; --green-text: #3ddb9b;
        --amber: #ffb648; --amber-tint: #3a2a10; --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
```
Replace with:
```css
        --ink: #f1f5f9; --muted: #94a3b8; --line: #334155; --soft: #1e293b; --paper: #111c33; --cream: #0b1220;
        --accent: #d4a017; --accent-tint: #2a2410; --accent-strong: #e8c25c; --accent-text: #e8c25c; --accent-solid: #d4a017;
        --green: #3ddb9b; --green-tint: #123829; --green-text: #3ddb9b;
        --amber: #ffb648; --amber-tint: #3a2a10; --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
```

- [ ] **Step 2a: `methodology.html` — replace its full `:root` pair (same values, one-per-line format)**

Find (`methodology.html`'s `:root { ... }` block, one variable per line):
```css
      :root {
        --ink: #2a182e;
        --muted: #7a6b7d;
        --line: #d4d1d5;
        --soft: #f3f1ee;
        --paper: #ffffff;
        --cream: #f7f6f3;
        --accent: #cdb3ff;
        --accent-tint: #f2ecff;
        --accent-strong: #8a63f0;
        --accent-text: #6d28d9;
        --accent-solid: #6d28d9;
        --green: #138a62;
        --green-tint: #ddf7ed;
        --green-text: #075e44;
        --amber: #8a5200;
        --amber-tint: #fff3d8;
        --shadow: 0 18px 42px rgba(42, 24, 46, 0.1);
      }
```
Replace with:
```css
      :root {
        --ink: #0f172a;
        --muted: #475569;
        --line: #cbd5e1;
        --soft: #f1f5f9;
        --paper: #ffffff;
        --cream: #f8fafc;
        --accent: #93a9d8;
        --accent-tint: #e7ecf9;
        --accent-strong: #2544a0;
        --accent-text: #1e3a8a;
        --accent-solid: #1e3a8a;
        --green: #138a62;
        --green-tint: #ddf7ed;
        --green-text: #075e44;
        --amber: #8a5200;
        --amber-tint: #fff3d8;
        --shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
      }
```

Find (`methodology.html`'s `:root[data-theme="dark"] { ... }` block):
```css
      :root[data-theme="dark"] {
        --ink: #f1eaf7;
        --muted: #a99bb5;
        --line: #423a4c;
        --soft: #241c2c;
        --paper: #1c1622;
        --cream: #15101a;
        --accent: #cdb3ff;
        --accent-tint: #2f2440;
        --accent-strong: #b79bff;
        --accent-text: #d8c6ff;
        --accent-solid: #cdb3ff;
        --green: #3ddb9b;
        --green-tint: #123829;
        --green-text: #3ddb9b;
        --amber: #ffb648;
        --amber-tint: #3a2a10;
        --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }
```
Replace with:
```css
      :root[data-theme="dark"] {
        --ink: #f1f5f9;
        --muted: #94a3b8;
        --line: #334155;
        --soft: #1e293b;
        --paper: #111c33;
        --cream: #0b1220;
        --accent: #d4a017;
        --accent-tint: #2a2410;
        --accent-strong: #e8c25c;
        --accent-text: #e8c25c;
        --accent-solid: #d4a017;
        --green: #3ddb9b;
        --green-tint: #123829;
        --green-text: #3ddb9b;
        --amber: #ffb648;
        --amber-tint: #3a2a10;
        --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }
```

- [ ] **Step 3: In all 12 files, swap the Google Fonts `<link>` and add the heading rule**

Find (appears once per file):
```html
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
```
Replace with:
```html
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;0,600;0,700;1,400&family=Roboto:wght@400;500;700&display=swap" />
```

Find, in `guides/index.html` and the 10 guide detail pages (single-line form):
```css
      body { margin: 0; background: var(--cream); color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif; line-height: 1.6; }
```
Replace with:
```css
      body { margin: 0; background: var(--cream); color: var(--ink); font-family: "Roboto", system-ui, -apple-system, sans-serif; line-height: 1.6; }
      h1, h2, .brand strong { font-family: "Newsreader", Georgia, "Times New Roman", serif; }
```

Find, in `methodology.html` only (its body rule is multi-line, not the compact single-line form above):
```css
      body {
        margin: 0;
        background: var(--cream);
        color: var(--ink);
        font-family: "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
        line-height: 1.6;
      }
```
Replace with:
```css
      body {
        margin: 0;
        background: var(--cream);
        color: var(--ink);
        font-family: "Roboto", system-ui, -apple-system, sans-serif;
        line-height: 1.6;
      }
      h1, h2, .brand strong { font-family: "Newsreader", Georgia, "Times New Roman", serif; }
```

- [ ] **Step 4: Bump each file's own asset-loading if it has any versioned query strings**

These 12 files load Google Fonts (no versioning needed there) and have no local `?v=` JS/CSS assets of their own (they're self-contained) — nothing to bump here. Skip.

- [ ] **Step 5: Verify all 12 pages render with the new palette and no console errors**

Start `static-server`. For each of the 12 URLs below, navigate, check `read_console_messages(onlyErrors: true)` is empty, and check via `javascript_tool`:
```js
getComputedStyle(document.querySelector("h1")).fontFamily
```
starts with `"Newsreader"`.

URLs: `http://localhost:4173/methodology.html`, `http://localhost:4173/guides/`, and each of the 10 `http://localhost:4173/guides/<filename>.html` from the file list above.

---

### Task 4: Create `about.html`

**Files:**
- Create: `about.html`

**Interfaces:**
- Consumes: the trust-list markup and founder-dashboard/advertise-panel markup currently in `index.html` (moved here, not duplicated — Task 6 removes them from `index.html`).
- Produces: `#founderDashboardAbout` (a container element `about.js` renders 3 stat tiles into) and `#copyAdvertiseEmailButtonAbout` (the copy-email button `about.js` wires up). These are new IDs, distinct from `index.html`'s `#founderDashboard`/`#copyAdvertiseEmailButton`, so both pages can exist without ID collisions if ever loaded in the same context (they won't be, but it costs nothing to keep them distinct and it makes it obvious which page a stray console error is about).

This page follows the same standalone-static-page pattern as `methodology.html`/`guides/*.html` (own embedded `<style>` block using the Task 3 navy/gold tokens, own theme pre-paint script, own `header.top` shell) — **except** it also loads `about.js` (Task 5) at the bottom, since it has one live data need (founder dashboard's 3 sitewide stats) and one interactive need (copy-email button) that a fully static page can't provide.

**Important refinement from the spec:** the spec said the founder dashboard moves "verbatim." It doesn't, fully — `renderFounderDashboard(data)` in `app.js` computes 7 stat tiles, but 4 of them (`Avg match confidence`, `Shortlist conversion`, `Top detected intent`, `Shortlist nightly value`) are derived from the search just run and the current shortlist (see `app.js:2294-2320`) — there is no "current search" on a standalone About page, so showing those would read as permanently broken (`0%`, `$0`, empty). This page shows only the 3 genuinely sitewide stats: **Hotels indexed**, **Cities live**, **Live Booking.com cities** — all computed from `GET /api/cities` alone, no search required.

- [ ] **Step 1: Write `about.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>About StayRank AI</title>
    <meta name="description" content="Why StayRank AI exists, what it promises never to do, real usage stats, and how to reach the person who built it." />
    <meta property="og:title" content="About StayRank AI" />
    <meta property="og:description" content="No fake urgency, no paid placement, no invented reviews - and what that actually means in practice." />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="https://clearstay.online/about.html" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%9B%8F%3C/text%3E%3C/svg%3E" />
    <script>
      (function () {
        try {
          const saved = localStorage.getItem("stayrank-theme");
          const theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          document.documentElement.setAttribute("data-theme", theme);
        } catch {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,500;0,600;0,700;1,400&family=Roboto:wght@400;500;700&display=swap" />
    <style>
      :root {
        --ink: #0f172a; --muted: #475569; --line: #cbd5e1; --soft: #f1f5f9; --paper: #ffffff; --cream: #f8fafc;
        --accent: #93a9d8; --accent-tint: #e7ecf9; --accent-strong: #2544a0; --accent-text: #1e3a8a; --accent-solid: #1e3a8a;
        --green: #138a62; --green-tint: #ddf7ed; --green-text: #075e44;
        --amber: #8a5200; --amber-tint: #fff3d8; --shadow: 0 18px 42px rgba(15, 23, 42, 0.1);
      }
      :root[data-theme="dark"] {
        --ink: #f1f5f9; --muted: #94a3b8; --line: #334155; --soft: #1e293b; --paper: #111c33; --cream: #0b1220;
        --accent: #d4a017; --accent-tint: #2a2410; --accent-strong: #e8c25c; --accent-text: #e8c25c; --accent-solid: #d4a017;
        --green: #3ddb9b; --green-tint: #123829; --green-text: #3ddb9b;
        --amber: #ffb648; --amber-tint: #3a2a10; --shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--cream); color: var(--ink); font-family: "Roboto", system-ui, -apple-system, sans-serif; line-height: 1.6; }
      h1, h2, .brand strong { font-family: "Newsreader", Georgia, "Times New Roman", serif; }
      a { color: var(--accent-text); }
      .wrap { max-width: 740px; margin: 0 auto; padding: 0 24px 96px; }
      header.top { display: flex; align-items: center; justify-content: space-between; padding: 28px 24px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
      .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); }
      .brand-mark { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, var(--accent-strong), var(--accent-solid)); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 17px; flex-shrink: 0; }
      .brand strong { font-size: 17px; display: block; }
      .backlink { font-size: 14px; font-weight: 600; text-decoration: none; color: var(--accent-text); white-space: nowrap; }
      .eyebrow { font-size: 12.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-text); margin: 32px 0 14px; }
      h1 { font-size: clamp(28px, 5vw, 38px); line-height: 1.15; margin: 0 0 18px; letter-spacing: -0.01em; }
      .dek { font-size: 17px; color: var(--muted); margin: 0 0 40px; max-width: 62ch; }
      h2 { font-size: 21px; margin: 44px 0 14px; letter-spacing: -0.01em; }
      p { margin: 0 0 14px; }
      .trust-list { list-style: none; padding: 0; margin: 18px 0; display: grid; gap: 10px; }
      .trust-list li { padding: 14px 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; font-size: 14.5px; box-shadow: var(--shadow); }
      .trust-list li strong { color: var(--ink); }
      .founder-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 18px 0; }
      .founder-item { padding: 14px 16px; background: linear-gradient(160deg, var(--accent-tint), var(--soft)); border: 1px solid var(--line); border-radius: 16px; }
      .founder-item strong { display: block; font-size: 22px; font-family: "Newsreader", Georgia, serif; margin-bottom: 4px; }
      .founder-item span { color: var(--muted); font-size: 13px; }
      .founder-loading { color: var(--muted); font-size: 14px; }
      .advertise-card { padding: 20px 22px; background: var(--paper); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); margin: 18px 0; }
      .card-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
      .card-actions a, .card-actions button { padding: 12px 20px; border-radius: 999px; font-weight: 700; text-decoration: none; cursor: pointer; font: inherit; font-size: 14px; }
      .card-actions a.book { background: var(--accent-solid); color: #fff; border: none; }
      :root[data-theme="dark"] .card-actions a.book { color: #1c1400; }
      .card-actions button.link-button { background: none; border: 1px solid var(--line); color: var(--accent-text); }
      .go-deeper { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 18px 0; }
      .go-deeper a { display: block; text-decoration: none; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; box-shadow: var(--shadow); }
      .go-deeper a strong { display: block; margin-bottom: 4px; font-family: "Newsreader", Georgia, serif; font-size: 16px; }
      .go-deeper a span { color: var(--muted); font-size: 13.5px; }
      #toastContainer { position: fixed; top: 16px; right: 16px; z-index: 999; display: flex; flex-direction: column; gap: 8px; }
      .toast { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; background: var(--paper); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 13.5px; color: var(--ink); }
      .toast-dismiss { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; margin-left: 4px; }
      footer.note { margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--muted); }
      @media (max-width: 640px) { .founder-grid, .go-deeper { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div id="toastContainer"></div>
    <header class="top">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">SR</span>
        <strong>StayRank AI</strong>
      </a>
      <a class="backlink" href="/">&larr; Back to the app</a>
    </header>

    <div class="wrap">
      <p class="eyebrow">About</p>
      <h1>Every ranking, fully documented.</h1>
      <p class="dek">StayRank AI is a solo-built hotel-ranking prototype with one rule that never bends: a hotel's position is a function of real data and your stated priorities, never a payment.</p>

      <h2>Why this beats a typical booking site</h2>
      <ul class="trust-list">
        <li><strong>No fake urgency.</strong> Never "Only 1 room left!" - UK/EU regulators have flagged that exact practice on major OTAs since 2024.</li>
        <li><strong>Real reviews only.</strong> When live data is on, every review comes straight from Booking.com, unedited - nothing purchased, filtered, or fabricated.</li>
        <li><strong>Zero ads.</strong> No sponsored placements bend the ranking - every hotel is scored by the same model you can inspect.</li>
        <li><strong>No notification spam.</strong> No push notifications, no re-engagement emails, ever.</li>
        <li><strong>Transparent AI.</strong> Every match reason is grounded in the hotel's actual data, not a black-box score.</li>
        <li><strong>All-in pricing.</strong> The nightly price shown is the price - no fees revealed only at checkout.</li>
        <li><strong>Accessibility, only when confirmed.</strong> The &#9855; Accessible filter only shows hotels with a specifically reported wheelchair-accessible room or facility (real Hotelbeds data) - we never treat "not reported" as "not accessible."</li>
        <li><strong>No AI review smoothing.</strong> "What guests actually mention" counts real keyword mentions across a hotel's own unedited reviews - never an AI-generated summary.</li>
      </ul>

      <h2>Real usage, right now</h2>
      <div id="founderDashboardAbout" class="founder-grid">
        <p class="founder-loading">Loading real stats…</p>
      </div>

      <h2>Advertise on StayRank AI</h2>
      <div class="advertise-card">
        <p>StayRank AI is an independently built, ad-free ranking engine - no placement here ever changes a hotel's score. If your travel brand, hotel group, or tourism board wants to reach travelers through a separate, clearly labeled spot (never blended into the ranking itself), get in touch.</p>
        <ul class="trust-list">
          <li><strong>Never a ranking boost.</strong> Sponsorship can buy visibility, never a better score.</li>
          <li><strong>Always labeled.</strong> Any paid placement is marked "Sponsored" - no exceptions.</li>
          <li><strong>Real reply, real person.</strong> This is solo-run - your email goes straight to the founder.</li>
        </ul>
        <div class="card-actions">
          <a class="book" href="mailto:wwm.8195967@gmail.com?subject=Advertising%20on%20StayRank%20AI">&#9993;&#65039; Contact about advertising</a>
          <button type="button" class="link-button" id="copyAdvertiseEmailButtonAbout" data-email="wwm.8195967@gmail.com">&#128203; Copy email</button>
        </div>
      </div>

      <h2>Go deeper</h2>
      <div class="go-deeper">
        <a href="methodology.html">
          <strong>How the ranking works &rarr;</strong>
          <span>The full scoring formula, weight table, and real-fact-vs-estimate breakdown.</span>
        </a>
        <a href="guides/">
          <strong>Hotel search guides &rarr;</strong>
          <span>Specific, honest answers to specific hotel-search questions.</span>
        </a>
      </div>

      <footer class="note">
        StayRank AI is a prototype MVP at <a href="https://clearstay.online">clearstay.online</a>.
      </footer>
    </div>

    <script src="about.js?v=1"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the file is well-formed HTML with no `about.js` yet**

Start `static-server`, navigate to `http://localhost:4173/about.html`. Expect a 404 in the console for `about.js` (Task 5 hasn't created it yet — that's expected right now) but otherwise a fully rendered page: trust list, "Loading real stats…" placeholder, advertise card, go-deeper cards. Confirm via `javascript_tool`: `getComputedStyle(document.querySelector("h1")).fontFamily` starts with `"Newsreader"`.

---

### Task 5: Create `about.js`

**Files:**
- Create: `about.js`

**Interfaces:**
- Consumes: `GET /api/cities` (existing endpoint, unchanged — returns `[{id, name, country, heroImage, hotelCount, source, lastSyncedAt}, ...]`, confirmed at `backend/main.py:187-216`), the `#founderDashboardAbout` and `#copyAdvertiseEmailButtonAbout` elements from Task 4.
- Produces: nothing consumed by later tasks — this is a leaf script for `about.html` only.

This is a small, self-contained script — deliberately **not** a copy of `app.js`. It duplicates two small helpers (`copyTextToClipboard`, `showToast`) rather than sharing them with `app.js`, so `about.html` stays independently loadable exactly like `methodology.html`/`guides/*.html`, with no risk of `app.js`'s many unguarded `document.querySelector(...).addEventListener(...)` calls throwing on a page that doesn't have those elements.

- [ ] **Step 1: Write `about.js`**

```js
// Same same-origin/localhost API_BASE resolution as app.js, duplicated
// rather than shared - this page loads independently, the same way
// methodology.html and guides/*.html do, and must not depend on app.js.
const API_BASE =
  window.STAYRANK_API_BASE ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

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

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.innerHTML = `<span aria-hidden="true">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span><button type="button" class="toast-dismiss" aria-label="Dismiss">×</button>`;
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.remove();
  };
  toast.querySelector(".toast-dismiss").addEventListener("click", dismiss);
  setTimeout(dismiss, 5000);
  container.appendChild(toast);
}

// Only the 3 stats that are genuinely sitewide (not derived from a
// search that isn't running on this page) - see the plan task's
// "Important refinement from the spec" note for why the other 4 fields
// renderFounderDashboard() computes in app.js don't belong here.
async function loadFounderDashboard() {
  const el = document.getElementById("founderDashboardAbout");
  if (!el) return;
  try {
    const response = await fetch(`${API_BASE}/api/cities`);
    if (!response.ok) throw new Error(`API error ${response.status}`);
    const cities = await response.json();
    const totalHotels = cities.reduce((sum, city) => sum + city.hotelCount, 0);
    const liveCities = cities.filter((city) => city.source === "live").length;
    const cards = [
      { label: "Hotels indexed", value: totalHotels },
      { label: "Cities live", value: cities.length },
      { label: "Live Booking.com cities", value: liveCities },
    ];
    el.innerHTML = cards
      .map((card) => `<div class="founder-item"><strong>${card.value}</strong><span>${escapeHtml(card.label)}</span></div>`)
      .join("");
  } catch (err) {
    console.error("StayRank About: couldn't load real stats:", err);
    el.innerHTML = `<p class="founder-loading">Couldn't load real stats right now.</p>`;
  }
}

document.getElementById("copyAdvertiseEmailButtonAbout")?.addEventListener("click", async () => {
  const btn = document.getElementById("copyAdvertiseEmailButtonAbout");
  const copied = await copyTextToClipboard(btn.dataset.email);
  showToast(copied ? "Email address copied to clipboard." : "Couldn't copy automatically - please copy the address manually.", copied ? "success" : "error");
});

loadFounderDashboard();
```

- [ ] **Step 2: Verify live stats load and the copy button works**

Start both preview servers. Navigate to `http://localhost:4173/about.html`. Wait ~1s, then via `javascript_tool`:
```js
document.getElementById("founderDashboardAbout").children.length
```
Expect `3` (three `.founder-item` tiles, not the loading placeholder). Check `read_console_messages(onlyErrors: true)` is empty. Then simulate the copy click:
```js
document.getElementById("copyAdvertiseEmailButtonAbout").click();
```
Wait briefly, then check a `.toast` element exists: `document.querySelector(".toast")?.textContent` should contain "copied" or "Couldn't copy" (either is a valid pass — clipboard access can be denied in a sandboxed test browser; what matters is the toast fired, not which branch).

---

### Task 6: Declutter `index.html` — sidebar accordion, remove moved sections, reposition Best Time panel, consolidate header nav

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `about.html` (Task 4) must exist before this task's header-nav link is meaningful (it will 404 until Task 4 lands — do this task after Task 4/5, not before).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Consolidate the header nav to one "About StayRank AI" link**

Find:
```html
            <p data-i18n="tagline">Hotel rankings from real traveler intent.</p>
            <a href="methodology.html" class="how-it-works-link">How the ranking works &rarr;</a>
            <a href="guides/" class="how-it-works-link" data-i18n="guidesLink">Hotel search guides &rarr;</a>
          </div>
```
Replace with:
```html
            <p data-i18n="tagline">Hotel rankings from real traveler intent.</p>
            <a href="about.html" class="how-it-works-link" data-i18n="aboutLink">About StayRank AI &rarr;</a>
          </div>
```

- [ ] **Step 2: Add the `aboutLink` i18n key**

In `i18n.js`, find:
```js
    communityReviewSuccess: "Posted! Thanks for sharing - your story is live above.",
    guidesLink: "Hotel search guides →",
  },
  es: {
```
Replace with:
```js
    communityReviewSuccess: "Posted! Thanks for sharing - your story is live above.",
    aboutLink: "About StayRank AI →",
  },
  es: {
```
(This removes the now-unused `guidesLink` key rather than leaving dead i18n data — nothing else references it after Step 1.)

Bump `i18n.js?v=` in `index.html`'s `<script src="i18n.js?v=42">` tag to the next integer.

- [ ] **Step 3: Wrap "Hard requirements" and "Ranking priorities" in a collapsed accordion**

Find the two `<section class="panel">` blocks for Hard requirements and Ranking priorities (the ones containing `id="mustHaves"` and `id="weights"`). Wrap both inside a single `<details>` element, replacing:
```html
        <section class="panel">
          <div class="section-title">
            <h2 data-i18n="hardRequirements">Hard requirements</h2>
            <button id="clearMusts" type="button" data-i18n="clear">Clear</button>
          </div>
          <p class="subline" id="autoMustsNote" aria-live="polite" hidden></p>
          <div class="check-grid" id="mustHaves">
```
with:
```html
        <details class="panel accordion-panel" id="filtersAccordion">
          <summary class="accordion-summary">
            <span data-i18n="filtersAccordionLabel">Hard requirements &amp; priorities</span>
            <span id="filtersAccordionCount" class="count-pill" hidden></span>
          </summary>
        <section class="panel accordion-inner">
          <div class="section-title">
            <h2 data-i18n="hardRequirements">Hard requirements</h2>
            <button id="clearMusts" type="button" data-i18n="clear">Clear</button>
          </div>
          <p class="subline" id="autoMustsNote" aria-live="polite" hidden></p>
          <div class="check-grid" id="mustHaves">
```
and find the closing of the Ranking priorities section:
```html
        <section class="panel">
          <div class="section-title">
            <h2 data-i18n="rankingPriorities">Ranking priorities</h2>
            <button id="resetWeights" type="button" data-i18n="reset">Reset</button>
          </div>
          <div id="weights" class="weights"></div>
        </section>
      </aside>
```
replace with:
```html
        <section class="panel accordion-inner">
          <div class="section-title">
            <h2 data-i18n="rankingPriorities">Ranking priorities</h2>
            <button id="resetWeights" type="button" data-i18n="reset">Reset</button>
          </div>
          <div id="weights" class="weights"></div>
        </section>
        </details>
      </aside>
```
(Net effect: one `<details class="panel accordion-panel">` now wraps both original `<section class="panel">` blocks, which become `<section class="panel accordion-inner">` — un-nested `<section>` inside `<details>` is valid HTML, this is a pure wrap, no content removed.)

- [ ] **Step 4: Add accordion CSS**

In `styles.css`, add (anywhere after the `.panel` rule — e.g. right after it):
```css
.accordion-panel {
  padding: 0;
}
.accordion-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 18px;
  cursor: pointer;
  font-weight: 700;
  list-style: none;
}
.accordion-summary::-webkit-details-marker {
  display: none;
}
.accordion-summary::after {
  content: "\25B8";
  color: var(--muted);
  transition: transform 0.15s ease;
}
.accordion-panel[open] .accordion-summary::after {
  transform: rotate(90deg);
}
.accordion-inner {
  margin: 0 18px 18px;
  padding: 0;
  background: none;
  border: none;
}
.accordion-inner + .accordion-inner {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
```
Bump `styles.css?v=` in `index.html` to the next integer (same bump as Task 1/2 if not already done in this session — don't double-bump; check the current number first).

- [ ] **Step 5: Wire the active-filter count badge in `app.js`**

This reuses the existing `#priceWatchesCount`-style `.count-pill` pattern already in the codebase. `state.musts` is a `Set` of active must-have values (confirmed at `app.js:5876-5883`); the default weights constant is `defaultWeights` (lowercase, `app.js:136-146`), and `state.weights` is a plain object keyed the same way. Every must-have checkbox change and every weight-slider `input` event already calls `rankAndRender()` (confirmed at `app.js:5885` and `app.js:1759`), so one call site inside `rankAndRender()` covers both — no separate listener needed.

Add this function (anywhere above `rankAndRender`, e.g. right before it):
```js
function updateFiltersAccordionCount() {
  const badge = document.getElementById("filtersAccordionCount");
  if (!badge) return;
  const changedWeights = Object.keys(defaultWeights).filter((key) => state.weights[key] !== defaultWeights[key]).length;
  const count = state.musts.size + changedWeights;
  if (count > 0) {
    badge.textContent = String(count);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}
```

Find (in `rankAndRender`, `app.js:2520-2522`):
```js
  await refreshCachedCities();
  if (token !== requestToken) return;
  renderFounderDashboard(data);
```
Replace with:
```js
  await refreshCachedCities();
  if (token !== requestToken) return;
  renderFounderDashboard(data);
  updateFiltersAccordionCount();
```

- [ ] **Step 6: Remove the trust-list, founder-dashboard, and advertise-panel sections**

Find and delete these three `<section class="panel">` blocks entirely from the `.decision-panel` aside (content has already been moved to `about.html` in Task 4 — this is a pure deletion here, not a move):
```html
            <section class="panel">
              <h2 data-i18n="whyBeats">Why this beats a typical booking site</h2>
              <ul class="trust-list">
                ...
              </ul>
            </section>

            <section class="panel">
              <h2 data-i18n="founderDashboard">Founder dashboard</h2>
              <div id="founderDashboard" class="founder-grid"></div>
            </section>

            <section class="panel advertise-panel">
              <h2 data-i18n="advertiseTitle">Advertise on StayRank AI</h2>
              ...
            </section>
```
(Copy the exact current content of these three blocks from `index.html` before deleting — this plan doesn't repeat the full HTML here since Task 4 already has the canonical copy that landed in `about.html`.)

- [ ] **Step 7: Reposition the Best Time to Visit panel**

Find (currently inside the `.decision-panel` aside, before "Decision model"):
```html
            <section class="panel" id="bestTimeSection" hidden>
              <h2 data-i18n="bestTimeToVisit">Best time to visit</h2>
              <p class="subline" data-i18n="bestTimeSubline">Real historical temperature and rainfall by month - not a "best month" score, since this app has no real crowd or event data to back one.</p>
              <div id="bestTimeSummary" class="best-time-summary"></div>
              <div id="bestTimeGrid" class="best-time-grid"></div>
            </section>
```
Delete it from that location. Then find, in the main results column:
```html
            <div id="recentlyViewedRow" class="recently-viewed-row" role="group" aria-label="Recently viewed hotels" hidden></div>
            <div class="filter-strip" role="group" aria-label="Filter results">
```
and insert the same `<section id="bestTimeSection" ...>` block (moved verbatim, same id/classes/children — every attribute identical to what was deleted above) directly between those two lines, so the order becomes: recently-viewed row → Best Time panel → filter strip → results grid. No JS changes needed here — `fetchBestTimeToVisit`/`renderBestTimeToVisit` target `#bestTimeSection`/`#bestTimeSummary`/`#bestTimeGrid` by ID regardless of DOM position.

- [ ] **Step 8: Verify the full decluttered page**

Start both preview servers, navigate to `http://localhost:4173/`, run a search (click "Rank hotels"). Verify via `get_page_text` / `read_page`:
- The right column no longer contains "Why this beats a typical booking site", "Founder dashboard", or "Advertise on StayRank AI" text.
- "Best time to visit" now appears above the results grid, not in the right column, and populates after the search resolves (same check pattern used earlier this session: wait ~1.5s, check `document.getElementById("bestTimeSection").hidden` is `false` for a city with enough historical data, e.g. Tokyo).
- The sidebar's "Hard requirements & priorities" accordion starts closed (`document.getElementById("filtersAccordion").open` is `false` or the attribute is absent) and opens on click.
- The header now shows exactly one link, "About StayRank AI →", pointing to `about.html`.
- `read_console_messages(onlyErrors: true)` is empty.

---

### Task 7: Guard `renderFounderDashboard` against the now-removed `#founderDashboard` element

**Files:**
- Modify: `app.js:2294`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderFounderDashboard` becomes a safe no-op on any page (or any future state) where `#founderDashboard` doesn't exist, instead of throwing.

This must land **before or together with** Task 6 Step 6 — if Task 6's deletion ships first without this guard, the very next search on `index.html` throws `TypeError: Cannot set properties of null (setting 'innerHTML')` inside `rankAndRender()`, which — because `renderFounderDashboard(data)` is called synchronously partway through that function — would abort the rest of `rankAndRender()` and break search results rendering entirely. Do not skip or reorder this task relative to Task 6.

- [ ] **Step 1: Add the guard**

Find:
```js
function renderFounderDashboard(data) {
  const totalHotels = state.cities.reduce((sum, city) => sum + city.hotelCount, 0);
```
Replace with:
```js
function renderFounderDashboard(data) {
  // #founderDashboard lived on index.html until the About-page redesign
  // moved founder stats to about.html/about.js - guard rather than
  // remove the call site, since it costs nothing and protects against
  // any future page that calls rankAndRender() without that element.
  if (!els.founderDashboard) return;
  const totalHotels = state.cities.reduce((sum, city) => sum + city.hotelCount, 0);
```

- [ ] **Step 2: Verify the guard actually prevents the crash**

With Task 6 already applied (so `#founderDashboard` no longer exists in `index.html`), start both preview servers, load `http://localhost:4173/`, run a search. Confirm via `read_console_messages(onlyErrors: true)` that there is no `TypeError` and that the results grid actually populates (`document.getElementById("results").children.length > 0`).

---

### Task 8: Add `about.html` to `sitemap.xml`

**Files:**
- Modify: `sitemap.xml`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the entry**

Find:
```xml
  <url>
    <loc>https://clearstay.online/methodology.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```
Insert immediately after it:
```xml
  <url>
    <loc>https://clearstay.online/about.html</loc>
    <lastmod>2026-08-30</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 2: Verify well-formed XML**

Run: `.venv/Scripts/python.exe -c "import xml.etree.ElementTree as ET; ET.parse('sitemap.xml'); print('valid')"` from the project root. Expect `valid` printed, no exception.

---

### Task 9: Full-site verification pass

**Files:** none (verification only)

**Interfaces:** none — this task exercises every interface produced by Tasks 1-8 together.

- [ ] **Step 1: Start both preview servers**

`static-server` (port 4173) and `backend-api` (port 8000), per `.claude/launch.json`.

- [ ] **Step 2: Console-error sweep across every page**

For each URL, navigate and check `read_console_messages(onlyErrors: true)` is empty:
`/`, `/about.html`, `/methodology.html`, `/guides/`, and all 10 `/guides/<file>.html` pages (13 URLs total).

- [ ] **Step 3: Light/dark mode check on `index.html` and `about.html`**

On each of those two pages, via `javascript_tool`:
```js
document.documentElement.setAttribute("data-theme", "dark");
getComputedStyle(document.documentElement).getPropertyValue("--accent-solid").trim();
```
Expect `"#d4a017"`. Then:
```js
document.documentElement.setAttribute("data-theme", "light");
getComputedStyle(document.documentElement).getPropertyValue("--accent-solid").trim();
```
Expect `"#1e3a8a"`.

- [ ] **Step 4: Link-integrity check**

Via `javascript_tool` on `/`, confirm `document.querySelector('a[href="about.html"]')` exists (the consolidated header link). On `/about.html`, confirm both `a[href="methodology.html"]` and `a[href="guides/"]` exist. Then actually navigate to each of those two hrefs from `about.html` and confirm a 200 (no 404 page).

- [ ] **Step 5: End-to-end search flow on `index.html`**

Run a real search (Tokyo, default prompt). Confirm: results render, Best Time panel appears above results once populated, clicking the "Hard requirements & priorities" summary opens the accordion and its contents (checkboxes, weight sliders) are interactive exactly as before, no console errors at any point in the flow.

- [ ] **Step 6: Report results**

Summarize pass/fail for each check above. Any failure blocks calling this plan complete — fix and re-run Task 9 from Step 2, don't skip ahead.
