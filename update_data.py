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
        # [修复点 1] 增加 format='mixed' 消除警告
        df_nb_official['Date'] = pd.to_datetime(df_nb_official['Date'], errors='coerce', format='mixed')
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
        # 计算单日变动，仅用于标记红点与定位 Effective Date
        df_final['NB_Is_Changed'] = df_final['NB_Price'].diff().fillna(0) != 0
        
        df_final = df_final[df_final['Date'] >= (today - pd.Timedelta(days=settings.ROLLING_WINDOW_DAYS))]
        df_final = df_final.reset_index(drop=True)
        latest = df_final.iloc[-1]

        # ---------------------------------------------------------
        # 重构核心：基于 EUB 第一性原理的动态差值预测模型
        # ---------------------------------------------------------
        
        # 提取历史利差数据（保留此计算仅为防止前端 UI 缺少参数报错，不再用于预测）
        change_days_for_median = df_final[df_final['NB_Is_Changed']].tail(8)
        median_historical_spread = change_days_for_median['Spread'].median() if not change_days_for_median.empty else latest['Spread']
        spread_vs_median = latest['Spread'] - median_historical_spread
        spread_series = df_final['Spread'].dropna()
        percentile = (spread_series < latest['Spread']).mean() * 100 if not spread_series.empty else 50.0

        # A. 创建纯交易日索引用于计算绝对均值 (剔除周末填补带来的污染)
        df_trading = df_final[df_final['Date'].dt.dayofweek < 5].copy()
        df_trading.set_index('Date', inplace=True)

        # B. 定位当前价格的“绝对基石”与生效日
        change_events = df_final[df_final['NB_Is_Changed'] == True]
        if not change_events.empty:
            effective_date = change_events.iloc[-1]['Date']
            current_nb_price = change_events.iloc[-1]['NB_Price']
        else:
            effective_date = today
            current_nb_price = latest['NB_Price']

        # C. 锁定基准时间窗口 (Base Window) 均值
        if effective_date.dayofweek == 3: 
            # 常规周四调价：基准为上周三(T-8)至本周二(T-2)
            base_start = effective_date - pd.Timedelta(days=8)
            base_end = effective_date - pd.Timedelta(days=2)
            base_window = df_trading.loc[base_start:base_end]
        else:
            # 熔断日调价 (Interrupter)：严格取生效日前最近的 3 个交易日
            past_trading_days = df_trading.loc[:effective_date - pd.Timedelta(days=1)]
            base_window = past_trading_days.tail(3)
            
        avg_base = base_window['RBOB_CAD_Cents_Liter'].mean() if not base_window.empty else latest['RBOB_CAD_Cents_Liter']

        # D. 锁定新时间窗口 (New Window) 均值，预测下一个周四
        days_ahead = 3 - today.dayofweek
        if days_ahead <= 0:
            days_ahead += 7 # 寻找下一个周四
        next_thursday = today + pd.Timedelta(days=days_ahead)
        
        new_start = next_thursday - pd.Timedelta(days=8)
        new_end = next_thursday - pd.Timedelta(days=2)
        new_window = df_trading.loc[new_start:new_end]
        
        avg_new = new_window['RBOB_CAD_Cents_Liter'].mean() if not new_window.empty else latest['RBOB_CAD_Cents_Liter']

        # E. 计算纯净 Delta 并叠加 15% HST
        delta_raw = avg_new - avg_base
        delta_with_hst = delta_raw * 1.15

        # F. 计算中断条款风险 (Interrupter Clause Risk)
        # 熔断通常在基准原价偏离超过 6 分时触发，我们测量当前日收盘价与基准均值的偏离度
        accumulated_change = latest['RBOB_CAD_Cents_Liter'] - avg_base
        interrupter_risk = abs(accumulated_change) >= 6.0 

        # 用于回溯显示的过往真实 Delta
        if len(change_events) >= 1:
            last_change_val = change_events['NB_Price'].iloc[-1]
            if latest['NB_Is_Changed'] and len(change_events) >= 2:
                prev_change_val = change_events['NB_Price'].iloc[-2]
            else:
                last_event_idx = change_events.index[-1]
                prev_change_val = df_final.loc[last_event_idx - 1, 'NB_Price'] if last_event_idx > 0 else last_change_val
            real_nb_delta = latest['NB_Price'] - prev_change_val
        else:
            real_nb_delta = 0.0

        print("4. 构建输出并保存...")
        ast_now_str = nb_now.strftime('%Y-%m-%d %H:%M:%S AST')
        
        output_data = {
            "metadata": {
                "last_sync": ast_now_str,
                # [修复点 2] 从 'Date' 列改为 index，因为上面 set_index('Date') 了
                "nb_last_date": df_nb_official.index.max().strftime('%Y-%m-%d'),
                "current_nb_price": float(latest['NB_Price']),
                "nb_delta": float(real_nb_delta), 
                "current_nymex_price": float(latest['RBOB_CAD_Cents_Liter']),
                "nymex_delta": float(real_nymex_delta),
                "current_spread": float(latest['Spread']),
                "spread_vs_avg": float(round(spread_vs_median, 1)),
                "spread_percentile": float(round(percentile, 1)),
                "prediction": { 
                    "change": round(delta_with_hst, 1), 
                    "direction": "up" if delta_with_hst > 0.1 else "down" if delta_with_hst < -0.1 else "stable",
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
        print(f"更新成功。预测下周油价变动: {delta_with_hst:+.1f}¢")

    except Exception as e:
        print(f"❌ 关键错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    update_gas_data()