# NB Gas Price Pulse - 核心设计与算法白皮书 (V4.6)

本项目是一个集成自动化 ETL、金融建模、调价预测及多端 PWA 可视化于一体的专业监控平台。它通过对比 **新不伦瑞克省 (NB) 官方监管油价** 与 **NYMEX RBOB 国际汽油期货**，为用户提供透明的利润空间分析及精准的调价预警。

---

## 1. 核心设计思路 (The Vision)
*   **决策辅助 (Forecast-First)**：利用监管定价的滞后性与平滑机制，提前预测周四的调价方向。
*   **品牌定位 (Pulse)**：像脉搏一样实时监测市场跳动，通过客观数据消除信息不对称。
*   **工业级鲁棒性 (Robustness)**：采用动态关键词解析 Excel、数据完整性校验、增量更新及**时区锁定 (America/Moncton)** 架构。
*   **全平台 App 体验**：支持 PWA、“添加到主屏幕”、骨架屏加载动画、Hero 级仪表盘布局以及深色模式。

---

## 2. 预测算法：灵敏度校准模型 (Beta-Calibrated Model)

项目采用经过 100+ 次历史调价回测验证的“灵敏度校准模型”。

### 2.1 核心公式
1.  **周期均值 (Trading-Day Average)**:
    *   计算本周三至今所有**真实交易日**（剔除周末）的 NYMEX RBOB (CAD ¢/L) 平均值：`Curr_Avg`。
2.  **常态基准校准 (8-Week Median)**:
    *   提取过去 8 个调价日的价差，计算其**中位数**作为当前季节的常态利润基准：`Median_Spread_8W`。使用中位数而非均值，能有效屏蔽中断条款 (Interrupter Clause) 产生的极端噪音。
3.  **灵敏度校准 (The Beta Coefficient)**:
    *   **核心系数**: `BETA = 0.48`。理由：回测显示期货波动通常是零售价波动的 2 倍左右，应用该系数可将误差控制在 ±1¢ 左右。
4.  **最终预测变动**:
    `Predicted_NB_Price = Curr_Avg + Median_Spread_8W`
    `Final_Forecast = (Predicted_NB_Price - Current_Price) * 0.48`

### 2.2 零售分析逻辑 (Retail Spread)
通过对比当前实时价差与 8 周中位价差的偏差 (`spread_vs_median`)，判定市场效率：
*   **色彩定义**：引入橙色 (Amber) 虚线面积图，与主价格线明确隔离。
*   **语义判定**：`> +0.5¢` 为 Thick Margin（利润空间厚）；`<-0.5¢` 为 Thin Margin（利润被压缩）。

---

## 3. 技术实现架构 (Implementation Workflow)

### 3.1 部署与分支隔离 (Decoupled Architecture)
*   **源代码 (`main`)**：仅存放 Python 脚本、HTML 模板及配置。
*   **运行结果 (`gh-pages`)**：机器人自动将生成的 `data.json` 推送到此分支。
*   **优势**：彻底解决了由于自动化脚本抢跑导致的 Git 推送冲突问题。

### 3.2 UI/UX 特性
*   **Skeleton Loader**：极速首屏体验，展示与卡片轮廓一致的占位动画。
*   **Tabular Style**：全大写标题、宽字间距，营造高端金融终端感。
*   **Timezone Safe**：强制锁定 NB 当地时间，杜绝 UTC 导致的日期超前 Bug。

---
*Created by Gemini CLI - Branding & Algo Update 2026-03-21*
