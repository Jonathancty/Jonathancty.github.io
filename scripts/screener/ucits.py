"""US ETF -> UK-retail-buyable UCITS equivalent.

US-domiciled ETFs generally can't be bought by UK retail investors (no UK KID under PRIIPs).
Each mapping below was checked against issuer pages / exchange listings on 2026-11-10.
"match": exact = same index; close = same theme, different index; none = no UCITS equivalent.
Re-verify before trading: share classes and LSE lines change.
"""

VERIFIED_ON = "2026-11-10"

UCITS_MAP = {
    "QQQ": {"match": "exact", "ucits": [
        {"name": "Invesco EQQQ Nasdaq-100 UCITS ETF (Dist)", "isin": "IE0032077012", "lse": "EQQQ"},
        {"name": "iShares Nasdaq 100 UCITS ETF (Acc)", "isin": "IE00B53SZB19", "lse": "CNDX"}]},
    "SMH": {"match": "exact", "ucits": [
        {"name": "VanEck Semiconductor UCITS ETF", "isin": "IE00BMC38736", "lse": "SMH (USD) / SMGB (GBP)"}]},
    "XLK": {"match": "close", "ucits": [
        {"name": "iShares S&P 500 Information Technology Sector UCITS ETF (Acc)", "isin": "IE00B3WJKG14",
         "lse": "IUIT (USD) / IITU (GBP)"}]},
    "XLC": {"match": "exact", "ucits": [
        {"name": "Invesco Communications S&P US Select Sector UCITS ETF (Acc)", "isin": "IE00BG7PP820", "lse": "XLCS"}]},
    "VOO": {"match": "exact", "ucits": [
        {"name": "Vanguard S&P 500 UCITS ETF (Acc)", "isin": "IE00BFMXXD54", "lse": "VUAG"},
        {"name": "iShares Core S&P 500 UCITS ETF (Acc)", "isin": "IE00B5BMR087", "lse": "CSPX"}]},
    "CIBR": {"match": "close", "ucits": [
        {"name": "L&G Cyber Security UCITS ETF", "isin": "IE00BYPLS672", "lse": "ISPY (GBP) / USPY (USD)"}]},
    "WCLD": {"match": "exact", "ucits": [
        {"name": "WisdomTree Cloud Computing UCITS ETF (Acc)", "isin": "IE00BJGWQN72", "lse": "KLWD"}]},
    "BOTZ": {"match": "close", "ucits": [
        {"name": "iShares Automation & Robotics UCITS ETF (Acc)", "isin": "IE00BYZK4552", "lse": "RBOT"}]},
    "IGV": {"match": "none", "ucits": [], "closest": "WCLD -> KLWD (cloud software, equal-weighted)"},
    "FDN": {"match": "none", "ucits": [], "closest": "XLC -> XLCS or QQQ -> EQQQ/CNDX"},
}
UCITS_MAP["SPY"] = UCITS_MAP["IVV"] = UCITS_MAP["VOO"]
UCITS_MAP["SOXX"] = UCITS_MAP["SMH"]

# Yahoo industry group -> the US ETF that best represents it
GROUP_ETF = {
    "Semiconductors": "SMH",
    "Semiconductor Equipment & Materials": "SMH",
    "Software - Application": "IGV",
    "Software - Infrastructure": "IGV",
    "Information Technology Services": "XLK",
    "Computer Hardware": "XLK",
    "Communication Equipment": "XLK",
    "Electronic Components": "XLK",
    "Scientific & Technical Instruments": "XLK",
    "Electronics & Computer Distribution": "XLK",
    "Consumer Electronics": "XLK",
    "Internet Content & Information": "XLC",
    "Telecom Services": "XLC",
    "Entertainment": "XLC",
    "Advertising Agencies": "XLC",
    "Electronic Gaming & Multimedia": "XLC",
    "Publishing": "XLC",
    "Broadcasting": "XLC",
}


def etf_route(us_etf):
    m = UCITS_MAP.get(us_etf)
    if m is None:
        return {"us_etf": us_etf, "uk_buyable": False, "note": "no UCITS mapping on file: not UK-retail buyable"}
    if m["match"] == "none":
        return {"us_etf": us_etf, "uk_buyable": False, "note": "not UK-retail buyable", "closest": m.get("closest")}
    return {"us_etf": us_etf, "uk_buyable": True, "match": m["match"], "ucits": m["ucits"]}


def group_etf_signals(groups_tbl, cfg):
    """For strong groups (top 20%) that map to an ETF, the UK-buyable route."""
    thr = cfg["indicators"]["group_strength"]["pass_percentile"]
    out = []
    for group, row in groups_tbl.iterrows():
        if row["percentile"] >= thr and group in GROUP_ETF:
            out.append({"group": group, "rank": int(row["rank"]), "of": int(row["n_groups"]),
                        **etf_route(GROUP_ETF[group])})
    return out
