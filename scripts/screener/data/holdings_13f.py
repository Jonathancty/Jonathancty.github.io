"""Form 13F data sets -> per-quarter institutional holder counts per CUSIP.

Point-in-time rule: for a report period P we only count filings filed within
TIMELY_DAYS of P (the 13F deadline is 45 days). Every timely filing for P therefore
sits in exactly one SEC data-set zip, later amendments are ignored, and the counts
for P are "known" from P + TIMELY_DAYS onward. That is what makes the calibration
free of look-ahead bias.

Column names follow SEC's "Form 13F Data Sets" readme (tab-delimited, UTF-8,
dates as DD-MON-YYYY; VALUE in dollars from 3 Jan 2023, thousands before).
"""
import io
import json
import os
import zipfile

import pandas as pd

TIMELY_DAYS = 48           # 45-day deadline + weekend/holiday slack
VALUE_IN_DOLLARS_FROM = pd.Timestamp("2023-01-03")


def _member(zf, stem):
    for n in zf.namelist():
        base = os.path.basename(n).upper()
        if base.startswith(stem.upper()) and base.endswith((".TSV", ".TXT")):
            return n
    raise KeyError(f"{stem} not found in zip ({zf.namelist()[:10]})")


def _read(zf, stem, usecols, chunksize=None):
    return pd.read_csv(
        zf.open(_member(zf, stem)), sep="\t", usecols=lambda c: c in usecols,
        dtype=str, chunksize=chunksize, quoting=3, on_bad_lines="skip", encoding="utf-8",
        encoding_errors="replace",
    )


def _date(s):
    return pd.to_datetime(s, format="%d-%b-%Y", errors="coerce")


def select_filings(sub, cover):
    """Pick the accession numbers to count, one 'book' per (CIK, period).

    sub: ACCESSION_NUMBER, FILING_DATE, SUBMISSIONTYPE, CIK, PERIODOFREPORT (parsed dates)
    cover: ACCESSION_NUMBER, AMENDMENTTYPE
    Returns a DataFrame of ACCESSION_NUMBER, CIK, PERIOD, FILING_DATE.
    """
    df = sub[sub["SUBMISSIONTYPE"].isin(["13F-HR", "13F-HR/A"])].copy()
    df = df.merge(cover[["ACCESSION_NUMBER", "AMENDMENTTYPE"]], on="ACCESSION_NUMBER", how="left")
    lag = (df["FILING_DATE"] - df["PERIODOFREPORT"]).dt.days
    df = df[(lag > 0) & (lag <= TIMELY_DAYS)]
    amend = df["AMENDMENTTYPE"].fillna("").str.upper()
    is_new_holdings = (df["SUBMISSIONTYPE"] == "13F-HR/A") & amend.str.contains("NEW HOLDINGS")
    base = df[~is_new_holdings].sort_values(["CIK", "PERIODOFREPORT", "FILING_DATE", "ACCESSION_NUMBER"])
    base = base.drop_duplicates(["CIK", "PERIODOFREPORT"], keep="last")   # latest restatement wins
    adds = df[is_new_holdings].merge(
        base[["CIK", "PERIODOFREPORT", "FILING_DATE"]].rename(columns={"FILING_DATE": "BASE_DATE"}),
        on=["CIK", "PERIODOFREPORT"], how="inner")
    adds = adds[adds["FILING_DATE"] >= adds["BASE_DATE"]]
    keep = pd.concat([base, adds[base.columns]], ignore_index=True)
    return keep.rename(columns={"PERIODOFREPORT": "PERIOD"})[["ACCESSION_NUMBER", "CIK", "PERIOD", "FILING_DATE"]]


def aggregate_infotable(info, filings):
    """info: ACCESSION_NUMBER, NAMEOFISSUER, CUSIP, VALUE, SSHPRNAMT, SSHPRNAMTTYPE, PUTCALL (strings).
    Returns per (PERIOD, CUSIP): n_holders, shares, value_usd, issuer."""
    info = info[(info["SSHPRNAMTTYPE"].str.upper() == "SH") & (info["PUTCALL"].isna() | (info["PUTCALL"].str.strip() == ""))]
    info = info.merge(filings, on="ACCESSION_NUMBER", how="inner")
    if info.empty:
        return pd.DataFrame(columns=["PERIOD", "CUSIP", "n_holders", "shares", "value_usd", "issuer"])
    info = info.assign(
        CUSIP=info["CUSIP"].str.strip().str.upper(),
        shares=pd.to_numeric(info["SSHPRNAMT"], errors="coerce").fillna(0.0),
        value=pd.to_numeric(info["VALUE"], errors="coerce").fillna(0.0),
    )
    info = info[info["CUSIP"].str.fullmatch(r"[0-9A-Z]{9}", na=False)]
    info.loc[info["FILING_DATE"] < VALUE_IN_DOLLARS_FROM, "value"] *= 1000.0
    per_holder = info.groupby(["PERIOD", "CUSIP", "CIK"], as_index=False).agg(
        shares=("shares", "sum"), value_usd=("value", "sum"), issuer=("NAMEOFISSUER", "first"))
    out = per_holder.groupby(["PERIOD", "CUSIP"], as_index=False).agg(
        n_holders=("CIK", "nunique"), shares=("shares", "sum"),
        value_usd=("value_usd", "sum"), issuer=("issuer", "first"))
    return out


