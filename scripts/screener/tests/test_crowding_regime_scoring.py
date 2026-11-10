import numpy as np
import pandas as pd

from scripts.screener import regime, scoring
from scripts.screener.indicators import not_crowded
from scripts.screener.indicators.common import IndicatorResult, na


def test_crowding_curve(cfg):
    assert not_crowded.compute(60, None, cfg).score == 100
    assert not_crowded.compute(60, None, cfg).status == "pass"
    mid = not_crowded.compute(90, None, cfg)
    assert np.isclose(mid.score, 30) and mid.status == "partial"
    hi = not_crowded.compute(98, None, cfg)
    assert hi.status == "fail" and hi.score < 10
    assert not_crowded.compute(None, None, cfg).status == "n/a"


def test_distribution_signal(cfg):
    q = pd.date_range("2025-03-31", periods=5, freq=pd.offsets.QuarterEnd())
    h = pd.Series([1000, 1100, 1200, 1300, 1200], index=q)    # 3 rises then -7.7%
    r = not_crowded.compute(50, h, cfg)
    assert r.raw["distribution_signal"] is True and r.status == "fail" and r.score == 50


def _idx(trend, n=300, dist_days=0):
    idx = pd.bdate_range("2025-01-01", periods=n)
    close = pd.Series(100 * np.cumprod(np.full(n, 1 + trend)), index=idx)
    vol = pd.Series(1e9, index=idx)
    for i in range(dist_days):
        j = n - 2 - 2 * i
        close.iloc[j] = close.iloc[j - 1] * 0.99
        vol.iloc[j] = 2e9
    return close, vol


def test_regime_states(cfg):
    c1, v1 = _idx(0.001)
    df_c, df_v = pd.DataFrame({"^GSPC": c1, "^IXIC": c1}), pd.DataFrame({"^GSPC": v1, "^IXIC": v1})
    assert regime.compute(df_c, df_v, cfg)["regime"] == regime.CONFIRMED
    c2, v2 = _idx(-0.001)
    assert regime.compute(pd.DataFrame({"^GSPC": c2, "^IXIC": c1}), pd.DataFrame({"^GSPC": v2, "^IXIC": v1}), cfg)["regime"] == regime.CORRECTION
    c3, v3 = _idx(0.002, dist_days=5)
    assert regime.compute(pd.DataFrame({"^GSPC": c3, "^IXIC": c1}), pd.DataFrame({"^GSPC": v3, "^IXIC": v1}), cfg)["regime"] == regime.PRESSURE


def test_heavy_distribution_needs_broken_50dma_for_correction(cfg):
    up, vu = _idx(0.001)
    c, v = _idx(0.002, dist_days=8)                      # 8 distribution days but still trending up
    st = regime.index_state(c, v, cfg)
    assert st["distribution_days"] >= 7 and st["above_ma50"]
    assert regime.compute(pd.DataFrame({"^GSPC": c, "^IXIC": up}), pd.DataFrame({"^GSPC": v, "^IXIC": vu}), cfg)["regime"] == regime.PRESSURE
    c2 = c.copy()
    c2.iloc[-1] = c2.iloc[-60:].min() * 0.97              # now also below the 50-day MA (still above the 200)
    v2 = v.copy()
    v2.iloc[-1] = 3e9
    st2 = regime.index_state(c2, v2, cfg)
    assert not st2["above_ma50"] and st2["above_ma"]
    assert regime.compute(pd.DataFrame({"^GSPC": c2, "^IXIC": up}), pd.DataFrame({"^GSPC": v2, "^IXIC": vu}), cfg)["regime"] == regime.CORRECTION


def test_distribution_days_expire_after_5pct_rally(cfg):
    c, v = _idx(0.0, dist_days=3)
    idx = c.index
    # rally 8% after the distribution days: they should no longer count
    c2 = c.copy()
    c2.iloc[-1] = c2.iloc[-10:-1].max() * 1.08
    v2 = v.copy()
    v2.iloc[-1] = 5e8
    assert regime.index_state(c, v, cfg)["distribution_days"] == 3
    assert regime.index_state(c2, v2, cfg)["distribution_days"] == 0


def test_regime_weights_redistribute(cfg):
    base = {k: float(v) for k, v in cfg["weights"].items()}
    assert regime.regime_weights(base, regime.CONFIRMED, cfg) == base
    w = regime.regime_weights(base, regime.CORRECTION, cfg)
    assert w["growth_fund"] == 1
    assert w["group_strength"] == 24.5 and w["sponsor_quality"] == 24.5
    assert np.isclose(sum(w.values()), 100)


def _res(**scores):
    out = {}
    for k in ["group_strength", "leader", "inst_trend", "added_owners", "sponsor_quality", "growth_fund", "not_crowded"]:
        s = scores.get(k)
        out[k] = na("missing") if s is None else IndicatorResult(s, "pass" if s >= 80 else "fail", {})
    return out


def test_default_weights_sum_to_100(cfg):
    assert sum(cfg["weights"].values()) == 100


def test_composite_rescales_over_available(cfg):
    w = cfg["weights"]
    full = scoring.composite(_res(group_strength=100, leader=100, inst_trend=100, added_owners=100,
                                  sponsor_quality=100, growth_fund=100, not_crowded=100), w, False, cfg)
    assert full["composite"] == 100 and full["coverage_pct"] == 100 and full["criteria_met"] == 7
    part = scoring.composite(_res(group_strength=80, inst_trend=40), w, False, cfg)
    assert part["composite"] == 60.0          # (20*80 + 20*40) / 40: n/a is not treated as 0
    assert part["coverage_pct"] == 40


def test_sympathy_penalty_and_sentiment_toggle(cfg):
    w = cfg["weights"]
    base = _res(group_strength=80, leader=80, inst_trend=80, added_owners=80, sponsor_quality=80, growth_fund=80, not_crowded=80)
    assert scoring.composite(base, w, True, cfg)["composite"] == 80 - cfg["composite"]["sympathy_penalty"]
    with_s = scoring.composite(base, w, False, cfg, sentiment=1.0, sentiment_weight=10)
    assert np.isclose(with_s["composite"], (80 * 100 + 100 * 10) / 110, atol=0.05)
    assert scoring.sentiment_to_score(-1) == 0 and scoring.sentiment_to_score(0) == 50


def test_composite_frame_matches_scalar(cfg):
    w = cfg["weights"]
    df = pd.DataFrame({"group_strength": [80.0], "leader": [np.nan], "inst_trend": [40.0], "added_owners": [np.nan],
                       "sponsor_quality": [np.nan], "growth_fund": [np.nan], "not_crowded": [np.nan]})
    v = scoring.composite_frame(df, w, pd.Series([False]), 15).iloc[0]
    assert np.isclose(v, 60.0)
