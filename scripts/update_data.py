import os
import sys
import requests
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import pytz
import settings
from dotenv import load_dotenv
import io

# 加载本地 .env 文件 (如果存在)
load_dotenv()

# 获取环境变量
CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

# V6.0 配置
COMMODITY_ID = "gasoline"

def push_to_d1(sql, params):
    """通过 Cloudflare REST API 执行原生 SQL"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {"params": params, "sql": sql}
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        result = response.json()
        if not response.ok or not result.get("success"):
            raise Exception(f"D1 错误: {result.get('errors') or response.text}")
        return result
    except Exception as e:
        print(f"❌ Cloudflare API 连接失败: {e}")
        return None

def fetch_market_data():
    """使用专家建议的抓取逻辑获取 NYMEX RBOB 和 USDCAD 汇率"""
    print("1. 获取金融行情 (yfinance)...")
    try:
        rbob_ticker = yf.Ticker("RB=F")
        rbob_hist = rbob_ticker.history(period="5d")
        
        actual_trading_date = rbob_hist.index[-1].strftime('%Y-%m-%d')
        latest_rbob = float(rbob_hist['Close'].iloc[-1])

        cad_ticker = yf.Ticker("CAD=X")
        cad_hist = cad_ticker.history(period="5d")
        latest_cad = float(cad_hist['Close'].iloc[-1])

        print(f"数据处理完毕: 交易日期={actual_trading_date}, RBOB=${latest_rbob:.4f}, 汇率={latest_cad:.4f}")
        return {
            "trading_date": actual_trading_date,
            "rbob_usd_gal": latest_rbob,
            "cad_usd_rate": latest_cad
        }
    except Exception as e:
        raise RuntimeError(f"拉取 yfinance 数据失败: {e}")

def fetch_eub_regulation():
    """解析 NB EUB Excel 获取官方限价 (V6.0 增强型抓取)"""
    print("2. 获取 NB EUB 官方限价 (Excel 解析)...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    try:
        response = requests.get(settings.NBEUB_XLS_URL, headers=headers, timeout=20)
        response.raise_for_status()
        
        if response.content.startswith(b'<!DOCTYPE') or response.content.startswith(b'<html'):
            print("⚠️ 警告: EUB 网站返回了 HTML 页面而非 Excel 文件。")
            return None

        df_raw = pd.read_excel(io.BytesIO(response.content), sheet_name=settings.EXCEL_SHEET_NAME, header=None, engine='xlrd')
        
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
    except Exception as e:
        print(f"⚠️ 无法解析 EUB Excel: {e}")
        return None

def main():
    nb_tz = pytz.timezone('America/Moncton')
    now = datetime.now(nb_tz)
    
    # V6.0 状态逻辑: 18:00 以后标记为 FINAL
    status_flag = 'FINAL' if now.hour >= 18 else 'INTRA'

    if not all([CF_ACCOUNT_ID, CF_DATABASE_ID, CF_API_TOKEN]):
        print("❌ 错误: 缺少 Cloudflare 凭证。")
        sys.exit(1)

    try:
        # 1. 同步金融行情 (V6.0 事实表)
        market = fetch_market_data()
        trading_date_str = market["trading_date"]
        
        # V6.0 SQL: 插入或更新市场报价 (支持重跑)
        sql_market = """
            INSERT INTO market_quotes (commodity_id, trading_date, price_usd_gal, fx_rate, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(commodity_id, trading_date, status) DO UPDATE SET
            price_usd_gal=excluded.price_usd_gal,
            fx_rate=excluded.fx_rate,
            captured_at=CURRENT_TIMESTAMP;
        """
        push_to_d1(sql_market, [COMMODITY_ID, trading_date_str, market["rbob_usd_gal"], market["cad_usd_rate"], status_flag])
        print(f"✅ 金融行情同步成功 ({trading_date_str}, Status={status_flag})")

        # 2. 同步 EUB 官方限价 (V6.0 参考表)
        eub = fetch_eub_regulation()
        if eub:
            sql_eub = """
                INSERT INTO eub_history (commodity_id, effective_date, max_retail_price, active_base, is_interrupter)
                VALUES (?, ?, ?, 45.42, ?)
                ON CONFLICT(commodity_id, effective_date) DO UPDATE SET
                max_retail_price=excluded.max_retail_price,
                active_base=excluded.active_base,
                is_interrupter=excluded.is_interrupter;
            """
            eff_date_obj = datetime.strptime(eub["effective_date"], '%Y-%m-%d')
            is_interrupter = 1 if eff_date_obj.weekday() != 4 else 0
            
            push_to_d1(sql_eub, [COMMODITY_ID, eub["effective_date"], eub["max_retail_price"], is_interrupter])
            print(f"✅ EUB 官方数据同步成功 ({eub['effective_date']}, Price={eub['max_retail_price']})")
        else:
            print("ℹ️ 跳过 EUB 数据同步 (未能获取有效 Excel)")

    except Exception as e:
        print(f"❌ 同步失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
