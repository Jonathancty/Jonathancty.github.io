"""The SEC fundamentals path of the daily build, end to end, with a fake SEC client."""
import re
from datetime import datetime, timezone

import numpy as np
import requests

from scripts.screener.build import load_fundamentals


class FakeSec:
    """Serves company_tickers.json and XBRL frames like data.sec.gov does."""

    def __init__(self):
        self.calls = []

    def get_json(self, url):
        self.calls.append(url)
        if url.endswith("company_tickers.json"):
            return {"0": {"cik_str": 1045810, "ticker": "NVDA", "title": "NVIDIA CORP"},
                    "1": {"cik_str": 1067983, "ticker": "BRK.B", "title": "BERKSHIRE"}}
        m = re.search(r"/frames/us-gaap/(\w+)/[^/]+/CY(\d{4})(Q\d)?\.json$", url)
        tag, year, q = m.group(1), int(m.group(2)), m.group(3)
        if tag not in ("EarningsPerShareDiluted", "Revenues"):
            raise requests.HTTPError("404 Client Error: Not Found")
        base = 1.0 if year <= 2025 else 2.0          # EPS and revenue double in 2026
        val = base * (100 if tag == "Revenues" else 1)
        if q is None:
            val *= 4
        end = f"{year}-{3 * int(q[1]):02d}-28" if q else f"{year}-12-31"
        return {"data": [{"accn": "x", "cik": 1045810, "entityName": "NVIDIA", "loc": "US-CA", "end": end, "val": val}]}


def test_load_fundamentals_with_tz_aware_now(tmp_path):
    sec = FakeSec()
    now = datetime(2026, 11, 10, 22, 30, tzinfo=timezone.utc)      # the build passes an aware UTC time
    f = load_fundamentals(sec, ["NVDA", "BRK-B", "ZZZZ"], now, str(tmp_path))
    assert list(f.index) == ["NVDA"]
    r = f.loc["NVDA"]
    assert r["latest_q"] == "2026Q2"                  # Q3 ends 30 Sep: +45 days = 14 Nov, not yet available
    assert np.isclose(r["eps_q_growth"], 1.0) and np.isclose(r["rev_q_growth"], 1.0)
    assert any("CY2026Q2" in c for c in sec.calls)
