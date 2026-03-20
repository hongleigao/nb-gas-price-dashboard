# NB Gas Price Dashboard - 核心设计与算法白皮书

本项目是一个集成自动化 ETL、金融建模、调价预测及多端 PWA 可视化于一体的专业监控平台。它通过对比 **新不伦瑞克省 (NB) 官方监管油价** 与 **NYMEX RBOB 国际汽油期货**，为用户提供透明的利润空间分析及精准的调价预警。

---

## 1. 核心设计思路 (The Vision)
*   **预测导向 (Forecast-First)**：利用监管定价的滞后性，提前 24-48 小时预测周四的调价方向，辅助用户加油决策。
*   **利润透明 (Margin Transparency)**：计算“零售价差 (Spread)”，量化除去国际基准价后的本地税收、运输及零售利润空间。
*   **工业级鲁棒性 (Robustness)**：采用动态关键词解析 Excel、数据完整性校验及增量更新架构，确保系统 7x24 小时稳定运行。
*   **全平台 App 体验**：通过 PWA 技术实现“添加到主屏幕”，支持深色模式与 AST 本地化时间展示。

---

## 2. 预测算法：稳定价差模型 (Stable Spread Model)

项目采用“稳定价差模型”来预测下周四的价格调整。该模型基于“零售价与市场基准价之间存在相对稳定溢价”的经济学原理。

### 2.1 核心公式
1.  **市场基准转换 (Benchmark)**:
    `RBOB_CAD = (NYMEX_RBOB_USD_Gallon * USD_CAD_Rate / 3.78541) * 100` (单位：¢/L)
2.  **历史溢价校准 (Historical Margin)**:
    定位过去 4 个 **NB 价格实际变动日**（通常是周四），计算这 4 个节点的平均价差：
    `Avg_Historical_Spread = Mean(NB_Price - RBOB_CAD_Benchmark)`
3.  **当前周期基准 (Current Cycle)**:
    计算本周三至今所有交易日的 `RBOB_CAD` 平均值：`Current_Cycle_Avg`。
4.  **预测调整幅 (Forecast Delta)**:
    `Predicted_NB_Price = Current_Cycle_Avg + Avg_Historical_Spread`
    `Predicted_Change = Predicted_NB_Price - Today_NB_Price`

### 2.2 零售分析逻辑 (Retail Spread Analysis)
通过对比当前实时价差与 4 周平均价差的偏差 (`spread_vs_avg`)，判定市场状态：
*   `> +0.5¢`: **Thick Margin**（零售端利润空间扩张）
*   `<-0.5¢`: **Thin Margin**（零售端利润空间被压缩）
*   `Otherwise`: **Stable Margin**

---

## 3. 技术实现架构 (Implementation Workflow)

### 3.1 后端 ETL (Python & Pandas)
*   **动态抓取**：基于关键词（如 "Maximum with Delivery"）搜索定位 Excel 行号，不依赖固定索引。
*   **增量抓取**：每次仅请求最近 30 天的金融数据进行合并，降低 API 调用负担。
*   **数据治理**：自动裁剪数据至最近 730 天（2年），并执行“数据完整性校验”防止损坏文件上线。

### 3.2 自动化与分支管理 (GitHub Actions)
*   **代码/数据分离**：`main` 分支存储源码，自动化脚本将生成的 `data.json` 推送到独立的 `gh-pages` 分支。
*   **Cloudflare 联动**：Cloudflare 监测 `gh-pages` 变更，实现毫秒级自动部署。

### 3.3 前端交互 (ECharts & PWA)
*   **双轴展示**：左轴展示价格趋势，右轴以橙色面积图展示价差波动。
*   **AST 本地化**：所有同步时间戳均已转换为 NB 省当地大西洋时间 (UTC-4)。
*   **PWA 支持**：包含 `manifest.json` 和 `sw.js`，支持添加到桌面并具备独立的 App 启动体验。

---
*Created by Gemini CLI - Professional Edition*