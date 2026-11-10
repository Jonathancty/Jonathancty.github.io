"""Shared result type and helpers for the seven indicators."""
import math
from dataclasses import dataclass, field

PASS, PARTIAL, FAIL, NA = "pass", "partial", "fail", "n/a"


@dataclass
class IndicatorResult:
    score: float | None          # 0-100, or None when the data is missing ("n/a", never 0)
    status: str                  # pass / partial / fail / n/a
    raw: dict = field(default_factory=dict)   # numbers shown in the page tooltip

    def to_dict(self):
        return {
            "score": None if self.score is None else round(float(self.score), 1),
            "status": self.status,
            "raw": {k: _clean(v) for k, v in self.raw.items()},
        }


def na(reason, **raw):
    raw = dict(raw)
    raw["reason"] = reason
    return IndicatorResult(None, NA, raw)


def clip(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def is_missing(x):
    return x is None or (isinstance(x, float) and math.isnan(x))


def _clean(v):
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v):
            return None
        return round(v, 4)
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if hasattr(v, "item"):          # numpy scalar
        return _clean(v.item())
    return v
