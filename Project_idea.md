# NB Gas Price Pulse - 架构白皮书 (Cloud Native V5.0)

本项目已进化为基于 **Cloudflare 生态的云原生数据中台**，实现了数据存储、逻辑计算与前端展示的彻底解耦。

---

## 1. 系统架构 (System Architecture)

### 1.1 数据流转闭环
1.  **数据采集 (GitHub Actions)**：`update_data.py` 每日从 `yfinance` 抓取金融指标，解析 EUB 官网 Excel 获取限价快照。
2.  **云端存储 (Cloudflare D1)**：采用分布式 SQLite 数据库，持久化存储 NYMEX 行情线与监管调价记录。
3.  **按需计算 (Cloudflare Worker)**：在用户访问瞬间，通过 SQL 窗口函数完成均值聚合、归因拆解及日历轴补全。
4.  **动态渲染 (GitHub Pages)**：前端通过 Fetch 调用 Worker API，实现秒级响应的交互式看板。

---

## 2. 核心逻辑规范 (Core Logic)

### 2.1 预测模型：第一性原理均值法 (M14)
*   **计算窗口**：严格对齐 EUB 周期，取 **下周四调价对应的 T-8 至 T-2 交易日均值**。
*   **预测 Delta**：`(New_Window_Avg - Current_Base_Avg) * 1.15 (HST)`。
*   **归因拆解 (Attribution)**：
    *   `Commodity Impact`：锁定汇率，由原油期货波动产生的贡献。
    *   `FX Impact`：锁定原油，由加元汇率波动产生的贡献。

### 2.2 熔断风险仪 (Interrupter Gauge)
*   **监测频率**：实时。
*   **逻辑**：`Current_3Day_Avg - Current_Base_Avg`。
*   **阈值**：
    *   🟢 **LOW**: < 3.0¢
    *   🟡 **ELEVATED**: 3.0¢ - 5.5¢
    *   🔴 **CRITICAL**: > 5.5¢ (可能触发提前调价)

---

## 3. 技术栈 (Tech Stack)
*   **Database**: Cloudflare D1 (SQLite)
*   **Backend**: Cloudflare Workers (JavaScript / SQL)
*   **Data Ingestion**: Python (yfinance, pandas, requests)
*   **Frontend**: Vanilla HTML/CSS/JS + ECharts
*   **CI/CD**: GitHub Actions

---
*Documented by Gemini CLI - 2026-03-22*
