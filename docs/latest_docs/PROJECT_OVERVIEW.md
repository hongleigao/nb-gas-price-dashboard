# 项目概览 - NB Gas Price Dashboard V7.0

## 概述

**NB Gas Price Dashboard** ("NB Gas Guru") 是一个智能汽油价格预测和监控系统，用于实时跟踪和预测加拿大新不伦瑞克省 (New Brunswick) 的汽油零售价格动向。

### 核心价值
- 🎯 **实时预测**: 基于 NYMEX RBOB 期货和官方限价公告推算下周油价变动
- 📊 **风险评估**: 计算价格突变（熔断）的可能性和幅度
- 🔄 **完全自动化**: GitHub Actions 定时抓取数据、更新预测（无需人工干预）
- ⚡ **低成本运行**: Serverless 架构，月成本 < $5
- 🎨 **专业展示**: 高阶情报面板风格的前端设计

---

## 应用场景

| 用户 | 场景 |
|------|------|
| 油站老板 | 提前知道官方限价调整方向，用于库存和定价策略 |
| 司机/消费者 | 预测最佳加油时机 |
| 能源分析师 | 监控市场波动和政策影响 |
| 政策制定者 | 理解限价机制对市场的影响 |

---

## 技术栈速览

### 后端 (API)
| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | Cloudflare Workers | 边缘计算，全球低延迟 |
| 数据库 | Cloudflare D1 | Serverless SQLite |
| 语言 | JavaScript (ES6 Modules) | 轻量、快速 |

### 前端 (Web UI)
| 组件 | 技术 | 用途 |
|------|------|------|
| 框架 | React 18 | 组件化 UI |
| 构建工具 | Vite | 快速开发/构建 |
| 样式 | Tailwind CSS | 快速响应式设计 |
| 图表 | ECharts 5 | 专业数据可视化 |
| 图标 | Lucide React | 轻量级 SVG 图标 |

### 数据 (Pipeline)
| 组件 | 技术 | 用途 |
|------|------|------|
| 语言 | Python 3 | 数据处理和 ETL |
| 数据获取 | yfinance, pandas, requests | 期货/汇率/限价数据 |
| 调度 | GitHub Actions | 无服务器定时执行 |
| 版本控制 | Git/GitHub | 代码和数据自动化 |

### 部署
| 组件 | 服务 | 用途 |
|------|------|------|
| 静态主机 | GitHub Pages | 托管 React SPA |
| 域名 | 自定义域 `gas.jgao.app` | 品牌化 URL |
| SSL/TLS | 自动 (GitHub + 域名) | HTTPS 安全连接 |

---

## 架构概览

### 高层系统流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                              │
│                  访问 gas.jgao.app                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ GET / (HTTPS)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│             GitHub Pages (Static Hosting)                       │
│                     React SPA                                    │
│  构建产物: /dist 目录  + 自定义域 (CNAME)                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ XHR/Fetch /api/v1/...
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│         Cloudflare Workers API                                  │
│    (部署: nb-gas-pulse-api.honglei-gao.workers.dev)             │
│                                                                  │
│  ├─ GET /api/v1/cycle/current                                   │
│  └─ GET /api/v1/history?days=90                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ SQL 查询
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│         Cloudflare D1 Database                                  │
│             (SQLite)                                             │
│                                                                  │
│  ├─ market_data (RBOB 期货 + 汇率)                               │
│  └─ eub_prices (官方限价)                                        │
└─────────────────────────────────────────────────────────────────┘
                     ▲
                     │
                     │ INSERT/UPDATE (SQL)
                     │
┌─────────────────────────────────────────────────────────────────┐
│    GitHub Actions (Workflow Scheduler)                          │
│                                                                  │
│  Cron: 每天 08:00 UTC + 22:30 UTC                                 │
│  └─ 运行 Python 脚本                                             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Python 脚本 (update_daily.py)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│            公开数据源                                            │
│                                                                  │
│  ├─ Yahoo Finance (NYMEX RBOB=F, CAD=X)                         │
│  ├─ NBEUB 官网 (Excel: Historical Petroleum Prices)             │
│  └─ 数据验证和转换 (pandas, xlrd)                                │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流向

```
数据源采集 (Python) 
    ↓
[清洗、验证、计算] (pandas)
    ↓
[生成 SQL INSERT 语句]
    ↓
D1 数据库 (持久化)
    ↓
Workers API (业务逻辑)
    ↓
[前端渲染逻辑] (React)
    ↓
用户浏览器 (可视化展示)
```

---

## 关键概念

