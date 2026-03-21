import pandas as pd
import yfinance as yf
import json
import os
import sys
import settings  # 引入配置文件

def validate_data(output_data):
    """验证生成的 JSON 数据是否合法"""
    print("5. 运行数据完整性校验...")
    required_keys = ["metadata", "dates", "nb_prices", "nymex_prices", "spreads"]
    for key in required_keys:
        if key not in output_data:
            raise ValueError(f"校验失败: 缺少必要字段 '{key}'")

    lengths = [len(output_data["dates"]), len(output_data["nb_prices"]), 
               len(output_data["nymex_prices"]), len(output_data["spreads"])]
    if len(set(lengths)) > 1:
        raise ValueError(f"校验失败: 数据序列长度不一致 {lengths}")

    meta = output_data["metadata"]
    critical_values = [meta["current_nb_price"], meta["current_nymex_price"], meta["current_spread"]]
    if any(pd.isna(v) or v is None for v in critical_values):
        raise ValueError(f"校验失败: 检测到关键价格指标为 NaN 或 None")

    if os.path.exists(settings.DATA_FILE):
        with open(settings.DATA_FILE, 'r') as f:
            old_data = json.load(f)
            if len(output_data["dates"]) < len(old_data["dates"]) * 0.8:
                raise ValueError("校验失败: 新生成的数据量较旧数据异常缩水超过 20%")
    print("✅ 数据校验通过")

def get_existing_data():
    """读取现有 data.json 并返回 DataFrame 字典"""
    if os.path.exists(settings.DATA_FILE):
        try:
            with open(settings.DATA_FILE, 'r') as f:
                data = json.load(f)
                df = pd.DataFrame({
                    'Date': pd.to_datetime(data['dates']),
                    'NB_Price': data['nb_prices'],
                    'RBOB_CAD_Cents_Liter': data['nymex_prices']
                })
                return df
        except Exception as e:
            print(f"读取旧数据失败 ({e})，将执行全量抓取。")
    return None

