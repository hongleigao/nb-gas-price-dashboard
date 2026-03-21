# NB Gas Price Dashboard - 核心设计与算法白皮书 (V3.5)

本项目是一个集成自动化 ETL、金融建模、调价预测及多端 PWA 可视化于一体的专业监控平台。它通过对比 **新不伦瑞克省 (NB) 官方监管油价** 与 **NYMEX RBOB 国际汽油期货**，为用户提供透明的利润空间分析及精准的调价预警。

---

## 1. 核心设计思路 (The Vision)
*   **决策辅助 (Forecast-First)**：利用监管定价的滞后性与平滑机制，提前 24-48 小时预测周四的调价方向。
*   **利润透明 (Margin Transparency)**：通过计算“零售价差 (Spread)”，量化除去国际基准价后的本地税收、运输及零售利润空间。
*   **工业级鲁棒性 (Robustness)**：具备动态数据抓取、完整性校验、增量更新及代码/数据分离架构。
*   **全平台 App 体验**：支持 PWA、深色模式、骨架屏加载以及 AST 本地化时间。

---

## 2. 预测算法：灵敏度校准模型 (Beta-Calibrated Model)

项目采用经过回测验证的“灵敏度校准模型”来预测下周四的价格调整。该模型在传统增量模型的基础上，引入了针对监管市场的“减震”系数。

### 2.1 核心公式
1.  **周期均值计算 (Trading-Day Average)**:
    *   计算本周三至今所有**交易日**（剔除周末）的 NYMEX RBOB (CAD ¢/L) 平均值：`Curr_Avg`。
    *   计算上周对应周期的交易日平均值：`Prev_Avg`。
2.  **灵敏度校准 (The Beta Coefficient)**:
    *   由于 NB 零售价受监管平滑，其波动幅度通常只有期货市场波动的约一半。
    *   **核心系数**: `BETA = 0.48` (基于过去 100+ 次调价的回测优化值)。
3.  **最终预测变动**:
    `Predicted_Change = (Curr_Avg - Prev_Avg) * 1.15 (HST) * 0.48 (BETA)`

### 2.2 零售分析逻辑
通过对比当前实时价差与 4 周平均价差的偏差 (`spread_vs_avg`)：
*   `> +0.5¢`: **Thick Margin**（零售端加价空间较历史平均水平有所扩张）。
*   `<-0.5¢`: **Thin Margin**（零售端利润受到国际市场挤压）。

---

## 3. 技术实现架构 (Implementation Workflow)

### 3.1 后端 ETL & 回测
*   **增量更新**：每次仅同步 30 天数据，降低 API 压力。
*   **回测验证**：内置 `backtest_analysis.py` 脚本，可对不同模型进行 MAE（平均绝对误差）和方向准确率评分。

### 3.2 部署与前端
*   **架构**：采用 GitHub Actions (计算) + gh-pages (存储) + Cloudflare (分发) 的 Serverless 链路。
*   **视觉优化**：引入 Skeleton Loader（骨架屏）提升加载感官速度；默认隐藏非核心曲线（降噪处理）。

---
*Created by Gemini CLI - Professional Edition*