import yfinance as yf
import pandas as pd
import sqlite3
import subprocess
import json
import os
from datetime import datetime, timedelta

# V6.0 配置
COMMODITY_ID = "gasoline"
NYMEX_SYMBOL = "RB=F"
FX_SYMBOL = "CAD=X"  # USD/CAD
DB_NAME = "nb-gas-db"

def get_history():
    print(f"正在从 Yahoo Finance 抓取 {COMMODITY_ID} 历史数据...")
    
    # 1. 抓取 RBOB (美元/加仑)
    rbob = yf.download(NYMEX_SYMBOL, period="2y", interval="1d")
    # 2. 抓取汇率 (USD/CAD)
    fx = yf.download(FX_SYMBOL, period="2y", interval="1d")
    
    # 合并数据
    df = pd.DataFrame()
    df['price_usd_gal'] = rbob['Close']
    df['fx_rate'] = fx['Close']
    df = df.dropna()
    
    # 转换索引为日期字符串
    df.index = df.index.strftime('%Y-%m-%d')
    return df

def generate_sql(df):
    sql_statements = []
    for date, row in df.iterrows():
        # V6.0 插入语句：直接插入事实表
        sql = f"INSERT INTO market_quotes (commodity_id, trading_date, price_usd_gal, fx_rate, status) VALUES ('{COMMODITY_ID}', '{date}', {row['price_usd_gal']:.4f}, {row['fx_rate']:.4f}, 'FINAL');"
        sql_statements.append(sql)
    return sql_statements

def main():
    df = get_history()
    sqls = generate_sql(df)
    
    # 保存到临时文件
    temp_file = "seed_v6_temp.sql"
    with open(temp_file, "w") as f:
        f.write("\n".join(sqls))
    
    print(f"成功生成 {len(sqls)} 条历史记录。正在同步到 D1...")
    
    # 执行同步
    try:
        result = subprocess.run(
            ["npx", "wrangler", "d1", "execute", DB_NAME, "--file", temp_file, "--remote"],
            capture_output=True, text=True, check=True, shell=True, encoding='utf-8'
        )
        print("D1 同步成功！")
        print(result.stdout)
    except subprocess.CalledProcessError as e:
        print("同步失败:", e.stderr)
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    main()
