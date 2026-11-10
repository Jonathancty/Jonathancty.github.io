import numpy as np
import pandas as pd

from scripts.screener.indicators import added_owners, inst_trend

Q = pd.to_datetime(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"])


def test_rising_holders_pass(cfg):
    h = pd.Series([1000, 1050, 1100, 1160, 1230, 1300], index=Q)
    r = inst_trend.compute(h, None, cfg)
    assert r.status == "pass"
    assert r.raw["increases_last4"] == 4 and r.raw["consecutive_increases"] == 5
    assert r.score > 80


def test_mixed_trend_partial(cfg):
    h = pd.Series([1000, 1050, 1020, 1060, 1040, 1080], index=Q)
    r = inst_trend.compute(h, None, cfg)
    assert r.raw["increases_last4"] == 2
    assert r.status == "partial"


def test_falling_holders_fail(cfg):
    h = pd.Series([1300, 1250, 1200, 1150, 1100, 1050], index=Q)
    r = inst_trend.compute(h, None, cfg)
    assert r.status == "fail" and r.score < 20


def test_filer_growth_adjustment(cfg):
    # holders grow exactly in line with the number of 13F filers: no real sponsorship gain
    filers = pd.Series([7000, 7200, 7400, 7600, 7800, 8000], index=Q)
    h = filers / 10
    adj = inst_trend.compute(h, filers, cfg)
    raw = inst_trend.compute(h, None, cfg)
    assert raw.status == "pass"
    assert adj.raw["filer_adjusted"] is True
    assert adj.raw["increases_last4"] == 0 and adj.status == "fail"


def test_short_history_na(cfg):
    r = inst_trend.compute(pd.Series([100, 110], index=Q[:2]), None, cfg)
    assert r.status == "n/a" and r.score is None


def test_added_owners_cross_section(cfg):
    holders = pd.DataFrame({"A": [100, 120], "B": [100, 95], "C": [100, 101]}, index=Q[-2:])
    shares = pd.DataFrame({"A": [1e6, 1.3e6], "B": [1e6, 0.8e6], "C": [1e6, 0.9e6]}, index=Q[-2:])
    chg = added_owners.changes(holders, shares)
    res = added_owners.compute_all(chg, cfg)
    assert res["A"].status == "pass" and res["A"].raw["net_new_holders"] == 20
    assert res["C"].status == "partial"
    assert res["B"].status == "fail"
    assert res["A"].score > res["C"].score > res["B"].score


def test_added_owners_missing_prior_is_na(cfg):
    holders = pd.DataFrame({"A": [np.nan, 120]}, index=Q[-2:])
    shares = pd.DataFrame({"A": [np.nan, 1e6]}, index=Q[-2:])
    res = added_owners.compute_all(added_owners.changes(holders, shares), cfg)
    assert res["A"].status == "n/a"
