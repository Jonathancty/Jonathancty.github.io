"""Indicator 6: Top-rated growth fund sponsorship (bull markets only).

Growth-style funds are graded A+ to E by the percentile of their 36-month performance,
weighted toward the latest 12 months (an approximation of IBD's proprietary fund ratings).
Badge (absolute): pass = >= 3 A+/A/A-/B+ growth funds holding or adding.
Score (relative): universe percentile of those funds' conviction points (an absolute cap
saturates for widely held large caps). In a correction the regime module cuts this weight to ~0.
"""
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def cross_section(metrics_by_ticker):
    pts = {t: (0.0 if m is None else float(m["growth_points"])) for t, m in metrics_by_ticker.items()}
    if not pts:
        return {}
    s = pd.Series(pts)
    r = s.rank(pct=True) * 100
    r[s == 0] = 0.0                     # no top-rated growth fund at all = 0, not a middling rank
    return r.to_dict()


def compute(metrics, cfg, holdings_available=True, pct=None):
    c = cfg["indicators"]["growth_fund"]
    if not holdings_available:
        return na("no N-PORT holdings snapshot available")
    if metrics is None:
        return IndicatorResult(0.0, FAIL, {"top_rated_growth_funds": 0})
    n = int(metrics["n_good_growth"])
    if pct is not None:
        score = clip(pct)
    else:
        score = clip(100 * float(metrics["growth_points"]) / c["full_score_points"])
    status = PASS if n >= c["min_funds_pass"] else PARTIAL if n >= c["min_funds_partial"] else FAIL
    return IndicatorResult(score, status, {
        "top_rated_growth_funds": n, "grades": metrics.get("growth_grades") or "",
        "conviction_points": float(metrics["growth_points"]),
    })