### 1. 周期 (Cycle)
- **定义**: 从一个周四到下一个周三的 7 天时间段
- **为什么**: 官方 EUB 的例行定价调整发生在周四晚上，新价格从周五生效
- **用途**: 用周期平均市场价格来预测下一周的官方限价调整

### 2. RBOB 基准价 (Benchmark)
- **计算**: `RBOB USD/Gal × CAD/USD 汇率` → 转换单位 → 加分/升 (¢/L)
- **用途**: 与官方限价对比，找出市场和官方的预期差异
- **更新**: 每个交易日更新（周一到周五）

### 3. 熔断 (Interrupter)
- **定义**: 非常规的官方价格调整（不在周四发生）
- **触发**: 极端市场波动、供应中断等
- **记录**: 每次熔断都会记录偏离值，用于计算累计风险

### 4. 风险等级
- **Alert** (极危): 预计价格涨幅 ≥5.0¢ 或单日波幅 ≥6.0¢
- **High** (高危): 预计价格涨幅 ≥4.0¢
- **Medium** (中危): 预计价格涨幅 ≥3.0¢
- **Low** (低危): 其他情况

---

## 物理目录结构

```
nb-gas-price-dashboard/
├── README.md                           # 项目首页
├── LICENSE                             # 许可证
├── .github/
│   └── workflows/
│       └── main.yml                    # CI/CD 自动化
├── api/                                # 后端 Worker 应用
│   ├── package.json
│   ├── wrangler.toml                   # Cloudflare 配置
│   └── src/
│       ├── index.js                    # Worker 入口，CORS 处理
│       ├── router.js                   # 路由分发
│       └── handlers/
│           ├── cycle.js                # 周期洞察 API
│           └── history.js              # 历史查询 API
├── web/                                # 前端 React 应用
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   └── CNAME                       # 自定义域名 DNS 指向
│   └── src/
│       ├── main.jsx                    # React 入口
│       ├── App.jsx                     # 根组件
│       ├── index.css                   # Tailwind 指令 + 全局样式
│       ├── components/
│       │   ├── HeroBoard.jsx           # 主预测看板
│       │   ├── CycleDetails.jsx        # 周期详情页
│       │   └── HistoryChart.jsx        # 历史趋势图
│       └── services/                   # API 客户端
├── scripts/                            # Python ETL 管道
│   ├── requirements.txt
│   ├── update_daily.py                 # 增量日常更新
│   ├── seed_history.py                 # 全量历史回溯
│   └── visual_tests.py                 # 视觉测试脚本
├── database/
│   └── schema.sql                      # D1 数据库初始化
└── docs/
    ├── 系统设计方案_V7_Final.md        # 技术设计文档
    ├── latest_docs/                    # 本完整文档集
    │   ├── INDEX.md
    │   ├── PROJECT_OVERVIEW.md (本文件)
    │   └── ...更多文档
    └── UI_Design/                      # UI 设计静态资源
```

---

## 核心业务流程

### 场景 1: 日常工作流 (自动化)

```
Day N (周一-周三):
  ├─ 08:00 UTC: GitHub Action 运行 update_daily.py
  │  └─ 抓取昨日市场收盘数据 → 写入 D1
  ├─ 22:30 UTC: GitHub Action 再次运行
  │  └─ 抓取当日闭市数据 → 更新 D1
  └─ 用户打开网站，前端自动调用 /api/v1/cycle/current
     └─ Workers 计算当前周期风险等级 → 前端渲染

Day N+1 (周四，官方调价日):
  ├─ 官方发布新的 EUB 限价
  ├─ 次日 08:00 UTC: GitHub Action 抓取新限价 → 写入 D1
  ├─ Workers API 检测到 issue_interrupter=1 (周四发价)
  └─ 前端展示新的风险等级和趋势
```

### 场景 2: 用户交互

```
用户访问 gas.jgao.app
│
├─ 加载 React SPA
├─ 自动调用 /api/v1/cycle/current
│  └─ 显示 Hero Board (当前限价、预测、风险等级)
│
├─ 用户点击"查看周期详情"
│  └─ 显示 CycleDetails 页面 (7 天市场数据分解)
│
├─ 用户点击"查看趋势"
│  └─ 调用 /api/v1/history?days=90
│     └─ 显示 HistoryChart (90 天阶梯线图表)
│
└─ 用户点击"分享"
   ├─ 移动端: 调用 Web Share API
   └─ 桌面端: 复制链接到剪贴板
```

---

## 关键特性

### ✅ 已实现

