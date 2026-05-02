import json
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import requests

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}


def fetch_stocktwits_trending():
    """Fetch trending tickers from StockTwits (sorted by social discussion volume)"""
    try:
        url = "https://api.stocktwits.com/api/2/trending/symbols.json"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            symbols = data.get('symbols', [])
            tickers = [s['symbol'] for s in symbols]
            print(f"Discovered {len(tickers)} trending tickers from StockTwits!")
            return tickers
    except Exception as e:
        print(f"StockTwits trending error: {e}")
    return []


def get_stocktwits_data(ticker):
    """
    Fetch the latest 30 messages for a ticker from StockTwits.
    Returns (texts, bullish_count, bearish_count, watchlist_count, messages).
    """
    try:
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            messages = data.get('messages', [])
            symbol_info = data.get('symbol', {})

            texts = [m['body'] for m in messages if m.get('body')]
            bullish = sum(
                1 for m in messages
                if m.get('entities', {}).get('sentiment', {}).get('basic') == 'Bullish'
            )
            bearish = sum(
                1 for m in messages
                if m.get('entities', {}).get('sentiment', {}).get('basic') == 'Bearish'
            )
            watchlist_count = symbol_info.get('watchlist_count', 0)
            return texts, bullish, bearish, watchlist_count, messages
        elif resp.status_code == 429:
            print(f"StockTwits rate limit hit, pausing...")
            time.sleep(60)
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
    """
    Use StockTwits bullish/bearish vote ratio when enough posts are tagged,
    otherwise fall back to VADER on message or news text.
    Score is in range [-1, 1].
    """
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
    """Pull hashtags from StockTwits posts; fall back to keyword scan on news text."""
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


def fetch_trending_tickers():
    """Merge StockTwits (social-first) and Yahoo Finance trending lists."""
    st_tickers = fetch_stocktwits_trending()

    yf_tickers = []
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/trending/US"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        yf_tickers = [item['symbol'] for item in data['finance']['result'][0]['quotes']]
        print(f"Discovered {len(yf_tickers)} trending tickers from Yahoo Finance!")
    except Exception as e:
        print(f"Yahoo Finance trending error: {e}. Using fallback list.")
        yf_tickers = ["PLTR", "SOUN", "SMCI", "MSTR", "ARM", "RDDT", "HOOD", "RKLB", "MARA", "CVNA", "ASTS"]

    # StockTwits tickers come first (social priority), then Yahoo, deduplicated
    seen = set()
    combined = []
    for t in st_tickers + yf_tickers:
        if t not in seen:
            seen.add(t)
            combined.append(t)
    return combined


def load_history(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def save_history(filepath, history):
    with open(filepath, 'w') as f:
        json.dump(history, f, indent=2)


def main():
    print("Starting Breakout Sentiment Scan (StockTwits + Yahoo Finance)...")

    basedir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(basedir, '..', 'trading', 'data.json')
    history_path = os.path.join(basedir, '..', 'trading', 'history.json')
    os.makedirs(os.path.dirname(data_path), exist_ok=True)

    history = load_history(history_path)
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')

    for t in history:
        history[t] = {k: v for k, v in history[t].items() if k >= cutoff_date}

    tickers = fetch_trending_tickers()
    results = []

    for ticker in tickers:
        print(f"Analyzing {ticker}...")
        try:
            if "^" in ticker or "=" in ticker:
                continue

            stock = yf.Ticker(ticker)
            st_info = stock.info

            market_cap = st_info.get('marketCap', 0)
            if market_cap > 150_000_000_000:
                print(f"Skipping {ticker}: Market cap too large (${market_cap/1e9:.1f}B)")
                continue

            current_price = st_info.get('currentPrice')
            prev_price = st_info.get('previousClose')

            if not current_price or not prev_price:
                hist_prices = stock.history(period="5d")
                if len(hist_prices) < 2:
                    continue
                current_price = float(hist_prices['Close'].iloc[-1])
                prev_price = float(hist_prices['Close'].iloc[-2])

            change_pct_val = ((current_price - prev_price) / prev_price) * 100
            sign = "+" if change_pct_val >= 0 else ""
            change_str = f"{sign}{change_pct_val:.2f}%"

            # StockTwits: real social posts + bullish/bearish votes
            st_texts, bull, bear, watchlist_count, st_messages = get_stocktwits_data(ticker)
            time.sleep(0.4)  # respect StockTwits rate limit (~200 req/hour)

            # Fall back to Yahoo Finance news if StockTwits returned nothing
            news_texts = get_yahoo_news(ticker) if not st_texts else []
            all_texts = st_texts if st_texts else news_texts

            current_sentiment = compute_sentiment(bull, bear, all_texts)

            if ticker not in history:
                history[ticker] = {}
            history[ticker][today_str] = current_sentiment

            past_scores = [v for d, v in history[ticker].items() if d != today_str]
            baseline = sum(past_scores) / len(past_scores) if past_scores else 0.0
            sentiment_delta = round(current_sentiment - baseline, 3)

            topics = extract_topics(st_messages, all_texts)

            # Social volume: StockTwits watchlist_count when available, else trade vol / 400
            raw_trade_vol = st_info.get('regularMarketVolume') or st_info.get('volume', 1_000_000)
            social_volume = watchlist_count if watchlist_count > 0 else int(raw_trade_vol / 400)

            results.append({
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
            })

        except Exception as e:
            print(f"Error processing {ticker}: {e}")

    save_history(history_path, history)

    # Sort by sentiment delta — the biggest positive breakouts rise to the top
    results.sort(key=lambda x: x['sentiment_delta'], reverse=True)

    if not results:
        print("No results found. Aborting.")
        return

    output_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "top_trending": results[0],
        "trending_list": results[1:min(11, len(results))],
    }

    with open(data_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    print("Successfully updated data.json with Top Breakouts!")


if __name__ == "__main__":
    main()
