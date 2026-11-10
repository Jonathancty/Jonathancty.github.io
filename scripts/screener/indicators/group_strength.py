"""Indicator 1: Industry group strength.

Group RS = equal-weighted constituent performance, weighted 40% last 3 months and 20% each
for 6/9/12 months. Groups are ranked across the whole liquid universe (all sectors) and
converted to a percentile. Pass = top 20% of groups, partial = top 40%.
"""
import numpy as np
import pandas as pd

from .common import FAIL, PARTIAL, PASS, IndicatorResult, na
from .rs import weighted_rs


def group_table(win_ret, industries, cfg):
    """win_ret: ticker x window returns. industries: Series ticker -> industry group.
    Returns DataFrame indexed by group: n, group_rs, rank, n_groups, percentile."""
    g = cfg["indicators"]["group_strength"]
    df = win_ret.join(industries.rename("group"), how="inner").dropna(subset=["group"])
    means = df.groupby("group").mean(numeric_only=True)
    counts = df.groupby("group").size().rename("n")
    tbl = means.join(counts)
    tbl = tbl[tbl["n"] >= g["min_group_size"]]
    tbl["group_rs"] = weighted_rs(tbl, cfg)
    tbl = tbl.dropna(subset=["group_rs"])
    tbl["rank"] = tbl["group_rs"].rank(ascending=False, method="min").astype(int)
    tbl["n_groups"] = len(tbl)
    # percentile: best group = 100, worst = 0
    tbl["percentile"] = 100.0 * (1 - (tbl["rank"] - 1) / max(len(tbl) - 1, 1))
    return tbl.sort_values("rank")


def compute(group, groups_tbl, cfg):
    g = cfg["indicators"]["group_strength"]
    if group is None or (isinstance(group, float) and np.isnan(group)):
        return na("no industry classification")
    if group not in groups_tbl.index:
        return na("group too small to rank", group=group)
    row = groups_tbl.loc[group]
    pct = float(row["percentile"])
    status = PASS if pct >= g["pass_percentile"] else PARTIAL if pct >= g["partial_percentile"] else FAIL
    return IndicatorResult(pct, status, {
        "group": group, "rank": int(row["rank"]), "of": int(row["n_groups"]),
        "percentile": pct, "constituents": int(row["n"]),
        "group_ret_3m_pct": float(row.get("r63", np.nan)) * 100,
        "group_ret_12m_pct": float(row.get("r252", np.nan)) * 100,
    })
