# NB Gas Price Pulse (V5.2) - System Architecture & Handbook
# NB 油价脉搏 (V5.2) - 系统架构与开发手册

NB Gas Pulse 是一个专为 New Brunswick 居民打造的**准实时（Near-Real-Time）燃油情报决策终端**。

---

## 1. Project Vision / 项目愿景
在 NB 省高度管制的燃油市场中，价格波动受复杂的 EUB 窗口法控制。本项目旨在解决：
*   **消除黑盒 (Transparency)**: 通过“归因拆解”，揭示国际市场与汇率对本地油价的驱动作用。
*   **辅助决策 (Actionable Advice)**: 直接给出“建议加油”或“建议等待”的直觉化行动指南。
*   **预测窗口对齐**: 严格模拟 5 日计价窗口，确保预测值与官方公式逻辑闭环。
*   **风险预警 (Risk Intelligence)**: 24小时监控“熔断红线”，在非计划调价发生前提供预警。

---

## 2. Design Philosophy / 设计哲学
系统基于**“逻辑与数据解耦”**与**“自动化 CI/CD”**原则构建。

*   **Data Ingestion (数据摄取)**: Semi-daily ETL (GitHub Actions).
    准实时（每天两次，08:00 & 22:00 UTC）的数据摄取。
*   **Storage (数据存储)**: Persistent and distributed (Cloudflare D1).
*   **Computation (逻辑计算)**: Active and on-demand (Cloudflare Workers).
*   **Automation (自动化部署)**: Integrated GitOps (GitHub Actions + Wrangler).

---

## 3. Data Flow & Components / 数据流与组件

### 3.1 The Pusher / 数据搬运工 (GitHub Actions & Python)
*   **Role (角色)**: Daily ETL (Extract, Transform, Load).
*   **Logic (逻辑)**: 从 NYMEX (RBOB) 与 Yahoo Finance (USDCAD) 获取半日行情快照，推送到 D1。

### 3.2 The Brain / 计算大脑 (Cloudflare Worker)
*   **Role (角色)**: 核心分析引擎。执行以下逻辑：
    *   **Window Logic**: 计算本周计价窗口内已锁定日期的平均值。
    *   **Spot Drive**: 计算数据库最新记录（Snapshot）相对于调价基准的即时驱动力。
    *   **Interrupter**: 实时监控累计偏离度，评估熔断风险。

---

## 4. Deployment Guide / 部署指南

### 4.1 核心配置 (GitHub Secrets)
必须配置以下 Secrets：
*   `CLOUDFLARE_API_TOKEN`: 需具备 `User Details: Read`, `Workers: Edit`, `D1: Edit` 权限。
*   `CLOUDFLARE_ACCOUNT_ID`: 您的 Cloudflare 账号 ID。
*   `CLOUDFLARE_DATABASE_ID`: 您的 D1 数据库 ID。

### 4.2 自动部署流程
1.  **代码提交**: 推送代码至 `main` 分支。
2.  **ETL 同步**: GitHub Action 首先运行 Python 脚本同步 D1 数据。
3.  **Worker 部署**: 接着通过 `cloudflare/wrangler-action` 自动将 `src/api/worker.js` 部署到云端。
4.  **Frontend 部署**: 最后将 `src/frontend` 目录发布至 GitHub Pages。

---

## 5. Roadmap / 演进路线图

### ✅ 已完成
*   云原生架构迁移 (V5.0)。
*   工业精密视觉 UI (V5.1)。
*   自动化部署集成 (V5.2)。
*   预测值与窗口逻辑闭环。

### 🚀 下一阶段 (V5.2+)
*   **多能源扩展**: 接入 Diesel (柴油) 与 Furnace Oil (取暖油)。
*   **边缘缓存**: 实现 1 小时级别的 API 响应缓存。

---
*Last Updated / 最后更新: 2026-03-23*
