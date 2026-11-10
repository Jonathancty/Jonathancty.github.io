"""Market regime (bull / under pressure / correction) from the S&P 500 and NASDAQ Composite.

Bull ("confirmed uptrend") = both indices above a rising 200-day moving average and fewer
than `pressure_distribution_days` distribution days in the last 25 sessions.
A distribution day = index closes down >= 0.2% on higher volume than the prior session.
"""
import pandas as pd

CONFIRMED, PRESSURE, CORRECTION = "Confirmed uptrend", "Uptrend under pressure", "Correction"


def index_state(close, volume, cfg):
    r = cfg["regime"]
    close = close.dropna()
    volume = volume.reindex(close.index)
    ma = close.rolling(r["ma_days"]).mean()
    rising = ma.iloc[-1] > ma.iloc[-1 - r["ma_rising_lookback"]]
    above = close.iloc[-1] > ma.iloc[-1]
    chg = close.pct_change() * 100
    dist = (chg <= -r["distribution_min_drop_pct"]) & (volume > volume.shift(1)) & (volume > 0)
    window = dist.tail(r["distribution_window"])
    # IBD convention: a distribution day expires once the index closes >= 5% above that day's close
    expiry = r.get("distribution_expiry_rally_pct", 5.0)
    n_dist = 0
    for d in window[window].index:
        later_max = close.loc[d:].iloc[1:].max() if len(close.loc[d:]) > 1 else close.loc[d]
        if later_max < close.loc[d] * (1 + expiry / 100):
            n_dist += 1
    ma_short = close.rolling(r.get("short_ma_days", 50)).mean()
    return {"close": float(close.iloc[-1]), "ma200": float(ma.iloc[-1]), "above_ma": bool(above),
            "ma_rising": bool(rising), "distribution_days": n_dist,
            "above_ma50": bool(close.iloc[-1] > ma_short.iloc[-1])}


def classify(states, cfg):
    """Correction = either index below a falling/broken 200-day MA, or heavy distribution while an
    index has also lost its 50-day MA. Heavy distribution alone = 'under pressure' (IBD convention)."""
    r = cfg["regime"]
    trend_ok = all(s["above_ma"] and s["ma_rising"] for s in states.values())
    max_dist = max(s["distribution_days"] for s in states.values())
    lost_50 = any(not s.get("above_ma50", True) for s in states.values())
    if not trend_ok or (max_dist >= r["correction_distribution_days"] and lost_50):
        return CORRECTION
    if max_dist >= r["pressure_distribution_days"]:
        return PRESSURE
    return CONFIRMED


def regime_weights(base_weights, regime, cfg):
    """In a correction, indicator 6 (top-rated growth fund sponsorship) drops to near zero and its
    weight is redistributed to group strength and sponsor quality."""
    w = dict(base_weights)
    if regime != CORRECTION:
        return w
    r = cfg["regime"]
    freed = w["growth_fund"] - r["correction_growth_fund_weight"]
    if freed <= 0:
        return w
    w["growth_fund"] = r["correction_growth_fund_weight"]
    for k, share in r["redistribute_to"].items():
        w[k] = w[k] + freed * share
    return w


def compute(index_close, index_volume, cfg, as_of=None):
    """index_close / index_volume: DataFrames with ^GSPC and ^IXIC columns."""
    c = index_close.loc[:as_of] if as_of is not None else index_close
    v = index_volume.loc[:as_of] if as_of is not None else index_volume
    states = {k: index_state(c[k], v[k], cfg) for k in c.columns}
    reg = classify(states, cfg)
    return {"regime": reg, "indices": states, "as_of": str(c.index[-1].date())}
