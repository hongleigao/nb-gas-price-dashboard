import os
import requests
import pandas as pd
import settings

CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_DATABASE_ID = os.environ.get('CLOUDFLARE_DATABASE_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def seed_eub_history():
    print(f"正在从 NB EUB 官方 Excel 获取全量历史监管数据...")
    print(f"源地址: {settings.NBEUB_XLS_URL}")
    
    try:
        # 读取 Excel (xlrd 引擎处理旧版 xls)
        df_raw = pd.read_excel(settings.NBEUB_XLS_URL, sheet_name=settings.EXCEL_SHEET_NAME, header=None, engine='xlrd')
        
        # 动态定位日期和价格行
        try:
            date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
            price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
        except:
            print("❌ 无法定位数据行关键词，使用默认索引 (2, 7)")
            date_row_idx, price_row_idx = 2, 7
            
        dates_raw = df_raw.iloc[date_row_idx].values
        prices_raw = df_raw.iloc[price_row_idx].values
        
        # 清洗数据
        df = pd.DataFrame({'Date': dates_raw, 'Max_Price': prices_raw})
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce', format='mixed')
        df['Max_Price'] = pd.to_numeric(df['Max_Price'], errors='coerce')
        df = df.dropna().sort_values('Date')
        
        print(f"成功解析 {len(df)} 条历史调价记录。")

        statements = []
        for _, row in df.iterrows():
            d_str = row['Date'].strftime('%Y-%m-%d')
            max_p = float(row['Max_Price'])
            pump_p = round(max_p - 5.5, 1)
            
            # 专家建议的 Active Base 逻辑：初始设为 0，由 Worker 实时计算。
            # 这里我们使用 INSERT OR IGNORE 防止重复
            sql = f"INSERT OR IGNORE INTO eub_regulations (effective_date, max_retail_price, actual_pump_price, active_eub_base, is_interrupter) VALUES ('{d_str}', {max_p}, {pump_p}, 0, 0);"
            statements.append(sql)

        # 分批处理防止 API 载荷过大 (每批 50 条)
        chunk_size = 50
        url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
        headers = {"Authorization": f"Bearer {CF_API_TOKEN}", "Content-Type": "application/json"}

        success_count = 0
        for i in range(0, len(statements), chunk_size):
            chunk = statements[i:i + chunk_size]
            full_sql = "\n".join(chunk)
            response = requests.post(url, headers=headers, json={"sql": full_sql})
            if response.ok:
                success_count += len(chunk)
                print(f"已同步: {success_count}/{len(statements)}...")
            else:
                print(f"❌ 批量同步失败: {response.text}")

        print(f"✅ 全量历史监管数据补录完成！总计: {success_count} 条。")

    except Exception as e:
        print(f"❌ 解析失败: {e}")

if __name__ == "__main__":
    seed_eub_history()