def process_zip(zip_path):
    """Returns (aggregates DataFrame, {period: n_filers})."""
    with zipfile.ZipFile(zip_path) as zf:
        sub = _read(zf, "SUBMISSION", {"ACCESSION_NUMBER", "FILING_DATE", "SUBMISSIONTYPE", "CIK", "PERIODOFREPORT"})
        sub["FILING_DATE"] = _date(sub["FILING_DATE"])
        sub["PERIODOFREPORT"] = _date(sub["PERIODOFREPORT"])
        cover = _read(zf, "COVERPAGE", {"ACCESSION_NUMBER", "AMENDMENTTYPE"})
        filings = select_filings(sub, cover)
        keep_acc = set(filings["ACCESSION_NUMBER"])
        parts = []
        cols = {"ACCESSION_NUMBER", "NAMEOFISSUER", "CUSIP", "VALUE", "SSHPRNAMT", "SSHPRNAMTTYPE", "PUTCALL"}
        for chunk in _read(zf, "INFOTABLE", cols, chunksize=1_000_000):
            chunk = chunk[chunk["ACCESSION_NUMBER"].isin(keep_acc)]
            if "PUTCALL" not in chunk:
                chunk["PUTCALL"] = None
            parts.append(chunk)
    info = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame()
    agg = aggregate_infotable(info, filings) if not info.empty else aggregate_infotable(
        pd.DataFrame(columns=list(cols)), filings)
    n_filers = filings.groupby("PERIOD")["CIK"].nunique().to_dict()
    return agg, {str(k.date()): int(v) for k, v in n_filers.items()}


# ---------------------------------------------------------------------------
# Cache layout: _screener_cache/13f/<YYYY-MM-DD>.csv.gz + meta.json
# ---------------------------------------------------------------------------
def save_periods(cache_dir, agg, n_filers, dataset_name, min_filers=1000):
    """Write one file per report period. Periods with few filers are spill-over
    from an adjacent window (stray early/late filings) and are skipped."""
    os.makedirs(cache_dir, exist_ok=True)
    meta = load_meta(cache_dir)
    written = []
    for period, grp in agg.groupby("PERIOD"):
        key = str(pd.Timestamp(period).date())
        if n_filers.get(key, 0) < min_filers:
            continue
        grp.drop(columns=["PERIOD"]).sort_values("CUSIP").to_csv(
            os.path.join(cache_dir, f"{key}.csv.gz"), index=False, compression="gzip")
        meta["periods"][key] = {"n_filers": n_filers[key], "dataset": dataset_name}
        written.append(key)
    meta["processed_datasets"] = sorted(set(meta.get("processed_datasets", [])) | {dataset_name})
    with open(os.path.join(cache_dir, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1, sort_keys=True)
    return written


def load_meta(cache_dir):
    p = os.path.join(cache_dir, "meta.json")
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return {"periods": {}, "processed_datasets": []}


def load_counts(cache_dir, periods=None):
    """Long DataFrame: period (Timestamp), cusip, n_holders, shares, n_filers."""
    meta = load_meta(cache_dir)
    keys = sorted(meta["periods"])
    if periods is not None:
        keys = [k for k in keys if k in set(periods)]
    frames = []
    for k in keys:
        p = os.path.join(cache_dir, f"{k}.csv.gz")
        if not os.path.exists(p):
            continue
        df = pd.read_csv(p, dtype={"CUSIP": str})
        df["period"] = pd.Timestamp(k)
        df["n_filers"] = meta["periods"][k]["n_filers"]
        frames.append(df)
    if not frames:
        return pd.DataFrame(columns=["CUSIP", "n_holders", "shares", "value_usd", "issuer", "period", "n_filers"])
    return pd.concat(frames, ignore_index=True)
