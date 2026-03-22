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
        # [时区锁定] 确保以 NB 当地时间为准
        nb_now = pd.Timestamp.now(tz='America/Moncton')
        today = nb_now.normalize().tz_localize(None)
        print(f"Current NB Date: {today.strftime('%Y-%m-%d')}")

        print("1. 获取 NB 历史油价 (动态解析)...")
        df_raw = pd.read_excel(settings.NBEUB_XLS_URL, sheet_name=settings.EXCEL_SHEET_NAME, header=None, engine='xlrd')
        
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
        
        # 捕捉所有变动点
        df_nb_official = df_nb_official.dropna().sort_values('Date').reset_index(drop=True)
        df_nb_official = df_nb_official[df_nb_official['Date'] <= today]
        
        print("2. 执行增量合并与时间轴填充...")
        df_old = get_existing_data()
        
        df_nb_official.set_index('Date', inplace=True)
        full_range = pd.date_range(start=df_nb_official.index.min(), end=today, freq='D')
        df_nb_ext = df_nb_official.reindex(full_range).ffill()
        df_nb_ext.index.name = 'Date'
        df_nb_ext = df_nb_ext.reset_index()

        print("3. 获取金融数据 (增量抓取)...")
        fetch_start = (today - pd.Timedelta(days=settings.INCREMENTAL_FETCH_DAYS)).strftime('%Y-%m-%d')
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
        df_final = df_final[df_final['Date'] <= today]
        df_final['RBOB_CAD_Cents_Liter'] = df_final['RBOB_CAD_Cents_Liter'].ffill().bfill().round(1)
        
        df_final['Spread'] = (df_final['NB_Price'] - df_final['RBOB_CAD_Cents_Liter']).round(1)
        # 计算单日变动，仅用于标记红点
        df_final['NB_Is_Changed'] = df_final['NB_Price'].diff().fillna(0) != 0
        
        df_final = df_final[df_final['Date'] >= (today - pd.Timedelta(days=settings.ROLLING_WINDOW_DAYS))]
        latest = df_final.iloc[-1]

        # [核心修复 1] 改进 NB Delta 逻辑：计算当前价格与上一个调价日价格的差值
        change_events = df_final[df_final['NB_Is_Changed'] == True]
        if len(change_events) >= 1:
            last_change_val = change_events['NB_Price'].iloc[-1]
            # 如果今天正好是调价日，我们需要找“上一个”变动日的价格
            if latest['NB_Is_Changed'] and len(change_events) >= 2:
                prev_change_val = change_events['NB_Price'].iloc[-2]
            else:
                # 否则说明今天在延续之前的价格，我们需要对比变动发生前的那个价格
                # 逻辑：找到最后一个变动点，它的前一行就是旧价格
                last_event_idx = change_events.index[-1]
                prev_change_val = df_final.loc[last_event_idx - 1, 'NB_Price'] if last_event_idx > 0 else last_change_val
            
            real_nb_delta = latest['NB_Price'] - prev_change_val
        else:
            real_nb_delta = 0.0

        # P2-Core: 升级版预测模型 (Beta 0.48)
        change_days_for_median = df_final[df_final['NB_Is_Changed']].tail(8)
        median_historical_spread = change_days_for_median['Spread'].median() if not change_days_for_median.empty else latest['Spread']
        
        last_wed = today - pd.Timedelta(days=(today.weekday() - 2) % 7)
        curr_cycle_trading = df_final[(df_final['Date'] >= last_wed) & (df_final['Date'].dt.dayofweek < 5)]
        curr_avg = curr_cycle_trading['RBOB_CAD_Cents_Liter'].mean() if not curr_cycle_trading.empty else latest['RBOB_CAD_Cents_Liter']
        
        BETA = 0.48
        predicted_nb_price = curr_avg + median_historical_spread
        calibrated_change = (predicted_nb_price - latest['NB_Price']) * BETA
        
        # [新逻辑] 计算中断条款风险 (Interrupter Clause Risk)
        # 找到上一个正式调价日的基数
        last_adj_events = df_final[df_final['NB_Is_Changed']]
        if not last_adj_events.empty:
            last_base_rbob = last_adj_events.iloc[-1]['RBOB_CAD_Cents_Liter']
            accumulated_change = latest['RBOB_CAD_Cents_Liter'] - last_base_rbob
        else:
            accumulated_change = 0.0
        
        interrupter_risk = abs(accumulated_change) >= 5.5
        
        spread_vs_median = latest['Spread'] - median_historical_spread
        spread_series = df_final['Spread'].dropna()
        percentile = (spread_series < latest['Spread']).mean() * 100 if not spread_series.empty else 50.0

        print("4. 构建输出并保存...")
        ast_now_str = nb_now.strftime('%Y-%m-%d %H:%M:%S AST')
        
        output_data = {
            "metadata": {
                "last_sync": ast_now_str,
                "nb_last_date": df_nb_official.index.max().strftime('%Y-%m-%d'),
                "current_nb_price": float(latest['NB_Price']),
                "nb_delta": float(real_nb_delta), 
                "current_nymex_price": float(latest['RBOB_CAD_Cents_Liter']),
                "nymex_delta": real_nymex_delta,
                "current_spread": float(latest['Spread']),
                "spread_vs_avg": round(spread_vs_median, 1),
                "spread_percentile": round(percentile, 1),
                "prediction": { 
                    "change": round(calibrated_change, 1), 
                    "direction": "up" if calibrated_change > 0.5 else "down" if calibrated_change < -0.5 else "stable",
                    "interrupter_risk": bool(interrupter_risk),
                    "accumulated_change": round(float(accumulated_change), 1)
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
        print(f"更新成功。NB Delta: {real_nb_delta:+.1f}¢")

    except Exception as e:
        print(f"❌ 关键错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    update_gas_data()
