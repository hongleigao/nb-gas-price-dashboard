import pandas as pd
import yfinance as yf
import json
import os

def update_gas_data():
    print("1. 获取 NB 历史油价...")
    url = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
    df_raw = pd.read_excel(url, sheet_name="Current", header=None)
    
    dates_raw = df_raw.iloc[2].values
    prices_raw = df_raw.iloc[7].values
    
    df_nb = pd.DataFrame({'Date': dates_raw, 'NB_Price': prices_raw})
    df_nb['Date'] = pd.to_datetime(df_nb['Date'], errors='coerce')
    df_nb['NB_Price'] = pd.to_numeric(df_nb['NB_Price'], errors='coerce')
    df_nb = df_nb.dropna(subset=['Date', 'NB_Price']).sort_values('Date').reset_index(drop=True)
    
    print("2. 扩展时间轴并填充...")
    df_nb.set_index('Date', inplace=True)
    full_date_range = pd.date_range(start=df_nb.index.min(), end=df_nb.index.max(), freq='D')
    df_nb_ext = df_nb.reindex(full_date_range)
    df_nb_ext['NB_Price'] = df_nb_ext['NB_Price'].ffill()
    df_nb_ext.index.name = 'Date'
    df_nb_ext.reset_index(inplace=True)
    
    print("3. 获取金融数据并对齐...")
    start_date = df_nb_ext['Date'].min().strftime('%Y-%m-%d')
    end_date = (df_nb_ext['Date'].max() + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
    
    rbob = yf.download('RB=F', start=start_date, end=end_date)['Close']
    if isinstance(rbob, pd.DataFrame): rbob = rbob.squeeze()
    rbob = rbob.reset_index()
    rbob.columns = ['Date', 'RBOB_USD_Gallon']
    rbob['Date'] = pd.to_datetime(rbob['Date']).dt.tz_localize(None)
    
    cad = yf.download('CAD=X', start=start_date, end=end_date)['Close']
    if isinstance(cad, pd.DataFrame): cad = cad.squeeze()
    cad = cad.reset_index()
    cad.columns = ['Date', 'USD_CAD_Rate']
    cad['Date'] = pd.to_datetime(cad['Date']).dt.tz_localize(None)
    
    df_final = pd.merge(df_nb_ext, rbob, on='Date', how='left')
    df_final = pd.merge(df_final, cad, on='Date', how='left')
    
    df_final['RBOB_USD_Gallon'] = df_final['RBOB_USD_Gallon'].ffill().bfill()
    df_final['USD_CAD_Rate'] = df_final['USD_CAD_Rate'].ffill().bfill()
    
    df_final['RBOB_CAD_Cents_Liter'] = (df_final['RBOB_USD_Gallon'] * df_final['USD_CAD_Rate'] / 3.78541) * 100
    df_final['RBOB_CAD_Cents_Liter'] = df_final['RBOB_CAD_Cents_Liter'].round(1)
    
    print("4. 生成 JSON 格式文件...")
    # 将 DataFrame 转换为 ECharts 需要的三组 Array
    output_data = {
        "dates": df_final['Date'].dt.strftime('%Y-%m-%d').tolist(),
        "nb_prices": df_final['NB_Price'].tolist(),
        "nymex_prices": df_final['RBOB_CAD_Cents_Liter'].tolist()
    }
    
    with open('data.json', 'w') as f:
        json.dump(output_data, f)
    
    print("更新完成，已生成 data.json")

if __name__ == "__main__":
    update_gas_data()
