import os
import sys
import json
import requests
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import pytz
import settings

# 获取 GitHub Secrets
CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def push_to_d1(sql, params):
    """通过 Cloudflare REST API 执行原生 SQL"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "params": params,
        "sql": sql
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        result = response.json()
        if not response.ok or not result.get("success"):
            raise Exception(f"D1 错误: {result.get('errors') or response.text}")
        return result
    except Exception as e:
        print(f"❌ Cloudflare API 连接失败: {e}")
        return None

def fetch_market_data():
    """使用 yfinance 获取 NYMEX RBOB 和 USDCAD 汇率"""
    print("1. 获取金融行情 (yfinance)...")
    # RB=F 是 NYMEX RBOB 期货，USDCAD=X 是美元兑加元汇率
    rbob = yf.download("RB=F", period="5d", progress=False)['Close']
    cad = yf.download("USDCAD=X", period="5d", progress=False)['Close']
    
    if rbob.empty or cad.empty:
        raise ValueError("无法获取金融行情数据")
        
    # 修正 FutureWarning: 使用 iloc[0] 显式转换
    latest_rbob = float(rbob.iloc[-1].iloc[0]) if isinstance(rbob.iloc[-1], pd.Series) else float(rbob.iloc[-1])
    latest_cad = float(cad.iloc[-1].iloc[0]) if isinstance(cad.iloc[-1], pd.Series) else float(cad.iloc[-1])
    
    # 专家公式：base_cad_liter = (rbob * rate) / 3.7854 * 100
    base_cad_liter = round((latest_rbob * latest_cad) / 3.7854 * 100, 2)
    
    return {
        "rbob_usd_gal": latest_rbob,
        "cad_usd_rate": latest_cad,
        "base_cad_liter": base_cad_liter
    }

def fetch_eub_regulation():
    """解析 NB EUB Excel 获取官方限价 (监管锚点)"""
    print("2. 获取 NB EUB 官方限价 (Excel 解析)...")
    df_raw = pd.read_excel(settings.NBEUB_XLS_URL, sheet_name=settings.EXCEL_SHEET_NAME, header=None, engine='xlrd')
    
    # 动态定位日期和价格行
    try:
        date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
        price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
    except:
        date_row_idx, price_row_idx = 2, 7
        
    dates_raw = df_raw.iloc[date_row_idx].values
    prices_raw = df_raw.iloc[price_row_idx].values
    
    df = pd.DataFrame({'Date': dates_raw, 'Price': prices_raw})
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce', format='mixed')
    df['Price'] = pd.to_numeric(df['Price'], errors='coerce')
    df = df.dropna().sort_values('Date').iloc[-1]
    
    return {
        "effective_date": df['Date'].strftime('%Y-%m-%d'),
        "max_retail_price": float(df['Price'])
    }

def main():
    # 时区锁定
    nb_tz = pytz.timezone('America/Moncton')
    today = datetime.now(nb_tz).strftime('%Y-%m-%d')
    
    if not all([CF_ACCOUNT_ID, CF_DATABASE_ID, CF_API_TOKEN]):
        print("❌ 错误: 缺少 Cloudflare 凭证。请检查 GitHub Secrets。")
        sys.exit(1)

    try:
        # 1. 采集并同步金融行情
        market = fetch_market_data()
        sql_market = """
            INSERT INTO nymex_market_data (trading_date, rbob_usd_gal, cad_usd_rate, base_cad_liter)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(trading_date) DO UPDATE SET 
            rbob_usd_gal=excluded.rbob_usd_gal,
            cad_usd_rate=excluded.cad_usd_rate,
            base_cad_liter=excluded.base_cad_liter;
        """
        push_to_d1(sql_market, [today, market["rbob_usd_gal"], market["cad_usd_rate"], market["base_cad_liter"]])
        print(f"✅ 金融行情同步成功: {market['base_cad_liter']} ¢/L")

        # 2. 采集并同步 EUB 官方限价
        eub = fetch_eub_regulation()
        # 注意：此处 active_eub_base 的逻辑将在 Worker 侧根据 effective_date 前的历史均值计算
        # 此处仅推送官方状态
        sql_eub = """
            INSERT INTO eub_regulations (effective_date, max_retail_price, actual_pump_price, active_eub_base, is_interrupter)
            VALUES (?, ?, ?, 0, 0)
        """
        # 简单的幂等性检查：如果该日期已存在，则不重复插入
        check_sql = "SELECT id FROM eub_regulations WHERE effective_date = ?"
        exists = push_to_d1(check_sql, [eub["effective_date"]])
        
        if exists and not exists.get("result", [{}])[0].get("results"):
            push_to_d1(sql_eub, [eub["effective_date"], eub["max_retail_price"], eub["max_retail_price"] - 5.5])
            print(f"✅ EUB 官方调价快照同步: {eub['max_retail_price']} ¢/L ({eub['effective_date']})")
        else:
            print(f"ℹ️ 该日期 ({eub['effective_date']}) 的 EUB 监管快照已存在，跳过。")

    except Exception as e:
        print(f"❌ 同步失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
