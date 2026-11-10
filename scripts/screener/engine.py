"""Scores every stock in the liquid universe as of one date.

Used by both the daily build (as_of = today) and the calibration (as_of = each past
quarter-end, fed only data that was available then).
"""
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import INDICATORS
from .indicators import (added_owners, group_strength, growth_fund, inst_trend, leader, not_crowded,
                         sponsor_quality)
from .indicators.common import na
from .indicators.rs import rs_rating, weighted_rs, window_returns


@dataclass
class Context:
    closes: pd.DataFrame                  # date x ticker (adjusted)
    opens: pd.DataFrame
    volumes: pd.DataFrame
    industries: pd.Series                 # ticker -> industry group
    sectors: pd.Series                    # ticker -> sector
    market_caps: pd.Series                # ticker -> USD (NaN if unknown)
    fundamentals: pd.DataFrame            # ticker -> eps_q_growth, eps_a_growth, rev_q_growth
    holders: pd.DataFrame                 # period x ticker (13F holder counts known at as_of)
    shares: pd.DataFrame
    values: pd.DataFrame
    n_filers: pd.Series
    sponsors: pd.DataFrame | None         # CUSIP -> sponsor metrics (None = no N-PORT snapshot)
    ticker_cusips: dict                   # ticker -> [CUSIP, ...]
    inst_pct: dict = field(default_factory=dict)   # ticker -> ownership % override (live: yfinance)


def liquid_universe(ctx, cfg, as_of):
    u = cfg["universe"]
    c = ctx.closes.loc[:as_of]
    v = ctx.volumes.loc[:as_of]
    recent = c.tail(60)
    alive = recent.notna().sum() >= 40
    price = c.ffill().iloc[-1]
    adv = (c * v).tail(50).mean()
    mc = ctx.market_caps.reindex(c.columns)
    ok = alive & (price >= u["min_price"]) & (adv >= u["min_avg_dollar_volume_50d"]) & (mc.isna() | (mc >= u["min_market_cap"]))
    return list(ok[ok].index), price, adv


def sponsor_row(ctx, ticker):
    if ctx.sponsors is None:
        return None
    rows = [ctx.sponsors.loc[c] for c in ctx.ticker_cusips.get(ticker, []) if c in ctx.sponsors.index]
    if not rows:
        return None
    return max(rows, key=lambda r: r["n_active_holders"])


def score_universe(ctx, cfg, as_of=None):
    as_of = pd.Timestamp(as_of) if as_of is not None else ctx.closes.index[-1]
    tickers, price, adv = liquid_universe(ctx, cfg, as_of)
    closes = ctx.closes.loc[:as_of, tickers]
    win = window_returns(closes, cfg)
    rs = weighted_rs(win, cfg)
    rating = rs_rating(rs)
    groups_tbl = group_strength.group_table(win, ctx.industries.reindex(tickers), cfg)

    stocks = pd.DataFrame(index=tickers)
    stocks["group"] = ctx.industries.reindex(tickers)
    stocks["rs_rating"] = rating
    f = ctx.fundamentals.reindex(tickers)
    for col in ("eps_q_growth", "eps_a_growth", "rev_q_growth"):
        stocks[col] = f[col] if col in f else np.nan
    ranked = leader.rank_within_groups(stocks, cfg)

    holders = ctx.holders.reindex(columns=tickers)
    shares = ctx.shares.reindex(columns=tickers)
    chg = added_owners.changes(holders, shares)
    added = added_owners.compute_all(chg, cfg)
    have_holdings = ctx.sponsors is not None
    lookback = cfg["indicators"]["inst_trend"]["lookback_quarters"]

    out = {}
    opens = ctx.opens.loc[:as_of]
    vols = ctx.volumes.loc[:as_of]
    for t in tickers:
        res = {}
        res["group_strength"] = group_strength.compute(stocks.at[t, "group"], groups_tbl, cfg)
        res["leader"], is_sym = leader.compute(t, ranked, closes, opens, vols, cfg)
        h = holders[t].dropna() if t in holders else pd.Series(dtype=float)
        res["inst_trend"] = inst_trend.compute(h.tail(lookback), ctx.n_filers, cfg) if len(h) else na("no 13F mapping for ticker")
        res["added_owners"] = added.get(t) or na("no 13F mapping for ticker")
        srow = sponsor_row(ctx, t)
        mapped = bool(ctx.ticker_cusips.get(t))
        res["sponsor_quality"] = sponsor_quality.compute(srow, cfg, have_holdings and mapped)
        res["growth_fund"] = growth_fund.compute(srow, cfg, have_holdings and mapped)
        ipct = ctx.inst_pct.get(t)
        if ipct is None and t in ctx.values and len(ctx.values[t].dropna()):
            mc = ctx.market_caps.get(t)
            if mc and mc > 0:
                ipct = float(ctx.values[t].dropna().iloc[-1]) / mc * 100
        res["not_crowded"] = not_crowded.compute(ipct, h if len(h) else None, cfg)
        out[t] = {
            "results": res, "sympathy": bool(is_sym), "price": float(price.get(t, np.nan)),
            "adv50": float(adv.get(t, np.nan)), "market_cap": ctx.market_caps.get(t),
            "sector": ctx.sectors.get(t), "group": stocks.at[t, "group"], "rs_rating": rating.get(t),
            "sponsor": srow,
        }
    return out, groups_tbl


def indicator_frame(scored):
    """ticker x indicator score frame (NaN for n/a), plus a sympathy column."""
    rows = {t: {k: d["results"][k].score for k in INDICATORS} | {"sympathy": d["sympathy"]} for t, d in scored.items()}
    return pd.DataFrame.from_dict(rows, orient="index").astype({k: float for k in INDICATORS})
