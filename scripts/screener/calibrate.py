"""Historical calibration: how predictive is each indicator, and what weights does the data suggest?

    python -m scripts.screener.calibrate

For every past quarter-end D (as far back as the data allows), every indicator is computed
using ONLY data available on D:
  * prices up to D,
  * 13F quarters whose 45-day filing deadline had passed by D (timely filings only),
  * N-PORT fund holdings/returns filed by D and at least 60 days old,
  * XBRL EPS/revenue at least 45 days (quarterly) / 75 days (annual) past period end.
Then forward 3- and 6-month returns versus QQQ are measured.

Reports per indicator: information coefficient (Spearman rank correlation of score with forward
excess return, averaged over dates) and hit rate (share of 'pass' stocks beating QQQ vs the base
rate). Suggested weights = positive mean IC normalised to 100, blended 50/50 with the defaults.
Walk-forward validation: weights for test date D are fitted only on dates whose forward window
had fully closed before D, and results are reported out-of-sample.

Known biases (also printed in the report): survivorship (only currently listed tickers have
price history), current industry classification and current share counts used historically.
"""
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import funds as fundlib
from . import regime as regime_mod
from .config import INDICATORS, cache_dir, cache_path, hist_dir, hist_path, load_config, output_path, repo_path
from .data import cusip_map, fundamentals, holdings_13f, holdings_nport, info_cache, prices, universe
from .data.holdings_view import ticker_panels
from .data.sec import SecClient, company_tickers
from .engine import Context, indicator_frame, score_universe
from .scoring import composite_frame

TIMELY = pd.Timedelta(days=holdings_13f.TIMELY_DAYS)


# ---------------------------------------------------------------------------
# Statistics (pure functions, unit-tested)
# ---------------------------------------------------------------------------
def spearman(a, b):
    m = a.notna() & b.notna()
    if m.sum() < 10 or a[m].nunique() < 2:
        return np.nan
    return float(a[m].rank().corr(b[m].rank()))


def ic_table(panel, horizon_col, min_n):
    """panel: rows = (date, ticker) with indicator score columns and forward excess returns.
    Returns DataFrame date x indicator of ICs."""
    out = {}
    for d, g in panel.groupby("date"):
        if g[horizon_col].notna().sum() < min_n:
            continue
        out[d] = {k: spearman(g[k], g[horizon_col]) for k in INDICATORS + ["composite_default"] if k in g}
    return pd.DataFrame.from_dict(out, orient="index").sort_index()


def summarise_ic(ics):
    s = {}
    for k in ics.columns:
        x = ics[k].dropna()
        if len(x) == 0:
            s[k] = {"mean_ic": None, "t_stat": None, "n_dates": 0, "pct_positive": None}
            continue
        sd = x.std(ddof=1) if len(x) > 1 else np.nan
        s[k] = {"mean_ic": float(x.mean()), "t_stat": float(x.mean() / sd * np.sqrt(len(x))) if sd and sd > 0 else None,
                "n_dates": int(len(x)), "pct_positive": float((x > 0).mean() * 100)}
    return s


def hit_rates(panel, horizon_col):
    """Share of 'pass' stocks that beat the benchmark, vs the base rate of all scored stocks."""
    p = panel.dropna(subset=[horizon_col])
    base = float((p[horizon_col] > 0).mean() * 100) if len(p) else None
    out = {}
    for k in INDICATORS:
        sel = p[p[f"{k}_status"] == "pass"]
        out[k] = {"pass_hit_rate": float((sel[horizon_col] > 0).mean() * 100) if len(sel) else None,
                  "pass_obs": int(len(sel)), "base_rate": base,
                  "pass_avg_excess_pct": float(sel[horizon_col].mean() * 100) if len(sel) else None}
    return out


