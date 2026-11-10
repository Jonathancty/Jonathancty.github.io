"""Form N-PORT data sets -> fund info, monthly fund returns, active-fund equity holdings
and a CUSIP -> ticker map.

Table/column names follow SEC's "NPORT Data Sets" readme (tab-delimited, UTF-8):
SUBMISSION, FUND_REPORTED_INFO, MONTHLY_TOTAL_RETURN, FUND_REPORTED_HOLDING, IDENTIFIERS.

Each quarterly zip (~400 MB) is reduced to four small parquet intermediates in the
history dir (kept in the GitHub Actions cache, not the repo).
"""
import os
import re
import zipfile

import numpy as np
import pandas as pd

AVAILABLE_LAG_DAYS = 60   # public N-PORT filings are due 60 days after the reporting month


def _member(zf, stem):
    for n in zf.namelist():
        base = os.path.splitext(os.path.basename(n))[0].upper()
        if base == stem.upper():
            return n
    raise KeyError(f"{stem} not found in zip")


def _read(zf, stem, usecols, chunksize=None):
    return pd.read_csv(
        zf.open(_member(zf, stem)), sep="\t", usecols=lambda c: c in usecols, dtype=str,
        chunksize=chunksize, quoting=3, on_bad_lines="skip", encoding="utf-8", encoding_errors="replace",
    )


def _date(s):
    # The readme doesn't pin a format; SEC data sets use DD-MON-YYYY but be tolerant.
    d = pd.to_datetime(s, format="%d-%b-%Y", errors="coerce")
    miss = d.isna() & s.notna()
    if miss.any():
        d[miss] = pd.to_datetime(s[miss], errors="coerce", format="mixed")
    return d


def is_index_fund(name, index_regex):
    return bool(re.search(index_regex, str(name or ""), flags=re.IGNORECASE))


def returns_to_decimal(values):
    """N-PORT monthly returns are reported in percent (1.5 = 1.5%). Detect the scale
    defensively: typical monthly equity returns are a few percent, so a median absolute
    value above 0.2 means 'percent'."""
    v = pd.to_numeric(values, errors="coerce")
    med = np.nanmedian(np.abs(v)) if len(v) else 0
    return v / 100.0 if med > 0.2 else v


def monthly_returns_long(mtr, sub_info):
    """mtr: ACCESSION_NUMBER, CLASS_ID, MONTHLY_TOTAL_RETURN1..3.
    sub_info: ACCESSION_NUMBER, SERIES_ID, REPORT_DATE, FILING_DATE.
    Returns SERIES_ID, month (month-end Timestamp), ret (decimal), FILING_DATE.
    RETURN1 is the first of the three months ending at REPORT_DATE."""
    df = mtr.merge(sub_info, on="ACCESSION_NUMBER", how="inner")
    rows = []
    for k, offset in (("MONTHLY_TOTAL_RETURN1", 2), ("MONTHLY_TOTAL_RETURN2", 1), ("MONTHLY_TOTAL_RETURN3", 0)):
        part = df[["SERIES_ID", "CLASS_ID", "REPORT_DATE", "FILING_DATE", k]].rename(columns={k: "ret"})
        part = part.assign(month=(part["REPORT_DATE"] + pd.offsets.MonthEnd(0)) - pd.offsets.MonthEnd(offset))
        rows.append(part)
    long = pd.concat(rows, ignore_index=True)
    long["ret"] = returns_to_decimal(long["ret"])
    long = long.dropna(subset=["ret", "month", "SERIES_ID"])
    # several share classes: take the median class return per (series, month, filing)
    long = long.groupby(["SERIES_ID", "month", "FILING_DATE"], as_index=False)["ret"].median()
    long = long.sort_values("FILING_DATE").drop_duplicates(["SERIES_ID", "month"], keep="last")
    return long


