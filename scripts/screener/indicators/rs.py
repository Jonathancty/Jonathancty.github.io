"""Relative strength helpers (IBD-style: 40% last 3 months, 20% each for 6/9/12 months)."""
import numpy as np
import pandas as pd


def window_returns(close, cfg, as_of=None):
    """DataFrame ticker x window ('r63', 'r126', ...) of simple returns ending at as_of."""
    c = close.loc[:as_of] if as_of is not None else close
    c = c.ffill()
    last = c.iloc[-1]
    out = {}
    for d in cfg["relative_strength"]["windows_days"]:
        base = c.iloc[-1 - d] if len(c) > d else pd.Series(np.nan, index=c.columns)
        out[f"r{d}"] = last / base - 1.0
    return pd.DataFrame(out)


def weighted_rs(win_ret, cfg):
    """Weighted performance; requires the 3-month window, rescales over available longer windows
    (so recent IPOs still get a value)."""
    rcfg = cfg["relative_strength"]
    cols = [f"r{d}" for d in rcfg["windows_days"]]
    w = pd.Series(rcfg["weights"], index=cols)
    vals = win_ret[cols]
    avail = vals.notna()
    num = (vals.fillna(0) * w).sum(axis=1)
    den = (avail * w).sum(axis=1)
    rs = num / den.replace(0, np.nan)
    rs[vals[cols[0]].isna()] = np.nan
    return rs


def rs_rating(rs):
    """1-99 percentile rating across the universe."""
    n = rs.notna().sum()
    if n <= 1:
        return rs.where(rs.isna(), 99.0)
    return (1 + 98 * (rs.rank() - 1) / (n - 1)).round(0)
