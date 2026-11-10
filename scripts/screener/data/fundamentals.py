"""EPS and revenue growth from SEC XBRL 'frames' (one request returns a concept for every
company in a calendar period, e.g. /api/xbrl/frames/us-gaap/EarningsPerShareDiluted/USD-per-shares/CY2026Q2.json).

Point-in-time: frames carry no filing date, so a quarter is treated as known 45 days after
its end (10-Q deadline is 40-45 days) and an annual figure 75 days after year end.
"""
import os

import numpy as np
import pandas as pd

FRAMES_URL = "https://data.sec.gov/api/xbrl/frames/us-gaap/{tag}/{unit}/{period}.json"
EPS_TAGS = [("EarningsPerShareDiluted", "USD-per-shares"), ("EarningsPerShareBasic", "USD-per-shares")]
REV_TAGS = [("Revenues", "USD"), ("RevenueFromContractWithCustomerExcludingAssessedTax", "USD"),
            ("SalesRevenueNet", "USD"), ("RevenueFromContractWithCustomerIncludingAssessedTax", "USD")]
Q_LAG_DAYS, A_LAG_DAYS = 45, 75


def period_labels(start_year, end_ts):
    end_ts = pd.Timestamp(end_ts)
    if end_ts.tzinfo is not None:
        end_ts = end_ts.tz_localize(None)
    out = []
    for y in range(start_year, end_ts.year + 1):
        for q in range(1, 5):
            if pd.Timestamp(year=y, month=3 * q, day=1) + pd.offsets.MonthEnd(0) <= end_ts:
                out.append(f"CY{y}Q{q}")
        if pd.Timestamp(year=y, month=12, day=31) <= end_ts:
            out.append(f"CY{y}")
    return out


def fetch_frames(client, cache_dir, labels, refresh_recent=3):
    """Download (or reuse cached) frames. The most recent `refresh_recent` quarterly labels are
    re-fetched every run because late filers keep adding to them."""
    os.makedirs(cache_dir, exist_ok=True)
    q_labels = [l for l in labels if "Q" in l]
    recent = set(q_labels[-refresh_recent:])
    for tag, unit in EPS_TAGS + REV_TAGS:
        for label in labels:
            path = os.path.join(cache_dir, f"{tag}_{label}.csv.gz")
            if os.path.exists(path) and label not in recent:
                continue
            try:
                data = client.get_json(FRAMES_URL.format(tag=tag, unit=unit, period=label))["data"]
                df = pd.DataFrame(data)[["cik", "end", "val"]]
            except Exception as e:  # 404 = no company reported that concept for that period
                if "404" not in str(e):
                    print(f"  frame {tag} {label}: {e}")
                df = pd.DataFrame(columns=["cik", "end", "val"])
            df.to_csv(path, index=False, compression="gzip")


def _load_concept(cache_dir, tags, labels):
    """First tag that has a value wins, per (cik, label)."""
    frames = []
    for prio, (tag, _) in enumerate(tags):
        for label in labels:
            p = os.path.join(cache_dir, f"{tag}_{label}.csv.gz")
            if os.path.exists(p):
                df = pd.read_csv(p)
                if len(df):
                    df["label"], df["prio"] = label, prio
                    frames.append(df)
    if not frames:
        return pd.DataFrame(columns=["cik", "label", "end", "val"])
    df = pd.concat(frames, ignore_index=True).sort_values("prio").drop_duplicates(["cik", "label"])
    return df[["cik", "label", "end", "val"]]


