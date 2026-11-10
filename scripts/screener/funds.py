"""Fund performance, IBD-style grades and per-stock sponsor metrics.

Inputs are plain DataFrames so this runs identically for the live screener and for
each historical date in the calibration.
"""
import re

import numpy as np
import pandas as pd


def _compound(x):
    return float(np.prod(1.0 + x) - 1.0)


def fund_performance(ret_wide, as_of_month, cfg):
    """ret_wide: month x SERIES_ID decimal returns. Returns DataFrame indexed by SERIES_ID with
    r12, r36_ann, y1, y2, y3 (yearly compounded, y1 = most recent) and months_available."""
    as_of_month = pd.Timestamp(as_of_month) + pd.offsets.MonthEnd(0)
    window = ret_wide.loc[:as_of_month].tail(36)
    window = window.reindex(pd.date_range(end=as_of_month, periods=36, freq=pd.offsets.MonthEnd()))
    out = {}
    for sid in window.columns:
        s = window[sid]
        n = int(s.notna().sum())
        y1, y2, y3 = s.iloc[24:36], s.iloc[12:24], s.iloc[0:12]
        rec = {"months": n}
        rec["r12"] = _compound(y1.values) if y1.notna().sum() >= 11 else np.nan
        rec["y1"], rec["y2"], rec["y3"] = rec["r12"], np.nan, np.nan
        if s.notna().sum() >= cfg["funds"]["min_months_for_rating"] - 2:
            vals = s.fillna(0.0).values
            rec["r36_ann"] = (np.prod(1 + vals)) ** (1 / 3) - 1
            rec["y2"] = _compound(y2.fillna(0.0).values)
            rec["y3"] = _compound(y3.fillna(0.0).values)
        else:
            rec["r36_ann"] = np.nan
        out[sid] = rec
    return pd.DataFrame.from_dict(out, orient="index")


def grade_from_percentile(pct, cutoffs):
    if pct is None or (isinstance(pct, float) and np.isnan(pct)):
        return None
    for grade, cut in cutoffs:
        if pct >= cut:
            return grade
    return cutoffs[-1][0]


def classify_funds(fund_info, cfg):
    """fund_info indexed by SERIES_ID with SERIES_NAME, is_index, eq_pct, n_eq.
    Adds is_peer (active equity fund) and is_growth."""
    sq = cfg["indicators"]["sponsor_quality"]
    gf = cfg["indicators"]["growth_fund"]
    f = fund_info.copy()
    f["is_peer"] = (~f["is_index"].astype(bool)) & (f["eq_pct"] >= sq["min_equity_pct"]) & (f["n_eq"] >= sq["min_fund_holdings"])
    name = f["SERIES_NAME"].fillna("")
    f["is_growth"] = f["is_peer"] & name.str.contains(gf["growth_name_regex"], flags=re.IGNORECASE, regex=True) \
        & ~name.str.contains(gf["exclude_name_regex"], flags=re.IGNORECASE, regex=True)
    return f


def rate_funds(fund_info, perf, cfg):
    """Adds pct12, pct36 (percentile vs all peer funds) and rating_pct/grade (vs growth funds)."""
    gf = cfg["indicators"]["growth_fund"]
    f = classify_funds(fund_info, cfg).join(perf, how="left")
    peers = f[f["is_peer"]]
    f["pct12"] = peers["r12"].rank(pct=True) * 100
    f["pct36"] = peers["r36_ann"].rank(pct=True) * 100
    w = gf["year_weights"]
    f["rating_input"] = w[0] * f["y1"] + w[1] * f["y2"] + w[2] * f["y3"]
    growth = f[f["is_growth"] & f["rating_input"].notna()]
    f["rating_pct"] = growth["rating_input"].rank(pct=True) * 100
    f["grade"] = f["rating_pct"].map(lambda p: grade_from_percentile(p, gf["grade_cutoffs"]))
    return f


def _points(pct, cap):
    """Conviction points: 1 for any position, up to 3 for a position >= cap % of net assets."""
    p = 0.0 if pct is None or np.isnan(pct) else max(0.0, float(pct))
    return 1.0 + 2.0 * min(p, cap) / cap


def sponsor_metrics(cur, prev, rated, cfg):
    """Per-CUSIP sponsor metrics.

    cur / prev: holdings snapshots (SERIES_ID, CUSIP, shares, pct) for the latest and prior quarter.
    rated: output of rate_funds (indexed by SERIES_ID).
    """
    sq = cfg["indicators"]["sponsor_quality"]
    gf = cfg["indicators"]["growth_fund"]
    cap = sq["conviction_cap_pct"]
    peers = rated[rated["is_peer"]]
    h = cur[cur["SERIES_ID"].isin(peers.index)][["SERIES_ID", "CUSIP", "shares", "pct"]]
    p = prev[["SERIES_ID", "CUSIP", "shares"]].rename(columns={"shares": "prev_shares"}) if prev is not None and len(prev) else \
        pd.DataFrame(columns=["SERIES_ID", "CUSIP", "prev_shares"])
    h = h.merge(p, on=["SERIES_ID", "CUSIP"], how="left")
    prev_series = set(p["SERIES_ID"]) if len(p) else set()
    # "holding or adding": new position, or shares not cut by more than 2%.
    # If the fund wasn't in the prior snapshot at all we can't tell, so treat it as holding.
    h["holding_or_adding"] = h["prev_shares"].isna() | (h["shares"] >= 0.98 * h["prev_shares"].fillna(0))
    h["is_new"] = h["prev_shares"].isna() & h["SERIES_ID"].isin(prev_series)
    h = h.join(peers[["SERIES_NAME", "pct12", "pct36", "grade", "rating_pct", "is_growth"]], on="SERIES_ID")
    thr = sq["above_average_percentile"]
    h["quality"] = (h["pct12"] >= thr) & (h["pct36"] >= thr) & h["holding_or_adding"]
    h["good_growth"] = h["grade"].isin(gf["good_grades"]) & h["is_growth"] & h["holding_or_adding"]
    h["points"] = h["pct"].map(lambda x: _points(x, cap))

    rows = []
    for cusip, g in h.groupby("CUSIP"):
        q = g[g["quality"]].copy()
        gg = g[g["good_growth"]]
        q["rank_key"] = q["points"] * ((q["pct12"] + q["pct36"]) / 2)
        top = q.sort_values("rank_key", ascending=False).head(3)
        rows.append({
            "CUSIP": cusip,
            "n_active_holders": int(len(g)),
            "n_quality": int(len(q)),
            "quality_points": float(q["points"].sum()),
            "n_good_growth": int(len(gg)),
            "growth_points": float(gg["points"].sum()),
            "growth_grades": ",".join(sorted(gg["grade"].dropna().tolist())),
            "top_sponsors": [
                {"name": r.SERIES_NAME, "pct12": round(float(r.pct12), 0), "pct36": round(float(r.pct36), 0),
                 "grade": r.grade, "position_pct": None if pd.isna(r.pct) else round(float(r.pct), 2),
                 "new": bool(r.is_new)}
                for r in top.itertuples()
            ],
        })
    return pd.DataFrame(rows).set_index("CUSIP") if rows else pd.DataFrame(
        columns=["n_active_holders", "n_quality", "quality_points", "n_good_growth", "growth_points", "growth_grades", "top_sponsors"])
