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

# --- 架构师修复：统一使用最严格的 EUB Excel 关键字 ---
EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
ROW_KEYWORD_DATE = 'Date'
# 必须完全匹配带运费的最大限价行，防止抓取成 Base Price
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

def get_secure_session():
    session = requests.Session()
    retry = Retry(connect=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

def get_latest_data():
    tz = pytz.timezone('America/Moncton')
    now_moncton = datetime.now(tz)
    
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

    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name='Current', header=None, engine='xlrd')
    
    # 架构师修复：使用与 seed_history 相同的严格匹配逻辑
    date_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
    price_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    
    eub_dates = pd.to_datetime(df_raw.iloc[date_row].values, errors='coerce', format='mixed')
    eub_prices = pd.to_numeric(df_raw.iloc[price_row].values, errors='coerce')
    
    # 架构师修复：必须在全局数据集上先计算 variance，再 tail(10)，防止覆盖历史真实熔断值
    eub_df = pd.DataFrame({'Date': eub_dates, 'Price': eub_prices}).dropna().sort_values('Date')
    eub_df['is_interrupter'] = eub_df['Date'].apply(lambda d: 1 if d.weekday() != 4 else 0)
    eub_df['prev_price'] = eub_df['Price'].shift(1)
    eub_df['interrupter_variance'] = eub_df.apply(
        lambda row: (row['Price'] - row['prev_price']) if (pd.notnull(row['prev_price']) and row['is_interrupter'] == 1) else 0,
        axis=1
    )
    
    # 算完之后，再安全地切出最后 10 天的数据用于日常增量更新
    eub_df = eub_df.tail(10)

    # 2. 获取市场数据
    end_date = now_moncton + timedelta(days=1)
    start_date = now_moncton - timedelta(days=7)
    
    rbob_raw = yf.download("RB=F", start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))
    cad_raw = yf.download("CAD=X", start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'))

    def extract_close(df, name):
        if df.empty: return pd.DataFrame(columns=[name])
        if isinstance(df.columns, pd.MultiIndex):
            return df['Close'].iloc[:, 0].to_frame(name=name)
        return df[['Close']].rename(columns={'Close': name})

    rbob = extract_close(rbob_raw, 'rbob_usd')
    cad = extract_close(cad_raw, 'cad_rate')
    
    market_df = rbob.join(cad, how='left')
    market_df['cad_rate'] = market_df['cad_rate'].ffill()
    market_df = market_df.dropna(subset=['rbob_usd'])
    
    today_str = now_moncton.strftime('%Y-%m-%d')
    current_hour = now_moncton.hour
    
    if current_hour < 18:
        market_df = market_df[market_df.index.strftime('%Y-%m-%d') < today_str]
    
    return eub_df, market_df

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--remote", action="store_true", default=False)
    args = parser.parse_args()

    try:
        eub_df, market_df = get_latest_data()
        sqls = []

        # 遍历已算好 variance 的 EUB 数据生成 SQL
        for _, row in eub_df.iterrows():
            d = row['Date'].strftime('%Y-%m-%d')
            sqls.append(f"INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance) VALUES ('{d}', '{d}', {row['Price']}, {row['is_interrupter']}, {row['interrupter_variance']}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price, is_interrupter=excluded.is_interrupter, published_date=excluded.published_date, interrupter_variance=excluded.interrupter_variance;")

        for d_idx, row in market_df.iterrows():
            d = d_idx.strftime('%Y-%m-%d')
            sqls.append(f"INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES ('{d}', {row['rbob_usd']}, {row['cad_rate']}) ON CONFLICT(date) DO UPDATE SET rbob_usd_close=excluded.rbob_usd_close, cad_usd_rate=excluded.cad_usd_rate;")

        if sqls:
            flag = "--remote" if args.remote else "--local"
            temp_sql = os.path.join(PROJECT_ROOT, "daily.sql")
            with open(temp_sql, "w", encoding='utf-8') as f: 
                f.write("\n".join(sqls))
            
            config_arg = f"-c {WRANGLER_CONFIG_PATH}"
            cmd = f"npx wrangler d1 execute D1_DB {flag} --file=daily.sql {config_arg} --yes"
            subprocess.run(cmd, shell=True, check=True, cwd=PROJECT_ROOT)
            os.remove(temp_sql)
            print(f"✅ Daily sync complete. Processed {len(sqls)} records.")
        else:
            print("ℹ️ No data to sync today.")
            
    except Exception as e:
        print(f"❌ Daily sync failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()