def build_table(cache_dir, labels):
    """Long table: cik, label, kind ('Q'/'A'), end, available, eps, rev.
    Missing Q4 quarters are derived as annual minus Q1-Q3 (common for 10-K-only Q4s)."""
    eps = _load_concept(cache_dir, EPS_TAGS, labels).rename(columns={"val": "eps"})
    rev = _load_concept(cache_dir, REV_TAGS, labels).rename(columns={"val": "rev"})
    t = eps.merge(rev, on=["cik", "label"], how="outer", suffixes=("", "_r"))
    t["end"] = pd.to_datetime(t["end"].fillna(t["end_r"]))
    t = t.drop(columns=["end_r"])
    t["kind"] = np.where(t["label"].str.contains("Q"), "Q", "A")
    t["year"] = t["label"].str.slice(2, 6).astype(int)
    t["q"] = np.where(t["kind"] == "Q", t["label"].str.slice(7).replace("", "0"), "0").astype(int)

    q = t[t["kind"] == "Q"].set_index(["cik", "year", "q"])
    a = t[t["kind"] == "A"].set_index(["cik", "year"])
    derived = []
    for (cik, year), arow in a.iterrows():
        if (cik, year, 4) in q.index:
            continue
        try:
            q123 = q.loc[[(cik, year, 1), (cik, year, 2), (cik, year, 3)]]
        except KeyError:
            continue
        if len(q123) != 3:
            continue
        derived.append({"cik": cik, "year": year, "q": 4, "label": f"CY{year}Q4", "kind": "Q",
                        "end": arow["end"],
                        "eps": arow["eps"] - q123["eps"].sum() if pd.notna(arow["eps"]) else np.nan,
                        "rev": arow["rev"] - q123["rev"].sum() if pd.notna(arow["rev"]) else np.nan,
                        "derived": True})
    t = pd.concat([t, pd.DataFrame(derived)], ignore_index=True)
    t["derived"] = t.get("derived", False)
    t["derived"] = t["derived"].fillna(False).astype(bool)
    lag = np.where((t["kind"] == "Q") & ~t["derived"], Q_LAG_DAYS, A_LAG_DAYS)
    t["available"] = t["end"] + pd.to_timedelta(lag, unit="D")
    return t


def growth(cur, prior):
    """YoY growth with sensible handling of losses. Returns a decimal (0.25 = +25%)."""
    if pd.isna(cur) or pd.isna(prior):
        return np.nan
    if prior > 0:
        return float(np.clip(cur / prior - 1.0, -1.0, 5.0))
    if prior == 0:
        return np.nan if cur <= 0 else 1.0
    if cur > 0:
        return 1.0                       # loss -> profit turnaround
    return float(np.clip((cur - prior) / abs(prior), -1.0, 1.0))   # narrowing / widening loss


def growth_as_of(table, as_of, ciks=None):
    """Per cik: eps_q_growth, rev_q_growth (latest quarter vs same quarter a year earlier) and
    eps_a_growth (latest annual vs prior), using only figures available on `as_of`."""
    as_of = pd.Timestamp(as_of)
    if as_of.tzinfo is not None:
        as_of = as_of.tz_localize(None)
    t = table[(table["available"] <= as_of) & (table["available"] > as_of - pd.Timedelta(days=800))]
    if ciks is not None:
        t = t[t["cik"].isin(set(ciks))]
    out = {}
    for cik, g in t.groupby("cik"):
        rec = {}
        qs = g[g["kind"] == "Q"].set_index(["year", "q"]).sort_index()
        if len(qs):
            (y, qq) = qs.index[-1]
            last = qs.iloc[-1]
            prior = qs.loc[(y - 1, qq)] if (y - 1, qq) in qs.index else None
            rec["eps_q"] = last["eps"]
            rec["eps_q_growth"] = growth(last["eps"], prior["eps"]) if prior is not None else np.nan
            rec["rev_q_growth"] = growth(last["rev"], prior["rev"]) if prior is not None else np.nan
            rec["latest_q"] = f"{y}Q{qq}"
        ann = g[g["kind"] == "A"].set_index("year").sort_index()
        if len(ann) >= 2 and ann.index[-1] - 1 in ann.index:
            rec["eps_a_growth"] = growth(ann.iloc[-1]["eps"], ann.loc[ann.index[-1] - 1]["eps"])
        out[int(cik)] = rec
    return pd.DataFrame.from_dict(out, orient="index")
