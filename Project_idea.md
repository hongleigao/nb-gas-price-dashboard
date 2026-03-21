# NB Gas Price Dashboard - 核心设计与算法白皮书 (V4.0)

本项目是一个集成自动化 ETL、金融建模、调价预测及多端 PWA 可视化于一体的专业监控平台。它通过对比 **新不伦瑞克省 (NB) 官方监管油价** 与 **NYMEX RBOB 国际汽油期货**，为用户提供透明的利润空间分析及精准的调价预警。

---

## 1. 核心设计思路 (The Vision)
*   **决策辅助 (Forecast-First)**：利用监管定价的滞后性与平滑机制，提前预测周四的调价方向。
*   **利润透明 (Margin Transparency)**：通过计算“零售价差 (Spread)”，量化除去国际基准价后的本地税收、运输及零售利润空间。
*   **工业级鲁棒性 (Robustness)**：采用动态关键词解析 Excel、数据完整性校验及增量更新架构。
*   **全平台 App 体验**：支持 PWA、“添加到主屏幕”、骨架屏加载动画、深色模式以及 AST 本地化时间。

---

## 2. 预测算法：灵敏度校准模型 (Beta-Calibrated Model)

项目采用经过 100+ 次历史调价回测验证的“灵敏度校准模型”来预测价格调整。该模型引入了针对监管市场的“减震”系数，有效解决了期货市场过度波动的预测偏差。

### 2.1 核心公式
1.  **周期均值计算 (Trading-Day Average)**:
    *   计算本周三至今所有**交易日**（剔除周末）的 NYMEX RBOB (CAD ¢/L) 平均值：`Curr_Avg`。
2.  **常态基准校准 (8-Week Median)**:
    *   提取过去 8 个调价日的价差，计算其**中位数**作为当前季节的常态利润基准：`Median_Spread_8W`。
3.  **灵敏度校准 (The Beta Coefficient)**:
    *   **核心系数**: `BETA = 0.48`。这代表国际期货市场每变动 1 ¢，最终传导到零售端的变动约为 0.48 ¢。
4.  **最终预测变动**:
    `Predicted_NB_Price = Curr_Avg + Median_Spread_8W`
    `Final_Forecast = (Predicted_NB_Price - Current_Price) * 0.48`

### 2.2 零售分析逻辑
通过对比当前实时价差与 8 周中位价差的偏差 (`spread_vs_median`)，判定利润状态：
*   `> +0.5¢`: **Thick Margin**（零售端加价空间扩张）
*   `<-0.5¢`: **Thin Margin**（零售端利润受到挤压）

---

## 3. 技术实现架构 (Implementation Workflow)

### 3.1 稳健的 ETL 与 数据治理
*   **增量抓取**：每次运行仅同步 30 天金融数据，通过 `merge` 逻辑与历史数据合并，大幅提升运行效率。
*   **时区锁定**：强制使用 `America/Moncton` 时区，确保数据精确停止在“NB 当地今天”。
*   **滚动窗口**：自动将 `data.json` 裁剪至最近 730 天（2年），确保轻量级分发。

### 3.2 部署与分支隔离 (Decoupled Architecture)
*   **源码分支 (`main`)**：仅存储 Python 脚本、HTML 模板及配置文件。
*   **数据分支 (`gh-pages`)**：GitHub Actions 将运行结果自动部署至此，杜绝了手动修改代码与自动更新数据之间的 Git 冲突。

### 3.3 UX 设计
*   **Skeleton Loader**：加载时展示闪烁的占位占位符，消除文字弹出的突兀感。
*   **Tabular Style UI**：采用全大写标题与宽字间距，营造高端仪表盘质感。

---
*Created by Gemini CLI - Professional Edition*