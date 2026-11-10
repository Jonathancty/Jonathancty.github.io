"""Indicator 3: Rising institutional ownership trend.

Input: number of 13F filers holding the stock per quarter (last 4-6 quarters). Because the
number of 13F filers itself grows every year, counts are optionally rescaled to the latest
quarter's filer population so the trend reflects real sponsorship, not more filers.

Score blends: share of the last 4 quarter-on-quarter changes that were increases, the run of
consecutive increases, and the log-slope of the trend. Pass = up in >= 3 of the last 4 quarters.
"""
import numpy as np
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def compute(holders, n_filers, cfg):
    """holders: Series period -> n_holders (sorted ascending). n_filers: Series period -> filer count."""
    c = cfg["indicators"]["inst_trend"]
    h = holders.dropna().sort_index().tail(c["lookback_quarters"])
    if len(h) < 3 or (h <= 0).any():
        return na("fewer than 3 quarters of 13F history", quarters=len(h))
    adj, adjusted = h.astype(float), False
    if c.get("adjust_for_filer_growth", True) and n_filers is not None:
        f = n_filers.reindex(h.index).astype(float)
        if f.notna().all():
            adj, adjusted = h / f * f.iloc[-1], True
    changes = adj.diff().dropna()
    last4 = changes.tail(4)
    incr = int((last4 > 0).sum())
    consec = 0
    for v in reversed(changes.values):
        if v > 0:
            consec += 1
        else:
            break
    t = np.arange(len(adj))
    slope = float(np.polyfit(t, np.log(adj.values), 1)[0]) * 100        # % per quarter
    b = c["blend"]
    full = c["slope_full_score_pct_per_q"]
    score = 100 * (b["increases"] * incr / max(len(last4), 1)
                   + b["consecutive"] * min(consec, 5) / 5
                   + b["slope"] * clip(0.5 + slope / (2 * full), 0, 1))
    status = PASS if incr >= c["pass_min_increases_of_last4"] else PARTIAL if incr >= c["partial_min_increases_of_last4"] else FAIL
    return IndicatorResult(score, status, {
        "holders_by_quarter": {str(pd.Timestamp(k).date()): int(v) for k, v in h.items()},
        "increases_last4": incr, "consecutive_increases": consec,
        "slope_pct_per_q": slope, "filer_adjusted": adjusted,
    })
