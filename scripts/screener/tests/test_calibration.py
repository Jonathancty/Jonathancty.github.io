import numpy as np
import pandas as pd

from scripts.screener import calibrate
from scripts.screener.config import INDICATORS


def test_spearman():
    a = pd.Series(np.arange(20.0))
    assert np.isclose(calibrate.spearman(a, a * 2), 1.0)
    assert np.isclose(calibrate.spearman(a, -a), -1.0)
    assert np.isnan(calibrate.spearman(a[:5], a[:5]))          # too few observations


def test_weights_from_ic_blend_and_rounding(cfg):
    default = {k: float(v) for k, v in cfg["weights"].items()}
    ic = {k: 0.0 for k in INDICATORS}
    ic["group_strength"] = 0.06
    ic["inst_trend"] = 0.02
    ic["not_crowded"] = -0.03                                  # negative IC gets zero raw weight
    raw, blended = calibrate.weights_from_ic(ic, default, 0.5)
    assert np.isclose(raw["group_strength"], 75) and raw["not_crowded"] == 0
    assert sum(blended.values()) == 100
    assert blended["group_strength"] == round(0.5 * 20 + 0.5 * 75)


def test_weights_fall_back_to_default_when_no_signal(cfg):
    default = {k: float(v) for k, v in cfg["weights"].items()}
    raw, blended = calibrate.weights_from_ic({k: -0.01 for k in INDICATORS}, default, 0.5)
    assert blended == {k: int(v) for k, v in default.items()}


def test_walk_forward_uses_only_closed_windows(cfg):
    """A planted signal in group_strength should be learnt and show positive OOS IC."""
    rng = np.random.default_rng(0)
    dates = list(pd.date_range("2019-03-31", periods=16, freq=pd.offsets.QuarterEnd()))
    rows = []
    for d in dates:
        for i in range(60):
            s = rng.uniform(0, 100)
            rows.append({"date": d, "ticker": f"T{i}", "group_strength": s,
                         **{k: rng.uniform(0, 100) for k in INDICATORS if k != "group_strength"},
                         "sympathy": False, "regime": "Confirmed uptrend",
                         "fwd_63": s / 1000 + rng.normal(0, 0.02)})
    panel = pd.DataFrame(rows)
    default = {k: float(v) for k, v in cfg["weights"].items()}
    wf = calibrate.walk_forward(panel, dates, 63, cfg, default)
    assert len(wf) >= 1
    first_test = pd.Timestamp(wf[0]["date"])
    assert first_test > dates[cfg["calibration"]["min_train_dates"] - 1]
    assert np.mean([r["ic_calibrated"] for r in wf]) > np.mean([r["ic_default"] for r in wf])
    assert all(r["weights"]["group_strength"] > 20 for r in wf)