def update_gas_data():
    try:
        # [核心修复 1] 强制锁定 NB 当地今天，防止 UTC 导致日期超前
        # NB 通常使用 America/Moncton 或 America/Halifax 时区
        nb_now = pd.Timestamp.now(tz='America/Moncton')
        today = nb_now.normalize().tz_localize(None)
        print(f"Current NB Date: {today.strftime('%Y-%m-%d')}")

        print("1. 获取 NB 历史油价 (动态解析)...")
        df_raw = pd.read_excel(settings.NBEUB_XLS_URL, sheet_name=settings.EXCEL_SHEET_NAME, header=None)
        
        try:
            date_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_DATE, case=False).any(), axis=1)].index[0]
            price_row_idx = df_raw[df_raw.apply(lambda x: x.astype(str).str.contains(settings.ROW_KEYWORD_PRICE, case=False).any(), axis=1)].index[0]
        except Exception as e:
            print(f"动态解析失败 ({e})，回退到默认索引...")
            date_row_idx, price_row_idx = 2, 7
        
        dates_raw = df_raw.iloc[date_row_idx].values
        prices_raw = df_raw.iloc[price_row_idx].values
        
        df_nb_official = pd.DataFrame({'Date': dates_raw, 'NB_Price': prices_raw})
        df_nb_official['Date'] = pd.to_datetime(df_nb_official['Date'], errors='coerce')
        df_nb_official['NB_Price'] = pd.to_numeric(df_nb_official['NB_Price'], errors='coerce')
        
        # 移除空值并排序
        df_nb_official = df_nb_official.dropna().sort_values('Date').reset_index(drop=True)
        # [核心修复 2] 严格过滤掉任何未来的 NB 官方日期（防止 Excel 里的 typo 或占位符）
        df_nb_official = df_nb_official[df_nb_official['Date'] <= today]
        
        print("2. 执行增量合并与时间轴填充...")
        df_old = get_existing_data()
        
        df_nb_official.set_index('Date', inplace=True)
        # 确保时间轴停止在 NB 当地今天
        full_range = pd.date_range(start=df_nb_official.index.min(), end=today, freq='D')
        df_nb_ext = df_nb_official.reindex(full_range).ffill()
        df_nb_ext.index.name = 'Date'
        df_nb_ext = df_nb_ext.reset_index()

        print("3. 获取金融数据 (增量抓取)...")
        fetch_start = (today - pd.Timedelta(days=settings.INCREMENTAL_FETCH_DAYS)).strftime('%Y-%m-%d')
        # YFinance 的 end 是 exclusive，所以使用 today + 1 是为了抓到 today 的收盘价
        yf_end = (today + pd.Timedelta(days=1)).strftime('%Y-%m-%d')
        
        rbob = yf.download(settings.TICKER_RBOB, start=fetch_start, end=yf_end)['Close']
        if isinstance(rbob, pd.DataFrame): rbob = rbob.squeeze()
        rbob = rbob.reset_index()
        rbob.columns = ['Date', 'RBOB_USD_G']
        rbob['Date'] = pd.to_datetime(rbob['Date']).dt.tz_localize(None)
        
        cad = yf.download(settings.TICKER_CAD, start=fetch_start, end=yf_end)['Close']
        if isinstance(cad, pd.DataFrame): cad = cad.squeeze()
        cad = cad.reset_index()
        cad.columns = ['Date', 'CAD_Rate']
        cad['Date'] = pd.to_datetime(cad['Date']).dt.tz_localize(None)
        
        df_new_finance = pd.merge(rbob, cad, on='Date', how='inner')
        # 仅保留交易日计算均值和 Delta
        df_trading_days = df_new_finance[df_new_finance['Date'].dt.dayofweek < 5].copy()
        df_trading_days['RBOB_CAD_Cents_Liter'] = (df_trading_days['RBOB_USD_G'] * df_trading_days['CAD_Rate'] / settings.GALLON_TO_LITER) * 100
        
        real_nymex_delta = float(df_trading_days['RBOB_CAD_Cents_Liter'].diff().round(1).iloc[-1]) if len(df_trading_days) > 1 else 0.0
        
        df_finance_to_merge = df_trading_days[['Date', 'RBOB_CAD_Cents_Liter']]

        if df_old is not None:
            df_old_limited = df_old[df_old['Date'] < pd.to_datetime(fetch_start)]
            df_finance_combined = pd.concat([df_old_limited[['Date', 'RBOB_CAD_Cents_Liter']], df_finance_to_merge]).drop_duplicates('Date')
        else:
            df_finance_combined = df_finance_to_merge 

        df_final = pd.merge(df_nb_ext, df_finance_combined, on='Date', how='left')
        # [核心修复 3] 严格过滤，确保最终合并后的数据不会超过 NB 当地今天
        df_final = df_final[df_final['Date'] <= today]
        df_final['RBOB_CAD_Cents_Liter'] = df_final['RBOB_CAD_Cents_Liter'].ffill().bfill().round(1)
        
        df_final['Spread'] = (df_final['NB_Price'] - df_final['RBOB_CAD_Cents_Liter']).round(1)
        df_final['NB_Delta'] = df_final['NB_Price'].diff().round(1).fillna(0)
        
        df_final = df_final[df_final['Date'] >= (today - pd.Timedelta(days=settings.ROLLING_WINDOW_DAYS))]
        latest = df_final.iloc[-1]

        # P2-Core: 升级版预测模型 (Beta 0.48)
        change_days = df_final[df_final['NB_Delta'] != 0].tail(4)
        avg_historical_spread = change_days['Spread'].mean() if not change_days.empty else latest['Spread']
        
        last_wed = today - pd.Timedelta(days=(today.weekday() - 2) % 7)
        curr_cycle_trading = df_final[(df_final['Date'] >= last_wed) & (df_final['Date'].dt.dayofweek < 5)]
        curr_avg = curr_cycle_trading['RBOB_CAD_Cents_Liter'].mean() if not curr_cycle_trading.empty else latest['RBOB_CAD_Cents_Liter']
        
        BETA = 0.48
        raw_pred_change = (curr_avg + avg_historical_spread) - latest['NB_Price']
        calibrated_change = raw_pred_change * BETA
        
        spread_vs_avg = latest['Spread'] - avg_historical_spread
        spread_series = df_final['Spread'].dropna()
        percentile = (spread_series < latest['Spread']).mean() * 100 if not spread_series.empty else 50.0

        print("4. 构建输出并保存...")
        # 统一使用 AST 时间戳
        ast_now_str = nb_now.strftime('%Y-%m-%d %H:%M:%S AST')
        
        output_data = {
            "metadata": {
                "last_sync": ast_now_str,
                "nb_last_date": df_nb_official.index.max().strftime('%Y-%m-%d'),
                "current_nb_price": float(latest['NB_Price']),
                "nb_delta": float(latest['NB_Delta']),
                "current_nymex_price": float(latest['RBOB_CAD_Cents_Liter']),
                "nymex_delta": real_nymex_delta,
                "current_spread": float(latest['Spread']),
                "spread_vs_avg": round(spread_vs_avg, 1),
                "spread_percentile": round(percentile, 1),
                "prediction": { 
                    "change": round(calibrated_change, 1), 
                    "direction": "up" if calibrated_change > 0.5 else "down" if calibrated_change < -0.5 else "stable" 
                }
            },
            "dates": df_final['Date'].dt.strftime('%Y-%m-%d').tolist(),
            "nb_prices": df_final['NB_Price'].tolist(),
            "nymex_prices": df_final['RBOB_CAD_Cents_Liter'].tolist(),
            "spreads": df_final['Spread'].tolist()
        }
        
        validate_data(output_data)
        with open(settings.DATA_FILE, 'w') as f:
            json.dump(output_data, f)
        print(f"更新成功。Today was: {today.strftime('%Y-%m-%d')}")

    except Exception as e:
        print(f"❌ 关键错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_gas_data()
