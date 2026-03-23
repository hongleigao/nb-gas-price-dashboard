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

### 阶段 7.5：项目结构重组 (已完成)
- [x] **目录分层**：实施 Option A 科技栈分层 (Frontend, API, Data, Scripts, Tests, Docs)。
- [x] **冗余清理**：删除了 `data.json` 及 8 个旧版测试与辅助脚本。
- [x] **CI/CD 适配**：修正了 GitHub Actions 执行路径与发布目录至 `src/frontend`。
- [x] **路径加固**：修复了 Python 脚本跨目录引用 `settings.py` 的路径导入问题。
- **状态：** complete

## 后续阶段 (Future Phases)
### 阶段 8：生产级稳健性优化 (V5.2)
- [x] **自动化部署**：集成 Cloudflare Wrangler Action，实现 Worker 自动部署。
- [ ] **多能源扩展**：接入 Diesel (柴油) 与 Furnace Oil (取暖油) 监控。
- [ ] **边缘计算优化**：利用 Cloudflare KV 或 Cache 实现 1 小时 API 响应缓存。

## 关键发现记录
1. **专家审计结论**：高度管制市场下，REI 指标毫无价值。系统应通过“熔断风险仪”、“数据置信度”和“归因拆解”来透明化调价黑盒。
2. **重构优势**：引入 D1 后，计算逻辑从 Python 迁移至 SQL/Worker，大幅提升了系统的实时性与可回测性。
3. **结构化意义**：将 Frontend 隔离到 `src/frontend` 后，GitHub Pages 部署不再包含敏感的 `.env` 或源码，安全性大幅提升。

## 已做决策
| 决策 | 理由 |
|------|------|
| 锁定 M7 为唯一引擎 | 78.7% 的方向准确率已达到商业决策要求 |
| 引入 CFR Adjustor 参数 | 适应 2026 年 NB EUB 的新定价规则 |
| Option A 目录结构 | 按照科技栈分层，符合 Serverless 开发直觉，易于长期维护 |
