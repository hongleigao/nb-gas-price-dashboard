# 故障排查指南

## 概述

本章节列出常见的错误、症状、原因和解决方案。

---

## 第 1 部分：API 相关问题

### 问题 1: API 返回 404

**症状**:
```
GET /api/v1/cycle/current
← 404 Not Found
{"error": "Not Found"}
```

**可能原因**:
1. 路由未注册
2. URL 大小写错误
3. Worker 未部署

**排查步骤**:
```bash
# 1. 检查路由是否存在
cat api/src/router.js | grep "cycle/current"

# 2. 测试本地 Worker
wrangler dev
curl http://localhost:8787/api/v1/cycle/current

# 3. 检查部署状态
wrangler deployments list

# 4. 如果本地 OK 但远程 404，重新部署
wrangler publish
```

### 问题 2: API 返回 500 SERVER_ERROR

**症状**:
```json
{
  "status": "error",
  "error": {
    "code": "SERVER_ERROR",
    "message": "D1_DB is not defined"
  }
}
```

**可能原因**:
1. D1_DB 未在 wrangler.toml 中配置
2. 环境变量未正确绑定
3. Worker 代码有 bug

**排查步骤**:
```bash
# 1. 检查 wrangler.toml
cat api/wrangler.toml | grep -A 3 "d1_databases"

# 2. 确保 binding 名称为 "D1_DB"
# [[d1_databases]]
# binding = "D1_DB"

# 3. 检查本地 Worker 是否有数据
wrangler d1 execute nb-gas-db --command "SELECT COUNT(*) FROM market_data"

# 4. 查看 Worker 日志
wrangler tail
```

### 问题 3: API 返回 "NO_DATA"

**症状**:
```json
{
  "status": "error",
  "error": {
    "code": "NO_DATA",
    "message": "No EUB price data available"
  }
}
```

**可能原因**:
- D1 数据库为空（未初始化或未导入数据）

**排查步骤**:
```bash
# 1. 检查数据库是否有数据
wrangler d1 execute nb-gas-db --command "SELECT COUNT(*) FROM eub_prices"

# 如果为 0，需要导入数据
cd scripts
python seed_history.py
```

### 问题 4: CORS 错误

**症状** (浏览器控制台):
```
Access to XMLHttpRequest at 'https://xxxx' 
from origin 'https://gas.jgao.app' 
has been blocked by CORS policy
```

**可能原因**:
- Worker 未设置 CORS 响应头

**排查步骤**:
```bash
# 检查响应头
curl -i https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current | grep -i "access-control"

# 应该看到:
# Access-Control-Allow-Origin: *

# 如果没有，检查 src/index.js 中的 CORS 处理
cat api/src/index.js | grep -A 5 "CORS"
```

---

## 第 2 部分：前端相关问题

### 问题 5: 前端无法加载任何数据

**症状**:
- 页面显示 "Loading..." 且持续不变
- 或显示错误信息

**可能原因**:
1. API 端点配置错误
2. API 离线或返回错误
3. 网络问题

**排查步骤**:
```bash
# 1. 在浏览器开发者工具中检查网络请求
# Chrome DevTools → Network → 查看 XHR 请求

# 2. 检查 API_BASE 配置
cat web/src/App.jsx | grep "API_BASE"

# 3. 手动测试 API
curl https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current | jq

# 4. 查看浏览器控制台错误
# Chrome DevTools → Console
```

### 问题 6: 前端显示 "No data"

**症状**:
- 页面加载完成但显示 "No data"

**可能原因**:
- API 响应格式不匹配
- 数据解析错误

**排查步骤**:
```bash
# 1. 检查 API 响应格式
curl https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current | jq '.data | keys'

# 应该包括: ["current_eub", "benchmark_price", "interrupter_total", "market_cycle"]

# 2. 检查前端是否正确解析数据
# DevTools → Console 输入:
# fetch('https://...').then(r => r.json()).then(console.log)
```

### 问题 7: 图表不显示

**症状**:
- 历史图表区域为空或显示错误

**可能原因**:
- ECharts 库加载失败
- 数据格式不正确
- DOM 元素不存在

