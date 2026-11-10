"""Indicator 5: Sponsor quality.

For the active (non-index) equity mutual funds holding the stock (N-PORT), each fund's 12-month
total return and 3-year annualised return are ranked against all peer funds. A "quality sponsor"
is above average (>= 50th percentile) on BOTH and is holding or adding. Each quality sponsor
earns 1-3 conviction points by position size relative to fund net assets.

Badge (absolute, per spec): pass = at least 3 quality sponsors holding or adding.
Score (relative): large caps have hundreds of fund holders, so an absolute points cap saturates.
The score is the universe percentile of conviction points blended with the percentile of the
quality share (quality sponsors / all active fund holders), so breadth AND quality both count.
"""
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def cross_section(metrics_by_ticker):
    """metrics_by_ticker: {ticker: metrics row or None}. Returns {ticker: (pct_points, pct_ratio)}
    in 0-100, ranked across every ticker that has holdings data (unheld stocks count as 0)."""
    pts, ratio = {}, {}
    for t, m in metrics_by_ticker.items():
        if m is None:
            pts[t], ratio[t] = 0.0, 0.0
        else:
            pts[t] = float(m["quality_points"])
            ratio[t] = float(m["n_quality"]) / max(int(m["n_active_holders"]), 1)
    if not pts:
        return {}
    p1 = pd.Series(pts).rank(pct=True) * 100
    p2 = pd.Series(ratio).rank(pct=True) * 100
    return {t: (p1[t], p2[t]) for t in pts}


def compute(metrics, cfg, holdings_available=True, pct=None):
    """metrics: row from funds.sponsor_metrics (or None if no active fund holds the stock).
    pct: (points percentile, quality-share percentile) from cross_section(); if omitted, an
    absolute points scale is used (full_score_points)."""
    c = cfg["indicators"]["sponsor_quality"]
    if not holdings_available:
        return na("no N-PORT holdings snapshot available")
    if metrics is None:
        return IndicatorResult(0.0, FAIL, {"active_fund_holders": 0, "quality_sponsors": 0})
    n = int(metrics["n_quality"])
    holders = int(metrics["n_active_holders"])
    if pct is not None:
        w = c.get("score_blend_points", 0.5)
        score = clip(w * pct[0] + (1 - w) * pct[1])
    else:
        score = clip(100 * float(metrics["quality_points"]) / c["full_score_points"])
    if n == 0:
        score = 0.0
    status = PASS if n >= c["min_quality_sponsors_pass"] else PARTIAL if n >= c["min_quality_sponsors_partial"] else FAIL
    return IndicatorResult(score, status, {
        "active_fund_holders": holders, "quality_sponsors": n,
        "quality_share_pct": 100.0 * n / max(holders, 1),
        "conviction_points": float(metrics["quality_points"]),
    })
