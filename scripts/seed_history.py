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

def seed_eub_history():
    """Extract ALL history from EUB Excel."""
    print("Step 1: Extracting EUB history from Excel...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(EUB_URL, headers=headers, timeout=30)
    
    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name=EXCEL_SHEET_NAME, header=None, engine='xlrd')
    
    # Dynamic row detection
    date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
    price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    
    dates = pd.to_datetime(df_raw.iloc[date_row_idx].values, errors='coerce')
    prices = pd.to_numeric(df_raw.iloc[price_row_idx].values, errors='coerce')
    
    df = pd.DataFrame({'Date': dates, 'Price': prices}).dropna().sort_values('Date')
    print(f"Found {len(df)} historical EUB records.")
    return df

def seed_market_history(days=730):
    """Fetch 2 years of market history."""
    print(f"Step 2: Fetching {days} days of market history from yfinance...")
    
    # Use yf.download for better historical consistency
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    rbob_data = yf.download("RB=F", start=start_date, end=end_date)
    cad_data = yf.download("CAD=X", start=start_date, end=end_date)
    
    if rbob_data.empty or cad_data.empty:
        print("Warning: One of the tickers returned no data.")
        return pd.DataFrame()

    # Flatten MultiIndex if necessary
    if isinstance(rbob_data.columns, pd.MultiIndex):
        rbob_data.columns = rbob_data.columns.get_level_values(0)
    if isinstance(cad_data.columns, pd.MultiIndex):
        cad_data.columns = cad_data.columns.get_level_values(0)

    rbob = rbob_data[['Close']].rename(columns={'Close': 'rbob_usd'})
    cad = cad_data[['Close']].rename(columns={'Close': 'cad_rate'})
    
    market_df = rbob.join(cad, how='inner').dropna()
    market_df.index = market_df.index.strftime('%Y-%m-%d')
    
    print(f"Fetched {len(market_df)} market data points.")
    return market_df

def run_sql_batch(sqls, remote=True):
    """Execute a batch of SQL commands."""
    flag = "--remote" if remote else "--local"
    config_path = "api/wrangler.toml"
    
    # Join SQLs with semicolon and newline
    batch_sql = "\n".join(sqls)
    
    # Save to temp file to avoid command line length limits
    with open("temp_seed.sql", "w") as f:
        f.write(batch_sql)
    
    print(f"Executing batch SQL ({flag})...")
    cmd = f"npx wrangler d1 execute D1_DB {flag} --file=temp_seed.sql -c {config_path} --yes"
    subprocess.run(cmd, shell=True, check=True)
    os.remove("temp_seed.sql")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true", default=True)
    args = parser.parse_args()
    
    try:
        # 1. Get Data
        eub_df = seed_eub_history()
        market_df = seed_market_history()
        
        # 2. Prepare EUB SQLs
        eub_sqls = []
        prev_price = None
        for _, row in eub_df.iterrows():
            date_str = row['Date'].strftime('%Y-%m-%d')
            price = row['Price']
            is_interrupter = 1 if row['Date'].weekday() != 4 else 0
            variance = (price - prev_price) if (prev_price and is_interrupter) else 0
            
            sql = f"INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance) VALUES ('{date_str}', '{date_str}', {price}, {is_interrupter}, {variance}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price;"
            eub_sqls.append(sql)
            prev_price = price
            
        # 3. Prepare Market SQLs
        market_sqls = []
        for date_str, row in market_df.iterrows():
            sql = f"INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES ('{date_str}', {row['rbob_usd']}, {row['cad_rate']}) ON CONFLICT(date) DO UPDATE SET rbob_usd_close=excluded.rbob_usd_close;"
            market_sqls.append(sql)
            
        # 4. Execute in chunks to avoid Cloudflare size limits
        print(f"Syncing {len(eub_sqls)} EUB records and {len(market_sqls)} market records...")
        
        # Chunking helper
        def chunk(lst, n):
            for i in range(0, len(lst), n):
                yield lst[i:i + n]
        
        for batch in chunk(eub_sqls, 50):
            run_sql_batch(batch, remote=args.remote)
            
        for batch in chunk(market_sqls, 100):
            run_sql_batch(batch, remote=args.remote)
            
        print("✅ Historical seeding complete.")
        
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
