# NB Gas Price Dashboard - 项目全维度解析 (P2 增强版)

本项目是一个集成自动化数据采集、金融建模、油价预测及多端可视化于一体的专业级监控平台。它通过对比 **新不伦瑞克省 (NB) 官方监管油价** 与 **NYMEX RBOB 国际汽油期货**，为用户提供透明的利润空间分析及精准的调价预警。

---

## 1. 核心设计思路 (Core Vision)
*   **决策辅助**：通过预测模型，让用户在周四调价前决定是否提前加油。
*   **市场透明度**：计算“零售价差 (Spread)”，揭示除去国际基准价后的税收、运输及零售利润空间。
*   **全自动化流水线**：利用 GitHub Actions 实现 7x24 小时无人值守的“抓取-计算-发布”循环。
*   **专业级体验**：支持深色模式、响应式布局及交互式 Tooltip，适配各种使用场景。

---

## 2. 核心算法：稳定价差预测模型 (Stable Spread Model)

项目最核心的价值在于其 **P2-Core 预测模型**。该模型采用“油价经济学家”方案，基于监管价与市场基准价之间存在相对稳定溢价的原理：

### 算法逻辑
1.  **历史溢价校准**：
    *   定位过去 4 个 **NB 价格实际变动日**（即官方调价生效日，通常为周四）。
    *   计算这 4 个调价日的平均价差：`Avg_Historical_Spread = Mean(NB_Price - RBOB_CAD_Benchmark)`。
    *   该数值代表了 EUB 委员会最近期认可的监管空间（包含利润、运输费及碳税）。

2.  **当前周期基准计算**：
    *   确定当前定价周期（从本周三开始至今）。
    *   计算该周期内所有交易日的 NYMEX RBOB (CAD ¢/L) 平均值：`Current_Cycle_Avg_RBOB`。

3.  **最终预测公式**：
    *   **预估新价格**：`Predicted_NB_Price = Current_Cycle_Avg_RBOB + Avg_Historical_Spread`
    *   **预计变动幅**：`Predicted_Change = Predicted_NB_Price - Today_NB_Price`
    *   *注：该模型通过 4 周滑动平均有效平摊了短期市场波动，比单一涨跌幅对比更具前瞻性和稳定性。*

---

## 3. 实现流程 (Technical Workflow)

### 第一阶段：稳健的数据中枢 (Python ETL)
*   **动态抓取 (P2-Dev)**：使用关键词搜索（如 "Regular Unleaded Maximum with Delivery"）在 EUB 的 Excel 中定位数据，彻底解决了由于官网文件格式微调导致的脚本崩溃问题。
*   **金融对齐**：同步抓取 Yahoo Finance 的 `RB=F` (期货) 和 `CAD=X` (汇率)，将国际市场数据实时转换为当地计价单位 (¢/L)。
*   **数据合成**：计算每日涨跌幅 (Deltas)、价差 (Spread) 以及预测序列，生成包含元数据的 `data.json`。

### 第二阶段：自动化流水线 (GitHub Actions)
*   **定时调度**：每天凌晨自动触发，确保用户起床时看到的是最新分析。
*   **自动发布**：脚本运行成功后，自动将数据推送到仓库，触发 GitHub Pages 静态页面刷新。

### 第三阶段：精细化可视化 (UI/UX)
*   **数值看板 (P0)**：直观展示当前价格、涨跌幅以及 **Weekly Forecast** 预测卡片。
*   **双轴图表 (P1)**：
    *   **左轴**：展示 NB 价格线（主线）与 NYMEX 基准线（趋势）。
    *   **右轴**：以橙色面积图形式展示 Retail Spread，揭示溢价空间波动。
*   **交互细节 (P2-UX)**：
    *   **Tooltip 解释系统**：悬停在预测卡片上时，弹出浮窗解释“预测逻辑”并展示“免责声明”。
    *   **全自动深色模式**：根据系统主题自动切换配色，优化夜间阅读体验。
    *   **MarkPoints**：在图表上自动标记价格变动日和“Today”节点。

---

## 4. 技术栈
*   **数据端**：Python 3 (Pandas, yfinance, openpyxl)
*   **前端**：Apache ECharts 5, Vanilla CSS (CSS Variables), JavaScript
*   **架构**：GitHub Actions + GitHub Pages (Serverless Architecture)

---
*Created by Gemini CLI - Professional Edition*