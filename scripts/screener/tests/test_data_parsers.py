"""SEC 13F / N-PORT parsing, fundamentals, universe and UCITS map on fixture rows."""
import io
import os
import zipfile

import numpy as np
import pandas as pd

from scripts.screener.data import fundamentals, holdings_13f, holdings_nport, universe
from scripts.screener.data.sec import parse_13f_zip_name, parse_nport_zip_name
from scripts.screener.ucits import UCITS_MAP, etf_route


def test_zip_name_parsing():
    s, e = parse_13f_zip_name("2023q4_form13f.zip")
    assert (s.month, e.year, e.month) == (10, 2024, 1)
    s, e = parse_13f_zip_name("01jun2026-31aug2026_form13f.zip")
    assert s == pd.Timestamp("2026-06-01") and e == pd.Timestamp("2026-09-01")
    assert parse_nport_zip_name("2026q3_nport.zip") == (2026, 3)


def test_expected_sec_file_names_match_published_ones():
    from datetime import datetime
    from scripts.screener.data import sec
    names = sec.candidate_13f_names(datetime(2026, 11, 10))
    # names as listed on SEC's page (checked 2026-11-10)
    for real in ("2013q2_form13f.zip", "2023q4_form13f.zip", "01jan2024-29feb2024_form13f.zip",
                 "01dec2025-28feb2026_form13f.zip", "01mar2026-31may2026_form13f.zip", "01jun2026-31aug2026_form13f.zip"):
        assert real in names
    assert names[-1] == "01jun2026-31aug2026_form13f.zip"      # Sep-Nov 2026 window hasn't ended yet
    assert all(sec.parse_13f_zip_name(n) for n in names)
    np_names = sec.candidate_nport_names(datetime(2026, 11, 10))
    assert np_names[0] == "2019q4_nport.zip" and np_names[-1] == "2026q3_nport.zip"


def test_discovery_falls_back_to_probing(tmp_path, cfg):
    import requests
    from scripts.screener.data import sec

    class FakeClient:
        def __init__(self):
            self.probed = []

        def get(self, url, **kw):
            raise requests.HTTPError("404 Client Error: Not Found")

        def exists(self, url):
            self.probed.append(url)
            return "datastandardsinnovation" in url and "01jun2026" in url or \
                   ("structureddata" in url and "01mar2026" in url)

    c = FakeClient()
    cache = str(tmp_path / "found.json")
    rows = sec.list_13f_datasets(c, cfg, recent=3, cache_file=cache)
    assert [r["name"] for r in rows] == ["01mar2026-31may2026_form13f.zip", "01jun2026-31aug2026_form13f.zip"]
    assert rows[-1]["url"].startswith("https://www.sec.gov/files/datastandardsinnovation/")
    n_first = len(c.probed)
    sec.list_13f_datasets(c, cfg, recent=3, cache_file=cache)
    assert len(c.probed) - n_first == 2       # found files are cached; only the missing one is re-probed (2 dirs)


def _write_13f_zip(path):
    sub = ("ACCESSION_NUMBER\tFILING_DATE\tSUBMISSIONTYPE\tCIK\tPERIODOFREPORT\n"
           "A1\t10-AUG-2026\t13F-HR\t1\t30-JUN-2026\n"
           "A2\t12-AUG-2026\t13F-HR/A\t1\t30-JUN-2026\n"     # restatement replaces A1
           "A3\t10-AUG-2026\t13F-HR\t2\t30-JUN-2026\n"
           "A4\t14-AUG-2026\t13F-HR/A\t2\t30-JUN-2026\n"     # new-holdings amendment adds to A3
           "A7\t05-SEP-2026\t13F-HR/A\t2\t30-JUN-2026\n"     # amendment after the 45-day window: ignored
           "A5\t01-NOV-2026\t13F-HR\t3\t30-JUN-2026\n"       # late filing: excluded (not point-in-time)
           "A6\t05-AUG-2026\t13F-NT\t4\t30-JUN-2026\n")
    cover = ("ACCESSION_NUMBER\tAMENDMENTTYPE\nA1\t\nA2\tRESTATEMENT\nA3\t\nA4\tNEW HOLDINGS\nA5\t\nA6\t\nA7\tNEW HOLDINGS\n")
    info = ("ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tVALUE\tSSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL\n"
            "A1\t1\tNVIDIA\tCOM\t67066G104\t100\t999\tSH\t\n"
            "A2\t1\tNVIDIA\tCOM\t67066G104\t100\t10\tSH\t\n"
            "A2\t2\tNVIDIA\tCOM\t67066G104\t100\t50\tSH\tPut\n"   # options excluded
            "A3\t1\tNVIDIA\tCOM\t67066G104\t100\t20\tSH\t\n"
            "A4\t1\tAPPLE\tCOM\t037833100\t100\t5\tSH\t\n"
            "A5\t1\tNVIDIA\tCOM\t67066G104\t100\t7\tSH\t\n"
            "A7\t1\tMICROSOFT\tCOM\t594918104\t100\t3\tSH\t\n"
            "A3\t2\tBOND CO\tNOTE\t123456AB1\t100\t1000\tPRN\t\n")
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("SUBMISSION.tsv", sub)
        z.writestr("COVERPAGE.tsv", cover)
        z.writestr("INFOTABLE.tsv", info)


