"""Composite Sponsorship Score.

composite = sum(weight_i * score_i) / sum(weight_i over AVAILABLE indicators) - sympathy penalty

Unknown indicators are "n/a", never 0: they drop out and the composite is rescaled over the
indicators that do have data. coverage_pct says how much of the total weight was available.
The web page repeats this exact formula in JavaScript so weight sets can be switched live.
"""
from .config import INDICATORS
from .indicators.common import PARTIAL, PASS


def sentiment_to_score(s):
    """Existing social sentiment is in [-1, 1]; map to 0-100."""
    if s is None:
        return None
    return max(0.0, min(100.0, (float(s) + 1.0) * 50.0))


def composite_frame(scores, weights, sympathy, penalty):
    """Vectorised composite for a ticker x indicator score frame (NaN = n/a)."""
    w = {k: float(weights[k]) for k in INDICATORS}
    num = sum(scores[k].fillna(0) * w[k] for k in INDICATORS)
    den = sum(scores[k].notna() * w[k] for k in INDICATORS)
    comp = num / den.where(den > 0) - sympathy.astype(float) * penalty
    return comp.clip(0, 100)


def composite(results, weights, sympathy, cfg, sentiment=None, sentiment_weight=0):
    """results: dict indicator -> IndicatorResult. weights: dict indicator -> weight."""
    total_w = sum(weights[k] for k in INDICATORS)
    num = den = 0.0
    for k in INDICATORS:
        r = results.get(k)
        if r is not None and r.score is not None:
            num += weights[k] * r.score
            den += weights[k]
    s_score = sentiment_to_score(sentiment)
    if sentiment_weight and s_score is not None:
        num += sentiment_weight * s_score
        den += sentiment_weight
        total_w += sentiment_weight
    elif sentiment_weight:
        total_w += sentiment_weight
    if den == 0:
        return {"composite": None, "coverage_pct": 0.0, "criteria_met": 0, "criteria_partial": 0}
    score = num / den - (cfg["composite"]["sympathy_penalty"] if sympathy else 0)
    return {
        "composite": round(max(0.0, min(100.0, score)), 1),
        "coverage_pct": round(100.0 * den / total_w, 0),
        "criteria_met": sum(1 for k in INDICATORS if results.get(k) is not None and results[k].status == PASS),
        "criteria_partial": sum(1 for k in INDICATORS if results.get(k) is not None and results[k].status == PARTIAL),
    }