def process_zip(zip_path, cfg):
    """Returns dict of DataFrames: funds, returns, holdings, tickers."""
    index_regex = cfg["funds"]["index_name_regex"]
    with zipfile.ZipFile(zip_path) as zf:
        sub = _read(zf, "SUBMISSION", {"ACCESSION_NUMBER", "FILING_DATE", "SUB_TYPE", "REPORT_DATE"})
        sub = sub[sub["SUB_TYPE"].fillna("").str.upper().str.replace("-", "").isin(["NPORTP", "NPORTP/A"])]
        sub["FILING_DATE"] = _date(sub["FILING_DATE"])
        sub["REPORT_DATE"] = _date(sub["REPORT_DATE"])
        info = _read(zf, "FUND_REPORTED_INFO", {"ACCESSION_NUMBER", "SERIES_NAME", "SERIES_ID", "NET_ASSETS"})
        funds = sub.merge(info, on="ACCESSION_NUMBER", how="inner").dropna(subset=["SERIES_ID"])
        funds["NET_ASSETS"] = pd.to_numeric(funds["NET_ASSETS"], errors="coerce")
        funds["is_index"] = funds["SERIES_NAME"].map(lambda n: is_index_fund(n, index_regex))
        active_acc = set(funds.loc[~funds["is_index"], "ACCESSION_NUMBER"])

        mtr = _read(zf, "MONTHLY_TOTAL_RETURN", {"ACCESSION_NUMBER", "CLASS_ID", "MONTHLY_TOTAL_RETURN1",
                                                  "MONTHLY_TOTAL_RETURN2", "MONTHLY_TOTAL_RETURN3"})
        returns = monthly_returns_long(mtr, funds[["ACCESSION_NUMBER", "SERIES_ID", "REPORT_DATE", "FILING_DATE"]])

        eq_stats, keep, hid_to_cusip = [], [], []
        hcols = {"ACCESSION_NUMBER", "HOLDING_ID", "ISSUER_CUSIP", "BALANCE", "UNIT", "CURRENCY_VALUE",
                 "PERCENTAGE", "PAYOFF_PROFILE", "ASSET_CAT"}
        for ch in _read(zf, "FUND_REPORTED_HOLDING", hcols, chunksize=2_000_000):
            ec = ch[(ch["ASSET_CAT"] == "EC") & (ch["PAYOFF_PROFILE"].fillna("Long").str.lower() == "long")]
            pct = pd.to_numeric(ec["PERCENTAGE"], errors="coerce")
            eq_stats.append(pd.DataFrame({"ACCESSION_NUMBER": ec["ACCESSION_NUMBER"], "pct": pct})
                            .groupby("ACCESSION_NUMBER").agg(eq_pct=("pct", "sum"), n_eq=("pct", "size")))
            ec = ec[ec["ACCESSION_NUMBER"].isin(active_acc) & (ec["UNIT"].fillna("NS") == "NS")]
            cusip = ec["ISSUER_CUSIP"].str.strip().str.upper()
            ok = cusip.str.fullmatch(r"[0-9A-Z]{9}", na=False) & (cusip != "000000000")
            ec = ec[ok]
            keep.append(pd.DataFrame({
                "ACCESSION_NUMBER": ec["ACCESSION_NUMBER"].values,
                "CUSIP": cusip[ok].values,
                "shares": pd.to_numeric(ec["BALANCE"], errors="coerce").values,
                "value_usd": pd.to_numeric(ec["CURRENCY_VALUE"], errors="coerce").values,
                "pct": pd.to_numeric(ec["PERCENTAGE"], errors="coerce").values,
            }))
            hid_to_cusip.append(pd.DataFrame({"HOLDING_ID": ec["HOLDING_ID"].str.strip().values,
                                              "CUSIP": cusip[ok].values}))

        stats = pd.concat(eq_stats).groupby(level=0).sum()
        funds = funds.merge(stats, left_on="ACCESSION_NUMBER", right_index=True, how="left")
        funds[["eq_pct", "n_eq"]] = funds[["eq_pct", "n_eq"]].fillna(0)

        # HOLDING_ID is joined as a string key so no float/int coercion can drop matches
        hid = pd.concat(hid_to_cusip, ignore_index=True).drop_duplicates("HOLDING_ID")
        tick_parts = []
        for ch in _read(zf, "IDENTIFIERS", {"HOLDING_ID", "IDENTIFIER_TICKER"}, chunksize=2_000_000):
            ch = ch.dropna(subset=["IDENTIFIER_TICKER"])
            ch = pd.DataFrame({"HOLDING_ID": ch["HOLDING_ID"].str.strip(),
                               "ticker": ch["IDENTIFIER_TICKER"].str.strip().str.upper()})
            part = ch.merge(hid, on="HOLDING_ID", how="inner")
            if len(part):
                tick_parts.append(part[["CUSIP", "ticker"]])
    holdings = pd.concat(keep, ignore_index=True)
    min_eq = cfg["indicators"]["sponsor_quality"]["min_equity_pct"]
    min_n = cfg["indicators"]["sponsor_quality"]["min_fund_holdings"]
    eq_funds = funds[(funds["eq_pct"] >= min_eq) & (funds["n_eq"] >= min_n)]
    holdings = holdings.merge(eq_funds[["ACCESSION_NUMBER", "SERIES_ID", "REPORT_DATE", "FILING_DATE"]],
                              on="ACCESSION_NUMBER", how="inner").drop(columns=["ACCESSION_NUMBER"])
    holdings = holdings.groupby(["SERIES_ID", "REPORT_DATE", "FILING_DATE", "CUSIP"], as_index=False).agg(
        shares=("shares", "sum"), value_usd=("value_usd", "sum"), pct=("pct", "sum"))
    eq_series = set(funds.loc[funds["eq_pct"] >= min_eq, "SERIES_ID"])
    returns = returns[returns["SERIES_ID"].isin(eq_series)]
    tickers = (pd.concat(tick_parts, ignore_index=True) if tick_parts else pd.DataFrame(columns=["CUSIP", "ticker"]))
    tickers = tickers[tickers["ticker"].str.fullmatch(r"[A-Z][A-Z0-9.\-/]{0,9}", na=False)]
    tickers = tickers.groupby(["CUSIP", "ticker"]).size().rename("n").reset_index()
    funds_out = funds[["SERIES_ID", "SERIES_NAME", "NET_ASSETS", "REPORT_DATE", "FILING_DATE", "is_index", "eq_pct", "n_eq"]]
    return {"funds": funds_out, "returns": returns, "holdings": holdings, "tickers": tickers}


