"""Daily job: score the universe and write trading/screener/screener.json for the web page.

    python -m scripts.screener.build [--skip-sentiment] [--max-tickers N]

This static JSON file is the screener's "API endpoint": the site is static (GitHub Pages),
so the page fetches it and recomputes composites in the browser for the chosen weight set.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import regime as regime_mod
from . import sentiment as senti
from .config import INDICATORS, cache_dir, cache_path, hist_dir, load_config, output_path
from .data import cusip_map, fundamentals, holdings_13f, info_cache, prices, universe
from .data.holdings_view import ticker_panels
from .data.sec import SecClient, company_tickers
from .engine import Context, score_universe
from .indicators.common import _clean
from .scoring import composite
from .ucits import VERIFIED_ON, group_etf_signals, etf_route

INDEX_TICKERS = ["^GSPC", "^IXIC", "QQQ"]


def load_sponsors(cfg):
    p = cache_path(cfg, "sponsors.csv.gz")
    if not os.path.exists(p):
        return None, None
    df = pd.read_csv(p, dtype={"CUSIP": str}).set_index("CUSIP")
    df["top_sponsors"] = df["top_sponsors"].map(lambda s: json.loads(s) if isinstance(s, str) else [])
    with open(cache_path(cfg, "sponsors_meta.json")) as f:
        meta = json.load(f)
    return df, meta


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def load_fundamentals(client, tickers, now, frames_dir):
    """ticker -> eps_q_growth, eps_a_growth, rev_q_growth (point-in-time as of `now`)."""
    now = pd.Timestamp(now)
    if now.tzinfo is not None:
        now = now.tz_localize(None)
    labels = fundamentals.period_labels(now.year - 3, now)
    fundamentals.fetch_frames(client, frames_dir, labels)
    table = fundamentals.build_table(frames_dir, labels)
    cik_map = company_tickers(client)
    g = fundamentals.growth_as_of(table, now, ciks=[cik_map[t] for t in tickers if t in cik_map])
    rows = {t: g.loc[cik_map[t]] for t in tickers if t in cik_map and cik_map[t] in g.index}
    return pd.DataFrame(rows).T if rows else pd.DataFrame()


def weight_sets(cfg, reg):
    default = {k: float(cfg["weights"][k]) for k in INDICATORS}
    cal = load_json(output_path(cfg, "calibration.json"), {}) or {}
    sets = {"default": default}
    if cal.get("suggested_weights"):
        sets["calibrated"] = {k: float(cal["suggested_weights"][k]) for k in INDICATORS}
    return {name: regime_mod.regime_weights(w, reg, cfg) for name, w in sets.items()}, sets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-sentiment", action="store_true")
    ap.add_argument("--max-tickers", type=int, default=0, help="debug: limit the universe")
    args = ap.parse_args()
    cfg = load_config()
    now = datetime.now(timezone.utc)
    sources, warnings = {}, []

    # --- universe + prices -------------------------------------------------------------
    listed = universe.listed_common_stocks(cfg)
    syms = list(listed["symbol"])
    if args.max_tickers:
        syms = syms[: args.max_tickers]
    print(f"Listed common stocks: {len(syms)}")
    px = prices.drop_incomplete_today(prices.download(syms + INDEX_TICKERS, period="2y"))
    closes, opens, vols = px["Close"], px["Open"], px["Volume"]
    sources["prices"] = {"source": "Yahoo Finance via yfinance", "as_of": str(closes.index.max().date())}

    # liquidity pre-filter on price/volume before the (slow) info lookups
    pre = universe.liquidity_filter(closes.drop(columns=INDEX_TICKERS, errors="ignore"), vols, {}, cfg)
    info = info_cache.refresh(cache_path(cfg, "info.json"), list(pre.index), cfg)
    sources["classification"] = {"source": "Yahoo Finance industry field (cached up to 30 days)",
                                 "as_of": now.date().isoformat()}
    ser = lambda k: pd.Series({t: (info.get(t) or {}).get(k) for t in pre.index})
    industries, sectors = ser("industry"), ser("sector")
    market_caps = pd.to_numeric(ser("marketCap"), errors="coerce")
    names = ser("longName").fillna(ser("shortName"))
    inst_pct = {t: v * 100 for t, v in ser("heldPercentInstitutions").items() if v is not None and not pd.isna(v)}

    # --- fundamentals (SEC XBRL frames) ------------------------------------------------
    fund = pd.DataFrame()
    try:
        fund = load_fundamentals(SecClient(cfg), list(pre.index), now, hist_dir(cfg, "frames"))
        sources["fundamentals"] = {"source": "SEC XBRL frames (EPS diluted, revenue)", "as_of": now.date().isoformat(),
                                   "note": "quarters count from 45 days after quarter end"}
    except Exception as e:      # missing email, SEC outage...: degrade to n/a, don't kill the build
        warnings.append(f"Fundamentals skipped: {e}")
        print(warnings[-1])

    # --- holdings ----------------------------------------------------------------------
    d13f = cache_dir(cfg, "13f")
    meta13 = holdings_13f.load_meta(d13f)
    periods = sorted(meta13["periods"])[-(cfg["indicators"]["inst_trend"]["lookback_quarters"] + 1):]
    counts = holdings_13f.load_counts(d13f, periods)
    cmap = cusip_map.load(cache_path(cfg, "cusip_map.json"))
    holders, shares, values, n_filers = ticker_panels(counts, cmap, list(pre.index))
    if periods:
        last = periods[-1]
        sources["13f"] = {"source": "SEC Form 13F data sets", "as_of": last,
                          "dataset": meta13["periods"][last]["dataset"],
                          "note": "quarter-end holdings; filed up to 45 days after quarter end, published by SEC quarterly"}
    else:
        warnings.append("No 13F data cached yet: run the holdings workflow.")
    sponsors, smeta = load_sponsors(cfg)
    if smeta:
        sources["nport"] = {"source": "SEC Form N-PORT data sets", "as_of": smeta["label"],
                            "returns_through": smeta["returns_through"],
                            "note": "fund holdings public ~60 days after quarter end, published by SEC quarterly",
                            "funds_in_snapshot": smeta["funds_in_snapshot"], "growth_funds_rated": smeta["growth_funds_rated"]}
    else:
        warnings.append("No N-PORT sponsor data cached yet: run the holdings workflow.")

    # --- regime ------------------------------------------------------------------------
    reg = regime_mod.compute(closes[["^GSPC", "^IXIC"]], vols[["^GSPC", "^IXIC"]], cfg)
    active_sets, base_sets = weight_sets(cfg, reg["regime"])

    # --- score -------------------------------------------------------------------------
    ctx = Context(closes=closes.drop(columns=INDEX_TICKERS, errors="ignore"), opens=opens, volumes=vols,
                  industries=industries, sectors=sectors, market_caps=market_caps, fundamentals=fund,
                  holders=holders, shares=shares, values=values, n_filers=n_filers,
                  sponsors=sponsors, ticker_cusips=cusip_map.ticker_to_cusips(cmap), inst_pct=inst_pct)
    scored, groups_tbl = score_universe(ctx, cfg)
    print(f"Scored {len(scored)} liquid stocks across {len(groups_tbl)} industry groups")

    for t, d in scored.items():
        d["composites"] = {n: composite(d["results"], w, d["sympathy"], cfg) for n, w in active_sets.items()}

    # pick rows: top N under each weight set, for tech-only and for all sectors
    n_out = cfg["composite"]["top_n_output"]
    tech = set(cfg["universe"]["tech_sectors"])
    keep = set()
    min_cov = cfg["composite"]["min_coverage_pct"]

    def sort_key(t, name):
        c = scored[t]["composites"][name]
        return (c["coverage_pct"] >= min_cov, c["composite"])     # well-covered rows rank first

    for name in active_sets:
        ranked = sorted((t for t in scored if scored[t]["composites"][name]["composite"] is not None),
                        key=lambda t: sort_key(t, name), reverse=True)
        keep |= set(ranked[:n_out])
        keep |= set([t for t in ranked if scored[t]["sector"] in tech][:n_out])

    # --- social sentiment (separate column) -------------------------------------------
    sent = senti.existing_scores()
    if not args.skip_sentiment:
        top = sorted(keep, key=lambda t: sort_key(t, "default"), reverse=True)
        todo = [t for t in top[: cfg["sentiment_factor"]["top_n_to_score"]] if t not in sent]
        sent.update(senti.score_tickers(todo))
    sources["sentiment"] = {"source": "StockTwits votes + VADER (existing Trading-tab pipeline)",
                            "as_of": now.date().isoformat()}

    rows = []
    for t in keep:
        d = scored[t]
        sp = d["sponsor"]
        ao = d["results"]["added_owners"].raw
        rows.append({
            "ticker": t, "name": names.get(t) or t, "sector": d["sector"], "group": d["group"],
            "group_rank": d["results"]["group_strength"].raw.get("rank"),
            "group_of": d["results"]["group_strength"].raw.get("of"),
            "price": round(d["price"], 2), "market_cap": None if pd.isna(d["market_cap"]) else d["market_cap"],
            "rs_rating": None if pd.isna(d["rs_rating"]) else int(d["rs_rating"]),
            "indicators": {k: d["results"][k].to_dict() for k in INDICATORS},
            "sympathy": d["sympathy"],
            "composites": d["composites"],
            "top_sponsors": (sp["top_sponsors"] if sp is not None else []),
            "holder_change": ao.get("net_new_holders"), "holder_change_pct": ao.get("holders_change_pct"),
            "uk_buyable": True,
            "uk_note": "US-listed stock: buyable from UK brokers (W-8BEN form needed)",
            "sentiment": sent.get(t),
        })
    rows.sort(key=lambda r: (r["composites"]["default"]["coverage_pct"] >= min_cov,
                             r["composites"]["default"]["composite"] or 0), reverse=True)

    out = {
        "generated_at": now.isoformat(),
        "disclaimer": "Personal research tool, not investment advice. Data can be stale, incomplete or wrong.",
        "regime": reg,
        "weights": {"base": base_sets, "active": active_sets,
                    "sentiment": {"enabled_default": cfg["sentiment_factor"]["enabled_default"],
                                  "weight": cfg["sentiment_factor"]["weight"]}},
        "sympathy_penalty": cfg["composite"]["sympathy_penalty"],
        "min_coverage_pct": cfg["composite"]["min_coverage_pct"],
        "tech_sectors": cfg["universe"]["tech_sectors"], "tech_only_default": cfg["universe"]["tech_only_default"],
        "universe": {"listed": len(syms), "liquid": len(scored), "groups_ranked": int(len(groups_tbl)),
                     "floors": {k: cfg["universe"][k] for k in ("min_price", "min_market_cap", "min_avg_dollar_volume_50d")}},
        "sources": sources, "warnings": warnings,
        "top_groups": [{"group": g, "rank": int(r["rank"]), "of": int(r["n_groups"]), "n": int(r["n"]),
                        "percentile": round(float(r["percentile"]), 1),
                        "ret_3m_pct": round(float(r["r63"]) * 100, 1)} for g, r in groups_tbl.head(25).iterrows()],
        "etf_signals": group_etf_signals(groups_tbl, cfg),
        "broad_market_ucits": [etf_route("QQQ"), etf_route("VOO")],
        "ucits_verified_on": VERIFIED_ON,
        "rows": rows,
    }
    with open(output_path(cfg, "screener.json"), "w") as f:
        json.dump(_clean(out), f, indent=None, separators=(",", ":"), default=_json_default, allow_nan=False)
    print(f"Wrote {len(rows)} rows to screener.json")


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (pd.Timestamp,)):
        return str(o.date())
    raise TypeError(type(o))


if __name__ == "__main__":
    main()
