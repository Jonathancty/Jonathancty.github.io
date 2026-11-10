"""Indicator 7: Not over-owned.

Penalises crowded stocks: institutional ownership above ~90% of shares, or a quarter with a
sharp drop in holders after a long run of increases (a possible distribution signal).
"""
import numpy as np
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, clip, na


def ownership_score(pct, c):
    """Piecewise linear: 100 up to full_score_max_pct, 30 at crowded_pct, 0 at zero_score_pct."""
    lo, mid, hi = c["full_score_max_pct"], c["crowded_pct"], c["zero_score_pct"]
    if pct <= lo:
        return 100.0
    if pct <= mid:
        return 100 - 70 * (pct - lo) / (mid - lo)
    return clip(30 - 30 * (pct - mid) / (hi - mid))


def distribution_signal(holders, c):
    """True if the latest quarter's holder change <= drop% after >= N consecutive increases."""
    h = holders.dropna().sort_index()
    if len(h) < c["distribution_prior_increases"] + 2:
        return False
    chg = h.pct_change().dropna() * 100
    prior = chg.iloc[:-1].tail(c["distribution_prior_increases"])
    return bool(chg.iloc[-1] <= c["distribution_drop_pct"] and (prior > 0).all())


def compute(inst_pct, holders, cfg):
    """inst_pct: institutional ownership in percent of shares (0-100+), or None."""
    c = cfg["indicators"]["not_crowded"]
    if inst_pct is None or pd.isna(inst_pct):
        return na("ownership % unavailable")
    score = ownership_score(float(inst_pct), c)
    dist = distribution_signal(holders, c) if holders is not None else False
    if dist:
        score = max(0.0, score - c["distribution_penalty"])
    if dist or inst_pct > c["crowded_pct"]:
        status = FAIL
    elif inst_pct > c["full_score_max_pct"]:
        status = PARTIAL
    else:
        status = PASS
    return IndicatorResult(score, status, {"inst_ownership_pct": float(inst_pct), "distribution_signal": dist})
