"""Indicator 6: Top-rated growth fund sponsorship (bull markets only).

Growth-style funds are graded A+ to E by the percentile of their 36-month performance,
weighted toward the latest 12 months (an approximation of IBD's proprietary fund ratings).
Score = conviction points from A+/A/A-/B+ growth funds holding or adding the stock.
In a correction the regime module cuts this indicator's weight to ~0.
"""
from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def compute(metrics, cfg, holdings_available=True):
    c = cfg["indicators"]["growth_fund"]
    if not holdings_available:
        return na("no N-PORT holdings snapshot available")
    if metrics is None:
        return IndicatorResult(0.0, FAIL, {"top_rated_growth_funds": 0})
    n = int(metrics["n_good_growth"])
    score = clip(100 * float(metrics["growth_points"]) / c["full_score_points"])
    status = PASS if n >= c["min_funds_pass"] else PARTIAL if n >= c["min_funds_partial"] else FAIL
    return IndicatorResult(score, status, {
        "top_rated_growth_funds": n, "grades": metrics.get("growth_grades") or "",
        "conviction_points": float(metrics["growth_points"]),
    })
