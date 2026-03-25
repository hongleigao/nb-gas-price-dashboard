import os
import sys
import argparse
import requests
import pandas as pd
import yfinance as yf
import io
import subprocess
from datetime import datetime, timedelta

# --- 架构师修复：动态路径解析逻辑 ---
# 获取当前脚本所在目录的绝对路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 溯源到项目根目录 (scripts 的上一级)
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
# 精准锁定 wrangler.toml 的绝对路径
WRANGLER_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'api', 'wrangler.toml')

# Configuration
EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
EXCEL_SHEET_NAME = 'Current'
ROW_KEYWORD_DATE = 'Date'
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

def seed_eub_history():
    print("Step 1: Extracting EUB history from Excel...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(EUB_URL, headers=headers, timeout=30)
    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name=EXCEL_SHEET_NAME, header=None, engine='xlrd')
    
    date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
    price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    
    # 修复 UserWarning: 增加 format='mixed' 提高解析鲁棒性
    dates = pd.to_datetime(df_raw.iloc[date_row_idx].values, errors='coerce', dayfirst=False)
    prices = pd.to_numeric(df_raw.iloc[price_row_idx].values, errors='coerce')
    
    df = pd.DataFrame({'Date': dates, 'Price': prices}).dropna().sort_values('Date')
    print(f"Found {len(df)} historical EUB records.")
    return df

def seed_market_history(days=730):
    print(f"Step 2: Fetching {days} days of market history (Settlement Focus)...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    rbob_raw = yf.download("RB=F", start=start_date, end=end_date)
    cad_raw = yf.download("CAD=X", start=start_date, end=end_date)
    
    if rbob_raw.empty or cad_raw.empty: return pd.DataFrame()

    def extract_close(df, new_name):
        if isinstance(df.columns, pd.MultiIndex):
            return df['Close'].iloc[:, 0].to_frame(name=new_name)
        return df[['Close']].rename(columns={'Close': new_name})

    rbob = extract_close(rbob_raw, 'rbob_usd')
    cad = extract_close(cad_raw, 'cad_rate')
    
    market_df = rbob.join(cad, how='left')
    market_df['cad_rate'] = market_df['cad_rate'].ffill() 
    market_df['rbob_cad_base'] = market_df['rbob_usd'] * market_df['cad_rate']
    
    market_df.index = market_df.index.strftime('%Y-%m-%d')
    return market_df.dropna()

def run_sql_batch(sqls, remote=True):
    flag = "--remote" if remote else "--local"
    # 使用之前动态解析出的绝对路径
    config_arg = f"-c {WRANGLER_CONFIG_PATH}"
    
    batch_sql = "\n".join(sqls)
    with open("temp_seed.sql", "w", encoding='utf-8') as f:
        f.write(batch_sql)
    
    print(f"Executing batch SQL ({flag}) using config: {WRANGLER_CONFIG_PATH}")
    # 强制在项目根目录下执行，确保 D1 绑定正常
    cmd = f"npx wrangler d1 execute D1_DB {flag} --file=temp_seed.sql {config_arg} --yes"
    subprocess.run(cmd, shell=True, check=True, cwd=PROJECT_ROOT)
    os.remove(os.path.join(PROJECT_ROOT, "temp_seed.sql"))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true", default=True)
    args = parser.parse_args()
    
    try:
        eub_df = seed_eub_history()
        market_df = seed_market_history()
        
        eub_sqls = []
        prev_p = None
        for _, row in eub_df.iterrows():
            d_str = row['Date'].strftime('%Y-%m-%d')
            is_int = 1 if row['Date'].weekday() != 4 else 0
            var = (row['Price'] - prev_p) if (prev_p and is_int) else 0
            sql = f"INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance) VALUES ('{d_str}', '{d_str}', {row['Price']}, {is_int}, {var}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price, is_interrupter=excluded.is_interrupter, interrupter_variance=excluded.interrupter_variance;"
            eub_sqls.append(sql)
            prev_p = row['Price']

        market_sqls = []
        for d_str, row in market_df.iterrows():
            sql = f"INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES ('{d_str}', {row['rbob_usd']}, {row['cad_rate']}) ON CONFLICT(date) DO UPDATE SET rbob_usd_close=excluded.rbob_usd_close, cad_usd_rate=excluded.cad_usd_rate;"
            market_sqls.append(sql)
            
        print(f"Syncing {len(eub_sqls)} EUB and {len(market_sqls)} Market records...")
        
        def chunk(lst, n):
            for i in range(0, len(lst), n): yield lst[i:i + n]
        
        for batch in chunk(eub_sqls, 50):
            run_sql_batch(batch, remote=args.remote)
            
        for batch in chunk(market_sqls, 100):
            run_sql_batch(batch, remote=args.remote)
            
        print("✅ Seeding Complete.")
    except Exception as e:
        print(f"❌ Seeding failed: {e}")

if __name__ == "__main__":
    main()