import os
import sys
import argparse
import requests
import pandas as pd
import yfinance as yf
import io
import subprocess
from datetime import datetime, timedelta
import pytz
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- 架构师修复：动态路径解析逻辑 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
WRANGLER_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'api', 'wrangler.toml')

# Configuration
EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
EXCEL_SHEET_NAME = 'Current'
ROW_KEYWORD_DATE = 'Date'
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

# --- 架构师修复：高级防反爬机制 ---
def get_secure_session():
    session = requests.Session()
    retry = Retry(connect=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

def seed_eub_history():
    print("Step 1: Extracting EUB history from Excel...")
    session = get_secure_session()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr-CA;q=0.8,fr;q=0.7',
        'Referer': 'https://nbeub.ca/current-petroleum-prices-2'
    }
    
    response = session.get(EUB_URL, headers=headers, timeout=30)
    response.raise_for_status()
    
    if b'<html' in response.content[:20].lower():
        raise ValueError(f"被 NB EUB 服务器拦截！请稍后再试。HTTP 状态码: {response.status_code}")

    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name=EXCEL_SHEET_NAME, header=None, engine='xlrd')
    
    date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
    price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    
    # 架构师修复：彻底解决 Pandas 解析警告
    dates = pd.to_datetime(df_raw.iloc[date_row_idx].values, errors='coerce', format='mixed')
    prices = pd.to_numeric(df_raw.iloc[price_row_idx].values, errors='coerce')
    
    df = pd.DataFrame({'Date': dates, 'Price': prices}).dropna().sort_values('Date')
    print(f"Found {len(df)} historical EUB records.")
    return df

def seed_market_history(days=730):
    print(f"Step 2: Fetching {days} days of market history (Settlement Focus)...")
    # 架构师修复：锚定强一致性时区
    tz = pytz.timezone('America/Moncton')
    end_date = datetime.now(tz) + timedelta(days=1)
    start_date = end_date - timedelta(days=days)
    
    # 使用 YYYY-MM-DD 字符串调用以避免 yfinance 内部时区偏移
    rbob_raw = yf.download("RB=F", start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
    cad_raw = yf.download("CAD=X", start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
    
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
    config_arg = f"-c {WRANGLER_CONFIG_PATH}"
    
    # 架构师修复：强制生成绝对路径，防止 PWD 与 CWD 不一致导致的找不到文件
    temp_sql_path = os.path.join(PROJECT_ROOT, "temp_seed.sql")
    batch_sql = "\n".join(sqls)
    
    with open(temp_sql_path, "w", encoding='utf-8') as f:
        f.write(batch_sql)
    
    print(f"Executing batch SQL ({flag}) using config: {WRANGLER_CONFIG_PATH}")
    # 注意这里执行文件使用的是纯文件名，因为 cwd 已经切到了 PROJECT_ROOT
    cmd = f"npx wrangler d1 execute D1_DB {flag} --file=temp_seed.sql {config_arg} --yes"
    subprocess.run(cmd, shell=True, check=True, cwd=PROJECT_ROOT)
    os.remove(temp_sql_path)

def main():
    parser = argparse.ArgumentParser()
    # 修改 argparse 逻辑：默认 default 为 False，加上 --remote 才为 True，避免逻辑互斥
    parser.add_argument("--remote", action="store_true", default=False, help="Run on remote D1 database instead of local")
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
            # 这里已经正确包含了 published_date
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
        
        # 批量执行
        for batch in chunk(eub_sqls, 50):
            run_sql_batch(batch, remote=args.remote)
            
        for batch in chunk(market_sqls, 100):
            run_sql_batch(batch, remote=args.remote)
            
        print("✅ Seeding Complete.")
    except Exception as e:
        print(f"❌ Seeding failed: {e}")

if __name__ == "__main__":
    main()