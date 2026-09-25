# Longbox — comic tracker (design)

Date: 2026-09-25 · Repo: MLGGStaR/Comic · Folder: Desktop/Comic · Live: https://mlggstar.github.io/Comic/

## What it is

A phone-first comic tracking app, sibling of letterSizd: same palette, type, gestures
and layout vocabulary, for comics instead of films and shows. Four tabs, nothing else:

| Tab | Job |
|---|---|
| **Home** | Your numbers (owned · read · this year · value), friends' latest, your pull list this week, new this week, to read (owned but unread), coming up for your series, popular with friends, recent reads, wishlist out now. Ambient glow tinted by your last read cover. |
| **Search** | One input. "absolute batman #2" → that issue; "absolute batman vol 1" → the trade; "absolute batman" → the series. One main result, big; variants and reprints folded away; a "Not it?" expander for the few genuinely different matches. + button → scan menu. |
| **Calendar** | Month grid (Sun–Sat). Each day: top cover + release count; green dot when one of your series has a book. Tap a day → its full list below (popular / A–Z / publisher, your series pinned). Everything vs My series, publisher and format filters, swipe to change month. |
| **My Comics** | Three shelves up top (Comics = owned, Read, Wishlist) as fanned-cover tiles; each opens a full shelf with search, sort (added / read / rating / series / release / value / price), filters (publisher, year, format) and the rating histogram. Portfolio card (estimated value, change vs paid, value sparkline) → Portfolio screen. Stats. + FAB → scan menu. |

Pushed screens (slide in from the right, edge-swipe back, Android back button):
Comic (tabs **Overview · Variants · Reviews**), Series, Shelf, Portfolio, Stats, Profile (a friend), Friends.

Hold any cover anywhere → **quick-log sheet**: Have it / Read / Wishlist toggles, drag-to-rate stars
(rating ⇒ read, dated today), read date. Everything saves instantly (optimistic, rolled back on failure).

## Collection model

One row per comic per user (`comic_entries`), three independent flags:

- **owned** ("have it") — clears wishlist; wishlist is disabled while owned.
- **read** — rating and review imply read; un-reading clears rating/date/review.
- **wishlist**.
- all three off ⇒ row deleted.

Plus `rating` (½–5), `read_at`, `review`, `variants` (the specific covers owned; empty + owned = main
cover), `paid`, `value` (your override), `est` (market estimate), and `meta` — a denormalised
`ComicLite` snapshot so shelves render without refetching. Rules live in `src/lib/entry.ts` (tested).

**Value of an owned comic** (`src/lib/shelf.ts`, tested): your value › market estimate › cover price × copies.
The portfolio shows the total, change vs paid, a daily value history (`comic_value_history`), how each
number was estimated, value by publisher and the most valuable books.

## Scanning

The + menu (Search tab and My Comics) offers **Scan cover**, **Scan barcode**, **Type it**.

- **Barcode**: live camera, decoded in the browser. Modern issues carry UPC-A + a 5-digit add-on
  (issue number ×3, cover, printing); trades carry ISBN-13 + a price add-on. Check digits are verified
  (`src/lib/barcode.ts`, tested) so a misread never resolves to the wrong comic. Continuous mode lets
  you scan a stack.
- **Cover**: photo → Edge Function → Claude vision (`claude-opus-5`, structured JSON) reads series,
  issue, publisher and variant hints → candidate lookup → a second vision pass compares the photo with
  the candidate covers (main + variants) and picks the exact one. Low confidence shows the top
  alternatives instead of guessing.

## Architecture

- **Frontend**: Vite + React 18 + TypeScript + Tailwind, static PWA on GitHub Pages
  (`/Comic/`), deployed by GitHub Actions on every push (tests → build → Pages). Service worker:
  network-first shell, cache-first covers; `version.json` auto-update.
- **Accounts + data**: the letterSizd Supabase project (shared auth, profiles, avatars, friends).
  Tables: `comic_entries`, `comic_follows`, `comic_value_history` (RLS: signed-in users read all,
  write own), `comic_cache` and `comic_upc` (service role only). Schema: `supabase/schema.sql`.
- **Comic data**: one Edge Function, `comic-api`, fetches and parses the sources server-side, normalises
  them into `ComicLite` / `ComicDetail` / `SeriesDetail`, and caches in `comic_cache`. The client adds an
  IndexedDB stale-while-revalidate layer (instant screens, offline copies).
- **Secrets**: the Anthropic key lives only in Supabase function secrets; nothing secret ships in the repo.

## Data sources

_Filled in from the probe results — see the Data sources section below._

## Testing

- Unit (vitest): query parsing, barcode decoding, entry rules, shelf sort/filter, portfolio math, dates.
- Smoke (Playwright, iPhone viewport, live site): throwaway account → every tab, sheet and screen,
  screenshots, overflow / "undefined" / JS-error checks, then the account is deleted.