def weights_from_ic(mean_ic, default, blend):
    """Positive mean ICs normalised to 100, blended with the defaults, rounded to sum to 100."""
    pos = {k: max(0.0, float(mean_ic.get(k) or 0.0)) for k in INDICATORS}
    tot = sum(pos.values())
    if tot <= 0:
        raw = {k: float(default[k]) for k in INDICATORS}
    else:
        raw = {k: 100.0 * v / tot for k, v in pos.items()}
    mixed = {k: blend * default[k] + (1 - blend) * raw[k] for k in INDICATORS}
    return raw, round_to_100(mixed)


def round_to_100(w):
    floor = {k: int(np.floor(v)) for k, v in w.items()}
    short = 100 - sum(floor.values())
    for k in sorted(w, key=lambda k: -(w[k] - floor[k]))[:max(short, 0)]:
        floor[k] += 1
    return floor


def walk_forward(panel, dates, horizon_days, cfg, default):
    """Out-of-sample composite IC: for each test date, fit weights on dates whose forward window
    closed before it, then score the test date with those (blended) weights."""
    cal = cfg["calibration"]
    col = f"fwd_{horizon_days}"
    res = []
    for i, d in enumerate(dates):
        train = [t for t in dates[:i] if t + pd.tseries.offsets.BDay(horizon_days) <= d]
        if len(train) < cal["min_train_dates"]:
            continue
        tp = panel[panel["date"].isin(train)]
        ic = summarise_ic(ic_table(tp, col, cal["min_stocks_per_date"]))
        _, w = weights_from_ic({k: ic.get(k, {}).get("mean_ic") for k in INDICATORS}, default, cal["blend_with_default"])
        g = panel[panel["date"] == d]
        if g[col].notna().sum() < cal["min_stocks_per_date"]:
            continue
        reg = g["regime"].iloc[0]
        wc = regime_mod.regime_weights(w, reg, cfg)
        wd = regime_mod.regime_weights(default, reg, cfg)
        comp_c = composite_frame(g, wc, g["sympathy"], cfg["composite"]["sympathy_penalty"])
        comp_d = composite_frame(g, wd, g["sympathy"], cfg["composite"]["sympathy_penalty"])
        top_n = max(10, len(g) // 10)
        res.append({
            "date": str(d.date()), "ic_calibrated": spearman(comp_c, g[col]), "ic_default": spearman(comp_d, g[col]),
            "top_decile_excess_calibrated": float(g.loc[comp_c.nlargest(top_n).index, col].mean()),
            "top_decile_excess_default": float(g.loc[comp_d.nlargest(top_n).index, col].mean()),
            "weights": w,
        })
    return res


# ---------------------------------------------------------------------------
# Panel construction
# ---------------------------------------------------------------------------
def quarter_ends(start, end):
    return list(pd.date_range(start, end, freq=pd.offsets.QuarterEnd()))


def last_trading_day(index, d):
    pos = index.searchsorted(d, side="right") - 1
    return index[pos] if pos >= 0 else None


def build_panel(cfg):
    cal = cfg["calibration"]
    now = pd.Timestamp(datetime.now(timezone.utc).date())
    dates = [d for d in quarter_ends(cal["start_date"], now) if d <= now - pd.Timedelta(days=95)]
    start_px = (pd.Timestamp(cal["start_date"]) - pd.Timedelta(days=420)).strftime("%Y-%m-%d")

    listed = universe.listed_common_stocks(cfg)
    syms = list(listed["symbol"])
    print(f"Calibration: {len(dates)} quarter-ends {dates[0].date()} .. {dates[-1].date()}, {len(syms)} listed symbols")
    px_path = hist_path(cfg, "calibration_prices.parquet")
    if os.path.exists(px_path) and (datetime.now().timestamp() - os.path.getmtime(px_path)) < 5 * 86400:
        wide = pd.read_parquet(px_path)
        px = {k: wide.xs(k, axis=1, level=0) for k in ("Open", "Close", "Volume")}
    else:
        px = prices.download(syms + ["^GSPC", "^IXIC", cal["benchmark"]], start=start_px)
        pd.concat(px, axis=1).to_parquet(px_path)
    closes, opens, vols = px["Close"], px["Open"], px["Volume"]
    bench = closes[cal["benchmark"]]

    # tickers that were liquid on at least one calibration date need industry info
    ever = set()
    for d in dates:
        c = closes.loc[:d].tail(60)
        adv = (c * vols.loc[:d].tail(60)).tail(50).mean()
        ever |= set(adv[(adv >= cfg["universe"]["min_avg_dollar_volume_50d"]) & (c.ffill().iloc[-1] >= cfg["universe"]["min_price"])].index)
    ever -= {"^GSPC", "^IXIC", cal["benchmark"]}
    cfg_info = json.loads(json.dumps(cfg))
    cfg_info["universe"]["info_max_refresh_per_run"] = 4000
    info = info_cache.refresh(cache_path(cfg, "info.json"), sorted(ever), cfg_info)
    ser = lambda k: pd.Series({t: (info.get(t) or {}).get(k) for t in ever})
    industries, sectors = ser("industry"), ser("sector")
    shares_out = pd.to_numeric(ser("sharesOutstanding"), errors="coerce")

    client = SecClient(cfg)
    labels = fundamentals.period_labels(pd.Timestamp(cal["start_date"]).year - 2, now)
    fdir = hist_dir(cfg, "frames")
    fundamentals.fetch_frames(client, fdir, labels, refresh_recent=0)
    ftable = fundamentals.build_table(fdir, labels)
    cik_map = company_tickers(client)

    counts = holdings_13f.load_counts(cache_dir(cfg, "13f"))
    cmap = cusip_map.load(cache_path(cfg, "cusip_map.json"))
    holders_all, shares_all, values_all, filers_all = ticker_panels(counts, cmap, list(ever))
    t2c = cusip_map.ticker_to_cusips(cmap)

    nport_hist = hist_dir(cfg, "nport")
    small = cache_dir(cfg, "nport")
    nsets = holdings_nport.available_datasets(nport_hist)
    nhold = holdings_nport.load_part(nport_hist, nsets, "holdings")
    if len(nhold):
        wanted = {c for t in ever for c in t2c.get(t, [])}
        nhold = nhold[nhold["CUSIP"].isin(wanted)]      # only stocks we can score: keeps memory sane
    small_sets = sorted({f.split(".")[0] for f in os.listdir(small) if f.endswith(".returns.parquet")})
    nret = holdings_nport.load_part(small, small_sets, "returns")
    nfunds = holdings_nport.load_part(small, small_sets, "funds")

    tech = set(cfg["universe"]["tech_sectors"])
    frames = []
    for d in dates:
        td = last_trading_day(closes.index, d)
        if td is None:
            continue
        mcap = closes.loc[td].reindex(shares_out.index) * shares_out
        g = fundamentals.growth_as_of(ftable, d, ciks=[cik_map[t] for t in ever if t in cik_map])
        fund = pd.DataFrame({t: g.loc[cik_map[t]] for t in ever if t in cik_map and cik_map[t] in g.index}).T
        known = [p for p in holders_all.index if p + TIMELY <= d]
        known = known[-(cfg["indicators"]["inst_trend"]["lookback_quarters"] + 1):]
        sponsors = None
        if len(nhold):
            # latest quarter-end whose N-PORT reports were public (60 days) by d
            label = pd.offsets.QuarterEnd().rollback(d - pd.Timedelta(days=holdings_nport.AVAILABLE_LAG_DAYS)).normalize()
            cur = holdings_nport.holdings_for_label(nhold, label, as_of=d)
            prev = holdings_nport.holdings_for_label(nhold, label - pd.offsets.QuarterEnd(1), as_of=d)
            if len(cur) and cur["SERIES_ID"].nunique() > 500:
                rw = holdings_nport.combine_returns(nret, as_of=d)
                if len(rw):
                    perf = fundlib.fund_performance(rw, label, cfg)
                    rated = fundlib.rate_funds(holdings_nport.latest_fund_info(nfunds, as_of=d), perf, cfg)
                    sponsors = fundlib.sponsor_metrics(cur, prev, rated, cfg)
        ctx = Context(closes=closes.loc[:td].drop(columns=["^GSPC", "^IXIC", cal["benchmark"]], errors="ignore"),
                      opens=opens.loc[:td], volumes=vols.loc[:td], industries=industries, sectors=sectors,
                      market_caps=mcap, fundamentals=fund,
                      holders=holders_all.loc[known], shares=shares_all.loc[known], values=values_all.loc[known],
                      n_filers=filers_all.loc[known], sponsors=sponsors, ticker_cusips=t2c)
        scored, _ = score_universe(ctx, cfg, as_of=td)
        reg = regime_mod.compute(closes[["^GSPC", "^IXIC"]], vols[["^GSPC", "^IXIC"]], cfg, as_of=td)["regime"]
        f = indicator_frame(scored)
        for k in INDICATORS:
            f[f"{k}_status"] = pd.Series({t: s["results"][k].status for t, s in scored.items()})
        f["sector"] = pd.Series({t: s["sector"] for t, s in scored.items()})
        f["date"], f["regime"] = d, reg
        p0 = closes.loc[td]
        for name, h in cal["horizons_days"].items():
            pos = closes.index.get_loc(td) + h
            if pos < len(closes.index):
                p1 = closes.iloc[pos]
                f[f"fwd_{h}"] = (p1 / p0 - 1).reindex(f.index) - (bench.iloc[pos] / bench.loc[td] - 1)
            else:
                f[f"fwd_{h}"] = np.nan
        if cal.get("tech_only", True):
            f = f[f["sector"].isin(tech)]
        f.index.name = "ticker"
        frames.append(f.reset_index())
        print(f"  {d.date()}: {len(f)} stocks, regime={reg}, 13F quarters={len(known)}, N-PORT={'yes' if sponsors is not None else 'no'}")
    panel = pd.concat(frames, ignore_index=True)
    return panel, dates


def main():
    cfg = load_config()
    cal = cfg["calibration"]
    default = {k: float(cfg["weights"][k]) for k in INDICATORS}
    panel, dates = build_panel(cfg)
    panel.to_parquet(hist_path(cfg, "calibration_panel.parquet"), index=False)
    panel["composite_default"] = panel.groupby("date", group_keys=False).apply(
        lambda g: composite_frame(g, regime_mod.regime_weights(default, g["regime"].iloc[0], cfg), g["sympathy"],
                                  cfg["composite"]["sympathy_penalty"]))
    dates = sorted(panel["date"].unique())
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "benchmark": cal["benchmark"],
              "dates": [str(pd.Timestamp(dates[0]).date()), str(pd.Timestamp(dates[-1]).date())],
              "n_dates": len(dates), "universe": "tech sectors" if cal.get("tech_only", True) else "all sectors",
              "avg_stocks_per_date": float(panel.groupby("date").size().mean()),
              "coverage_pct": {k: float(panel[k].notna().mean() * 100) for k in INDICATORS},
              "default_weights": default, "horizons": {}}
    ic_means = {}
    for name, h in cal["horizons_days"].items():
        col = f"fwd_{h}"
        ics = ic_table(panel, col, cal["min_stocks_per_date"])
        summ = summarise_ic(ics)
        report["horizons"][name] = {"ic": summ, "hit_rates": hit_rates(panel, col),
                                    "walk_forward": walk_forward(panel, [pd.Timestamp(d) for d in dates], h, cfg, default)}
        for k in INDICATORS:
            ic_means.setdefault(k, []).append(summ.get(k, {}).get("mean_ic"))
    avg_ic = {k: float(np.nanmean([x for x in v if x is not None])) if any(x is not None for x in v) else None
              for k, v in ic_means.items()}
    raw, suggested = weights_from_ic(avg_ic, default, cal["blend_with_default"])
    report["avg_ic"] = avg_ic
    report["calibrated_raw_weights"] = raw
    report["suggested_weights"] = suggested
    for name, hz in report["horizons"].items():
        wf = hz["walk_forward"]
        if wf:
            hz["oos_summary"] = {
                "test_dates": len(wf),
                "mean_ic_calibrated": float(np.nanmean([r["ic_calibrated"] for r in wf])),
                "mean_ic_default": float(np.nanmean([r["ic_default"] for r in wf])),
                "mean_top_decile_excess_calibrated_pct": float(np.nanmean([r["top_decile_excess_calibrated"] for r in wf]) * 100),
                "mean_top_decile_excess_default_pct": float(np.nanmean([r["top_decile_excess_default"] for r in wf]) * 100),
            }
    report["caveats"] = [
        "Survivorship bias: only currently listed tickers have price history, so delisted losers are missing.",
        "Industry groups and share counts are today's values applied to past dates.",
        "N-PORT starts Oct 2019 and fund ratings need 36 months of returns, so sponsor-quality and growth-fund "
        "indicators only have data from about 2022: their ICs rest on far fewer dates.",
        "Quarterly dates with 6-month horizons overlap, so t-stats overstate significance.",
        "Small samples: treat suggested weights as a nudge, which is why they are blended 50/50 with the defaults.",
    ]
    from .indicators.common import _clean
    with open(output_path(cfg, "calibration.json"), "w") as f:
        json.dump(_clean(report), f, indent=1, allow_nan=False, default=str)
    write_markdown(report, repo_path("scripts", "screener", "CALIBRATION.md"))
    print(json.dumps({"suggested_weights": suggested, "avg_ic": avg_ic}, indent=1, default=str))


