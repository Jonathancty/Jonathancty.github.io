import numpy as np

from scripts.screener.indicators import group_strength
from scripts.screener.indicators.rs import rs_rating, weighted_rs, window_returns


def test_group_ranking_and_badges(cfg, price_universe):
    closes, industries = price_universe
    win = window_returns(closes, cfg)
    tbl = group_strength.group_table(win, industries, cfg)
    assert list(tbl.index) == ["Chips", "Software", "Telecom"]
    assert tbl.loc["Chips", "percentile"] == 100.0
    assert tbl.loc["Telecom", "percentile"] == 0.0

    top = group_strength.compute("Chips", tbl, cfg)
    assert top.status == "pass" and top.score == 100.0
    assert top.raw["rank"] == 1 and top.raw["of"] == 3
    assert group_strength.compute("Telecom", tbl, cfg).status == "fail"


def test_missing_group_is_na_not_zero(cfg, price_universe):
    closes, industries = price_universe
    tbl = group_strength.group_table(window_returns(closes, cfg), industries, cfg)
    r = group_strength.compute(None, tbl, cfg)
    assert r.score is None and r.status == "n/a"
    r = group_strength.compute("Unknown Group", tbl, cfg)
    assert r.score is None and r.status == "n/a"


def test_small_groups_are_not_ranked(cfg, price_universe):
    closes, industries = price_universe
    industries = industries.copy()
    industries["TEL3"] = "Tiny"
    tbl = group_strength.group_table(window_returns(closes, cfg), industries, cfg)
    assert "Tiny" not in tbl.index


def test_rs_weighting_is_40_20_20_20(cfg):
    import pandas as pd
    win = pd.DataFrame({"r63": [0.10], "r126": [0.20], "r189": [0.30], "r252": [0.40]}, index=["X"])
    assert np.isclose(weighted_rs(win, cfg)["X"], 0.4 * 0.1 + 0.2 * 0.2 + 0.2 * 0.3 + 0.2 * 0.4)
    # a recent IPO with only 3 months of history still gets a value
    win2 = pd.DataFrame({"r63": [0.10], "r126": [np.nan], "r189": [np.nan], "r252": [np.nan]}, index=["IPO"])
    assert np.isclose(weighted_rs(win2, cfg)["IPO"], 0.10)


def test_rs_rating_range():
    import pandas as pd
    r = rs_rating(pd.Series(np.arange(100.0)))
    assert r.min() == 1 and r.max() == 99
