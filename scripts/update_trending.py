import json
import os
import time
from datetime import datetime, timezone, timedelta
import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import random
import requests

# Set User-Agent to avoid 403 Forbidden on requests
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def get_x_data(ticker):
    return []

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

def analyze_sentiment(texts):
    analyzer = SentimentIntensityAnalyzer()
    if not texts:
        return 0.0
    total_score = 0
    for text in texts:
        score = analyzer.polarity_scores(text)
        total_score += score['compound']
    return total_score / len(texts)

def extract_topics(texts):
    keywords = ["AI", "Earnings", "Growth", "Demand", "Chips", "Revenue", "Launch", "CEO", "Market", "Update", "Price Target", "Guidance", "Crypto", "Acquisition", "FDA", "Trial", "Buyout", "Squeeze"]
    found = set()
    text_content = " ".join(texts).upper()
    for kw in keywords:
        if kw.upper() in text_content:
            found.add(kw)
    if not found:
        return ["Momentum", "Volume Spike"]
    return list(found)[:3]

def fetch_trending_tickers():
    """Fetch actively trending tickers from Yahoo Finance to find moving stocks"""
    try:
        url = "https://query1.finance.yahoo.com/v1/finance/trending/US"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        tickers = [item['symbol'] for item in data['finance']['result'][0]['quotes']]
        print(f"Discovered {len(tickers)} trending tickers from Yahoo!")
        return tickers
    except Exception as e:
        print(f"Error fetching trending list: {e}. Using fallback list.")
        return ["PLTR", "SOUN", "SMCI", "MSTR", "ARM", "RDDT", "HOOD", "RKLB", "MARA", "CVNA", "ASTS"]

def load_history(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}

def save_history(filepath, history):
    with open(filepath, 'w') as f:
        json.dump(history, f, indent=2)

def main():
    print("Starting Breakout Sentiment Scan...")
    
    basedir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(basedir, '..', 'trading', 'data.json')
    history_path = os.path.join(basedir, '..', 'trading', 'history.json')
    os.makedirs(os.path.dirname(data_path), exist_ok=True)
    
    # Load past 7-day history to calculate baseline
    history = load_history(history_path)
    today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    
    # Clean up old history (> 7 days)
    for t in history:
        history[t] = {k: v for k, v in history[t].items() if k >= cutoff_date}
    
    tickers = fetch_trending_tickers()
    results = []
    
    for ticker in tickers:
        print(f"Analyzing {ticker}...")
        try:
            # Drop weird index/crypto tickers to stick to equities
            if "^" in ticker or "=" in ticker:
                continue

            stock = yf.Ticker(ticker)
            st_info = stock.info
            
            # 1. FILTER: Ignore Mega-caps
            # We want "under the radar" stocks. Let's say less than $150 Billion market cap
            market_cap = st_info.get('marketCap', 0)
            if market_cap > 150_000_000_000:
                print(f"Skipping {ticker}: Market cap too large (${market_cap/1e9:.1f}B)")
                continue

            # Get Price Data
            # Prefer realtime info if available
            current_price = st_info.get('currentPrice')
            prev_price = st_info.get('previousClose')
            
            if not current_price or not prev_price:
                hist_prices = stock.history(period="5d")
                if len(hist_prices) < 2:
                    continue
                current_price = hist_prices['Close'].iloc[-1]
                prev_price = hist_prices['Close'].iloc[-2]
                
            change_pct = ((current_price - prev_price) / prev_price) * 100
            sign = "+" if change_pct >= 0 else ""
            change_str = f"{sign}{change_pct:.2f}%"
            
            # Get News and calculate today's Sentiment
            texts = get_x_data(ticker)
            if not texts:
                texts = get_yahoo_news(ticker)
            
            current_sentiment = analyze_sentiment(texts)
            
            # Save to history
            if ticker not in history:
                history[ticker] = {}
            history[ticker][today_str] = current_sentiment
            
            # Calculate Baseline (Average of previous days)
            past_scores = [score for date, score in history[ticker].items() if date != today_str]
            
            baseline = sum(past_scores) / len(past_scores) if past_scores else 0.0
            
            # The Magic Metric: Sentiment Delta (Spike)
            sentiment_delta = current_sentiment - baseline
            
            topics = extract_topics(texts)
            raw_vol = st_info.get('regularMarketVolume') or st_info.get('volume', random.randint(1000000, 5000000))
            
            short_name = st_info.get('shortName', ticker)
            
            results.append({
                "ticker": ticker,
                "name": short_name,
                "sentiment_delta": round(sentiment_delta, 3), # NEW METRIC
                "current_sentiment": round(current_sentiment, 2),
                "tweet_volume": int(raw_vol / 400),
                "price": round(current_price, 2),
                "change_pct": change_str,
                "key_topics": topics
            })
        except Exception as e:
            print(f"Error processing {ticker}: {e}")
            
    save_history(history_path, history)
            
    # Sort by highest Sentiment Delta (The Breakouts)
    results.sort(key=lambda x: x['sentiment_delta'], reverse=True)
    
    # Optional: Filter out logic if desired
    # We just want top 11 elements
        
    if not results:
        print("No results found. Aborting.")
        return
        
    top_trending = results[0]
    if len(results) > 1:
        trending_list = results[1:min(11, len(results))] # Pass up to 10 others
    else:
        trending_list = []
    
    output_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "top_trending": top_trending,
        "trending_list": trending_list
    }
    
    with open(data_path, 'w') as f:
        json.dump(output_data, f, indent=2)
        
    print(f"Successfully updated data.json with Top Breakouts!")

if __name__ == "__main__":
    main()
