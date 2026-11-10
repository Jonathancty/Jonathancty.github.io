"""Indicators 5 and 6 (sponsor quality, top-rated growth funds) on a fixture fund universe."""
import numpy as np
import pandas as pd
import pytest

from scripts.screener import funds as fundlib
from scripts.screener.indicators import growth_fund, sponsor_quality

AS_OF = pd.Timestamp("2026-06-30")


@pytest.fixture
def fund_fixture(cfg):
    months = pd.date_range(end=AS_OF, periods=40, freq=pd.offsets.MonthEnd())
    # 20 peer funds with steadily increasing monthly returns: S19 best, S00 worst
    ids = [f"S{i:02d}" for i in range(20)]
    ret = pd.DataFrame({sid: 0.002 * i - 0.01 for i, sid in enumerate(ids)}, index=months, dtype=float)
    names = {sid: (f"Alpha Growth Fund {sid}" if i % 2 else f"Steady Equity Fund {sid}") for i, sid in enumerate(ids)}
    names["S18"] = "Big Index 500 Fund"          # excluded as index fund
    info = pd.DataFrame({"SERIES_NAME": names, "is_index": {s: s == "S18" for s in ids},
                         "eq_pct": 97.0, "n_eq": 80}).rename_axis("SERIES_ID")
    perf = fundlib.fund_performance(ret, AS_OF, cfg)
    rated = fundlib.rate_funds(info, perf, cfg)
    return rated


def test_fund_percentiles_and_grades(cfg, fund_fixture):
    r = fund_fixture
    assert not r.loc["S18", "is_peer"]
    assert r.loc["S19", "pct12"] == 100.0
    assert r.loc["S19", "grade"] == "A+"
    assert not r.loc["S10", "is_growth"]                   # "Steady Equity" isn't growth-style
    assert r["grade"].dropna().isin([g for g, _ in cfg["indicators"]["growth_fund"]["grade_cutoffs"]]).all()


def test_grade_cutoffs(cfg):
    cut = cfg["indicators"]["growth_fund"]["grade_cutoffs"]
    assert fundlib.grade_from_percentile(96, cut) == "A+"
    assert fundlib.grade_from_percentile(90, cut) == "A"
    assert fundlib.grade_from_percentile(85, cut) == "A-"
    assert fundlib.grade_from_percentile(81, cut) == "B+"
    assert fundlib.grade_from_percentile(10, cut) == "E"


def _holdings(rows):
    return pd.DataFrame(rows, columns=["SERIES_ID", "CUSIP", "shares", "pct"])


def test_sponsor_metrics_quality_and_adding(cfg, fund_fixture):
    cur = _holdings([
        ("S19", "AAA111111", 1000, 4.0), ("S17", "AAA111111", 500, 1.0), ("S15", "AAA111111", 300, 0.5),
        ("S13", "AAA111111", 900, 0.2),   # quality fund but cutting its stake below
        ("S01", "AAA111111", 100, 0.1),   # poor performer
        ("S19", "BBB222222", 10, 0.05),
    ])
    prev = _holdings([("S19", "AAA111111", 900, 3.5), ("S17", "AAA111111", 500, 1.0),
                      ("S15", "AAA111111", 300, 0.5), ("S13", "AAA111111", 2000, 0.4), ("S01", "AAA111111", 100, 0.1)])
    m = fundlib.sponsor_metrics(cur, prev, fund_fixture, cfg)
    a = m.loc["AAA111111"]
    assert a["n_active_holders"] == 5
    assert a["n_quality"] == 3                              # S19, S17, S15 (S13 sold, S01 below average)
    assert a["top_sponsors"][0]["name"].endswith("S19")      # highest conviction x performance first
    res = sponsor_quality.compute(a, cfg)
    assert res.status == "pass"
    b = sponsor_quality.compute(m.loc["BBB222222"], cfg)
    assert b.status == "partial" and b.score < res.score


def test_growth_fund_indicator(cfg, fund_fixture):
    cur = _holdings([("S19", "AAA111111", 1000, 4.0), ("S17", "AAA111111", 500, 1.0), ("S15", "AAA111111", 300, 0.5),
                     ("S10", "AAA111111", 300, 0.5)])
    m = fundlib.sponsor_metrics(cur, None, fund_fixture, cfg)
    res = growth_fund.compute(m.loc["AAA111111"], cfg)
    # S19/S17/S15 are odd-numbered "Growth" funds near the top; S10 is not growth-style
    assert res.raw["top_rated_growth_funds"] >= 2
    assert res.status in ("pass", "partial")


def test_sponsor_scores_are_relative_and_do_not_saturate(cfg):
    """Large caps with hundreds of quality sponsors must still be distinguishable."""
    def m(nq, holders, pts, ng, gpts):
        return pd.Series({"n_quality": nq, "n_active_holders": holders, "quality_points": pts,
                          "n_good_growth": ng, "growth_points": gpts, "growth_grades": ""})
    rows = {"BIG_BROAD": m(200, 1000, 300.0, 30, 45.0),     # many sponsors, low quality share
            "FOCUSED": m(120, 200, 200.0, 25, 40.0),       # fewer but high-quality holders
            "THIN": m(2, 40, 3.0, 0, 0.0),
            "NONE": None}
    sq = sponsor_quality.cross_section(rows)
    gf = growth_fund.cross_section(rows)
    s = {t: sponsor_quality.compute(rows[t], cfg, pct=sq[t]) for t in rows}
    assert s["BIG_BROAD"].score < 100 and s["FOCUSED"].score < 100
    assert s["FOCUSED"].score > s["THIN"].score > s["NONE"].score == 0
    assert s["BIG_BROAD"].status == "pass" and s["THIN"].status == "partial"
    g = {t: growth_fund.compute(rows[t], cfg, pct=gf[t]) for t in rows}
    assert g["THIN"].score == 0 and g["BIG_BROAD"].score == 100 and g["FOCUSED"].score < 100


def test_unheld_stock_scores_zero_but_missing_data_is_na(cfg):
    assert sponsor_quality.compute(None, cfg).score == 0.0
    assert sponsor_quality.compute(None, cfg, holdings_available=False).status == "n/a"
    assert growth_fund.compute(None, cfg, holdings_available=False).score is None
