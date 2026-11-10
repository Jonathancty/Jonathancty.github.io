"""Bridge to the existing social-sentiment pipeline (StockTwits + VADER, scripts/update_trending.py).

The screener shows that score as a separate column. It is NOT part of the composite unless the
page's toggle adds it as an 8th factor.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from .config import repo_path

sys.path.insert(0, repo_path("scripts"))


def existing_scores(max_age_days=3):
    """Latest sentiment per ticker from trading/data.json and trading/search_results.json."""
    out = {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)

    def _take(rec, when):
        if rec and rec.get("current_sentiment") is not None and when and when >= cutoff:
            out[rec["ticker"]] = {"score": rec["current_sentiment"], "label": rec.get("sentiment_label"),
                                  "bullish_pct": rec.get("bullish_pct"), "as_of": when.isoformat(),
                                  "source": "StockTwits/VADER"}

    try:
        with open(repo_path("trading", "data.json")) as f:
            d = json.load(f)
        when = datetime.fromisoformat(d["updated_at"])
        for rec in [d.get("top_trending")] + d.get("trending_list", []):
            _take(rec, when)
    except Exception:
        pass
    try:
        with open(repo_path("trading", "search_results.json")) as f:
            for rec in json.load(f).values():
                if rec.get("requested_at"):
                    _take(rec, datetime.fromisoformat(rec["requested_at"]))
    except Exception:
        pass
    return out


def score_tickers(tickers):
    """Run the existing StockTwits/VADER sentiment on a few tickers (rate-limit friendly)."""
    try:
        from update_trending import compute_sentiment, get_stocktwits_data, get_yahoo_news, sentiment_label
    except Exception as e:
        print(f"sentiment module unavailable: {e}")
        return {}
    out = {}
    now = datetime.now(timezone.utc).isoformat()
    for t in tickers:
        try:
            texts, bull, bear, _, _ = get_stocktwits_data(t)
            if not texts:
                texts = get_yahoo_news(t)
            s = compute_sentiment(bull, bear, texts)
            total = bull + bear
            out[t] = {"score": s, "label": sentiment_label(s),
                      "bullish_pct": round(bull / total * 100) if total else None,
                      "as_of": now, "source": "StockTwits/VADER"}
        except Exception as e:
            print(f"  sentiment {t}: {e}")
        time.sleep(0.5)
    return out
