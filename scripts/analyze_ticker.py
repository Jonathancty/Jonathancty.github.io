import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import requests

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}


def _sentiment_basic(message):
    # StockTwits sets entities/sentiment to null (not absent) when untagged,
    # so a plain .get(..., {}) chain still hits None and raises.
    entities = message.get('entities') or {}
    sentiment = entities.get('sentiment') or {}
    return sentiment.get('basic')


def get_stocktwits_data(ticker):
    try:
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            messages = data.get('messages', [])
            symbol_info = data.get('symbol', {})

            texts = [m['body'] for m in messages if m.get('body')]
            bullish = sum(1 for m in messages if _sentiment_basic(m) == 'Bullish')
            bearish = sum(1 for m in messages if _sentiment_basic(m) == 'Bearish')
            watchlist_count = symbol_info.get('watchlist_count', 0)
            return texts, bullish, bearish, watchlist_count, messages
        elif resp.status_code == 429:
            print("StockTwits rate limit hit, pausing...")
            time.sleep(30)
    except Exception as e:
        print(f"StockTwits error for {ticker}: {e}")
    return [], 0, 0, 0, []


def get_yahoo_news(ticker):
    stock = yf.Ticker(ticker)
    news = stock.news
    headlines = []
    if not news:
        return headlines
    for article in news[:8]:
        title = article.get('title', '')
        summary = article.get('summary', '')
        if title:
            headlines.append(title + ". " + summary)
    return headlines


def analyze_sentiment_vader(texts):
    analyzer = SentimentIntensityAnalyzer()
    if not texts:
        return 0.0
    scores = [analyzer.polarity_scores(t)['compound'] for t in texts]
    return sum(scores) / len(scores)


def compute_sentiment(bullish, bearish, texts):
    total = bullish + bearish
    if total >= 5:
        return round((bullish / total) * 2 - 1, 3)
    return round(analyze_sentiment_vader(texts), 3)


def sentiment_label(score):
    if score >= 0.1:
        return "Bullish"
    if score <= -0.1:
        return "Bearish"
    return "Neutral"


def bullish_pct(bullish, bearish):
    total = bullish + bearish
    if total == 0:
        return None
    return round((bullish / total) * 100)


def extract_topics(st_messages, fallback_texts):
    hashtags = []
    for m in st_messages:
        tags = re.findall(r'#(\w+)', m.get('body', ''), re.IGNORECASE)
        hashtags.extend(t.capitalize() for t in tags if len(t) > 2)

    if hashtags:
        return [tag for tag, _ in Counter(hashtags).most_common(3)]

    keywords = [
        "AI", "Earnings", "Growth", "Demand", "Chips", "Revenue", "Launch",
        "CEO", "Market", "Update", "Price Target", "Guidance", "Crypto",
        "Acquisition", "FDA", "Trial", "Buyout", "Squeeze",
    ]
    found = {kw for kw in keywords if kw.upper() in " ".join(fallback_texts).upper()}
    return list(found)[:3] if found else ["Momentum", "Volume Spike"]


def load_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def save_json(filepath, obj):
    with open(filepath, 'w') as f:
        json.dump(obj, f, indent=2)


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("Usage: python analyze_ticker.py TICKER")
        sys.exit(1)

    ticker = sys.argv[1].strip().upper()
    print(f"On-demand sentiment analysis for {ticker}...")

    basedir = os.path.dirname(os.path.abspath(__file__))
    results_path = os.path.join(basedir, '..', 'trading', 'search_results.json')
    history_path = os.path.join(basedir, '..', 'trading', 'history.json')

    results = load_json(results_path)
    history = load_json(history_path)

    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    requested_at = datetime.now(timezone.utc).isoformat()

    try:
        stock = yf.Ticker(ticker)
        st_info = stock.info

        current_price = st_info.get('currentPrice')
        prev_price = st_info.get('previousClose')

        if not current_price or not prev_price:
            hist_prices = stock.history(period="5d")
            if len(hist_prices) < 2:
                results[ticker] = {
                    "ticker": ticker,
                    "error": "Ticker not found or no price data available.",
                    "requested_at": requested_at,
                }
                save_json(results_path, results)
                print(f"No price data for {ticker}. Wrote error entry.")
                return
            current_price = float(hist_prices['Close'].iloc[-1])
            prev_price = float(hist_prices['Close'].iloc[-2])

        change_pct_val = ((current_price - prev_price) / prev_price) * 100
        sign = "+" if change_pct_val >= 0 else ""
        change_str = f"{sign}{change_pct_val:.2f}%"

        st_texts, bull, bear, watchlist_count, st_messages = get_stocktwits_data(ticker)
        news_texts = get_yahoo_news(ticker) if not st_texts else []
        all_texts = st_texts if st_texts else news_texts

        current_sentiment = compute_sentiment(bull, bear, all_texts)

        if ticker not in history:
            history[ticker] = {}
        history[ticker] = {k: v for k, v in history[ticker].items() if k >= cutoff_date}
        past_scores = [v for d, v in history[ticker].items() if d != today_str]
        baseline = sum(past_scores) / len(past_scores) if past_scores else 0.0
        history[ticker][today_str] = current_sentiment
        sentiment_delta = round(current_sentiment - baseline, 3)

        topics = extract_topics(st_messages, all_texts)

        raw_trade_vol = st_info.get('regularMarketVolume') or st_info.get('volume', 1_000_000)
        social_volume = watchlist_count if watchlist_count > 0 else int(raw_trade_vol / 400)

        results[ticker] = {
            "ticker": ticker,
            "name": st_info.get('shortName', ticker),
            "sentiment_delta": sentiment_delta,
            "current_sentiment": current_sentiment,
            "sentiment_label": sentiment_label(current_sentiment),
            "bullish_pct": bullish_pct(bull, bear),
            "tweet_volume": social_volume,
            "price": round(current_price, 2),
            "change_pct": change_str,
            "key_topics": topics,
            "requested_at": requested_at,
        }

        save_json(results_path, results)
        save_json(history_path, history)
        print(f"Successfully analyzed {ticker} and updated search_results.json")

    except Exception as e:
        print(f"Error analyzing {ticker}: {e}")
        results[ticker] = {
            "ticker": ticker,
            "error": f"Analysis failed: {e}",
            "requested_at": requested_at,
        }
        save_json(results_path, results)


if __name__ == "__main__":
    main()
