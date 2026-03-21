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
    all_change_indices = df[df['NB_Delta'] != 0].index.tolist()
    
    results = []

    for i in range(15, len(all_change_indices)):
        target_idx = all_change_indices[i]
        target_date = df.loc[target_idx, 'Date']
        
        # 仅针对常规调价日验证
        if target_date.dayofweek not in [3, 4]: 
            continue

        actual_price = df.loc[target_idx, 'NB_Price']
        prev_price = df.loc[target_idx - 1, 'NB_Price']
        actual_change = actual_price - prev_price
        
        # 基础均值数据 (剔除周末)
        lookback_data = df.loc[target_idx-7 : target_idx-1]
        lookback_trading = lookback_data[lookback_data['Date'].dt.dayofweek < 5]
        curr_rbob_avg = lookback_trading['RBOB_CAD'].mean()
        
        prev_cycle_data = df.loc[target_idx-14 : target_idx-8]
        prev_trading = prev_cycle_data[prev_cycle_data['Date'].dt.dayofweek < 5]
        prev_rbob_avg = prev_trading['RBOB_CAD'].mean()
        
        # --- M7: 现有 V4.0 模型 (固定 Beta 0.48) ---
        pred_m7 = (curr_rbob_avg - prev_rbob_avg) * 1.15 * 0.48

        # --- M13: 物理累加模型 (Bottom-Up) ---
        # 物理组件 (¢/L)
        FIXED_MARGINS = 18.72  # Wholesale + Retail + Delivery
        EXCISE_PROV_TAX = 20.87 # Federal Excise (10) + Provincial (10.87)
        CFR = 5.22
        # 碳税动态逻辑 (2025-04-01 之后设为 0)
        carbon_tax = 17.61 if target_date < pd.Timestamp('2025-04-01') else 0.0
        
        # 期货与现货存在基准差 (Basis)，通过最近 4 周 Spread 均值提取 Basis
        # Basis = Spread_Avg - (Margins + Taxes + CFR)
        recent_spreads = df.iloc[:target_idx][df.iloc[:target_idx]['NB_Delta'] != 0].tail(4)['Spread'].mean()
        basis_adjustment = recent_spreads - (FIXED_MARGINS + EXCISE_PROV_TAX + CFR + carbon_tax)
        
        # 预测价格 = (基准均值 + 组件 + 碳税 + 动态 Basis) * 1.15
        pred_m13_price = (curr_rbob_avg + FIXED_MARGINS + EXCISE_PROV_TAX + CFR + carbon_tax + basis_adjustment) * 1.15
        # 注意：这里计算的是变动
        pred_m13_change = pred_m13_price - (prev_price / 1.15 * 1.15) # 简化逻辑
        # 修正：物理模型直接计算变动
        pred_m13_delta = (pred_m13_price - prev_price) * 0.5 # 依然需要一个平滑系数

        results.append({
            'Date': target_date,
            'Actual': round(actual_change, 1),
            'M7_V4': round(pred_m7, 1),
            'M13_Physical': round(pred_m13_delta, 1)
        })

    rdf = pd.DataFrame(results)
    
    def get_metrics(actual, pred):
        mae = np.mean(np.abs(actual - pred))
        dir_acc = np.mean(np.sign(actual) == np.sign(pred))
        hit_rate = np.mean(np.abs(actual - pred) <= 1.0)
        return {"MAE": mae, "Dir_Acc": dir_acc, "1c_Hit": hit_rate}

    m7_m = get_metrics(rdf['Actual'], rdf['M7_V4'])
    m13_m = get_metrics(rdf['Actual'], rdf['M13_Physical'])

    print("\n" + "="*80)
    print(" NB GAS PRICE ALGORITHM OPTIMIZATION: PHYSICAL MODEL VERIFICATION ")
    print("="*80)
    print(f"Sample Size: {len(rdf)} test cases")
    print("-" * 80)
    print(f"{'Metric':<15} | {'M7 (Beta 0.48)':<20} | {'M13 (Physical)':<20}")
    print("-" * 80)
    for k in m7_m.keys():
        row = f"{k:<15} | "
        for m in [m7_m, m13_m]:
            val = f"{m[k]:.2f}" if "MAE" in k else f"{m[k]*100:.1f}%"
            row += f"{val:<20} | "
        print(row)
    
    print("-" * 80)
    print("\nObservation: M13 attempts to account for Carbon Tax shifts and Basis.")
    print("="*80)

if __name__ == "__main__":
    run_backtest()
