"""Indicator 5: Sponsor quality.

For the active (non-index) equity mutual funds holding the stock (N-PORT), each fund's 12-month
total return and 3-year annualised return are ranked against all peer funds. A "quality sponsor"
is above average (>= 50th percentile) on BOTH and is holding or adding. Each quality sponsor
earns 1-3 conviction points by position size relative to fund net assets.
Pass = at least 3 quality sponsors holding or adding.
"""
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def compute(metrics, cfg, holdings_available=True):
    """metrics: row from funds.sponsor_metrics (or None if no active fund holds the stock)."""
    c = cfg["indicators"]["sponsor_quality"]
    if not holdings_available:
        return na("no N-PORT holdings snapshot available")
    if metrics is None:
        return IndicatorResult(0.0, FAIL, {"active_fund_holders": 0, "quality_sponsors": 0})
    n = int(metrics["n_quality"])
    score = clip(100 * float(metrics["quality_points"]) / c["full_score_points"])
    status = PASS if n >= c["min_quality_sponsors_pass"] else PARTIAL if n >= c["min_quality_sponsors_partial"] else FAIL
    return IndicatorResult(score, status, {
        "active_fund_holders": int(metrics["n_active_holders"]), "quality_sponsors": n,
        "conviction_points": float(metrics["quality_points"]),
    })
