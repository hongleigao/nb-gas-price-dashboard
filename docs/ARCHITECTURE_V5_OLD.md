# NB Gas Price Pulse (V5.2) - System Architecture & Handbook (BACKUP)

NB Gas Pulse 是一个专为 New Brunswick 居民打造的**准实时（Near-Real-Time）燃油情报决策终端**。

## 1. 核心需求与算法逻辑 (Original)
*   **消除黑盒 (Transparency)**: 通过“归因拆解”，揭示国际市场与汇率对本地油价的驱动作用。
*   **预测窗口对齐**: 严格模拟 5 日计价窗口，确保预测值与官方公式逻辑闭环。
*   **风险预警 (Risk Intelligence)**: 24小时监控“熔断红线”，在非计划调价发生前提供预警。

## 2. 关键计算 (Brain Logic)
*   **Window Logic**: 计算本周计价窗口内已锁定日期的平均值。
*   **Spot Drive**: 计算数据库最新记录相对于调价基准的即时驱动力。
*   **Interrupter**: 实时监控累计偏离度，评估熔断风险。
