"""Indicator 2: Leader, not sympathy stock.

Within each industry group, stocks are ranked on a blend of their own RS rating, latest-quarter
EPS growth, annual EPS growth and latest-quarter revenue growth (percentiles within the group,
rescaled over whatever is available). The top 1-3 per group pass.

Sympathy stock = its recent daily returns track the group leader closely (correlation >= 0.70
over 60 sessions), it is weaker than the leader (RS or EPS growth), and it has no catalyst of
its own (no >= 4% gap on >= 1.5x volume that didn't coincide with a leader gap). Sympathy
stocks are capped at a low leader score and get a composite penalty.

The catalyst test is a price/volume proxy: free data has no reliable news feed.
"""
import numpy as np
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, na

METRICS = {"rs": "rs_rating", "eps_q": "eps_q_growth", "eps_a": "eps_a_growth", "rev_q": "rev_q_growth"}


def rank_within_groups(stocks, cfg):
    """stocks: DataFrame indexed by ticker with group, rs_rating, eps_q_growth, eps_a_growth,
    rev_q_growth. Adds lead_score (0-1), group_rank, group_size, group_pct."""
    lc = cfg["indicators"]["leader"]
    df = stocks.copy()
    w = lc["rank_weights"]
    pct_cols = {}
    for k, col in METRICS.items():
        pct_cols[k] = df.groupby("group")[col].rank(pct=True)
    num = sum(pct_cols[k].fillna(0) * w[k] for k in METRICS)
    den = sum(pct_cols[k].notna() * w[k] for k in METRICS)
    df["lead_score"] = num / den.replace(0, np.nan)
    df.loc[df["rs_rating"].isna(), "lead_score"] = np.nan    # RS is required
    df["group_rank"] = df.groupby("group")["lead_score"].rank(ascending=False, method="first")
    df["group_size"] = df.groupby("group")["lead_score"].transform("count")
    df["group_pct"] = 100 * (1 - (df["group_rank"] - 1) / (df["group_size"] - 1).clip(lower=1))
    return df


def gap_days(open_, close, volume, lookback, gap_pct, vol_mult=None):
    """Dates in the last `lookback` sessions where the stock gapped up >= gap_pct
    (and, if vol_mult is given, volume >= vol_mult x the prior 50-day average)."""
    prev_close = close.shift(1)
    gap = (open_ / prev_close - 1) * 100
    cond = gap.abs() >= gap_pct
    if vol_mult is not None:
        avg = volume.rolling(50).mean().shift(1)
        cond &= volume >= vol_mult * avg
    cond = cond.tail(lookback)
    return list(cond[cond].index)


def detect_sympathy(ticker, leader, closes, opens, volumes, ranked, cfg):
    """Returns (is_sympathy, details dict)."""
    sc = cfg["indicators"]["leader"]["sympathy"]
    if leader == ticker or leader not in closes or ticker not in closes:
        return False, {}
    rets = closes[[ticker, leader]].pct_change().tail(sc["corr_window_days"]).dropna()
    if len(rets) < sc["corr_window_days"] * 0.8:
        return False, {"reason": "not enough overlapping history"}
    corr = float(rets[ticker].corr(rets[leader]))
    s, l = ranked.loc[ticker], ranked.loc[leader]
    weaker_rs = pd.notna(s["rs_rating"]) and pd.notna(l["rs_rating"]) and s["rs_rating"] < l["rs_rating"] - sc["rs_gap"]
    weaker_eps = pd.notna(s["eps_q_growth"]) and pd.notna(l["eps_q_growth"]) and s["eps_q_growth"] < l["eps_q_growth"]
    own = gap_days(opens[ticker], closes[ticker], volumes[ticker], sc["catalyst_lookback_days"],
                   sc["catalyst_gap_pct"], sc["catalyst_volume_mult"])
    leader_gaps = gap_days(opens[leader], closes[leader], volumes[leader], sc["catalyst_lookback_days"] + 5,
                           sc["catalyst_gap_pct"])
    idx = closes.index
    win = sc["leader_gap_window_days"]
    leader_pos = {idx.get_loc(d) for d in leader_gaps}
    independent = [d for d in own if not any(abs(idx.get_loc(d) - p) <= win for p in leader_pos)]
    has_catalyst = len(independent) > 0
    is_sym = corr >= sc["min_corr"] and (weaker_rs or weaker_eps) and not has_catalyst
    return is_sym, {"corr_with_leader": corr, "leader": leader, "weaker_rs": bool(weaker_rs),
                    "weaker_eps": bool(weaker_eps), "own_catalyst_days": len(independent),
                    "followed_leader_gaps": len(own) - len(independent)}


def compute(ticker, ranked, closes, opens, volumes, cfg):
    lc = cfg["indicators"]["leader"]
    if ticker not in ranked.index:
        return na("not ranked"), False
    r = ranked.loc[ticker]
    if pd.isna(r["lead_score"]) or pd.isna(r["group"]):
        return na("missing RS or industry"), False
    if r["group_size"] < cfg["indicators"]["group_strength"]["min_group_size"]:
        return na("group too small to pick a leader", group_size=int(r["group_size"])), False
    grp = ranked[ranked["group"] == r["group"]]
    leader = grp["group_rank"].idxmin()
    rank, size = int(r["group_rank"]), int(r["group_size"])
    top_n = lc["top_n_per_group"]
    if rank <= top_n:
        score = 100 - (rank - 1) * 10                      # 100 / 90 / 80
    else:
        score = 60 * float(r["group_pct"]) / 100           # everyone else: 0-60
    status = PASS if rank <= top_n else PARTIAL if r["group_pct"] >= lc["partial_within_group_percentile"] else FAIL
    is_sym, sym = detect_sympathy(ticker, leader, closes, opens, volumes, ranked, cfg)
    if is_sym:
        score = min(score, lc["sympathy"]["leader_score_cap"])
        status = FAIL
    raw = {"group_rank": rank, "group_size": size, "group_leader": leader, "rs_rating": r["rs_rating"],
           "eps_q_growth_pct": _pct(r.get("eps_q_growth")), "eps_a_growth_pct": _pct(r.get("eps_a_growth")),
           "rev_q_growth_pct": _pct(r.get("rev_q_growth")), "sympathy": bool(is_sym)}
    raw.update({f"sym_{k}": v for k, v in sym.items()})
    return IndicatorResult(score, status, raw), is_sym


def _pct(x):
    return None if x is None or pd.isna(x) else float(x) * 100
