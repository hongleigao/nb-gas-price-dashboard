import os
import sys
import argparse
import requests
import pandas as pd
import yfinance as yf
import io
import subprocess
from datetime import datetime, timedelta

# Configuration
EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
EXCEL_SHEET_NAME = 'Current'
ROW_KEYWORD_DATE = 'Date'
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

def get_market_data():
    """Fetch RBOB and CAD/USD from Yahoo Finance."""
    print("Fetching market data from yfinance...")
    
    # RBOB Gasoline Futures
    rbob_ticker = yf.Ticker("RB=F")
    rbob = rbob_ticker.history(period="5d")
    # USD to CAD Exchange Rate
    cad_ticker = yf.Ticker("CAD=X")
    cad = cad_ticker.history(period="5d")
    
    # Filter ghost data (NaNs) as per v7.0 design Section 9
    rbob = rbob.dropna(subset=['Close'])
    cad = cad.ffill() # Forward-fill missing exchange rates
    
    if rbob.empty or cad.empty:
        raise ValueError("Failed to fetch market data or data is empty after filtering.")
        
    latest_date = rbob.index[-1].strftime('%Y-%m-%d')
    rbob_usd = float(rbob['Close'].iloc[-1])
    cad_usd = float(cad['Close'].iloc[-1])
    
    print(f"Market Data: Date={latest_date}, RBOB={rbob_usd:.4f} USD/gal, CAD/USD={cad_usd:.4f}")
    return latest_date, rbob_usd, cad_usd

def get_eub_prices():
    """Fetch official EUB prices from Excel."""
    print("Fetching EUB prices from official Excel...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    response = requests.get(EUB_URL, headers=headers, timeout=30)
    response.raise_for_status()
    
    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name=EXCEL_SHEET_NAME, header=None, engine='xlrd')
    
    # Dynamic row detection
    date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
    price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    
    dates = pd.to_datetime(df_raw.iloc[date_row_idx].values, errors='coerce')
    prices = pd.to_numeric(df_raw.iloc[price_row_idx].values, errors='coerce')
    
    df = pd.DataFrame({'Date': dates, 'Price': prices}).dropna().sort_values('Date')
    
    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest
    
    effective_date = latest['Date'].strftime('%Y-%m-%d')
    max_price = float(latest['Price'])
    
    # Determine if it's an interrupter (usually not a Friday)
    is_interrupter = 1 if latest['Date'].weekday() != 4 else 0
    variance = max_price - prev['Price'] if is_interrupter else 0
    
    print(f"EUB Data: Date={effective_date}, Price={max_price:.2f}, Interrupter={is_interrupter}")
    return effective_date, effective_date, max_price, is_interrupter, variance

def sync_to_d1(market_data, eub_data, remote=False):
    """Sync data to Cloudflare D1 using wrangler CLI."""
    flag = "--remote" if remote else "--local"
    config_path = "api/wrangler.toml"
    
    # 1. Market Data
    date, rbob, cad = market_data
    sql_market = f"INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES ('{date}', {rbob}, {cad}) ON CONFLICT(date) DO UPDATE SET rbob_usd_close=excluded.rbob_usd_close, cad_usd_rate=excluded.cad_usd_rate;"
    
    # 2. EUB Prices
    eff_date, pub_date, price, interrupter, variance = eub_data
    sql_eub = f"INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance) VALUES ('{eff_date}', '{pub_date}', {price}, {interrupter}, {variance}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price, is_interrupter=excluded.is_interrupter, interrupter_variance=excluded.interrupter_variance;"
    
    # Execute
    for sql in [sql_market, sql_eub]:
        print(f"Executing SQL ({flag}): {sql[:50]}...")
        cmd = f"npx wrangler d1 execute D1_DB {flag} --command=\"{sql}\" -c {config_path}"
        subprocess.run(cmd, shell=True, check=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true", help="Sync to remote D1")
    parser.add_argument("--dry-run", action="store_true", help="Fetch data but don't sync")
    args = parser.parse_args()
    
    try:
        market_data = get_market_data()
        eub_data = get_eub_prices()
        
        if not args.dry_run:
            sync_to_d1(market_data, eub_data, remote=args.remote)
            print("✅ Sync complete.")
        else:
            print("🚀 Dry run complete. No data was written.")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
