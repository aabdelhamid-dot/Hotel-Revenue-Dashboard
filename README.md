# 🏨 Hotel KPI Dashboard Builder

A **standalone, client-side dashboard app for hotel revenue managers.** Upload a booking-data CSV
export from any PMS, map its columns to a common set of hotel fields, then pick from a catalog of
20+ industry-standard revenue-management KPIs to build a dashboard — all rendered live in the
browser. No backend, no install, no data ever leaves the browser tab.

👉 **[Try the live app](https://aabdelhamid-dot.github.io/Hotel-Revenue-Dashboard/)**

> **Disclaimer:** Personal project. The bundled sample dataset is a generic, publicly-circulated
> hotel-bookings dataset (synthetic booking IDs, no personal or company data). Not affiliated with
> or derived from my employer or any of its systems.

---

## What it does

1. **Load data** — drag & drop your own CSV, or load the bundled 36,275-booking sample dataset to explore.
2. **Map columns** — the app auto-detects common hotel PMS column names (rate, nights, lead time,
   status, market segment, room type, etc.) and lets you fix anything it guessed wrong. Fields you
   don't have can be left unmapped; KPIs that need them are simply marked unavailable rather than
   breaking the app.
3. **Set property details** — property name, currency, and total room count (needed to unlock
   Occupancy Rate and RevPAR).
4. **Pick your KPIs** — a sidebar catalog grouped by category lets you toggle exactly the metrics
   you want on the dashboard. Selections persist locally between visits.
5. **Get a dashboard** — stat cards and charts render instantly from your data, computed entirely
   in-browser.

## KPI catalog

| Category | KPIs |
|---|---|
| Revenue & Yield | Total Bookings, ADR, Occupancy Rate, RevPAR, Potential Revenue, Realized Revenue, Revenue Lost to Cancellations, Revenue by Room Type |
| Demand & Bookings | Cancellation Rate, Avg. Length of Stay, Avg. Booking Lead Time, Booking Pace by Lead Time, Seasonality by Month, Weekend vs. Weekday Nights |
| Guest Profile | Repeat Guest Rate, Avg. Special Requests, Avg. Party Size, Parking Request Rate |
| Channel & Segment | Market Segment Mix, Cancellation Rate by Segment, ADR by Segment |
| Room Type | Room Type Mix, Cancellation Rate by Room Type |

KPIs that need columns your data doesn't have (e.g. Occupancy/RevPAR without a room count) are
greyed out in the picker instead of producing broken numbers.

## Why standalone / sellable

- **Zero backend, zero internet dependency.** Static HTML/CSS/JS with Chart.js and PapaParse
  vendored locally (`js/vendor/`) — host it anywhere (GitHub Pages, S3, a USB stick, an intranet
  server) or hand a hotel a folder to open locally, no CDN or connectivity required at runtime.
- **Privacy by design.** CSV parsing and every KPI calculation happen in the visitor's browser;
  booking data is never transmitted anywhere.
- **Bring-your-own-data.** Column mapping means it isn't locked to one PMS export format.
- **White-label ready.** Property name, currency, and branding live in `index.html`/`css/style.css`
  and are trivial to reskin per customer.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell — load/map/settings/dashboard steps |
| `css/style.css` | Styling (dark theme, responsive, print-friendly) |
| `js/app.js` | CSV parsing (PapaParse), column auto-mapping, KPI engine, Chart.js rendering |
| `js/vendor/` | Vendored PapaParse &amp; Chart.js (MIT-licensed, bundled for offline use) |
| `Hotel Reservations.csv` | Bundled sample dataset (36,275 bookings) for the "try it now" path |
| `.github/workflows/update report.yml` | CI: deploys the static app to GitHub Pages on every push |

## Run it locally

Because browsers block `fetch()` on `file://`, serve the folder over HTTP to use the bundled
sample dataset (uploading your own CSV works either way):

```bash
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy

Push to `main` — the included GitHub Actions workflow copies `index.html`, `css/`, `js/`, and the
sample CSV to GitHub Pages automatically. In the repo settings, set **Pages → Build and
deployment → Source: GitHub Actions** once.
