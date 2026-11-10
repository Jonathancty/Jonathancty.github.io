# Institutional Sponsorship Screener

A CAN SLIM-style screen of US-listed stocks on **industry-group strength** and **institutional sponsorship**, published at [`/trading/screener/`](../../trading/screener/). It is a personal research tool, not investment advice.

Everything runs on free data: SEC EDGAR (13F, N-PORT, XBRL), Yahoo Finance via `yfinance`, the NASDAQ Trader symbol directory and OpenFIGI.

## How it fits the site

The site is static (GitHub Pages), so the "API endpoint" is a JSON file written by GitHub Actions, in the same way as the existing sentiment scraper.

| Workflow | When | What it does |
|---|---|---|
| `screener-daily.yml` | Weekdays 22:30 UTC | Runs the tests, scores the universe, writes `trading/screener/screener.json` |
| `screener-holdings.yml` | Sundays 06:00 UTC | Checks SEC for new 13F / N-PORT data sets and, only if there are new ones, rebuilds `_screener_cache/` |
| `screener-calibrate.yml` | Manual, plus quarterly | Backfills all history and writes `calibration.json` and [`CALIBRATION.md`](CALIBRATION.md) |

The page loads `screener.json` and recalculates the composite in the browser. That's how switching weight sets, adding sentiment as an 8th factor and the tech-only toggle work without a server.

### Setup

1. **Required:** add a repository secret named `SEC_CONTACT_EMAIL` (Settings → Secrets and variables → Actions). SEC asks every automated client to identify itself with a contact email in the User-Agent and blocks clients that don't. The email is only ever sent to sec.gov.
2. **Optional:** add `OPENFIGI_API_KEY` (free at openfigi.com). It raises the CUSIP→ticker lookup rate limit.
3. Run **Sponsorship Screener (holdings refresh)** once by hand. The first run downloads about 14 N-PORT and 13 13F data sets.
4. Run **Calibrate Screener Weights** to produce the first calibration report. The first backfill is several GB. If it hits the time limit, run it again: it carries on where it stopped.

All thresholds and weights live in [`config.yaml`](config.yaml).

## Universe (step 0)

- NYSE and NASDAQ common stocks from the NASDAQ Trader symbol files. OTC, ETFs, warrants, units, preferreds and SPACs are excluded. US-listed ADRs are included (`include_adrs`).
- Liquidity floor: price ≥ $10, market cap ≥ $1B, 50-day average dollar volume ≥ $20M.
- The page defaults to Technology and Communication Services, with a toggle for all sectors. Industry groups are always ranked across the whole market.
- **UK availability:** US-listed stocks can be bought from UK brokers once you've filed a W-8BEN. US-domiciled ETFs generally can't be, because there's no UK key information document. When a strong tech group maps to an ETF, the page shows its UCITS equivalent from [`ucits.py`](ucits.py) (Irish ISINs, LSE tickers, checked 2026-11-10). US ETFs with no UCITS version (IGV, FDN) are flagged "not UK-retail buyable", with the closest alternative named.

## The seven indicators

Each indicator scores 0–100 and gets a pass / partial / fail badge. **Missing data is "n/a", not 0.** The composite leaves it out and rescales the weights over what's available, and the page shows each row's coverage %.

| # | Indicator | Weight | Data source | Pass | Partial |
|---|---|---|---|---|---|
| 1 | **Industry group strength.** Equal-weighted group return, weighted 40% for the last 3 months and 20% each for 6/9/12 months, then ranked against all ~145 Yahoo industries | 20 | yfinance prices + Yahoo `industry` field | Top 20% of groups | Top 40% |
| 2 | **Leader, not sympathy.** Rank within the group on RS rating (40%), latest-quarter EPS growth (25%), annual EPS growth (15%) and latest-quarter revenue growth (20%) | 15 | yfinance prices, SEC XBRL frames | Top 3 in group | Top 40% of group |
| 3 | **Rising institutional ownership.** 13F holder count over 6 quarters: share of quarterly increases, run of consecutive increases, and trend slope. Counts are rescaled for growth in the number of 13F filers | 20 | SEC Form 13F data sets | Up in ≥ 3 of last 4 quarters | 2 of 4 |
| 4 | **Added owners last quarter.** Net new holders and % change in shares held, scored as percentiles against the universe | 10 | SEC Form 13F data sets | Both rose | One rose |
| 5 | **Sponsor quality.** Active equity mutual funds holding the stock, with 12-month and 3-year annualised returns ranked against peers. A quality sponsor is above the median on both and is holding or adding (shares not cut more than 2%). Each scores 1–3 conviction points, depending on position as a % of fund net assets | 20 | SEC Form N-PORT data sets (holdings + monthly returns) | ≥ 3 quality sponsors | ≥ 1 |
| 6 | **Top-rated growth fund sponsorship.** Growth-style funds graded A+ to E by the percentile of their 36-month return (year weights 50/25/25, most recent first). Counts A+/A/A-/B+ funds holding or adding | 10 (≈ 1 in a correction) | SEC Form N-PORT | ≥ 3 such funds | ≥ 1 |
| 7 | **Not over-owned.** Scores 100 up to 80% institutional ownership, 30 at 90% and 0 at 100%. A ≥ 3% drop in holders after ≥ 3 straight increases (possible distribution) costs 50 points | 5 | Yahoo `heldPercentInstitutions`, else 13F value ÷ market cap | ≤ 80% and no distribution signal | ≤ 90% |

