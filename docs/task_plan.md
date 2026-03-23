# 任务计划：NB油价预测系统 - Serverless 数据库化重构 (Expert)

## 目标
实现“数据状态 (D1 DB)”与“计算逻辑 (Worker/API)”的彻底解耦。引入 Cloudflare D1 数据库，将油价预测系统从静态 JSON 模式升级为动态 SQL 计算模式，解决时间序列回测与扩展性难题。

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
- **状态：** complete

### 阶段 8：生产级稳健性与逻辑优化 (已完成)
- [x] **自动化部署**：集成 Cloudflare Wrangler Action，实现 Worker 自动部署。
- [x] **预测逻辑闭环**：修正 5 日窗口均值算法，确保 UI 数据闭环。
- [x] **归因语义化**：重构 "Price Driver" 为 "Spot Drive" 并增加解释文案，消除用户困惑。
- **状态：** complete

## 后续阶段 (Future Phases)
### 阶段 9：多能源扩展 (V5.3)
- [ ] **Schema 扩展**：更新 `schema.sql` 支持 Diesel 与 Furnace Oil。
- [ ] **ETL 增强**：修改 `update_data.py` 同步多能源 NYMEX 数据。
- [ ] **UI 多品种切换**：在前端增加能源类型选择器。

### 阶段 10：边缘计算优化
- [ ] **边缘缓存**：利用 Cloudflare KV 实现 1 小时 API 响应缓存。

## 已做决策
| 决策 | 理由 |
|------|------|
| 锁定 5 日均值法 | 严格遵循 NB EUB 官方监管计价规则 |
| 分离 Spot 与 Window | 区分“即时市场压力”与“最终调价预测”，提高透明度 |
| 强制准实时同步 | 每天两次 GitHub Actions 是成本与实时性的最佳平衡点 |
