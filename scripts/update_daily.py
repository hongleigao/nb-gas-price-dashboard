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

EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'

# --- 架构师修复：高级防反爬机制 ---
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
    
    # 1. 获取 EUB 数据 (包含高级 Header 伪装)
    session = get_secure_session()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr-CA;q=0.8,fr;q=0.7',
        'Referer': 'https://nbeub.ca/current-petroleum-prices-2'
    }
    
    response = session.get(EUB_URL, headers=headers, timeout=30)
    response.raise_for_status()
    
    # 拦截校验：如果依然被防火墙返回 HTML，则提前抛出详细报错
    if b'<html' in response.content[:20].lower():
        raise ValueError(f"被 NB EUB 服务器拦截！请稍后再试。HTTP 状态码: {response.status_code}")

    df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name='Current', header=None, engine='xlrd')
    date_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains('Date', case=False).any(), axis=1)].index[0]
    price_row = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains('Regular Unleaded', case=False).any(), axis=1)].index[0]
    
    # 修复 Pandas 警告：使用 format='mixed'
    eub_dates = pd.to_datetime(df_raw.iloc[date_row].values, errors='coerce', format='mixed')
    eub_prices = pd.to_numeric(df_raw.iloc[price_row].values, errors='coerce')
    # 取尾部 10 条，以确保能计算出正确的熔断差值 (variance)
    eub_df = pd.DataFrame({'Date': eub_dates, 'Price': eub_prices}).dropna().sort_values('Date').tail(10)

    # 2. 获取市场数据 (强一致性时区)
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
    
    # 前向填充汇率，剔除脏数据
    market_df = rbob.join(cad, how='left')
    market_df['cad_rate'] = market_df['cad_rate'].ffill()
    market_df = market_df.dropna(subset=['rbob_usd'])
    
    today_str = now_moncton.strftime('%Y-%m-%d')
    current_hour = now_moncton.hour
    
    # 架构逻辑：下午 6 点之后才承认今天的市场彻底收盘
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

        # 生成 EUB 数据 SQL (修复了 published_date 与 interrupter_variance 的缺失)
        prev_p = None
        for _, row in eub_df.iterrows():
            d = row['Date'].strftime('%Y-%m-%d')
            is_int = 1 if row['Date'].weekday() != 4 else 0
            var = (row['Price'] - prev_p) if (prev_p and is_int) else 0
            
            sqls.append(f"INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance) VALUES ('{d}', '{d}', {row['Price']}, {is_int}, {var}) ON CONFLICT(effective_date) DO UPDATE SET max_price=excluded.max_price, is_interrupter=excluded.is_interrupter, published_date=excluded.published_date, interrupter_variance=excluded.interrupter_variance;")
            
            prev_p = row['Price']

        # 生成市场数据 SQL
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
        # 如果出错，强制返回非 0 退出码，让 GitHub Actions 正确标红报错
        sys.exit(1)

if __name__ == "__main__":
    main()