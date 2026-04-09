import json
import os
from datetime import datetime, timezone
import yfinance as yf
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import random

# Core target list of typically trendy tech/finance stocks
TICKERS = ["NVDA", "TSLA", "AAPL", "AMD", "META", "PLTR", "MSFT", "GOOGL", "AMZN", "COIN"]

def get_x_data(ticker):
    """
    Placeholder for your X (Twitter) Scraper.
    You can use Tweepy or your existing scraper here.
    If you have the scraper from the Sentiment Dashboard repo, call it!
    Requires X API Keys.
    """
    # Example: return [] if no keys exist, forcing fallback to Yahoo News
    return []

def get_yahoo_news(ticker):
    """
    Fallback method: gets the latest news from Yahoo Finance
    so the dashboard works immediately without API keys.
    """
    stock = yf.Ticker(ticker)
    news = stock.news
    headlines = []
    # yfinance news sometimes returns a dictionary format depending on version
    for article in news[:8]:
        title = article.get('title', '')
        summary = article.get('summary', '') # some versions might not have summary
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

def get_sentiment_label(score):
    if score >= 0.5: return "Extremely Bullish"
    elif score >= 0.1: return "Bullish"
    elif score > -0.1: return "Neutral"
    elif score > -0.5: return "Bearish"
    else: return "Extremely Bearish"

def extract_topics(texts):
    # Simplistic topic extraction for demo purposes.
    # You can swap this with Gemini API for true summarization.
    keywords = ["AI", "Earnings", "Growth", "Demand", "Chips", "Revenue", "Launch", "CEO", "Market", "Update", "Price Target", "Guidance", "Crypto"]
    found = set()
    text_content = " ".join(texts).upper()
    
    for kw in keywords:
        if kw.upper() in text_content:
            found.add(kw)
            
    if not found:
        return ["General Market", "Performance"]
        
    return list(found)[:3]

def main():
    print("Starting X-Sentiment Data Update...")
    results = []
    
    for ticker in TICKERS:
        print(f"Analyzing {ticker}...")
        try:
            # 1. Get Live Price Data
            stock = yf.Ticker(ticker)
            hist = stock.history(period="5d")
            
            if len(hist) < 2:
                print(f"Not enough history for {ticker}")
                continue
                
            current_price = hist['Close'].iloc[-1]
            prev_price = hist['Close'].iloc[-2]
            change_pct = ((current_price - prev_price) / prev_price) * 100
            
            # Format nicely
            sign = "+" if change_pct >= 0 else ""
            change_str = f"{sign}{change_pct:.2f}%"
            
            # 2. Try to get X data, fallback to Yahoo News
            texts = get_x_data(ticker)
            if not texts:
                texts = get_yahoo_news(ticker)
            
            # 3. Analyze Sentiment
            sentiment_score = analyze_sentiment(texts)
            sentiment_label = get_sentiment_label(sentiment_score)
            
            # 4. Extract Topics
            topics = extract_topics(texts)
            
            # Simulate "Tweet Volume" purely for visualization using relative stock volume
            st_info = stock.info
            # Some tickers might be missing 'regularMarketVolume'
            raw_vol = st_info.get('regularMarketVolume') or st_info.get('volume', random.randint(5000000, 20000000))
            scaled_volume = int(raw_vol / 400) # Proxy social volume scale
            
            short_name = st_info.get('shortName', ticker)
            
            results.append({
                "ticker": ticker,
                "name": short_name,
                "sentiment_score": round(sentiment_score, 2),
                "sentiment_label": sentiment_label,
                "tweet_volume": scaled_volume,
                "price": round(current_price, 2),
                "change_pct": change_str,
                "key_topics": topics
            })
        except Exception as e:
            print(f"Error processing {ticker}: {e}")
            
    # Sort by a combination of volume and absolute sentiment magnitude to find "Most Trendy"
    results.sort(key=lambda x: (x['tweet_volume'] * (abs(x['sentiment_score']) + 0.1)), reverse=True)
    
    if not results:
        print("No results found. Aborting.")
        return
        
    top_trending = results[0]
    trending_list = results[1:7] # Pass the top 6 remaining
    
    output_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "top_trending": top_trending,
        "trending_list": trending_list
    }
    
    # Save to trading/data.json
    # ensure directories exist just in case
    basedir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(basedir, '..', 'trading', 'data.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)
        
    print(f"Successfully updated data.json with Real-time data for {len(results)} stocks!")

if __name__ == "__main__":
    main()
