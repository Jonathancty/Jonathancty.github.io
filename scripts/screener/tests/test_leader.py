import numpy as np
import pandas as pd

from scripts.screener.indicators import leader


def _stocks():
    return pd.DataFrame({
        "group": ["Chips"] * 5,
        "rs_rating": [95, 90, 60, 50, 40],
        "eps_q_growth": [0.80, 0.50, 0.10, np.nan, -0.2],
        "eps_a_growth": [0.60, 0.40, 0.05, 0.0, -0.1],
        "rev_q_growth": [0.50, 0.30, 0.10, 0.05, 0.0],
    }, index=["LEAD", "TWO", "FOLLOW", "FOUR", "FIVE"])


def _prices(n=120, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2026-01-01", periods=n)
    lead_r = 0.002 + 0.02 * rng.standard_normal(n)
    other = {t: 0.0005 + 0.02 * rng.standard_normal(n) for t in ["TWO", "FOUR", "FIVE"]}
    follow_r = lead_r * 0.95 + 0.003 * rng.standard_normal(n)       # tracks the leader closely
    rets = pd.DataFrame({"LEAD": lead_r, "FOLLOW": follow_r, **other}, index=idx)
    closes = 100 * (1 + rets).cumprod()
    opens = closes.shift(1).fillna(100.0)                            # no gaps by default
    vols = pd.DataFrame(1_000_000.0, index=idx, columns=closes.columns)
    return closes, opens, vols


def test_ranking_top3_pass(cfg):
    ranked = leader.rank_within_groups(_stocks(), cfg)
    assert ranked.loc["LEAD", "group_rank"] == 1
    assert ranked.loc["TWO", "group_rank"] == 2
    closes, opens, vols = _prices()
    r, sym = leader.compute("LEAD", ranked, closes, opens, vols, cfg)
    assert r.status == "pass" and r.score == 100 and not sym
    r5, _ = leader.compute("FIVE", ranked, closes, opens, vols, cfg)
    assert r5.status == "fail" and r5.score < 60


def test_sympathy_stock_detected_and_capped(cfg):
    ranked = leader.rank_within_groups(_stocks(), cfg)
    closes, opens, vols = _prices()
    r, sym = leader.compute("FOLLOW", ranked, closes, opens, vols, cfg)
    assert sym is True
    assert r.status == "fail"
    assert r.score <= cfg["indicators"]["leader"]["sympathy"]["leader_score_cap"]
    assert r.raw["sym_corr_with_leader"] > 0.9


def test_own_catalyst_clears_sympathy(cfg):
    ranked = leader.rank_within_groups(_stocks(), cfg)
    closes, opens, vols = _prices()
    d = closes.index[-20]
    # FOLLOW gaps up 8% on 3x volume on a day the leader did not gap: its own catalyst
    opens.loc[d, "FOLLOW"] = closes["FOLLOW"].shift(1).loc[d] * 1.08
    vols.loc[d, "FOLLOW"] = 3_000_000
    _, sym = leader.compute("FOLLOW", ranked, closes, opens, vols, cfg)
    assert sym is False


def test_gap_following_leader_is_not_a_catalyst(cfg):
    ranked = leader.rank_within_groups(_stocks(), cfg)
    closes, opens, vols = _prices()
    d = closes.index[-20]
    prev = closes.shift(1).loc[d]
    opens.loc[d, "LEAD"] = prev["LEAD"] * 1.10
    opens.loc[d, "FOLLOW"] = prev["FOLLOW"] * 1.06
    vols.loc[d, "FOLLOW"] = 3_000_000
    _, sym = leader.compute("FOLLOW", ranked, closes, opens, vols, cfg)
    assert sym is True


def test_missing_rs_is_na(cfg):
    s = _stocks()
    s.loc["FIVE", "rs_rating"] = np.nan
    ranked = leader.rank_within_groups(s, cfg)
    closes, opens, vols = _prices()
    r, _ = leader.compute("FIVE", ranked, closes, opens, vols, cfg)
    assert r.status == "n/a" and r.score is None
