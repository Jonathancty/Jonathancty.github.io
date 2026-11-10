import os
import sys

import numpy as np
import pandas as pd
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from scripts.screener.config import load_config  # noqa: E402


@pytest.fixture
def cfg():
    return load_config()


def trend_prices(daily_drift, n=300, start=100.0, noise=0.0, seed=0):
    rng = np.random.default_rng(seed)
    r = daily_drift + noise * rng.standard_normal(n)
    return start * np.cumprod(1 + r)


@pytest.fixture
def price_universe():
    """3 industry groups x 3 stocks with different trends. 'Chips' is strongest."""
    idx = pd.bdate_range("2025-01-01", periods=300)
    spec = {
        "CHIP1": ("Chips", 0.0030), "CHIP2": ("Chips", 0.0025), "CHIP3": ("Chips", 0.0020),
        "SOFT1": ("Software", 0.0010), "SOFT2": ("Software", 0.0008), "SOFT3": ("Software", 0.0005),
        "TEL1": ("Telecom", -0.0005), "TEL2": ("Telecom", -0.0008), "TEL3": ("Telecom", -0.0010),
    }
    closes = pd.DataFrame({t: trend_prices(d, seed=i) for i, (t, (_, d)) in enumerate(spec.items())}, index=idx)
    industries = pd.Series({t: g for t, (g, _) in spec.items()})
    return closes, industries