def test_13f_point_in_time_aggregation(tmp_path):
    p = tmp_path / "x_form13f.zip"
    _write_13f_zip(p)
    agg, n_filers = holdings_13f.process_zip(str(p))
    agg = agg.set_index("CUSIP")
    nv = agg.loc["67066G104"]
    assert nv["n_holders"] == 2                  # CIK 1 (restated) + CIK 2; late CIK 3 excluded
    assert nv["shares"] == 30                    # 10 (A2, put excluded) + 20 (A3)
    assert agg.loc["037833100", "n_holders"] == 1
    assert "123456AB1" not in agg.index          # principal amounts (bonds) excluded
    assert "594918104" not in agg.index          # late amendment excluded
    assert n_filers == {"2026-06-30": 2}


def test_13f_cache_roundtrip(tmp_path):
    p = tmp_path / "x_form13f.zip"
    _write_13f_zip(p)
    agg, n_filers = holdings_13f.process_zip(str(p))
    holdings_13f.save_periods(str(tmp_path / "c"), agg, n_filers, "x_form13f.zip", min_filers=1)
    counts = holdings_13f.load_counts(str(tmp_path / "c"))
    assert set(counts["CUSIP"]) == {"67066G104", "037833100"}
    assert (counts["n_filers"] == 2).all()


def test_nport_monthly_return_mapping():
    mtr = pd.DataFrame({"ACCESSION_NUMBER": ["N1", "N1"], "CLASS_ID": ["C1", "C2"],
                        "MONTHLY_TOTAL_RETURN1": ["1.0", "1.2"], "MONTHLY_TOTAL_RETURN2": ["-2.0", "-2.0"],
                        "MONTHLY_TOTAL_RETURN3": ["3.0", "3.0"]})
    sub = pd.DataFrame({"ACCESSION_NUMBER": ["N1"], "SERIES_ID": ["S1"],
                        "REPORT_DATE": [pd.Timestamp("2026-06-30")], "FILING_DATE": [pd.Timestamp("2026-08-25")]})
    long = holdings_nport.monthly_returns_long(mtr, sub).set_index("month")["ret"]
    assert np.isclose(long[pd.Timestamp("2026-04-30")], 0.011)      # median of classes, % -> decimal
    assert np.isclose(long[pd.Timestamp("2026-05-31")], -0.02)
    assert np.isclose(long[pd.Timestamp("2026-06-30")], 0.03)


def test_nport_label_snapshot_point_in_time():
    h = pd.DataFrame({
        "SERIES_ID": ["S1", "S1", "S2", "S3"],
        "REPORT_DATE": pd.to_datetime(["2026-04-30", "2026-06-30", "2026-06-30", "2026-03-31"]),
        "FILING_DATE": pd.to_datetime(["2026-06-20", "2026-08-25", "2026-08-28", "2026-05-20"]),
        "CUSIP": ["X", "X", "Y", "Z"], "shares": [1, 2, 3, 4], "value_usd": 1.0, "pct": 1.0})
    snap = holdings_nport.holdings_for_label(h, "2026-06-30")
    assert set(zip(snap["SERIES_ID"], snap["shares"])) == {("S1", 2), ("S2", 3)}
    early = holdings_nport.holdings_for_label(h, "2026-06-30", as_of="2026-07-15")
    assert set(early["SERIES_ID"]) == {"S1"} and early["shares"].iloc[0] == 1   # June reports not public yet


