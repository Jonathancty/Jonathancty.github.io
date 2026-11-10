"""Turns CUSIP-level 13F counts into per-ticker panels."""
import pandas as pd


def ticker_panels(counts, cmap, tickers=None):
    """counts: long 13F counts (period, CUSIP, n_holders, shares, value_usd, n_filers).
    Returns (holders_wide, shares_wide, value_wide, n_filers Series), period x ticker."""
    c = counts.copy()
    c["ticker"] = c["CUSIP"].map(cmap)
    c = c.dropna(subset=["ticker"])
    if tickers is not None:
        c = c[c["ticker"].isin(set(tickers))]
    # A ticker can have >1 CUSIP (after a CUSIP change). Within one period, take the most-held
    # line for holder counts (avoids double counting) and sum shares/value.
    holders = c.pivot_table(index="period", columns="ticker", values="n_holders", aggfunc="max")
    shares = c.pivot_table(index="period", columns="ticker", values="shares", aggfunc="sum")
    value = c.pivot_table(index="period", columns="ticker", values="value_usd", aggfunc="sum")
    n_filers = counts.groupby("period")["n_filers"].first().sort_index()
    return holders.sort_index(), shares.sort_index(), value.sort_index(), n_filers