**Sympathy stocks:** a stock is flagged when its daily returns track the group leader (correlation ≥ 0.70 over 60 sessions), it is weaker on RS or EPS growth, and it has no catalyst of its own. A catalyst means a gap of ≥ 4% on ≥ 1.5× average volume that didn't happen within a day of a leader gap. Sympathy stocks have their leader score capped at 20 and lose 15 composite points. The catalyst test only uses price and volume, because free data has no reliable news feed.

**Market regime:** "Confirmed uptrend" means the S&P 500 and NASDAQ are both above a rising 200-day moving average with fewer than 5 distribution days in 25 sessions. 5–6 distribution days is "under pressure". A falling or broken 200-day average, or 7+ distribution days while an index is below its 50-day average, is a "Correction". A distribution day is a ≥ 0.2% drop on higher volume, and it expires once the index rallies 5% above it. In a correction, indicator 6 drops to weight 1 and the other 9 points go half each to indicators 1 and 5.

**Composite** = Σ(weight × score) / Σ(weight of available indicators) − 15 if the stock is a sympathy stock. **Criteria met** counts passes (X/7) and lists partials separately. Social sentiment from the existing StockTwits/VADER pipeline is shown as its own column. It only enters the composite when you turn on the 8th-factor toggle, with a configurable weight.

## Data freshness

| Source | Lag |
|---|---|
| 13F | Quarter-end holdings, filed up to 45 days later. SEC publishes the data sets every three months, so data can be 2–5 months old |
| N-PORT | Public fund holdings ~60 days after quarter end, then published by SEC quarterly |
| XBRL frames | A quarter counts 45 days after it ends (75 days for annual figures) |
| Prices / classification | Daily / refreshed every 30 days |

The page shows a "data as of" chip for each source, highlighted when it's stale.

## Calibration

`calibrate.py` scores every past quarter-end using only data that was available on that date:

- timely 13F filings only,
- N-PORT reports that were already public,
- XBRL figures past their reporting lag,
- prices up to that day.

It then measures forward 3- and 6-month returns against QQQ, and reports each indicator's information coefficient (Spearman, averaged across dates), t-stat, and pass-badge hit rate against the base rate.

The suggested weights are the positive mean ICs normalised to 100 and blended 50/50 with the defaults. Walk-forward validation fits weights for each test date only on earlier dates whose forward window had already closed, and reports the composite's IC and top-decile excess return out of sample. The page shows default and calibrated weights side by side and lets you pick which set is active.

**Biases to keep in mind:**

- Survivorship: only currently listed tickers have price history.
- Today's industry classification and share counts are applied to past dates.
- N-PORT starts in Oct 2019, so indicators 5 and 6 only have about 4 years of usable history.
- Overlapping 6-month windows inflate t-stats.

## Code layout

```
scripts/screener/
  config.yaml            all weights and thresholds
  data/                  sec.py, holdings_13f.py, holdings_nport.py, fundamentals.py, universe.py,
                         prices.py, info_cache.py, cusip_map.py, holdings_view.py
  indicators/            one module per indicator (+ rs.py, common.py)
  funds.py               fund performance, grades, per-stock sponsor metrics
  regime.py              bull / pressure / correction + weight redistribution
  scoring.py             composite, coverage, criteria met
  engine.py              scores the universe as of any date (shared by build and calibrate)
  build.py               daily entry point -> trading/screener/screener.json
  refresh_holdings.py    weekly entry point -> _screener_cache/
  calibrate.py           calibration -> trading/screener/calibration.json + CALIBRATION.md
  ucits.py               US ETF -> UCITS map
  tests/                 pytest, fixture-based (python -m pytest scripts/screener/tests)
```
