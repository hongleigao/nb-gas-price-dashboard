# 部署完整指南

## 概述

本章节涵盖从本地开发到生产部署的完整流程。包括初始化、本地测试、生产部署和监控。

---

## 第 1 部分：环境准备

### 账号要求

创建 (如无):
- 🔐 GitHub 账号 - 代码托管和 Actions
- ☁️ Cloudflare 账号 - Workers 和 D1 数据库
- (可选) 自定义域名

### 本地工具

```bash
# Node.js 18+
node --version  # v18.0.0 或更高

# Python 3.9+
python --version  # Python 3.9.0 或更高

# Git 2.0+
git --version  # git version 2.0 或更高

# npm (通常随 Node.js 安装)
npm --version

# Cloudflare Workers CLI
npm install -g wrangler
wrangler --version
```

### 安装 Wrangler

```bash
npm install -g @cloudflare/wrangler
```

验证:
```bash
wrangler whoami
# 应该显示你的 Cloudflare 账号信息
```

---

## 第 2 部分：本地开发

### 2.1 克隆和初始化

```bash
# 克隆仓库
git clone <repo-url>
cd nb-gas-price-dashboard

# 创建分支 (可选)
git checkout -b feature/my-feature
```

### 2.2 前端开发

```bash
cd web

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 输出:
# VITE v5.x.x  ready in XXX ms
# ➜  Local: http://localhost:5173/
```

访问 http://localhost:5173 开始开发。

### 2.3 后端开发

```bash
cd api

# 安装依赖
npm install

# 启动本地 Worker
wrangler dev

# 输出:
# ⛅️ wrangler 3.58.0
# ▲ [wrangler:dev] server listening at http://localhost:8787
```

本地 API 可在 http://localhost:8787/api/v1/... 访问。

### 2.4 数据管道开发

```bash
cd scripts

# 安装 Python 依赖
pip install -r requirements.txt

# 测试数据抓取 (不执行 wrangler)
python update_daily.py --dry-run

# 输出: Generated SQL (dry-run mode):
# INSERT INTO market_data ...
# INSERT INTO eub_prices ...
```

### 2.5 集成测试 (本地)

配置前端使用本地 API:

```javascript
// web/src/App.jsx 中修改
const API_BASE = 'http://localhost:8787';  // 使用本地 Worker
```

然后访问 http://localhost:5173，应该能看到来自本地 API 的数据。

---

## 第 3 部分：生产部署 - 后端 (Workers + D1)

### 3.1 创建 D1 数据库

```bash
cd api

# 创建新 D1 数据库
wrangler d1 create nb-gas-db

# 输出:
# ✅ Successfully created D1 database 'nb-gas-db'
# 📝 Add the following config to wrangler.toml:
# 
# [[d1_databases]]
# binding = "D1_DB"
# database_name = "nb-gas-db"
# database_id = "9088f5bb-cb62-4db3-a1e6-xxxxx"
```

将输出的配置复制到 `wrangler.toml`。

### 3.2 初始化数据库 Schema

```bash
# 从 schema.sql 创建表
wrangler d1 execute nb-gas-db --file ../database/schema.sql

# 输出:
# ✅ Executed ... 
```

### 3.3 导入历史数据

```bash
cd scripts

# 生成全量历史数据的 SQL
python seed_history.py --dry-run > history.sql

# 执行 SQL (可能需要分块，因为数据量较大)
wrangler d1 execute nb-gas-db --file history.sql

# 或者逐个执行小块 SQL
python seed_history.py
```

### 3.4 发布 Worker

更新 `wrangler.toml` 中的路由 (如需):

```toml
[env.production]
route = "https://nb-gas-pulse-api.honglei-gao.workers.dev/*"
```

发布:

```bash
cd api

# 检查配置
wrangler publish --dry-run

# 发布
wrangler publish

# 输出:
# ▲ [wrangler:publish] Uploading...
# ▲ [wrangler:publish] Success! Your worker is live at:
# https://xxxxxx-yyyyyy-zzzzz.workers.dev
```

### 3.5 验证 API

```bash
# 测试周期洞察
curl https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current

# 测试历史查询
curl "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history?days=30"
```

---

## 第 4 部分：生产部署 - 前端 (GitHub Pages)

### 4.1 配置 GitHub Pages

1. 进入 GitHub 仓库 Settings
2. Pages 选项卡
3. 选择 "Deploy from a branch"
4. 分支: `main`, 文件夹: `/ (web/dist)`

### 4.2 配置自定义域名 (可选)

1. 打开 `web/public/CNAME`
2. 添加域名:
   ```
   gas.jgao.app
   ```

3. 在你的域名 DNS 设置中添加 CNAME:
   ```
   gas.jgao.app CNAME <username>.github.io
   ```

### 4.3 配置 GitHub Actions 自动构建和部署

创建 `.github/workflows/main.yml`:

```yaml
name: Build & Deploy

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd web
          npm install
      
      - name: Build
        run: |
          cd web
          npm run build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./web/dist
```

