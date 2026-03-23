# 集成 Cloudflare Wrangler Action 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Cloudflare Worker 的自动化部署，确保代码变更能通过 GitHub Actions 自动同步到云端。

**Architecture:** 引入 `wrangler.toml` 配置文件，并在现有的 `.github/workflows/main.yml` 中增加 `cloudflare/wrangler-action` 步骤。

**Tech Stack:** GitHub Actions, Cloudflare Wrangler, Cloudflare Workers.

---

### Task 1: 创建 Wrangler 配置文件

**Files:**
- Create: `wrangler.toml`

- [ ] **Step 1: 创建 `wrangler.toml`**

写入以下内容：
```toml
name = "nb-gas-pulse-api"
main = "src/api/worker.js"
compatibility_date = "2024-03-23"

[[d1_databases]]
binding = "D1_DB"
database_name = "nb-gas-db"
database_id = "9088f5bb-cb62-4db3-a1e6-30f9c2a2e123"
```

- [ ] **Step 2: 验证文件存在**

Run: `ls wrangler.toml`
Expected: 文件存在且内容正确。

- [ ] **Step 3: Commit**

```bash
git add wrangler.toml
git commit -m "chore: add wrangler.toml for automated deployment"
```

### Task 2: 集成到 GitHub Actions 工作流

**Files:**
- Modify: `.github/workflows/main.yml`

- [ ] **Step 1: 修改工作流文件**

在 `build-and-deploy` Job 的 `Run ETL` 步骤之后，添加 `Deploy Worker` 步骤。

```yaml
      - name: Deploy Cloudflare Worker
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 2: 验证 YAML 语法**

检查 `main.yml` 的结构是否完整。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/main.yml
git commit -m "ci: integrate cloudflare wrangler action"
```

### Task 3: 更新项目文档与进度

**Files:**
- Modify: `docs/task_plan.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: 更新 `task_plan.md`**

将阶段 8 的第一个子任务标记为完成。

- [ ] **Step 2: 更新 `ARCHITECTURE.md`**

在部署指南中提到 `wrangler.toml` 的作用。

- [ ] **Step 3: Commit**

```bash
git add docs/task_plan.md docs/ARCHITECTURE.md
git commit -m "docs: update progress for automated deployment integration"
```