**排查步骤**:
```bash
# 1. 检查 ECharts 是否加载
# DevTools → Console:
# console.log(echarts)  # 应该显示对象，非 undefined

# 2. 检查数据是否获取成功
# DevTools → Network → 查看 /api/v1/history 响应

# 3. 检查图表容器
# DevTools → Inspector → 搜索 "history-chart"
```

---

## 第 3 部分：数据管道问题

### 问题 8: GitHub Actions 自动同步失败

**症状**:
- GitHub Actions 工作流显示红色 ❌
- 日志显示"ETL failed"

**可能原因**:
1. Secrets 未配置
2. 网络连接失败
3. 数据源 (Yahoo Finance, NBEUB) 暂时不可用

**排查步骤**:
```bash
# 1. 检查 GitHub Actions 日志
# GitHub → Actions → 最新 workflow → 查看输出

# 2. 检查 Secrets 是否配置
# Settings → Secrets and variables → Actions
# 应该有 CLOUDFLARE_API_TOKEN 等

# 3. 本地测试 Python 脚本
cd scripts
python update_daily.py --dry-run

# 4. 测试数据源可访问性
python -c "import yfinance; print(yfinance.download('RB=F', period='1d'))"
```

### 问题 9: "Cannot parse EUB Excel"

**症状** (update_daily.py 错误):
```
ValueError: Cannot find 'Regular Unleaded Maximum with Delivery' in Excel
```

**可能原因**:
- NBEUB 官网更改了 Excel 格式
- 关键字匹配失败

**排查步骤**:
```bash
# 1. 检查官网 Excel 是否可下载
curl -I "https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls"

# 2. 本地查看 Excel 结构
python -c "
import pandas as pd
import requests
import io
url = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
df = pd.read_excel(io.BytesIO(requests.get(url).content), sheet_name='Current', header=None, engine='xlrd')
print(df.head(10))
"

# 3. 更新 update_daily.py 中的 ROW_KEYWORD_PRICE
```

### 问题 10: "Cannot download RBOB data"

**症状**:
```
Empty DataFrame returned from yfinance
```

**可能原因**:
1. Yahoo Finance API 暂时故障
2. 网络连接问题
3. yfinance 库版本问题

**排查步骤**:
```bash
# 1. 测试是否能连接 Yahoo Finance
python -c "import yfinance; print(yfinance.Ticker('RB=F').info)"

# 2. 更新 yfinance
pip install --upgrade yfinance

# 3. 检查网络代理设置
# 如果在代理下，配置 requests session
```

---

## 第 4 部分：数据库 (D1) 问题

### 问题 11: "D1_DB is not a function"

**症状** (Worker 错误):
```
TypeError: env.D1_DB is not a function
```

**可能原因**:
- 使用了过时的 D1 API

**排查步骤**:
```bash
# 1. 检查 API 用法
cat api/src/handlers/cycle.js | grep "env.D1_DB"

# 应该是:
# const db = env.D1_DB;
# db.prepare(...).bind(...).all()

# 2. 更新到最新的 wrangler 和兼容日期
npm install -g @cloudflare/wrangler@latest
```

### 问题 12: "Database locked"

**症状** (D1 错误):
```
database is locked
```

**可能原因**:
- 并发写入冲突
- 事务未提交

**排查步骤**:
```bash
# 1. 检查是否有其他进程在写入
ps aux | grep wrangler

# 2. 等待 1-2 分钟后重试
sleep 120
wrangler d1 execute nb-gas-db --command "SELECT 1"
```

---

## 第 5 部分：部署问题

### 问题 13: "wrangler publish" 失败

**症状**:
```
Error: Failed to publish worker
```

**可能原因**:
1. 认证失败
2. wrangler.toml 配置错误
3. 资源大小超限

**排查步骤**:
```bash
# 1. 检查认证
wrangler whoami

# 如果失败，重新认证
wrangler login

# 2. 验证 wrangler.toml
cat api/wrangler.toml | grep -E "^name|^main|^compatibility_date"

# 3. 检查代码大小 (Worker 限制 1MB)
npm run build
ls -lh dist/
```