### 4.4 建立 CNAME 获取

默认 GitHub Pages 部署时会忽略 `public/CNAME`。添加构建步骤:

```yaml
- name: Copy CNAME
  run: cp web/public/CNAME web/dist/
  
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./web/dist
    cname: gas.jgao.app  # 直接指定
```

### 4.5 验证前端

访问:
- 生产 URL: https://gas.jgao.app
- GitHub Pages: https://<username>.github.io/nb-gas-price-dashboard

---

## 第 5 部分：CI/CD 自动化设置

### 5.1 GitHub Actions Secrets

添加 Cloudflare 认证信息供 Python 脚本使用:

1. Settings → Secrets and variables → Actions
2. 新增 Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_API_KEY`

获取这些值:
- https://dash.cloudflare.com/profile/api-tokens
- 创建 API Token with `D1` 权限

### 5.2 自动数据同步 Workflow

`.github/workflows/auto-etl.yml`:

```yaml
name: Auto Data Sync

on:
  schedule:
    - cron: '0 8 * * *'   # 每天 UTC 08:00
    - cron: '30 22 * * *'  # 每天 UTC 22:30
  workflow_dispatch:

jobs:
  sync_data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install Python dependencies
        run: |
          pip install -q yfinance pandas requests xlrd
      
      - name: Run ETL
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          cd scripts
          python update_daily.py
      
      - name: Commit & Push
        run: |
          git config user.email "action@github.com"
          git config user.name "GitHub Action"
          git add -A
          git commit -m "🤖 Auto sync: $(date -u +'%Y-%m-%d %H:%M:%S')" || true
          git push
```

---

## 第 6 部分：生产检查清单

部署前，验证以下项目：

- ✅ 本地构建无错误: `npm run build` (web + api)
- ✅ 所有环境变量已设置
- ✅ D1 数据库已初始化并有测试数据
- ✅ API 端点可从浏览器访问
- ✅ 前端可加载 API 数据
- ✅ GitHub Actions Secrets 已配置
- ✅ 自定义域名 DNS 已配置 (如使用)
- ✅ CORS 头正确
- ✅ 缓存策略已设置
- ✅ 错误日志可访问

---

## 第 7 部分：监控和调试

### 查看 Cloudflare Worker 日志

```bash
wrangler tail --format json

# 查看实时日志流
```

### 查看 D1 查询

```bash
# 连接到 D1 并查询
wrangler d1 execute nb-gas-db --command "SELECT COUNT(*) FROM market_data"
```

### GitHub Actions 监控

1. 进入 Actions 标签
2. 选择 workflow 运行
3. 查看每个 step 的日志

### 性能监控

使用 Cloudflare Analytics:
- Dashboard → Workers → nb-gas-pulse-api
- 查看请求量、错误率、响应时间

---

## 第 8 部分：常见问题

### Q: wrangler publish 后 404

**原因**: 路由配置错误或 Worker 未初始化

**解决**:
```bash
wrangler publish --name nb-gas-pulse-api
wrangler deployments list
```

### Q: D1 数据为空

**原因**: 未运行 seed_history.py 或 update_daily.py

**解决**:
```bash
cd scripts
python seed_history.py
```

### Q: GitHub Pages 仍然显示旧版本

**原因**: 缓存或构建失败

**解决**:
```bash
# 清除 GitHub Pages 缓存
# 进入 Settings → Pages → 重新部署
# 或推送新提交强制重新构建
git commit --allow-empty -m "Force rebuild"
git push
```

### Q: 跨域请求失败

**原因**: Worker 未设置 CORS 头

**解决**: 检查 `src/index.js` 中的 CORS 设置

---

## 第 9 部分：灾难恢复

### 场景：需要重置整个系统

```bash
# 1. 删除 D1 数据库
wrangler d1 delete nb-gas-db

# 2. 重新创建
wrangler d1 create nb-gas-db

# 3. 初始化 schema
wrangler d1 execute nb-gas-db --file database/schema.sql

# 4. 导入历史数据
python scripts/seed_history.py

# 5. 重新发布 Worker
wrangler publish
```

---

## 第 10 部分：更新和维护

### 定期任务

- 📅 每周: 检查 GitHub Actions 日志
- 📅 每月: 验证 API 响应时间
- 📅 每季度: 检查依赖版本更新

### 依赖更新

```bash
# 检查过期的依赖
npm outdated

# 更新 npm 包
npm update

# 检查安全漏洞
npm audit

# Python
pip list --outdated
pip install --upgrade yfinance pandas
```

---

## 总结

| 步骤 | 命令 |
|------|------|
| 本地开发 | `wrangler dev` (API), `npm run dev` (Web) |
| 创建 D1 | `wrangler d1 create nb-gas-db` |
| 初始化 DB | `wrangler d1 execute ... --file database/schema.sql` |
| 发布 Workers | `wrangler publish` |
| 构建前端 | `npm run build` (web) |
| 部署前端 | GitHub Actions (自动) |

**下一步**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排查
