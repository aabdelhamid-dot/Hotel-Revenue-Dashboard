# 🏨 Hotel Revenue Dashboard — INN Hotels

A revenue-management analysis of **36,275 hotel bookings (2017–2018)**, with an interactive
dashboard of core KPIs and prioritized recommendations to increase revenue.

👉 **[View the live dashboard](https://aabdelhamid-dot.github.io/hotel-revenue-dashboard/)**


> **Disclaimer:** Personal learning project using a generic, publicly-circulated sample
> hotel-bookings dataset (synthetic booking IDs, no personal or company data). Not affiliated
> with or derived from my employer or any of its systems.

---

## The headline finding

**Cancellations are the single biggest revenue leak.** 32.8% of all bookings cancel,
destroying ~**$4.3M of booked room-night value — 37.9% of total potential revenue**
($11.3M booked → $7.1M realized). Every recommendation below targets it.

## Core KPIs

| KPI | Value | Read |
|---|---|---|
| Cancellation rate | **32.8%** | Very high; ~20% is a typical healthy ceiling |
| ADR (all / kept) | $103 / $100 | Cancellations skew toward higher-rate bookings |
| Avg length of stay | 3.0 nights | Weekday-heavy (80k week vs 29k weekend nights) |
| Avg lead time | 85 days | Long lead → high cancellation exposure |
| Repeat-guest share | **2.6%** | Almost no loyalty base — large upside |
| Avg special requests | 0.62 | Low engagement signal |

## What drives the leak

- **Lead time is the strongest predictor.** 0–7 days → 8.9% cancel; 91–180 days → 44.9%; **180+ days → 73.9%.**
- **Special requests signal commitment.** 0 requests → 43% cancel; 2 → 15%; **3+ → ~0%.**
- **Channel.** Online is 64% of volume but cancels 36.5% and accounts for **77% ($3.3M) of all lost value**. Corporate cancels only 11%; repeat guests only 1.7%.
- **Seasonality.** Demand and ADR peak Sep–Oct (~$116 ADR); cancellation spikes in summer (Jul 45%), lowest Dec–Jan.

## Recommendations (smallest useful step first)

| Priority | Action | Why / Impact |
|---|---|---|
| **P1** | Tiered deposit policy by lead time | Non-refundable terms on 90+ day bookings (45–74% cancel) — targets the bulk of the $4.3M leak |
| **P1** | Capture special requests at booking | Moving guests 0→1 request cuts cancellation 43% → 24%; near-zero cost |
| P2 | Repeat-guest / loyalty program | 2.6% repeat share, yet they cancel just 1.7% — stickiest segment |
| P2 | Channel-aware overbooking | Recover Online's predictable 36% fallout; budget for walk costs |
| P2 | Dynamic pricing in Sep–Oct peak | Demand & ADR both peak — raise rates, tighten discounts |
| P2 | Midweek / corporate packages | Week nights (80k) ≫ weekend (29k); corporate cancels just 11% |

**Risk:** stricter deposit policies can suppress total bookings — pilot per segment and track
*realized* revenue, not just cancellation rate.

## Data note

The source file has **no room inventory or occupancy**, so true RevPAR/occupancy cannot be
computed. "Value" = ADR × length of stay (room-night value). ADR, cancellation, lead time,
channel and seasonal mix are fully reliable.

---

## Reproduce it

```bash
pip install -r requirements.txt
python analyze.py        # prints the full report and writes metrics.json
```

`analyze.py` reads `Hotel Reservations.csv`, prints every KPI table, and emits **`metrics.json`** —
the exact figures embedded in the dashboard.

## Files

| File | Purpose |
|---|---|
| `index.html` | Self-contained dashboard (Chart.js via CDN); fetches `metrics.json` at runtime, with an embedded fallback for `file://` |
| `analyze.py` | Full KPI analysis; writes `metrics.json` |
| `metrics.json` | Computed figures the dashboard renders from |
| `requirements.txt` | Python dependencies |
| `.github/workflows/deploy.yml` | CI: rebuilds `metrics.json` and deploys to Pages on every push |
| `Hotel Reservations.csv` | Source data (36,275 bookings) |

## Publish to GitHub Pages

```bash
git init && git add . && git commit -m "Add hotel revenue dashboard"
gh repo create hotel-revenue-dashboard --public --source=. --push
```

Then set Pages to deploy from the workflow (one time):

```bash
gh api -X POST repos/{owner}/hotel-revenue-dashboard/pages -f build_type=workflow
```

Or in the UI: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The included workflow (`.github/workflows/deploy.yml`) then runs automatically: on every push
that touches the CSV, `analyze.py`, or `index.html`, it reinstalls deps, **re-runs `analyze.py`
to regenerate `metrics.json`**, and deploys the dashboard. You never hand-edit the published data.

Site lands at `https://<your-username>.github.io/hotel-revenue-dashboard/`.

### Local preview with live data

Because browsers block `fetch` on `file://`, run a local server to see live mode:

```bash
python -m http.server 8000   # then open http://localhost:8000
```
