# 任务计划：NB油价预测系统 - Serverless 数据库化重构 (Expert)

## 目标
实现“数据状态 (D1 DB)”与“计算逻辑 (Worker/API)”的彻底解耦。引入 Cloudflare D1 数据库，将油价预测系统从静态 JSON 模式升级为动态 SQL 计算模式，解决时间序列回测与扩展性难题。

## 核心架构变化
- **存储层**：Cloudflare D1 (SQLite) 替代 `data.json`。
- **数据流**：GitHub Actions (Python) 负责原始变量注入 -> D1 存储 -> Cloudflare Worker (JS/SQL) 负责动态聚合计算。
- **UI 层**：渐进式展露 (Progressive Disclosure) 适配动态 API。

## 各阶段状态

### 阶段 7：Serverless 数据库化重构 (进行中)
- [x] **基础设施定义 (Schema)**：创建 `schema.sql` (nymex_market_data, eub_regulations)。
- [ ] **数据推送器重构 (Pusher)**：修改 `update_data.py` 使用 Cloudflare D1 REST API 进行写入。
- [ ] **核心 API 开发 (The Brain)**：编写 Cloudflare Worker 逻辑，实现 SQL 窗口均值聚合与归因拆解。
- [ ] **UI 动态适配**：前端切换至 Worker API。
- **状态：** in_progress

## 关键发现记录
1. **专家审计结论**：高度管制市场下，REI 指标毫无价值。系统应通过“熔断风险仪”、“计价沙漏”和“归因拆解”来透明化 EUB 调价黑盒。
2. **重构优势**：引入 D1 后，复杂的“上周三至本周二均值计算”可在 SQL 层直接完成，彻底解耦数据与展现。

## 已做决策
| 决策 | 理由 |
|------|------|
| 锁定 M7 为唯一引擎 | 78.7% 的方向准确率已达到商业决策要求 |
| 引入 CFR Adjustor 参数 | 适应 2026 年 NB EUB 的新定价规则 |
| 前端决策优先 | 界面直接展示 "BUY/WAIT" 建议，降低用户认知负担 |