### 问题 14: GitHub Pages 部署 404

**症状**:
- 访问 https://gas.jgao.app 显示 404
- 但 GitHub Pages 默认 URL 可用

**可能原因**:
- CNAME 文件未正确部署
- DNS 配置错误

**排查步骤**:
```bash
# 1. 检查 CNAME 文件
curl https://raw.githubusercontent.com/<user>/nb-gas-price-dashboard/main/web/public/CNAME

# 应该返回: gas.jgao.app

# 2. 检查 DNS 配置
nslookup gas.jgao.app
# 应该指向 <username>.github.io

# 3. 检查 GitHub Pages 设置中的自定义域
# Settings → Pages → 应该显示你的域名
```

---

## 第 6 部分：性能问题

### 问题 15: API 响应缓慢

**症状**:
- API 响应时间 > 1 秒

**可能原因**:
1. D1 查询缓慢
2. Worker 位置距离远
3. 缓存未启用

**排查步骤**:
```bash
# 1. 检查缓存头
curl -i https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current | grep -i "cache-control"

# 应该显示: Cache-Control: public, max-age=1800

# 2. 检查 D1 查询时间 (添加到 handler)
const start = Date.now();
const { results } = await db.prepare(...).all();
const duration = Date.now() - start;
console.log(`Query took ${duration}ms`);

# 3. 使用 Cloudflare Analytics 监控
```

---

## 第 7 部分：安全问题

### 问题 16: "不安全的敏感信息泄露"

**症状**:
- 代码中硬编码了 API 密钥或 Token

**修复**:
```bash
# 1. 撤销泄露的密钥
# Cloudflare Dashboard → 生成新 Token

# 2. 使用 Environment Variables
# wrangler.toml:
# [env.production]
# vars = { API_TOKEN = "xxxxx" }

# 3. 代码中访问
// const token = env.API_TOKEN;

# 4. 从 git 历史中移除敏感信息
# git filter-branch (或使用专门工具如 BFG)
```

---

## 第 8 部分：调试工具和技巧

### Curl 测试 API

```bash
# 周期洞察
curl -X GET https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current \
  -H "Accept: application/json" \
  -H "Origin: https://gas.jgao.app" \
  -v

# 历史查询
curl -X GET "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history?days=30" \
  -H "Accept: application/json"
```

### 浏览器开发者工具

```javascript
// Console 中测试 API
fetch('https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current')
  .then(r => r.json())
  .then(d => {
    console.log('API Response:', d);
    if (d.status === 'error') {
      console.error('Error:', d.error.message);
    }
  })
  .catch(e => console.error('Fetch failed:', e));
```

### Python 调试

```python
import requests
import json

# 测试 API
response = requests.get('https://...')
print(json.dumps(response.json(), indent=2))

# 测试数据抓取
import yfinance
data = yfinance.download('RB=F', period='1d')
print(data)
```

---

## 第 9 部分：获取帮助

### 内部资源
- 📖 [ARCHITECTURE.md](ARCHITECTURE.md) - 系统设计
- 👨‍💻 [BACKEND_GUIDE.md](BACKEND_GUIDE.md) - 后端代码
- 🎨 [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) - 前端代码

### 外部资源
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- D1 文档: https://developers.cloudflare.com/d1/
- wrangler CLI: https://developers.cloudflare.com/workers-cli/
- React 文档: https://react.dev/
- Vite 文档: https://vitejs.dev/

### 报告问题
- 创建 GitHub Issue
- 包括错误日志、复现步骤和环境信息

---

## 总结

| 问题类型 | 检查清单 |
|---------|---------|
| API 404 | ✅ 路由存在 ✅ Worker 已部署 ✅ URL 正确 |
| API 500 | ✅ D1 绑定配置 ✅ 环境变量 ✅ 权限 |
| 前端加载失败 | ✅ API 可访问 ✅ CORS 设置 ✅ 网络连接 |
| 数据为空 | ✅ D1 有数据 ✅ 初始化完成 ✅ 查询正确 |

**需要更多帮助？** → [KNOWN_ISSUES.md](KNOWN_ISSUES.md) - 已知问题和规划功能