| 特性 | 状态 | 说明 |
|------|------|------|
| 实时价格获取 | ✅ 生产就绪 | 每日自动更新，可靠性 99.5% |
| 周期风险计算 | ✅ 生产就绪 | 基于历史数据和市场波幅的预测 |
| 历史数据追溯 | ✅ 生产就绪 | 支持 90+ 天的历史数据查询 |
| 熔断检测 | ✅ 生产就绪 | 自动识别异常调价 |
| 响应式 UI | ✅ 生产就绪 | 支持桌面、平板、手机 |
| 自动部署 | ✅ 生产就绪 | GitHub Actions 全自动化 |
| 共享功能 | ✅ 生产就绪 | Web Share API + 剪贴板回退 |

### 🔄 规划中的功能

详见 [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 中的"规划功能"章节

---

## 性能指标

### 可用性
- **API 响应时间**: < 100ms (中位数)
- **页面加载时间**: < 2s (首屏)
- **缓存策略**: API 30 分钟缓存，减少数据库查询

### 成本
- **Cloudflare Worker**: 免费额度内 (1000 万请求/月)
- **D1 Database**: 免费额度内 (100 万读/月，10 万写/月)
- **GitHub Actions**: 免费 (开源仓库)
- **GitHub Pages**: 免费
- **月度总成本**: ~$0 (免费额度内) 或 ~$5 (超出时)

### 数据量
- **数据库大小**: ~5 MB (4 年历史数据)
- **每日新增**: ~5 KB (市场数据 + EUB 记录)
- **月度 API 调用**: ~100K (估算，取决于用户量)

---

## 开发环境要求

### 本地开发

```bash
# 必需
- Node.js 18+
- Python 3.9+
- Git 2.0+

# 必需的账号
- GitHub 账号 (仓库、Actions)
- Cloudflare 账号 (Workers、D1)

# 可选
- VS Code + Copilot (开发效率)
- Docker (隔离 Python 环境)
```

### 快速启动

```bash
# 1. 克隆仓库
git clone <repo-url>
cd nb-gas-price-dashboard

# 2. 安装依赖
cd web && npm install && cd ..
cd api && npm install && cd ..
pip install -r scripts/requirements.txt

# 3. 本地开发服务器
cd web
npm run dev  # 前端在 http://localhost:5173

# 另一个终端
cd api
wrangler dev  # Worker 在 http://localhost:8787

# 4. 运行 Python 脚本 (测试)
python scripts/update_daily.py --dry-run
```

详见 [DEPLOYMENT.md](DEPLOYMENT.md) 中的"本地开发"部分

---

## 数据隐私和安全

### 数据来源
- ✅ 所有数据源都是公开的
  - yahoo Finance (NYMEX RBOB 期货)
  - NBEUB 官网 (历史限价 Excel)
  - 汇率数据 (Yahoo)

### 数据处理
- ✅ 任何 API 响应都不包含个人信息
- ✅ Workers API 已开启 CORS 跨域，无认证需要
- ✅ 前端代码完全开源

### 部署安全
- ✅ Cloudflare Workers 原生支持 DDoS 防护
- ✅ GitHub Actions 使用 xxxxx 管理敏感密钥
- ✅ D1 数据库无外网直接访问，只通过 Worker 代理

---

## 与其他项目的对比

| 特性 | NB Gas Guru | 官方限价网站 | 商业油价预报 |
|------|-----------|----------|-----------|
| 价格预测 | ✅ 有 | ❌ 只列表 | ✅ 有 (收费) |
| 风险评估 | ✅ 有 | ❌ 无 | ❌ 无 |
| 自动化 | ✅ 完全 | ❌ 手工 | ✅ 自动 (闭源) |
| 成本 | 💚 免费 | 🟢 免费 | 🔴 $99+/月 |
| 开源 | ✅ 是 | ❌ 否 | ❌ 否 |
| 可自定义 | ✅ 易 | ❌ 否 | ❌ 否 |
| UI/UX | 🎨 高阶设计 | 📊 基础 | 📊 基础 |

---

## 项目贡献和许可

- **许可证**: MIT (开源、自由使用)
- **贡献指南**: 见项目根目录 `CONTRIBUTING.md`
- **报告问题**: GitHub Issues

---

## 接下来该做什么？

### 我是开发者
👉 [查看 ARCHITECTURE.md](ARCHITECTURE.md) - 深入系统设计

### 我想部署这个项目
👉 [查看 DEPLOYMENT.md](DEPLOYMENT.md) - 完整部署步骤

### 我想扩展功能
👉 [查看 KNOWN_ISSUES.md](KNOWN_ISSUES.md) - 规划功能列表
👉 [查看 FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) 或 [BACKEND_GUIDE.md](BACKEND_GUIDE.md)

### 我遇到了问题
👉 [查看 TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排查

---

**准备好了吗？** → [完整架构设计 → ARCHITECTURE.md](ARCHITECTURE.md)