def write_markdown(r, path):
    def f(x, nd=3):
        return "n/a" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{nd}f}"
    L = [f"# Calibration report", "",
         f"Generated {r['generated_at'][:10]}. Quarter-ends {r['dates'][0]} to {r['dates'][1]} ({r['n_dates']} dates), "
         f"{r['universe']}, ~{r['avg_stocks_per_date']:.0f} stocks per date, benchmark {r['benchmark']}.", "",
         "| Indicator | Coverage % | IC 3m | t 3m | IC 6m | t 6m | Pass hit rate 6m | Base rate 6m | Default w | Calibrated raw | Suggested |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    h3, h6 = r["horizons"].get("3m", {}), r["horizons"].get("6m", {})
    for k in INDICATORS:
        i3, i6 = h3.get("ic", {}).get(k, {}), h6.get("ic", {}).get(k, {})
        hr = h6.get("hit_rates", {}).get(k, {})
        L.append(f"| {k} | {f(r['coverage_pct'][k], 0)} | {f(i3.get('mean_ic'))} | {f(i3.get('t_stat'), 1)} | "
                 f"{f(i6.get('mean_ic'))} | {f(i6.get('t_stat'), 1)} | {f(hr.get('pass_hit_rate'), 0)} | "
                 f"{f(hr.get('base_rate'), 0)} | {r['default_weights'][k]:.0f} | {f(r['calibrated_raw_weights'][k], 1)} | "
                 f"{r['suggested_weights'][k]} |")
    L += ["", "## Out-of-sample (walk-forward)", ""]
    for name, hz in r["horizons"].items():
        s = hz.get("oos_summary")
        if s:
            L.append(f"- **{name}**: {s['test_dates']} test dates. Composite IC calibrated {f(s['mean_ic_calibrated'])} vs "
                     f"default {f(s['mean_ic_default'])}; top-decile excess return vs {r['benchmark']}: calibrated "
                     f"{f(s['mean_top_decile_excess_calibrated_pct'], 1)}% vs default {f(s['mean_top_decile_excess_default_pct'], 1)}%.")
    L += ["", "## Caveats", ""] + [f"- {c}" for c in r["caveats"]]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