def test_nport_zip_end_to_end(tmp_path, cfg):
    cfg["indicators"]["sponsor_quality"]["min_fund_holdings"] = 2
    sub = ("ACCESSION_NUMBER\tFILING_DATE\tFILE_NUM\tSUB_TYPE\tREPORT_ENDING_PERIOD\tREPORT_DATE\tIS_LAST_FILING\n"
           "0001-26-000001\t25-AUG-2026\t811-1\tNPORT-P\t31-DEC-2026\t30-JUN-2026\tN\n"
           "0001-26-000002\t26-AUG-2026\t811-2\tNPORT-P\t31-DEC-2026\t30-JUN-2026\tN\n"
           "0001-26-000003\t27-AUG-2026\t811-3\tNPORT-P\t31-DEC-2026\t30-JUN-2026\tN\n")
    info = ("ACCESSION_NUMBER\tSERIES_NAME\tSERIES_ID\tSERIES_LEI\tTOTAL_ASSETS\tNET_ASSETS\n"
            "0001-26-000001\tAcme Growth Fund\tS000000001\t\t1000\t1000\n"
            "0001-26-000002\tAcme 500 Index Fund\tS000000002\t\t1000\t1000\n"
            "0001-26-000003\tAcme Bond Fund\tS000000003\t\t1000\t1000\n")
    mtr = ("ACCESSION_NUMBER\tMONTHLY_TOTAL_RETURN_ID\tCLASS_ID\tMONTHLY_TOTAL_RETURN1\tMONTHLY_TOTAL_RETURN2\tMONTHLY_TOTAL_RETURN3\n"
           "0001-26-000001\t1\tC1\t1.5\t-0.5\t2.0\n"
           "0001-26-000003\t2\tC3\t0.1\t0.1\t0.1\n")
    hold = ("ACCESSION_NUMBER\tHOLDING_ID\tISSUER_NAME\tISSUER_CUSIP\tBALANCE\tUNIT\tCURRENCY_VALUE\tPERCENTAGE\tPAYOFF_PROFILE\tASSET_CAT\n"
            "0001-26-000001\t11\tNVIDIA\t67066G104\t100\tNS\t5000\t50.0\tLong\tEC\n"
            "0001-26-000001\t12\tAPPLE\t037833100\t50\tNS\t4500\t45.0\tLong\tEC\n"
            "0001-26-000001\t13\tTSY\t912828XX1\t100\tPA\t500\t5.0\tLong\tDBT\n"
            "0001-26-000002\t21\tNVIDIA\t67066G104\t999\tNS\t5000\t50.0\tLong\tEC\n"
            "0001-26-000002\t22\tAPPLE\t037833100\t999\tNS\t5000\t50.0\tLong\tEC\n"
            "0001-26-000003\t31\tTSY\t912828XX1\t100\tPA\t1000\t100.0\tLong\tDBT\n")
    ids = ("HOLDING_ID\tIDENTIFIERS_ID\tIDENTIFIER_ISIN\tIDENTIFIER_TICKER\n"
           "11\t1\tUS67066G1040\tNVDA\n12\t2\tUS0378331005\tAAPL\n21\t3\t\tNVDA\n")
    p = tmp_path / "2026q3_nport.zip"
    with zipfile.ZipFile(p, "w") as z:
        for name, body in (("SUBMISSION", sub), ("FUND_REPORTED_INFO", info), ("MONTHLY_TOTAL_RETURN", mtr),
                           ("FUND_REPORTED_HOLDING", hold), ("IDENTIFIERS", ids)):
            z.writestr(f"{name}.tsv", body)
    parts = holdings_nport.process_zip(str(p), cfg)
    f = parts["funds"].set_index("SERIES_ID")
    assert f.loc["S000000002", "is_index"] and not f.loc["S000000001", "is_index"]
    assert np.isclose(f.loc["S000000001", "eq_pct"], 95.0) and f.loc["S000000003", "eq_pct"] == 0
    h = parts["holdings"]
    assert set(h["SERIES_ID"]) == {"S000000001"}                 # index fund and bond fund dropped
    assert set(h["CUSIP"]) == {"67066G104", "037833100"}
    assert set(parts["returns"]["SERIES_ID"]) == {"S000000001"}  # bond fund returns dropped
    m = holdings_nport.cusip_ticker_map(parts["tickers"])
    assert m == {"67066G104": "NVDA", "037833100": "AAPL"}


