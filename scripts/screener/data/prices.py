"""Daily prices from yfinance (split/dividend adjusted), downloaded in batches."""
import time

import pandas as pd
import yfinance as yf


def download(tickers, start=None, period=None, batch=150, pause=1.0, retries=2):
    """Returns dict with wide DataFrames 'Open', 'Close', 'Volume' (date x ticker)."""
    tickers = list(dict.fromkeys(tickers))
    parts = {"Open": [], "Close": [], "Volume": []}
    for i in range(0, len(tickers), batch):
        chunk = tickers[i:i + batch]
        for attempt in range(retries + 1):
            try:
                df = yf.download(chunk, start=start, period=None if start else (period or "2y"),
                                 auto_adjust=True, progress=False, threads=True, group_by="column")
                break
            except Exception as e:  # network hiccups / rate limits
                print(f"  price batch {i} failed ({e}); retrying")
                time.sleep(10 * (attempt + 1))
                df = None
        if df is None or df.empty:
            continue
        if not isinstance(df.columns, pd.MultiIndex):     # single ticker
            df.columns = pd.MultiIndex.from_product([df.columns, chunk])
        for k in parts:
            if k in df.columns.get_level_values(0):
                parts[k].append(df[k])
        time.sleep(pause)
    out = {}
    for k, frames in parts.items():
        wide = pd.concat(frames, axis=1) if frames else pd.DataFrame()
        wide = wide.loc[:, ~wide.columns.duplicated()]
        wide.index = pd.to_datetime(wide.index).tz_localize(None)
        out[k] = wide.sort_index().dropna(how="all", axis=1)
    return out


def drop_incomplete_today(prices):
    """yfinance returns a partial bar for today during US market hours; the daily job runs
    after the close, but guard against manual runs mid-session."""
    now = pd.Timestamp.now(tz="America/New_York")
    last = prices["Close"].index.max()
    if last is not None and last.date() == now.date() and now.hour < 16:
        return {k: v.iloc[:-1] for k, v in prices.items()}
    return prices
