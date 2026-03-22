import os
import requests
import pandas as pd
import yfinance as yf

CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def seed_history():
    print("正在从 yfinance 获取历史压舱石数据 (过去 730 天)...")
    # 获取历史 RBOB 和 汇率 (2y 代表 2 年)
    rbob = yf.download("RB=F", period="2y")['Close']
    cad = yf.download("USDCAD=X", period="2y")['Close']
    
    # 合并数据
    df = pd.merge(rbob, cad, left_index=True, right_index=True)
    df.columns = ['rbob', 'cad']
    
    statements = []
    for date, row in df.iterrows():
        d_str = date.strftime('%Y-%m-%d')
        base_cad_liter = round((row['rbob'] * row['cad']) / 3.7854 * 100, 2)
        
        sql = f"INSERT OR REPLACE INTO nymex_market_data (trading_date, rbob_usd_gal, cad_usd_rate, base_cad_liter) VALUES ('{d_str}', {row['rbob']}, {row['cad']}, {base_cad_liter});"
        statements.append(sql)

    # 构造批量请求
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}
    
    # 拼接成一个大的 SQL 块
    full_sql = "\n".join(statements)
    response = requests.post(url, headers=headers, json={"sql": full_sql})
    
    if response.ok:
        print(f"✅ 成功补录 {len(statements)} 条历史行情数据！")
    else:
        print(f"❌ 补录失败: {response.text}")

if __name__ == "__main__":
    seed_history()
