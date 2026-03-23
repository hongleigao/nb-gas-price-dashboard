# 任务计划：NB油价预测系统 - Serverless 数据库化重构 (Expert)

## 目标
实现“数据状态 (D1 DB)”与“计算逻辑 (Worker/API)”的彻底解耦。引入 Cloudflare D1 数据库，将油价预测系统从静态 JSON 模式升级为动态 SQL 计算模式，解决时间序列回测与扩展性难题。

## 核心架构变化
- **存储层**：Cloudflare D1 (SQLite) 替代 `data.json`。
- **数据流**：GitHub Actions (Python) 负责原始变量注入 -> D1 存储 -> Cloudflare Worker (JS/SQL) 负责动态聚合计算。
- **UI 层**：渐进式展露 (Progressive Disclosure) 适配动态 API。

## 各阶段状态

### 阶段 7：Serverless 数据库化重构 (已完成)
- [x] **基础设施定义 (Schema)**：创建 `schema.sql` (nymex_market_data, eub_regulations)。
- [x] **数据推送器重构 (Pusher)**：重构 `update_data.py` 使用 Cloudflare D1 REST API 进行写入。
- [x] **核心 API 开发 (The Brain)**：编写 Cloudflare Worker 实现 SQL 窗口聚合、归因拆解与日历轴补全。
- [x] **UI 动态适配**：重构 `index.html` 接入 Worker API，实现工业精密风格 UI。
- **状态：** complete

## 关键发现记录
1. **专家审计结论**：高度管制市场下，REI 指标毫无价值。系统应通过“熔断风险仪”、“数据置信度”和“归因拆解”来透明化调价黑盒。
2. **重构优势**：引入 D1 后，计算逻辑从 Python 迁移至 SQL/Worker，大幅提升了系统的实时性与可回测性。
3. **视觉闭环**：通过 ⛽ 图标、动态语义化边框和直觉化文案，实现了从“数据看板”到“决策终端”的跨越。

## 已做决策
| 决策 | 理由 |
|------|------|
| 锁定 M7 为唯一引擎 | 78.7% 的方向准确率已达到商业决策要求 |
| 引入 CFR Adjustor 参数 | 适应 2026 年 NB EUB 的新定价规则 |
| 前端决策优先 | 界面直接展示 "BUY/WAIT" 建议，降低用户认知负担 |