def test_cusip_ticker_map_majority():
    t = pd.DataFrame({"CUSIP": ["C1", "C1", "C2"], "ticker": ["BRK.B", "BRKB", "NVDA"], "n": [10, 2, 5]})
    m = holdings_nport.cusip_ticker_map(t)
    assert m == {"C1": "BRK-B", "C2": "NVDA"}


def test_index_fund_detection(cfg):
    rx = cfg["funds"]["index_name_regex"]
    assert holdings_nport.is_index_fund("Vanguard 500 Index Fund", rx)
    assert holdings_nport.is_index_fund("iShares Core S&P 500 ETF", rx)
    assert not holdings_nport.is_index_fund("Fidelity Blue Chip Growth Fund", rx)


def test_eps_growth_rules():
    assert np.isclose(fundamentals.growth(1.5, 1.0), 0.5)
    assert fundamentals.growth(0.5, -0.2) == 1.0           # turnaround
    assert np.isclose(fundamentals.growth(-0.1, -0.2), 0.5)   # narrowing loss
    assert np.isnan(fundamentals.growth(None, 1.0))


def test_fundamentals_table_and_derived_q4(tmp_path):
    d = tmp_path
    def w(tag, label, rows):
        pd.DataFrame(rows, columns=["cik", "end", "val"]).to_csv(d / f"{tag}_{label}.csv.gz", index=False, compression="gzip")
    for y, base in ((2024, 1.0), (2025, 2.0)):
        for q in (1, 2, 3):
            w("EarningsPerShareDiluted", f"CY{y}Q{q}", [(1, f"{y}-{3*q:02d}-28", base)])
            w("Revenues", f"CY{y}Q{q}", [(1, f"{y}-{3*q:02d}-28", 100 * base)])
        w("EarningsPerShareDiluted", f"CY{y}", [(1, f"{y}-12-31", 5 * base)])    # Q4 = 5 - 3 = 2 x base
        w("Revenues", f"CY{y}", [(1, f"{y}-12-31", 500 * base)])
    labels = fundamentals.period_labels(2024, pd.Timestamp("2026-06-30"))
    t = fundamentals.build_table(str(d), labels)
    q4 = t[(t["label"] == "CY2025Q4")].iloc[0]
    assert q4["derived"] and np.isclose(q4["eps"], 4.0)
    g = fundamentals.growth_as_of(t, "2026-04-15").loc[1]
    assert g["latest_q"] == "2025Q4" and np.isclose(g["eps_q_growth"], 1.0) and np.isclose(g["eps_a_growth"], 1.0)
    early = fundamentals.growth_as_of(t, "2026-01-10").loc[1]
    assert early["latest_q"] == "2025Q3"                     # Q4 not available yet (point-in-time)


def test_universe_filters(cfg):
    nas = pd.DataFrame({"Symbol": ["NVDA", "QQQ", "ABCDW", "TSM2", "ZZZT"],
                        "Security Name": ["NVIDIA Corporation - Common Stock", "Invesco QQQ", "ABC Corp - Warrant",
                                          "Taiwan Semi - American Depositary Shares", "Test Co"],
                        "Market Category": "Q", "Test Issue": ["N", "N", "N", "N", "Y"],
                        "Financial Status": "N", "ETF": ["N", "Y", "N", "N", "N"]})
    oth = pd.DataFrame({"ACT Symbol": ["BRK.B", "PFX", "ARCA1"], "Security Name": ["Berkshire Class B", "Foo 5% Preferred", "Arca Co"],
                        "Exchange": ["N", "N", "P"], "ETF": "N", "Test Issue": "N"})
    u = universe.parse_listings(nas, oth, cfg)
    assert list(u["symbol"]) == ["NVDA", "TSM2", "BRK-B"]
    assert u.set_index("symbol").loc["TSM2", "is_adr"]


def test_ucits_routes():
    assert etf_route("QQQ")["uk_buyable"] and etf_route("QQQ")["ucits"][0]["isin"].startswith("IE")
    assert not etf_route("IGV")["uk_buyable"]
    assert not etf_route("ARKK")["uk_buyable"]
    for m in UCITS_MAP.values():
        for u in m["ucits"]:
            assert u["isin"][:2] in ("IE", "LU") and len(u["isin"]) == 12
