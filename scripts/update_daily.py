import os
import requests
import pandas as pd
import yfinance as yf
import io
import subprocess
from datetime import datetime, timedelta
import pytz

# --- 架构师修复：动态路径解析逻辑 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
WRANGLER_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'api', 'wrangler.toml')

EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'

def get_latest_data():
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(EUB_URL, headers=headers, timeout=30)
    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name='Current', header=None, engine='xlrd')
    date_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains('Date', case=False).any(), axis=1)].index[0]
    price_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains('Regular Unleaded', case=False).any(), axis=1)].index[0]
    
    eub_dates = pd.to_datetime(df_raw.iloc[date_row].values, errors='coerce')
    eub_prices = pd.to_numeric(df_raw.iloc[price_row].values, errors='coerce')
    eub_df = pd.DataFrame({'Date': eub_dates, 'Price': eub_prices}).dropna().sort_values('Date').tail(5)

    end_date = datetime.now() + timedelta(days=1)
    start_date = end_date - timedelta(days=7)
    
    rbob_raw = yf.download("RB=F", start=start_date, end=end_date)
    cad_raw = yf.download("CAD=X", start=start_date, end=end_date)

    def extract_close(df, name):
        if isinstance(df.columns, pd.MultiIndex):
            return df['Close'].iloc[:, 0].to_frame(name=name)
        return df[['Close']].rename(columns={'Close': name})

    rbob = extract_close(rbob_raw, 'rbob_usd')
    cad = extract_close(cad_raw, 'cad_rate')
    
    market_df = rbob.join(cad, how='left').ffill()
    
    tz = pytz.timezone('America/Moncton')
    today_moncton = datetime.now(tz).strftime('%Y-%m-%d')
    current_hour = datetime.now(tz).hour
    if current_hour < 18:
        market_df = market_df[market_df.index.strftime('%Y-%m-%d') < today_moncton]
    
    return eub_df, market_df.dropna()

def main():
    try:
        eub_df, market_df = get_latest_data()
        sqls = []

        for _, row in eub_df.iterrows():
            d = row['Date'].strftime('%Y-%m-%d')
            is_int = 1 if row['Date'].weekday() != 4 else 0
            sqls.append(f"INSERT INTO eub_prices (effective_date, max_price, is_interrupter) VALUES ('{d}', {row['Price']}, {is_int}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price, is_interrupter=excluded.is_interrupter;")

        for d_idx, row in market_df.iterrows():
            d = d_idx.strftime('%Y-%m-%d')
            sqls.append(f"INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES ('{d}', {row['rbob_usd']}, {row['cad_rate']}) ON CONFLICT(date) DO UPDATE SET rbob_usd_close=excluded.rbob_usd_close, cad_usd_rate=excluded.cad_usd_rate;")

        if sqls:
            temp_sql = os.path.join(PROJECT_ROOT, "daily.sql")
            with open(temp_sql, "w", encoding='utf-8') as f: f.write("\n".join(sqls))
            
            config_arg = f"-c {WRANGLER_CONFIG_PATH}"
            cmd = f"npx wrangler d1 execute D1_DB --remote --file=daily.sql {config_arg} --yes"
            subprocess.run(cmd, shell=True, check=True, cwd=PROJECT_ROOT)
            os.remove(temp_sql)
            print(f"✅ Daily sync complete. Processed {len(sqls)} records.")
    except Exception as e:
        print(f"❌ Daily sync failed: {e}")

if __name__ == "__main__":
    main()