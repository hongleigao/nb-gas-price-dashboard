import pandas as pd
import json
import numpy as np
import os

def run_backtest():
    if not os.path.exists('data.json'):
        print("Error: data.json not found.")
        return

    with open('data.json', 'r') as f:
        data = json.load(f)
    
    df = pd.DataFrame({
        'Date': pd.to_datetime(data['dates']),
        'NB_Price': data['nb_prices'],
        'RBOB_CAD': data['nymex_prices'],
        'Spread': data['spreads']
    })
    
    df['NB_Delta'] = df['NB_Price'].diff()
    # 找到所有的价格变动日
    all_change_indices = df[df['NB_Delta'] != 0].index.tolist()
    
    results = []

    for i in range(10, len(all_change_indices)):
        target_idx = all_change_indices[i]
        target_date = df.loc[target_idx, 'Date']
        
        # [优化过滤逻辑] 
        # NB 的调价点在数据中通常体现为周五（4）或周四（3）
        # 排除掉周六、周日和周一这种极大概率是 Interruptor Clause 的异常变动点
        if target_date.dayofweek not in [3, 4]: 
            continue

        actual_price = df.loc[target_idx, 'NB_Price']
        prev_price = df.loc[target_idx - 1, 'NB_Price']
        actual_change = actual_price - prev_price
        
        # 模拟“预测时刻”的数据状态（取调价前 7 天的交易日均值）
        lookback_window = df.loc[target_idx-7 : target_idx-1]
        lookback_trading = lookback_window[lookback_window['Date'].dt.dayofweek < 5]
        curr_rbob_avg = lookback_trading['RBOB_CAD'].mean()
        
        prev_window = df.loc[target_idx-14 : target_idx-8]
        prev_trading = prev_window[prev_window['Date'].dt.dayofweek < 5]
        prev_rbob_avg = prev_trading['RBOB_CAD'].mean()
        
        # --- M2: 原始周期增量 (100% 传导) ---
        pred_m2_change = (curr_rbob_avg - prev_rbob_avg) * 1.15

        # --- M7: 灵敏度校准模型 (Beta = 0.52) ---
        BETA = 0.52 
        pred_m7_change = (curr_rbob_avg - prev_rbob_avg) * BETA * 1.15
        
        results.append({
            'Date': target_date,
            'Day': target_date.strftime('%a'),
            'Actual': round(actual_change, 1),
            'M2_Pred': round(pred_m2_change, 1),
            'M7_Pred': round(pred_m7_change, 1)
        })

    rdf = pd.DataFrame(results)
    
    if rdf.empty:
        print("Error: No matching Thursday/Friday adjustments found in history.")
        return

    def get_metrics(actual, pred):
        mae = np.mean(np.abs(actual - pred))
        dir_acc = np.mean(np.sign(actual) == np.sign(pred))
        hit_rate = np.mean(np.abs(actual - pred) <= 1.5)
        return {"MAE": mae, "Direction Acc": dir_acc, "1.5c Hit": hit_rate}

    m2 = get_metrics(rdf['Actual'], rdf['M2_Pred'])
    m7 = get_metrics(rdf['Actual'], rdf['M7_Pred'])

    print("\n" + "="*70)
    print(" NB GAS PRICE BACKTEST: REGULAR WEEKLY ADJUSTMENTS (THU/FRI) ")
    print("="*70)
    print(f"Sample Size: {len(rdf)} Weekly Adjustments")
    print("-" * 70)
    print(f"{'Metric':<20} | {'M2 (Raw Delta)':<15} | {'M7 (Beta 0.52)':<15}")
    print("-" * 70)
    for k in m2.keys():
        row = f"{k:<20} | "
        for m in [m2, m7]:
            val = f"{m[k]:.2f}" if "MAE" in k else f"{m[k]*100:.1f}%"
            row += f"{val:<15} | "
        print(row)
    
    print("-" * 70)
    print("\nLast 10 Weekly Adjustments Details:")
    print(rdf.tail(10).to_string(index=False))
    print("="*70)

if __name__ == "__main__":
    run_backtest()
