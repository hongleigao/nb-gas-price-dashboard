# NB Gas Price Pulse - 优化路线图 (V4.6 状态)

本项目已从单一脚本进化为成熟的 PWA 数据监控应用。以下是后续的演进建议。

---

## ✅ 已完成 (Done)
*   **[UX] 骨架屏加载 (Skeleton Loader)**：消除首屏加载的闪烁感。
*   **[UX] Hero Card 布局**：将预测信息作为页面的绝对焦点。
*   **[UI] 品牌重塑 (Pulse)**：确立了“NB Gas Price Pulse”品牌，增加了 ⛽ 图标及视觉规范。
*   **[Algo] 终极校准 (Beta 0.48)**：经过回测验证的最优灵敏度参数。
*   **[Algo] 稳健中位数法**：Retail Spread 分析不再受异常值干扰。
*   **[Infrastructure] 代码/数据分离架构**：实现了 `main` 和 `gh-pages` 分支隔离。

---

## 🚀 下一阶段核心任务 (The Next Step)

### 1. 自动化算法回测 (Automated Backtesting) - **P0**
*   **目标**：将 `backtest_analysis.py` 集成到 GitHub Actions。
*   **功能**：每次调价后，自动在 GitHub Issue 或日志中生成“上周预测误差报告”，实现算法的闭环监控。

### 2. 多能源扩展 (Multi-Fuel Support) - **P1**
*   **目标**：引入 **Diesel (柴油)** 和 **Heating Oil (取暖油)**。
*   **理由**：这是 NB 省非常核心的开支，能够吸引卡车司机和房主等高价值活跃用户。

### 3. 行动建议逻辑 (Action Index) - **P1**
*   **目标**：不仅仅展示数字，而是直接展示“🔴 今晚加满”或“🟢 周四再加”。
*   **UI**：在 Hero Card 中增加一个极简的红绿灯图标。

### 4. 社交传播图片生成 (Share Card) - **P2**
*   **目标**：一键生成“预测周报”图片。
*   **理由**：方便用户分享到 Facebook 的当地油价讨论群组，实现无成本的用户增长。

---
*Created by Gemini CLI - Consulting Team*
