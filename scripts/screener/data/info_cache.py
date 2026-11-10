"""Cached yfinance `.info` subset: sector, industry, market cap, institutional ownership %.

The industry field (Yahoo's ~145 fine-grained industries, e.g. 'Semiconductors',
'Software - Infrastructure') is the industry-group key for indicator 1.
"""
import json
import os
import time
from datetime import datetime, timezone

import yfinance as yf

FIELDS = ["shortName", "longName", "sector", "industry", "marketCap", "heldPercentInstitutions",
          "sharesOutstanding", "floatShares", "quoteType"]


def load(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)


def refresh(path, tickers, cfg, pause=0.5):
    """Fetch info for tickers that are missing or older than info_refresh_days, capped per run
    (the rest are picked up on later runs). Returns the full cache dict."""
    cache = load(path)
    max_age = cfg["universe"]["info_refresh_days"] * 86400
    now = datetime.now(timezone.utc).timestamp()
    stale = [t for t in tickers if t not in cache or now - cache[t].get("_ts", 0) > max_age]
    stale.sort(key=lambda t: cache.get(t, {}).get("_ts", 0))      # never-fetched first
    stale = stale[: cfg["universe"]["info_max_refresh_per_run"]]
    print(f"info cache: {len(cache)} cached, refreshing {len(stale)}")
    limited_in_a_row = 0
    for i, t in enumerate(stale):
        try:
            info = yf.Ticker(t).info or {}
            cache[t] = {k: info.get(k) for k in FIELDS}
            cache[t]["_ts"] = now
            limited_in_a_row = 0
        except Exception as e:
            if "Too Many Requests" in str(e) or "Rate limited" in str(e):
                limited_in_a_row += 1
                if limited_in_a_row >= 5:
                    print(f"  Yahoo rate limit persists; stopping after {i} lookups (the rest retry next run)")
                    break
                time.sleep(60 * limited_in_a_row)      # back off: 1, 2, 3, 4 minutes
            else:
                print(f"  info {t}: {e}")
                time.sleep(2)
        if i % 100 == 99:
            save(path, cache)
        time.sleep(pause)
    save(path, cache)
    return cache
