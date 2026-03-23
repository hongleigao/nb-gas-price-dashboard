import os
import sys
import requests
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import pytz
import settings
from dotenv import load_dotenv

# 加载本地 .env 文件 (如果存在)
load_dotenv()

# 获取环境变量
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
    payload = {"params": params, "sql": sql}
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
    """使用专家建议的抓取逻辑获取 NYMEX RBOB 和 USDCAD 汇率"""
    print("1. 获取金融行情 (yfinance)...")
    try:
        # 专家方法：使用 Ticker 直接获取最近数据
        rbob_ticker = yf.Ticker("RB=F")
        rbob_hist = rbob_ticker.history(period="5d")
        
        # 核心：获取真实的交易日期 (从 Index 中提取最新日期)
        actual_trading_date = rbob_hist.index[-1].strftime('%Y-%m-%d')
        latest_rbob = float(rbob_hist['Close'].iloc[-1])

        cad_ticker = yf.Ticker("CAD=X")
        cad_hist = cad_ticker.history(period="5d")
        latest_cad = float(cad_hist['Close'].iloc[-1])

        # 核心转换公式：(每加仑美元 * 加元汇率) / 3.7854 * 100
        base_cad_liter = round((latest_rbob * latest_cad) / 3.7854 * 100, 2)
        
        print(f"数据处理完毕: 交易日期={actual_trading_date}, RBOB=${latest_rbob:.4f}, 汇率={latest_cad:.4f}, 基准加分={base_cad_liter}¢")
        return {
            "trading_date": actual_trading_date,
            "rbob_usd_gal": latest_rbob,
            "cad_usd_rate": latest_cad,
            "base_cad_liter": base_cad_liter
        }
    except Exception as e:
        raise RuntimeError(f"拉取 yfinance 数据失败: {e}")

def fetch_eub_regulation():
    """解析 NB EUB Excel 获取官方限价 (保持监管锚点)"""
    print("2. 获取 NB EUB 官方限价 (Excel 解析)...")
    df_raw = pd.read_excel(settings.NBEUB_XLS_URL, sheet_name=settings.EXCEL_SHEET_NAME, header=None, engine='xlrd')
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
    # 专家建议：时区处理
    nb_tz = pytz.timezone('America/Moncton')
    now = datetime.now(nb_tz)
    
    # 规则：如果 AST 时间在 18:15 之后，我们认为抓到的是该交易日的最终收盘价 (is_final=1)
    is_final_flag = 1 if now.hour >= 18 else 0

    if not all([CF_ACCOUNT_ID, CF_DATABASE_ID, CF_API_TOKEN]):
        print("❌ 错误: 缺少 Cloudflare 凭证。")
        sys.exit(1)

    try:
        # 1. 采集并同步金融行情
        market = fetch_market_data()
        trading_date_str = market["trading_date"] # 使用真实交易日期
        
        sql_market = """
            INSERT INTO nymex_market_data (trading_date, rbob_usd_gal, cad_usd_rate, base_cad_liter, is_final)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(trading_date) DO UPDATE SET 
            rbob_usd_gal=excluded.rbob_usd_gal,
            cad_usd_rate=excluded.cad_usd_rate,
            base_cad_liter=excluded.base_cad_liter,
            is_final=excluded.is_final;
        """
        push_to_d1(sql_market, [trading_date_str, market["rbob_usd_gal"], market["cad_usd_rate"], market["base_cad_liter"], is_final_flag])
        print(f"✅ 金融行情同步成功: {market['base_cad_liter']} ¢/L ({trading_date_str}, Final={is_final_flag})")

        # 2. 采集并同步 EUB 官方限价
        eub = fetch_eub_regulation()
        eff_date_obj = datetime.strptime(eub["effective_date"], '%Y-%m-%d')
        is_interrupter = 1 if eff_date_obj.weekday() != 4 else 0

        sql_eub = """
            INSERT INTO eub_regulations (effective_date, max_retail_price, actual_pump_price, active_eub_base, rbob_usd_gal, cad_usd_rate, is_interrupter)
            VALUES (?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(effective_date) DO NOTHING;
        """
        push_to_d1(sql_eub, [
            eub["effective_date"], 
            eub["max_retail_price"], 
            eub["max_retail_price"] - 5.5, 
            market["rbob_usd_gal"], 
            market["cad_usd_rate"], 
            is_interrupter
        ])
        print(f"✅ EUB 官方调价快照检查/同步完成: {eub['max_retail_price']} ¢/L ({eub['effective_date']})")

    except Exception as e:
        print(f"❌ 同步失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
