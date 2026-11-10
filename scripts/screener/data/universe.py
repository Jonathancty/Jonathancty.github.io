"""Listed-symbol universe from the free NASDAQ Trader symbol directory.

nasdaqlisted.txt covers NASDAQ; otherlisted.txt covers NYSE (Exchange == 'N'),
NYSE American, NYSE Arca, Cboe and IEX. OTC / pink sheets are not in either file.
"""
import io
import re

import pandas as pd
import requests

NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
HEADERS = {"User-Agent": "Mozilla/5.0 (personal research screener)"}

NON_COMMON = re.compile(
    r"warrant|\bwts?\b|\brights?\b|\bunits?\b|preferred|\bpfd\b|\bnotes?\b|debenture|subordinated|%|"
    r"\bfund\b|\btrust units\b|depositary shares, each representing|contingent value|\bcvr\b|\betn\b|"
    r"exchange[- ]traded|acquisition corp",
    re.IGNORECASE,
)
ADR = re.compile(r"american depositary|\bads\b|\badr\b", re.IGNORECASE)


def _fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    text = "\n".join(l for l in r.text.splitlines() if not l.startswith("File Creation Time"))
    return pd.read_csv(io.StringIO(text), sep="|", dtype=str)


def parse_listings(nasdaq, other, cfg):
    """Pure function over the two raw files -> DataFrame(symbol, name, exchange, is_adr)."""
    rows = []
    want = set(cfg["universe"]["exchanges"])
    if "NASDAQ" in want:
        n = nasdaq[(nasdaq["Test Issue"] == "N") & (nasdaq["ETF"] == "N") & (nasdaq["Financial Status"].fillna("N") != "Q")]
        rows.append(pd.DataFrame({"symbol": n["Symbol"], "name": n["Security Name"], "exchange": "NASDAQ"}))
    if "NYSE" in want:
        o = other[(other["Test Issue"] == "N") & (other["ETF"] == "N") & (other["Exchange"] == "N")]
        rows.append(pd.DataFrame({"symbol": o["ACT Symbol"], "name": o["Security Name"], "exchange": "NYSE"}))
    df = pd.concat(rows, ignore_index=True).dropna(subset=["symbol", "name"])
    df = df[~df["symbol"].str.contains(r"[\$\^=]", regex=True)]
    df["symbol"] = df["symbol"].str.strip().str.replace(".", "-", regex=False)
    df = df[~df["name"].str.contains(NON_COMMON)]
    df["is_adr"] = df["name"].str.contains(ADR)
    if not cfg["universe"]["include_adrs"]:
        df = df[~df["is_adr"]]
    return df.drop_duplicates("symbol").reset_index(drop=True)


def listed_common_stocks(cfg):
    return parse_listings(_fetch(NASDAQ_URL), _fetch(OTHER_URL), cfg)


def liquidity_filter(close, volume, info, cfg, as_of=None):
    """Apply the price / 50-day dollar-volume / market-cap floors.

    close, volume: wide daily frames (date x ticker). info: dict ticker -> yfinance info subset
    (may be missing for some names: market cap then counts as unknown and the name passes only
    on price + volume, flagged in the output). Returns DataFrame indexed by ticker.
    """
    u = cfg["universe"]
    c = close.loc[:as_of] if as_of is not None else close
    v = volume.loc[:as_of] if as_of is not None else volume
    last = c.ffill().iloc[-1]
    adv = (c * v).tail(50).mean()
    out = pd.DataFrame({"price": last, "adv50": adv})
    out["market_cap"] = [((info or {}).get(t) or {}).get("marketCap") for t in out.index]
    ok = (out["price"] >= u["min_price"]) & (out["adv50"] >= u["min_avg_dollar_volume_50d"])
    mc = pd.to_numeric(out["market_cap"], errors="coerce")
    ok &= mc.isna() | (mc >= u["min_market_cap"])
    out["market_cap_known"] = mc.notna()
    return out[ok]
