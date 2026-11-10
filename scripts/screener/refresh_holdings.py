"""Weekly job: pick up new SEC 13F / N-PORT data sets and rebuild the sponsorship cache.

    python -m scripts.screener.refresh_holdings            # live: only what the screener needs
    python -m scripts.screener.refresh_holdings --history  # backfill everything (for calibration)

Holdings only change quarterly, so this does nothing (cheaply) unless SEC has published a
new data set. Large zips are downloaded, reduced, and deleted.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import pandas as pd

from . import funds as fundlib
from .config import cache_dir, cache_path, hist_dir, hist_path, load_config
from .data import cusip_map, holdings_13f, holdings_nport
from .data.sec import SecClient, list_13f_datasets, list_nport_datasets


def refresh_13f(client, cfg, history):
    d13f = cache_dir(cfg, "13f")
    meta = holdings_13f.load_meta(d13f)
    done = set(meta.get("processed_datasets", []))
    sets = list_13f_datasets(client, cfg)
    if not history:
        sets = sets[-(cfg["sec"]["history_13f_quarters"] + 1):]
    todo = [s for s in sets if s["name"] not in done]
    print(f"13F: {len(sets)} data sets in scope, {len(todo)} new")
    for s in todo:
        zpath = hist_path(cfg, "zips", s["name"])
        print(f"  downloading {s['name']}")
        client.download(s["url"], zpath)
        agg, n_filers = holdings_13f.process_zip(zpath)
        written = holdings_13f.save_periods(d13f, agg, n_filers, s["name"])
        print(f"  {s['name']}: periods {written}")
        os.remove(zpath)
    return holdings_13f.load_meta(d13f)


def refresh_nport(client, cfg, history):
    nport_hist = hist_dir(cfg, "nport")
    small_dir = cache_dir(cfg, "nport")
    sets = list_nport_datasets(client, cfg)
    # live needs 36+ months of fund returns (13 data sets) and the last 3 sets of holdings
    need_returns = sets if history else sets[-14:]
    need_holdings = sets if history else sets[-3:]
    have_small = {f.split(".")[0] for f in os.listdir(small_dir) if f.endswith(".returns.parquet")} if os.path.isdir(small_dir) else set()
    have_hist = set(holdings_nport.available_datasets(nport_hist))
    todo = [s for s in sets if (s in need_returns and s["name"].replace(".zip", "") not in have_small)
            or (s in need_holdings and s["name"].replace(".zip", "") not in have_hist)]
    print(f"N-PORT: {len(sets)} data sets listed, {len(todo)} to process")
    cmap_path = cache_path(cfg, "cusip_map.json")
    for s in todo:
        stem = s["name"].replace(".zip", "")
        zpath = hist_path(cfg, "zips", s["name"])
        print(f"  downloading {s['name']} (~400 MB)")
        client.download(s["url"], zpath)
        parts = holdings_nport.process_zip(zpath, cfg)
        os.makedirs(small_dir, exist_ok=True)
        parts["returns"].to_parquet(os.path.join(small_dir, f"{stem}.returns.parquet"), index=False)
        f = parts["funds"]
        f[f["eq_pct"] >= cfg["indicators"]["sponsor_quality"]["min_equity_pct"]].to_parquet(
            os.path.join(small_dir, f"{stem}.funds.parquet"), index=False)
        holdings_nport.save_intermediates(nport_hist, s["name"], {"holdings": parts["holdings"], "tickers": parts["tickers"]})
        cusip_map.update(cmap_path, holdings_nport.cusip_ticker_map(parts["tickers"]), [], cfg)
        print(f"  {s['name']}: {len(parts['holdings']):,} holdings rows, {len(parts['returns']):,} fund-months")
        os.remove(zpath)
    return sets


def pick_labels(holdings):
    """Latest quarter-end label with reasonably complete fund coverage, and the one before it."""
    q_ends = sorted({(d + pd.offsets.QuarterEnd(0)).normalize() for d in holdings["REPORT_DATE"].dropna().unique()})
    counts = {q: holdings_nport.holdings_for_label(holdings, q)["SERIES_ID"].nunique() for q in q_ends[-4:]}
    labels = [q for q in q_ends[-4:]]
    while len(labels) >= 3 and counts[labels[-1]] < 0.7 * counts[labels[-2]]:
        labels = labels[:-1]
    return labels[-1], (labels[-2] if len(labels) >= 2 else None), counts


def build_sponsor_cache(cfg):
    nport_hist = hist_dir(cfg, "nport")
    small_dir = cache_dir(cfg, "nport")
    ds = holdings_nport.available_datasets(nport_hist)[-3:]
    holdings = holdings_nport.load_part(nport_hist, ds, "holdings")
    if holdings.empty:
        print("No N-PORT holdings intermediates available; sponsor cache not rebuilt.")
        return None
    small_sets = sorted({f.split(".")[0] for f in os.listdir(small_dir) if f.endswith(".returns.parquet")})
    returns = holdings_nport.load_part(small_dir, small_sets, "returns")
    fund_info = holdings_nport.latest_fund_info(holdings_nport.load_part(small_dir, small_sets, "funds"))
    label, prev_label, counts = pick_labels(holdings)
    cur = holdings_nport.holdings_for_label(holdings, label)
    prev = holdings_nport.holdings_for_label(holdings, prev_label) if prev_label is not None else None
    ret_wide = holdings_nport.combine_returns(returns)
    perf = fundlib.fund_performance(ret_wide, label, cfg)
    rated = fundlib.rate_funds(fund_info, perf, cfg)
    metrics = fundlib.sponsor_metrics(cur, prev, rated, cfg)
    out = metrics.copy()
    out["top_sponsors"] = out["top_sponsors"].map(json.dumps)
    out.to_csv(cache_path(cfg, "sponsors.csv.gz"), compression="gzip")
    graded = rated[rated["grade"].notna()]
    meta = {
        "label": str(label.date()), "prev_label": None if prev_label is None else str(prev_label.date()),
        "funds_in_snapshot": int(cur["SERIES_ID"].nunique()), "label_fund_counts": {str(k.date()): int(v) for k, v in counts.items()},
        "peer_funds": int(rated["is_peer"].sum()), "growth_funds_rated": int(len(graded)),
        "grade_counts": graded["grade"].value_counts().to_dict(),
        "returns_through": str(ret_wide.index.max().date()), "datasets": ds,
    }
    with open(cache_path(cfg, "sponsors_meta.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"Sponsor cache: label {meta['label']}, {meta['funds_in_snapshot']} funds, {len(out)} CUSIPs")
    return meta


def fill_cusip_gaps(cfg, meta13f):
    """OpenFIGI fallback for widely held CUSIPs (latest 13F quarter) that N-PORT didn't map."""
    periods = sorted(meta13f["periods"])
    if not periods:
        return
    latest = holdings_13f.load_counts(cache_dir(cfg, "13f"), [periods[-1]])
    cmap_path = cache_path(cfg, "cusip_map.json")
    m = cusip_map.load(cmap_path)
    wide = latest[latest["n_holders"] >= cfg["openfigi"]["min_holders_to_lookup"]]
    todo = sorted(set(wide["CUSIP"]) - set(m))
    cusip_map.update(cmap_path, {}, todo, cfg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", action="store_true", help="backfill every available data set")
    args = ap.parse_args()
    cfg = load_config()
    client = SecClient(cfg)
    meta13f = refresh_13f(client, cfg, args.history)
    refresh_nport(client, cfg, args.history)
    fill_cusip_gaps(cfg, meta13f)
    meta = build_sponsor_cache(cfg)
    periods = sorted(meta13f["periods"])
    status = {
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "13f_latest_period": periods[-1] if periods else None,
        "13f_dataset": meta13f["periods"][periods[-1]]["dataset"] if periods else None,
        "nport_label": meta and meta["label"],
        "nport_returns_through": meta and meta["returns_through"],
    }
    with open(cache_path(cfg, "holdings_status.json"), "w") as f:
        json.dump(status, f, indent=1)
    print(json.dumps(status, indent=1))


if __name__ == "__main__":
    main()
