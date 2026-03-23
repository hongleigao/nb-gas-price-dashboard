# NB Gas Price Pulse - 架构白皮书 (Cloud Native V5.1)

本项目是一个基于 **Cloudflare Serverless 生态**的燃油价格智能监控系统，旨在通过第一性原理分析，消除受管制市场中的信息差。

---

## 1. 核心架构 (System Architecture)

### 1.1 数据闭环
1.  **数据采集 (Pusher)**: GitHub Actions 定时运行 `update_data.py`，从 `yfinance` 抓取 NYMEX RBOB 与 USDCAD 汇率，并解析 NB EUB 官网 Excel 快照。
2.  **持久化层 (D1 DB)**: Cloudflare D1 存储全量金融日线与监管调价历史，具备唯一性约束防止数据污染。
3.  **计算引擎 (The Brain)**: Cloudflare Worker 在用户请求时执行 SQL 聚合，实时计算 5 日滑动窗口均值。
4.  **决策 UI (Frontend)**: 基于工业精密风格设计，提供“行动建议”、“双价灯塔”和“归因拆解”。

---

## 2. 预测算法逻辑 (M14 Model)

### 2.1 价格构成因子 (Factors)
*   **Market Variable (Commodity)**: NYMEX RBOB 汽油期货价格 (USD/Gallon)。
*   **Currency Variable (FX)**: 美元兑加元汇率 (USDCAD)。
*   **Tax Component (HST)**: NB 省统一销售税 (15%)。
*   **Regulatory Constant**: 泵站价格与最高限价的固定价差 (-5.5 ¢)。

### 2.2 调价窗口公式
*   **Base Window (B)**: 当前官价生效日之前的 5 个交易日均值。
*   **Target Window (T)**: 下周五调价对应的上周三至本周二 5 个交易日均值。
*   **Predicted Change**: `(Avg(T) - Avg(B)) * 1.15`。

### 2.3 熔断触发机制 (Interrupter Clause)
*   **逻辑**: 当 `最近3日市场均值 - Base Window 均值` 的绝对值超过 **±6.0 ¢** 时，EUB 拥有在周五之外任何时间强制调价的法定权力。
*   **UI 映射**: 
    *   🟢 < 3.0¢: 低风险。
    *   🟡 3.0 - 5.5¢: 预警。
    *   🔴 > 5.5¢: 极高风险 (立即行动建议)。

---

## 3. 产品哲学 (Product Vision)
*   **去指标化**: 移除 REI 等噪音，只保留对用户决策有用的数字。
*   **行动导向**: 文案直接告诉用户“涨到多少钱”、“今天还是明天加”。
*   **渐进式展露**: 默认展示核心决策，为数据极客保留 Pro Mode 趋势分析。

---
*Created by Gemini CLI - Consulting Team (2026-03-22)*