def save_intermediates(hist_dir, dataset_name, parts):
    os.makedirs(hist_dir, exist_ok=True)
    stem = dataset_name.replace(".zip", "")
    for k, df in parts.items():
        df.to_parquet(os.path.join(hist_dir, f"{stem}.{k}.parquet"), index=False)


def available_datasets(hist_dir):
    if not os.path.isdir(hist_dir):
        return []
    return sorted({f.split(".")[0] for f in os.listdir(hist_dir) if f.endswith(".holdings.parquet")})


def load_part(hist_dir, datasets, part):
    frames = []
    for ds in datasets:
        p = os.path.join(hist_dir, f"{ds}.{part}.parquet")
        if os.path.exists(p):
            frames.append(pd.read_parquet(p))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def holdings_for_label(holdings, label, as_of=None):
    """Snapshot of every equity fund's latest report in the quarter ending `label`.
    If `as_of` is given, only filings available by then (report + 60 days and filed) count."""
    label = pd.Timestamp(label)
    lo = label - pd.offsets.QuarterEnd(1)
    h = holdings[(holdings["REPORT_DATE"] > lo) & (holdings["REPORT_DATE"] <= label)]
    if as_of is not None:
        as_of = pd.Timestamp(as_of)
        h = h[(h["FILING_DATE"] <= as_of) & (h["REPORT_DATE"] + pd.Timedelta(days=AVAILABLE_LAG_DAYS) <= as_of)]
    if h.empty:
        return h
    latest = h.groupby("SERIES_ID").agg(REPORT_DATE=("REPORT_DATE", "max"))
    h = h.merge(latest.reset_index(), on=["SERIES_ID", "REPORT_DATE"], how="inner")
    last_filing = h.groupby("SERIES_ID")["FILING_DATE"].transform("max")
    return h[h["FILING_DATE"] == last_filing]


def combine_returns(returns, as_of=None):
    r = returns
    if as_of is not None:
        as_of = pd.Timestamp(as_of)
        r = r[r["FILING_DATE"] <= as_of]
    r = r.sort_values("FILING_DATE").drop_duplicates(["SERIES_ID", "month"], keep="last")
    return r.pivot(index="month", columns="SERIES_ID", values="ret").sort_index()


def latest_fund_info(funds, as_of=None):
    f = funds if as_of is None else funds[funds["FILING_DATE"] <= pd.Timestamp(as_of)]
    return f.sort_values(["REPORT_DATE", "FILING_DATE"]).drop_duplicates("SERIES_ID", keep="last").set_index("SERIES_ID")


def cusip_ticker_map(tickers):
    """Most frequently reported ticker per CUSIP."""
    if tickers.empty:
        return {}
    t = tickers.groupby(["CUSIP", "ticker"])["n"].sum().reset_index()
    t = t.sort_values(["CUSIP", "n"], ascending=[True, False]).drop_duplicates("CUSIP")
    return dict(zip(t["CUSIP"], t["ticker"].str.replace(".", "-", regex=False).str.replace("/", "-", regex=False)))
