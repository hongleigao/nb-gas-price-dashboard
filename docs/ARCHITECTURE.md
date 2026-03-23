# NB Gas Price Pulse (V5.1) - System Architecture & Handbook
# NB 油价脉搏 (V5.1) - 系统架构与开发手册

NB Gas Pulse 不仅仅是一个数据看板，它是专为 New Brunswick 居民打造的**燃油情报决策终端**。

---

## 1. Project Vision / 项目愿景
在 NB 省高度管制的燃油市场中，价格波动受复杂的 EUB 窗口法控制。本项目旨在解决：
*   **消除黑盒 (Transparency)**: 通过“归因拆解”，揭示国际市场与汇率对本地油价的驱动作用。
*   **辅助决策 (Actionable Advice)**: 直接给出“建议加油”或“建议等待”的直觉化行动指南。
*   **风险预警 (Risk Intelligence)**: 24小时监控“熔断红线”，在非计划调价发生前提供预警。

---

## 2. Design Philosophy / 设计哲学
系统基于**“逻辑与数据解耦”**的原则构建。

*   **Data Ingestion (数据摄取)**: Passive and scheduled (GitHub Actions).
    被动且定时的（通过 GitHub Actions 实现）。
*   **Storage (数据存储)**: Persistent and distributed (Cloudflare D1).
    持久化且分布式的（通过 Cloudflare D1 实现）。
*   **Computation (逻辑计算)**: Active and on-demand (Cloudflare Workers).
    主动且按需的（通过 Cloudflare Workers 实现）。
*   **Presentation (前端展示)**: Progressive and decision-oriented (GitHub Pages).
    渐进式且以决策为导向的（通过 GitHub Pages 实现）。

---

## 3. Data Flow & Components / 数据流与组件

### 3.1 The Pusher / 数据搬运工 (GitHub Actions & Python)
*   **Role (角色)**: Daily ETL (Extract, Transform, Load).
*   **Logic (逻辑)**: 抓取 NYMEX RBOB 期货与 USDCAD 汇率，解析 NB EUB Excel 报告，推送到云端 D1。

### 3.2 The Storage / 云端仓库 (Cloudflare D1)
*   **Engine (引擎)**: Distributed SQLite.
*   **Core Tables (核心表结构)**: `nymex_market_data` (市场序列) 与 `eub_regulations` (监管记录)。

### 3.3 The Brain / 计算大脑 (Cloudflare Worker)
*   **Role (角色)**: 实时分析引擎。执行 SQL 窗口聚合、归因拆解与日历补全。

### 3.4 Interrupter Logic / 熔断判定逻辑
*   **Rule 1 (单日波动)**: 超过 **6.0 ¢/L**。
*   **Rule 2 (累计偏离)**: 3日滚动均价偏离基准超过 **5.0 ¢/L**。
*   **Blackout (静默期)**: 周二与周三法律禁止触发熔断。

---

## 4. Deployment Guide / 部署指南

### 4.1 GitHub Actions 配置
1.  **Workflow permissions**: 开启 "Read and write permissions"。
2.  **Repository Secrets**: 配置 `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`。

### 4.2 Cloudflare 基础设施
1.  **D1**: 创建数据库，执行 `schema.sql`，运行 `seed_history.py`。
2.  **Worker**: 
    *   **配置**: 配置文件为 `wrangler.toml`，定义了名称、入口点 (`src/api/worker.js`) 及 D1 绑定。
    *   **部署**: 通过 GitHub Actions 自动部署（使用 `cloudflare/wrangler-action`）。
    *   **手动部署**: (可选) 在本地安装 Wrangler 后运行 `npx wrangler deploy`。

### 4.3 前端 (GitHub Pages)
1.  确保 `index.html` 中的 `API_ENDPOINT` 指向您的 Worker URL。
2.  推送至 `main` 分支，GitHub Actions 自动完成 PWA 与 Worker 的全量云端部署。

---

## 5. Roadmap / 演进路线图

### ✅ 已完成
*   云原生架构迁移 (V5.0)。
*   工业精密视觉 UI (V5.1)。
*   全量监管历史压舱石补录。

### 🚀 下一阶段 (V5.2)
*   **自动化部署**: 集成 Cloudflare Wrangler Action。
*   **多能源扩展**: 接入 Diesel (柴油) 与 Furnace Oil (取暖油)。
*   **边缘缓存**: 实现 1 小时级别的 API 响应缓存。

---
*Last Updated / 最后更新: 2026-03-23*
