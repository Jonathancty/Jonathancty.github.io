"""Indicator 4: Added owners in the most recent quarter.

Net new institutional holders and net change in shares held (13F, latest vs prior quarter).
Score = average of the two changes' percentiles across the universe, so a stock is judged
against everyone else in the same filing season. Pass = both positive, partial = one positive.
"""
import numpy as np
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, na


def changes(holders_wide, shares_wide):
    """holders_wide / shares_wide: period x ticker. Returns DataFrame per ticker with the latest
    quarter's net new holders and % changes."""
    if holders_wide.shape[0] < 2:
        return pd.DataFrame(columns=["d_holders", "d_holders_pct", "d_shares_pct", "latest_period"])
    h, s = holders_wide.iloc[-2:], shares_wide.iloc[-2:]
    out = pd.DataFrame({
        "d_holders": h.iloc[1] - h.iloc[0],
        "d_holders_pct": (h.iloc[1] / h.iloc[0] - 1) * 100,
        "d_shares_pct": (s.iloc[1] / s.iloc[0] - 1) * 100,
    })
    out = out.replace([np.inf, -np.inf], np.nan)
    out["latest_period"] = str(pd.Timestamp(h.index[-1]).date())
    return out


def compute_all(chg, cfg):
    """Cross-sectional scoring -> dict ticker -> IndicatorResult."""
    res = {}
    if chg.empty:
        return res
    p1 = chg["d_holders_pct"].rank(pct=True)
    p2 = chg["d_shares_pct"].rank(pct=True)
    for t, row in chg.iterrows():
        if pd.isna(row["d_holders_pct"]) and pd.isna(row["d_shares_pct"]):
            res[t] = na("no prior-quarter 13F data")
            continue
        score = 100 * np.nanmean([p1.get(t, np.nan), p2.get(t, np.nan)])
        pos = [x > 0 for x in (row["d_holders"], row["d_shares_pct"]) if pd.notna(x)]
        status = PASS if len(pos) == 2 and all(pos) else PARTIAL if any(pos) else FAIL
        res[t] = IndicatorResult(score, status, {
            "net_new_holders": None if pd.isna(row["d_holders"]) else int(row["d_holders"]),
            "holders_change_pct": row["d_holders_pct"], "shares_change_pct": row["d_shares_pct"],
            "quarter": row["latest_period"],
        })
    return res
