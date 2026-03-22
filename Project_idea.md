# NB Gas Price Pulse - 核心设计与算法白皮书 (V4.8)

本项目是一个集成自动化 ETL、金融建模、调价预测及多端 PWA 可视化于一体的专业监控平台。

---

## 1. 架构设计 (System Architecture)

项目采用 **轻量化 Serverless 思想**，通过 GitHub Actions 定时触发 Python 脚本进行数据处理，并将静态 JSON 结果推送到 GitHub Pages。

### 1.1 数据流转
1.  **数据采集 (E)**: 
    *   从 NB EUB 官网抓取历史油价 Excel。
    *   通过 `yfinance` 获取 NYMEX RBOB 期货与 CAD 汇率。
2.  **数据清洗与建模 (T)**: 
    *   动态解析 Excel (通过关键词定位)。
    *   执行增量合并，确保 730 天历史记录完整。
    *   运行 **M7 统计校准模型**。
3.  **结果输出 (L)**: 
    *   生成 `data.json`，包含元数据、时间轴价格及价差。

---

## 2. 核心逻辑与接口 (Core Logic & Interfaces)

### 2.1 预测引擎 (M7 - Beta Calibrated Model)
*   **输入参数**:
    *   `Curr_Avg`: 本周三至今的 RBOB (CAD ¢/L) 均值。
    *   `Median_Spread_8W`: 过去 8 周调价日的价差中位数。
*   **计算公式**:
    *   `Predicted_Price = Curr_Avg + Median_Spread_8W`
    *   `Calibrated_Change = (Predicted_Price - Last_NB_Price) * 0.48` (平滑系数 Beta=0.48)。
*   **判断逻辑**:
    *   若 `Calibrated_Change > 0.5`: 方向为 `up` (建议 Buy)。
    *   若 `Calibrated_Change < -0.5`: 方向为 `down` (建议 Wait)。
    *   否则: 状态为 `stable`。

### 2.2 政策哨兵：中断条款 (Interrupter Clause)
*   **触发监测**: 计算当前 RBOB 价格与上一个官方调价日基准价格的差值。
*   **逻辑判定**: `abs(accumulated_change) >= 5.5¢`。
*   **接口输出**: `interrupter_risk: true`。

### 2.3 零售效率评价 (Retail Efficiency)
*   **Spread 计算**: `Current_NB - Current_RBOB`。
*   **百分位映射**: 将当前 Spread 与过去 2 年所有记录对比，计算 `Percentile`。百分位越低，说明当前零售利润被压缩得越厉害（对消费者越有利）。

---

## 3. 实现细节 (Implementation Details)

### 3.1 后端 ETL (`update_data.py`)
*   **时区锁定**: 使用 `pytz` 强制锁定 `America/Moncton`，防止服务器 UTC 时间导致的日期偏移。
*   **动态解析**: 搜索 Excel 中的 "Date" 和 "Regular Unleaded" 关键词，自适应政府报表格式的微调。
*   **增量合并**: 优先读取旧的 `data.json` 并只补充缺失日期，减少 API 调用。

### 3.2 前端展示 (`index.html`)
*   **Visual Thesis**: Precision & Calm (精准且冷静)。
*   **材质**: Glassmorphism (磨砂玻璃) + Dot Matrix (背景点阵)。
*   **交互**: 
    *   `animateValue`: 实现数值从 0 到目标值的平滑滚动。
    *   `ECharts`: 绘制三线合一图表（NB Price, NYMEX, Spread）。
*   **响应式决策**: 前端根据 `interrupter_risk` 状态实时切换 Hero Banner 样式（红色警示或决策勋章）。

---

## 4. 关键指标 (KPIs)
*   **MAE**: 1.63¢ (平均绝对误差)。
*   **方向准确率**: 78.7% (回测结果)。
*   **1c_Hit**: 40.4% (误差小于 1¢ 的概率)。

---
*Documented by Gemini CLI - 2026-03-22*
