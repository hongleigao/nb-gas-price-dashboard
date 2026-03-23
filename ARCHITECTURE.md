# System Architecture: NB Gas Price Pulse (V5.1)
# 系统架构说明书：NB 油价脉搏 (V5.1)

This document details the "First Principles" architecture of the NB Gas Pulse system.
本文档详细介绍了 NB Gas Pulse 系统的“第一性原理”架构设计。

---

## 1. Design Philosophy / 设计哲学
The system is built on the principle of **Logic-Data Decoupling**.
系统基于**“逻辑与数据解耦”**的原则构建。

*   **Data Ingestion (数据摄取)**: Passive and scheduled (GitHub Actions).
    被动且定时的（通过 GitHub Actions 实现）。
*   **Storage (数据存储)**: Persistent and distributed (Cloudflare D1).
    持久化且分布式的（通过 Cloudflare D1 实现）。
*   **Computation (逻辑计算)**: Active and on-demand (Cloudflare Workers).
    主动且按需的（通过 Cloudflare Workers 实现）。
*   **Presentation (前端展示)**: Progressive and decision-oriented (GitHub Pages).
    渐进式且以决策为导向的（通过 GitHub Pages 实现）。

---

## 2. Data Flow & Components / 数据流与组件

### 2.1 The Pusher / 数据搬运工 (GitHub Actions & Python)
*   **Role (角色)**: Daily ETL (Extract, Transform, Load). / 每日数据的抽取、转换与加载。
*   **Logic (逻辑)**:
    *   Fetches financial benchmarks (NYMEX RB=F, USDCAD=X) via `yfinance`.
        通过 `yfinance` 抓取金融基准指标（NYMEX RBOB 汽油期货与 USDCAD 汇率）。
    *   Parses regulatory snapshots from NB EUB Excel reports.
        解析 NB EUB 官网的 Excel 报告，获取监管价格快照。
    *   Pushes raw variables to Cloudflare D1 via REST API.
        通过 REST API 将原始变量推送到云端数据库 D1。

### 2.2 The Storage / 云端仓库 (Cloudflare D1)
*   **Engine (引擎)**: Distributed SQLite. / 分布式 SQLite 数据库。
*   **Core Tables (核心表结构)**:
    *   **`nymex_market_data`**: Time-series of commodity prices and exchange rates.
        存储大宗商品价格与汇率的时间序列数据。
    *   **`eub_regulations`**: Historical regulatory price changes and effective dates.
        记录官方监管价格的变更历史及生效日期。
*   **Integrity (数据完整性)**: `UNIQUE` constraints on dates prevent duplicate reporting.
    在日期字段上设有“唯一约束”，从根本上杜绝重复数据的产生。

### 2.3 The Brain / 计算大脑 (Cloudflare Worker)
*   **Role (角色)**: Real-time Analytics Engine. / 实时分析引擎。
*   **Key Operations (核心操作)**:
    *   **Window Aggregation (窗口聚合)**: SQL-based calculation of 5-day trading averages (T-8 to T-2).
        基于 SQL 计算 5 个交易日的滑动平均值（对应调价周期的 T-8 至 T-2）。
    *   **Attribution Analysis (归因分析)**: Isolating "Commodity Impact" vs. "Currency Impact".
        独立拆解“原油市场波动”与“汇率变动”对最终价格的贡献。
    *   **Calendar Alignment (日历对齐)**: Forward-filling weekend gaps to ensure continuous visualization.
        自动补齐周末及节假日的市场空值，确保前端图表呈现连贯的阶梯状。
    *   **Risk Scoring (风险评分)**: Monitoring Interrupter Clause thresholds (±6.0¢).
        实时监控熔断条款阈值（±6.0¢），计算风险等级。

---

## 3. Prediction Model (M14) / 预测模型 (M14)

### 3.1 The Formula / 计算公式
The predicted variation for the upcoming Friday is calculated as:
下周五的预估价格变动计算公式为：
`Predicted_Delta = (Avg_Target_Window - Avg_Base_Window) * 1.15 (HST)`

### 3.2 Key Factors / 影响因子
| Factor (因子) | Source (来源) | Impact (影响) |
| :--- | :--- | :--- |
| **NYMEX RBOB** | Global Futures / 全球期货 | Primary cost driver / 核心成本驱动力 |
| **USDCAD** | FX Market / 汇率市场 | Import cost multiplier / 进口成本乘数 |
| **HST (15%)** | NB Regulation / 省税 | Fixed tax on variations / 施加于所有变动的固定税率 |
| **Retail Spread** | Fixed Constant / 固定常数 | Est. Pump Price = Max Ceiling - 5.5¢ |

---

## 4. UI/UX Decision Logic / 前端交互逻辑
*   **Hero Card (核心决策卡)**: Displays actionable advice based on current trends.
    根据预测趋势直接展示“立即加油”或“建议等待”的行动建议。
*   **Insight Hub (分析舱)**: Combines attribution bars and confidence levels for transparency.
    整合驱动力条形图与数据置信度，确保预测过程透明可信。
*   **Pro Mode (专家模式)**: Juxtaposes "NB Price Staircase" against "NYMEX Curve".
    将“NB 官方价格阶梯”与“NYMEX 波动曲线”在同一时间轴对撞展示。

---
*Last Updated / 最后更新: 2026-03-22*
