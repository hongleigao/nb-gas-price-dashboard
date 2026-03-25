# NB Gas Price Dashboard V7.0 - 系统终极设计与技术规范

## 1. 系统概述 (Overview)

NB Gas Price Dashboard (Fuel Architect) 是一个用于预测、监控和展示加拿大新不伦瑞克省 (New Brunswick) 汽油终端最高限价 (EUB Max Price) 的 Serverless 云原生应用。
系统完全摒弃了传统的服务器架构，采用低成本、高可用的方案，核心理念是：**基于数据事实计算风险，通过高阶数字架构师 (The Digital Architect) 的 UI 风格传达权威性。**

### 核心技术栈
- **数据源提取**: Python 3 (yfinance + pandas + requests + xlrd)
- **数据库**: Cloudflare D1 (Serverless SQLite)
- **后端 API**: Cloudflare Workers (Node.js ES Modules)
- **前端展示**: React 18 + Vite + Tailwind CSS + ECharts
- **CI/CD 与自动化**: GitHub Actions
- **静态托管**: GitHub Pages (Custom Domain: `gas.jgao.app`)

---

## 2. 物理目录结构 (Monorepo Architecture)

系统严格采用 Monorepo（单体仓库）结构，通过目录隔离不同的技术栈与部署目标，避免代码耦合。

```text
/ (Repository Root)
├── .github/workflows/        
│   └── main.yml            # CI/CD 流水线：自动抓取数据(Cron) + 自动部署 API + 自动部署前端
├── api/                    # Cloudflare Worker 后端服务
│   ├── src/  
│   │   ├── index.js        # Worker 入口，CORS 预检处理
│   │   ├── router.js       # 简易路由分发中心
│   │   └── handlers/       # 业务逻辑处理器 (cycle.js, history.js)
│   ├── package.json        # 后端依赖配置
│   └── wrangler.toml       # Cloudflare D1 与 Worker 的绑定配置
├── web/                    # React 前端代码
│   ├── src/  
│   │   ├── App.jsx         # 根组件，全局状态与页面路由切换
│   │   ├── components/     # UI 视图组件 (HeroBoard, CycleDetails, HistoryChart)
│   │   ├── main.jsx        # React DOM 挂载入口
│   │   └── index.css       # 全局样式与 Tailwind 指令
│   ├── public/
│   │   └── CNAME           # 自定义域名配置 (gas.jgao.app)
│   ├── package.json        # 前端依赖配置
│   ├── postcss.config.js   # Tailwind 编译支持
│   └── vite.config.js      # Vite 构建配置 (base 设定为 '/')
├── scripts/                # Python 数据抓取与洗洗管道
│   ├── requirements.txt    # Python 依赖清单
│   ├── update_daily.py     # 每日定时执行的增量抓取与同步脚本
│   └── seed_history.py     # 系统初始化：用于追溯和写入近两年历史数据的全量脚本
└── database/                 
    └── schema.sql          # D1 数据库建表与索引语句
```

---

## 3. 数据层设计 (Database Schema - Cloudflare D1)

数据库设计遵循极致极简原则。禁止在 D1 中编写复杂的存储过程，所有数学计算后置到 API 或前端。

### 3.1 表 1: `market_data` (市场行情数据事实表)
记录每日金融市场的收盘价。
- `date` (TEXT, PRIMARY KEY): 交易日期 `YYYY-MM-DD`。
- `rbob_usd_close` (REAL): NYMEX RBOB 汽油期货收盘价 (USD/Gal)。
- `cad_usd_rate` (REAL): 美元对加元汇率。
- `rbob_cad_base` (REAL, VIRTUAL): **虚拟生成列**。自动计算加元基准价 `rbob_usd_close * cad_usd_rate`。
- `is_weekend` (INTEGER): 是否为周末/非交易日（0或1），默认0。
- **索引**: `idx_market_date` 建立在 `date` 列。

### 3.2 表 2: `eub_prices` (EUB 官方定价记录表)
记录官方监管机构发布的最高限价记录。
- `effective_date` (TEXT, PRIMARY KEY): 价格生效日期 `YYYY-MM-DD`。
- `published_date` (TEXT): 价格公布日期。
- `max_price` (REAL): 官方公布的 Regular Unleaded Maximum Retail Price (¢/L)。
- `is_interrupter` (INTEGER): 是否为紧急熔断调整（1 为熔断，0 为常规周四调整）。
- `interrupter_variance` (REAL): 若为熔断，此次调价对比上次的差值（绝对偏离值）。
- **索引**: `idx_eub_effective_desc` 建立在 `effective_date DESC`，用于快速获取最新价格。

---

## 4. 数据管道机制 (ETL & Python Scripts)

### 4.1 数据流异常处理约束 (Ghost Data & FFill)
在 `scripts/update_daily.py` 和 `seed_history.py` 中：
1. **幽灵数据 (Ghost Data)**: `yfinance` 可能会返回某些假期/非交易日的空值（NaN）。必须使用 `rbob.dropna(subset=['Close'])` 过滤。
2. **汇率缺失**: 如果出现只有商品价格但缺汇率的情况，必须强制执行 `ffill()` (前向填充) 借用前一天的汇率。
3. **熔断判定**: 在抓取 EUB Excel 后，判断生效日期的 `weekday()`，**如果不等于 4（星期五生效，通常是周四晚公布，程序中计为4），则必定为 Interrupter 熔断。**

### 4.2 GitHub Actions 调度
- **Cron Job**: 每天触发两次，分别为 UTC 08:00 (美东凌晨，抓取前一日最终收盘) 和 UTC 22:30 (美东下午 18:30，抓取当日闭市数据)。
- **同步机制**: Python 脚本生成原生 SQL 语句，通过 Cloudflare 的 `npx wrangler d1 execute` 命令以批处理或覆盖更新 (`ON CONFLICT DO UPDATE`) 模式推送到远程 D1。

---

## 5. 后端 API 接口契约 (Cloudflare Workers)

API 统一提供 CORS Headers (`Access-Control-Allow-Origin: *`) 并设置合理的浏览器缓存 (`Cache-Control: public, max-age=1800`)。

### 5.1 GET `/api/v1/cycle/current` (当前周期洞察)
**核心算法 `getMonctonCycleDates()`**:
- 必须基于 `America/Moncton` 时区推算当前日期。
- 寻找距离当前最近的“上一个星期四”作为 `currentStartStr`（本周期起点）。
- 再往前推 7 天作为 `prevStartStr`（上周期起点）。

**响应结构**:
```json
{
  "status": "success",
  "data": {
    "current_eub": {
      "effective_date": "2026-03-22",
      "max_price": 182.0,
      "is_interrupter": 1,
      "interrupter_variance": 6.2
    },
    "benchmark_price": 4.1234, // 上一周期 (5天) 的 rbob_cad_base 平均值
    "interrupter_total": 6.2,  // 本周期内发生的所有熔断差值总和 (解决1周内多次熔断的 Bug)
    "market_cycle": [
      { "date": "2026-03-23", "absolute_price": 4.1567, "is_weekend": 0 }
    ]
  },
  "meta": { "last_sync_time": "2026-03-24", "timezone": "America/Moncton" }
}
```

### 5.2 GET `/api/v1/history?days=90` (双轨历史数据)
**完美断线修复逻辑 (LOCF Anchor)**:
- 为了防止 ECharts 在图表左侧画出断线，查询 `eub_prices` 时，必须获取**指定日期窗口前最后一次生效**的价格作为起点锚点（LOCF算法）。
- 接口并行返回 `eub_history` 和 `market_history` 数组。

---

## 6. 前端业务逻辑与 UI 架构 (The Digital Architect)

### 6.1 设计语言约束 (Design System)
- **主题风格**: 极简的高阶情报面板，禁止使用花哨的阴影，全靠背景色差体现层级。
- **色彩层次**: 
  - `surface` (#f8f9fa) - 画布底色
  - `surface-container-low` (#f3f4f5) - 基础容器块
  - `surface-container-lowest` (#ffffff) - 数据卡片
  - `primary-container` (#1e3a8a) - Hero 主预测区背景
- **排版 (Typography)**: `Manrope` 用于权威数字和标题；`Inter` 用于说明文本和标签。
- **边框约束 (No-Line Rule)**: 严禁使用 1px 的 solid borders 作为卡片分割，完全依赖 Tonal Depth。

### 6.2 组件物理映射与算法

#### 6.2.1 `HeroBoard.jsx` (主看板与风险计算引擎)
前端不再依赖后端计算复杂的差值，而是承接预测逻辑。
- **单位转换**: 所有的 `rbob_cad_base` 需要通过公式 `(price / 3.7854) * 100` 转化为 `加分/升 (¢/L)`。
- **市区预估价 (Pump Estimated Price)**: 永远等于 `current_eub.max_price - 5.5`。
- **预测变动 (predicted_change)**: `= 市场当周平均偏离值 - 周期内已发生的累计熔断变动值 (interrupter_total)`。
- **熔断风险等级核心算法**:
  1. 计算 **单日最大波幅 (max_daily_variance)** = 今天绝对价 - 昨天绝对价 (如果只有1天，则是今天 - benchmark)。
  2. 计算 **累计残余差值 (current_risk_variance)** = `Math.abs(predicted_change)`。
  3. **分级规则**:
     - `Alert` (极危): 残余差值 >= 5.0 ¢ 或 单日波幅 >= 6.0 ¢。
     - `High` (高危): 残余差值 >= 4.0 ¢ 且未触发 Alert。
     - `Medium` (中危): 残余差值 >= 3.0 ¢。
     - `Low` (低危): 其他情况。

#### 6.2.2 `CycleDetails.jsx` (公式推演详情)
- 二级页面，隐藏底部导航栏。
- 顶层展示 `NYMEX RBOB / 85.0 ¢ × USD/CAD` 的核心公式逻辑。
- 逐日渲染 5 天滚动周期的市场差异，增加数据的透明度。

#### 6.2.3 `HistoryChart.jsx` (趋势图表)
- 利用 `echarts` 绘制双 Y 轴图表。
- **左轴 (EUB Max Price)**: 必须使用 `type: 'line', step: 'end'` 绘制成严谨的阶梯线，颜色 `#00236f`，宽度 `4px`。
- **右轴 (Market RBOB Cost)**: 使用平滑曲线 (`smooth: true`) 与微透明面积渐变色来衬托阶梯线。

---

## 7. 部署与环境约束 (Deployment)

1. **Vite 根路径映射**:
   - `vite.config.js` 中的 `base` 必须被设定为 `'/'`，因为 GitHub Pages 挂载了自定义域名 `gas.jgao.app`，网站是从根域提供服务的。
   - `web/public/CNAME` 必须包含 `gas.jgao.app`，以确保 GitHub 自动重定向。
2. **API 自动嗅探**:
   - 前端网络请求使用 `window.location.hostname` 探测，如果是 `127.0.0.1` 则请求本地 Worker `8787` 端口；否则请求 Cloudflare 线上地址 `https://nb-gas-pulse-api.honglei-gao.workers.dev`。

--- 
*本设计文档定义了系统的绝对真理。任何后续的代码修改、功能迭代都必须基于此文档的约束进行。*
