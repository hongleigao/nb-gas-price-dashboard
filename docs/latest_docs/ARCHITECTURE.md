# 系统架构设计 - NB Gas Price Dashboard

## 概述

本章节深入讲解 NB Gas Price Dashboard 的系统设计、核心算法和实现约束。这是开发者必读的技术参考。

---

## 第 1 部分：数据库设计 (Cloudflare D1)

### 1.1 表 1: `market_data` - 市场行情数据

**用途**: 记录每日 NYMEX RBOB 汽油期货的收盘价和 USD/CAD 汇率

```sql
CREATE TABLE IF NOT EXISTS market_data (
    date TEXT PRIMARY KEY,                                    -- 交易日期 'YYYY-MM-DD'
    rbob_usd_close REAL NOT NULL,                             -- RBOB 汽油期货收盘价 (USD/Gal)
    cad_usd_rate REAL NOT NULL,                               -- 美元对加元汇率
    rbob_cad_base REAL GENERATED ALWAYS AS 
      (rbob_usd_close * cad_usd_rate) VIRTUAL,                -- 虚拟列：加元基准价
    is_weekend INTEGER DEFAULT 0                             -- 是否为周末/假期 (0 或 1)
);
CREATE INDEX IF NOT EXISTS idx_market_date ON market_data(date);
```

**数据流**:
```
Python 脚本获取数据
    ↓
yfinance 获取 NYMEX RB=F (RBOB 期货)
yfinance 获取 CAD=X (汇率)
    ↓
清洗数据 (dropna, ffill)
    ↓
生成 INSERT/UPDATE SQL
    ↓
wrangler d1 execute 写入 D1
    ↓
Workers API 计算 rbob_cad_base (单位转换为 ¢/L)
```

**单位转换公式**:
```
加分/升 (¢/L) = (USD/Gal) × (CAD/USD) × 100 / 3.7854
                = rbob_cad_base × 100 / 3.7854

注释:
- 3.7854 是 1 加仑 (US) = 3.7854 升的转换系数
- 乘以 100 是因为我们需要分而不是美元
```

**示例数据**:
```
date            rbob_usd_close  cad_usd_rate  rbob_cad_base  is_weekend
2026-03-24      2.891           1.3565        3.9233         0
2026-03-23      2.877           1.3568        3.9086         0
2026-03-20      2.894           1.3580        3.9348         0
2026-03-19      2.887           1.3585        3.9258         0
(周末无数据)
2026-03-18      2.899           1.3590        3.9406         0
```

**约束**:
- ⚠️ `date` 必须是 'YYYY-MM-DD' 格式，无时间戳
- ⚠️ 必须过滤掉非交易日的 NaN (使用 `dropna(subset=['Close'])`)
- ⚠️ 汇率缺失时，使用 `ffill()` (向前填充) 借用前一天的汇率

---

### 1.2 表 2: `eub_prices` - EUB 官方限价

**用途**: 记录官方 NBEUB 发布的加油站最高限价

```sql
CREATE TABLE IF NOT EXISTS eub_prices (
    effective_date TEXT PRIMARY KEY,      -- 价格生效日期 'YYYY-MM-DD'
    published_date TEXT NOT NULL,         -- 价格公布日期 (通常在生效前一天)
    max_price REAL NOT NULL,              -- 官方最高零售价 (¢/L) "Regular Unleaded"
    is_interrupter INTEGER NOT NULL DEFAULT 0,  -- 是否为熔断 (0=常规周四, 1=熔断)
    interrupter_variance REAL DEFAULT 0,  -- 熔断幅度 (环比差值，仅当 is_interrupter=1)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eub_effective_desc ON eub_prices(effective_date DESC);
```

**数据流**:
```
Python 脚本抓取 EUB Excel
    ↓
解析 "Regular Unleaded Maximum with Delivery" 列
    ↓
检测每条记录的 effective_date 的 weekday()
    ↓
if weekday() != 4 (周四): is_interrupter = 1
else: is_interrupter = 0
    ↓
计算 interrupter_variance = 当前价 - 前一条记录的价
    ↓
INSERT/UPDATE 到 D1
```

**示例数据**:
```
effective_date  published_date  max_price  is_interrupter  interrupter_variance
2026-03-24      2026-03-23      182.0      0               0.0          (周四常规)
2026-03-17      2026-03-16      180.4      0               -1.6         (周四常规)
2026-03-10      2026-03-09      182.0      0               1.6          (周四常规)
2026-02-27      2026-02-26      185.2      1               3.2          (周五，熔断↑)
2026-02-23      2026-02-22      182.0      0               -3.2         (周四常规↓)
```

**熔断判定逻辑**:

```python
# 伪代码 (来自 update_daily.py)
for row in eub_data:
    date = row['effective_date']
    weekday = date.weekday()  # 0=Mon, 4=Thu, 5=Fri...
    
    # 官方例行调整发生在周四晚（收盘后），周五生效
    # 所以在我们的系统中：
    # - 周四生效 (weekday=3) 的是前一天公布的
    # - 周五或其他日期生效的都是熔断
    
    if weekday != 4:  # 如果不是常规的周四生效
        is_interrupter = 1
        interrupter_variance = current_price - previous_price
    else:
        is_interrupter = 0
        interrupter_variance = 0
```

⚠️ **注意**: 这里有一个细微的时区问题。官方在"周四下午 13:00 Atlantic Time"发布价格，周五 00:01 生效。系统内部使用 America/Moncton 时区统一处理。

---

## 第 2 部分：后端 API 设计 (Cloudflare Workers)

### 2.1 核心工作流

```
User Request
    ↓
CloudFlare Workers (edge node)
    ↓
CORS 检查 + 路由匹配
    ↓
Handler 函数 (cycle.js / history.js)
    ↓
D1 数据库查询
    ↓
数据计算和聚合
    ↓
JSON 响应 + Cache Headers
    ↓
User Browser
```

### 2.2 路由设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/cycle/current` | GET | 当前周期洞察（当前限价、预测、风险等级） |
| `/api/v1/history` | GET | 历史查询（支持 days 参数，默认 30） |

### 2.3 API #1: 周期洞察 - `/api/v1/cycle/current`

**请求**:
```
GET https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current
```

**响应示例**:
```json
{
  "status": "success",
  "data": {
    "current_eub": {
      "effective_date": "2026-03-24",
      "max_price": 182.0,
      "is_interrupter": 0,
      "interrupter_variance": 0.0
    },
    "benchmark_price": 4.1234,
    "interrupter_total": 3.2,
    "market_cycle": [
      { "date": "2026-03-20", "absolute_price": 4.0956, "is_weekend": 0 },
      { "date": "2026-03-21", "absolute_price": 4.1156, "is_weekend": 0 },
      { "date": "2026-03-22", "absolute_price": 4.1167, "is_weekend": 0 },
      { "date": "2026-03-23", "absolute_price": 4.1156, "is_weekend": 0 },
      { "date": "2026-03-24", "absolute_price": 4.1234, "is_weekend": 0 }
    ]
  },
  "meta": {
    "last_sync_time": "2026-03-24",
    "timezone": "America/Moncton"
  }
}
```

**核心算法: getMonctonCycleDates()**

```javascript
function getMonctonCycleDates() {
    // 1. 强制转换当前日期到 America/Moncton 时区
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Moncton', 
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayStr = formatter.format(new Date());  // "2026-03-24"
    
    // 2. 解析成日期
    const [y, m, d] = todayStr.split('-').map(Number);
    const todayDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = todayDate.getUTCDay();  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    
    // 3. 核心逻辑：找最近的"上一个周四"作为本周期起点
    // 
    // 情景 1: 周一 (dayOfWeek=1)
    //   daysSinceThu = 1 - 4 = -3
    //   daysSinceThu <= 0 → daysSinceThu += 7 → daysSinceThu = 4
    //   本周期起点 = 今天 - 4 天 = 前个周四
    // 
    // 情景 2: 周四 (dayOfWeek=4)
    //   daysSinceThu = 4 - 4 = 0
    //   daysSinceThu <= 0 → daysSinceThu += 7 → daysSinceThu = 7
    //   本周期起点 = 今天 - 7 天 = 上周四（NOT 本周四！）
    //   原因: 在周四全天，我们展示上周期的预测，直到周五凌晨跨日
    //
    // 情景 3: 周五 (dayOfWeek=5)
    //   daysSinceThu = 5 - 4 = 1
    //   daysSinceThu > 0 → 无处理
    //   本周期起点 = 今天 - 1 天 = 昨天周四
    
    let daysSinceThu = dayOfWeek - 4;
    if (daysSinceThu <= 0) daysSinceThu += 7;
    
    // 4. 计算周期边界
    const currentStart = new Date(todayDate);
    currentStart.setUTCDate(todayDate.getUTCDate() - daysSinceThu);
    
    // 周期结束 = 周三 
    // (防止周四晚新市场数据污染本周期计算)
    const currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentStart.getUTCDate() + 6);
    
    // 上一周期起点
    const prevStart = new Date(currentStart);
    prevStart.setUTCDate(currentStart.getUTCDate() - 7);
    
    return {
        currentStartStr: currentStart.toISOString().split('T')[0],
        currentEndStr: currentEnd.toISOString().split('T')[0],
        prevStartStr: prevStart.toISOString().split('T')[0]
    };
}
```

**字段说明**:

| 字段 | 说明 | 计算方式 |
|------|------|---------|
| `current_eub` | 当前生效的官方限价 | 本周期内最后一条 EUB 记录 (可能是常规或熔断) |
| `benchmark_price` | 上一个周期的平均市场基准价 | `sum(rbob_cad_base 上周期 5 个交易日) / 5` |
| `interrupter_total` | 本周期内所有熔断累计幅度 | `sum(interrupter_variance: is_interrupter=1)` |
| `market_cycle` | 本周期的 5 日市场行情 | 按日期升序排列，仅交易日 |

🔍 **深度解析: interrupter_total 为何存在?**
- **问题**: 在一个周期内可能发生 2+ 次官方熔断调价
- **举例**: 周一熔断 +3.2¢, 周三再次熔断 +2.1¢
- **错误做法**: 只取最后一条记录的 interrupter_variance = 2.1¢ (遗漏了 3.2¢)
- **正确做法**: 累加所有熔断: interrupter_total = 3.2 + 2.1 = 5.3¢

---

### 2.4 API #2: 历史查询 - `/api/v1/history`

**请求**:
```
GET https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history?days=90
```

**查询参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `days` | 整数 | 30 | 查询过去多少天的数据 |

**响应示例**:
```json
{
  "status": "success",
  "data": {
    "eub_history": [
      {
        "date": "2026-03-24",
        "max_price": 182.0,
        "is_interrupter": 0
      },
      {
        "date": "2026-03-17",
        "max_price": 180.4,
        "is_interrupter": 0
      }
    ],
    "market_history": [
      {
        "date": "2026-03-24",
        "rbob_cad_base": 4.1234
      },
      {
        "date": "2026-03-23",
        "rbob_cad_base": 4.1156
      }
    ]
  },
  "meta": {
    "query_days": 90,
    "start_date": "2025-12-24"
  }
}
```

**核心算法: LOCF (Last Observation Carried Forward) 锚点**

```sql
-- 问题: 为防止图表左侧出现断线，我们需要在查询窗口之外找到最后一次有效的价格

SELECT effective_date as date, max_price, is_interrupter 
FROM eub_prices 
WHERE effective_date >= (
    -- 内层查询: 找 start_date 之前的最后一条有效记录
    SELECT IFNULL(MAX(effective_date), '1970-01-01') 
    FROM eub_prices 
    WHERE effective_date <= ?  -- start_date
)
ORDER BY effective_date DESC

-- 示例:
-- start_date = '2026-01-01'
-- 内层返回: '2025-12-26' (最后一条在 2026-01-01 前的记录)
-- 外层返回: ['2025-12-26', ..., '2026-01-01', ..., '2026-03-31']
-- 结果: 图表从 12-26 开始，完整展示 01-01 到 03-31 的阶梯线
```

**为什么需要 LOCF?**

```
❌ 错误做法 (简单过滤):
  SELECT * FROM eub_prices WHERE date >= '2026-01-01'
  
  结果: 
  ┌─────────────────────┐
  │                     │ (12-26 到 01-01 的价格未定义)
  │ ╱                   │
  ├─────────────────────┤
  │ 2026-01-01 ← 才开始有数据
  └─────────────────────┘

✅ 正确做法 (LOCF 锚点):
  结果:
  ┌─────────────────────────┐
  │ ________              │ (12-26 的价格向前传播到 01-01)
  │ ╱      ╲               │
  ├─────────────────────────┤
  │ 2025-12-26 ... 2026-01-01
  └─────────────────────────┘
```

---

## 第 3 部分：前端业务逻辑 (React)

### 3.1 设计语言约束

#### 色彩系统

| 用途 | 颜色 | HEX | Tailwind |
|------|------|-----|----------|
| 画布底色 | Light Grey | #f8f9fa | `bg-slate-50` |
| 基础容器 | Lighter Grey | #f3f4f5 | `bg-slate-100` |
| 数据卡片 | White | #ffffff | `bg-white` |
| Hero 主区背景 | Deep Blue | #1e3a8a | `bg-blue-900` |
| 文字主要 | Dark Grey | #323232 | `text-slate-800` |
| 文字次要 | Grey | #757575 | `text-slate-600` |

#### 排版

| 用途 | 字体 | 场景 |
|------|------|------|
| 权威数字和标题 | Manrope | Hero 区域的大号数字、卡片标题 |
| 说明文本和标签 | Inter | 亚标题、描述、小标签 |
| 代码/数据 | Monospace | API 响应、错误信息 |

#### 禁止事项

- ❌ 1px solid border 作为卡片分割（改用 bg 色差）
- ❌ 深阴影和蓝色渐变（改用 flat 设计）
- ❌ 花哨的动画和过渡（改用微妙的变化）

### 3.2 主要组件：HeroBoard.jsx

**职责**: 
- 展示当前官方限价和预测
- 计算风险等级
- 驱动页面的主视图

**数据流**:
```
App.jsx (fetch /api/v1/cycle/current)
    ↓
data = {
  current_eub: { max_price, is_interrupter, ... },
  benchmark_price,
  interrupter_total,
  market_cycle: [...]
}
    ↓
HeroBoard.jsx
    ├─ 渲染当前限价 (current_eub.max_price)
    ├─ 计算加油站预估零售价 = max_price - 5.5
    ├─ 计算预测变动 = 市场周期均值 - benchmark_price - interrupter_total
    ├─ 判定风险等级 (Alert / High / Medium / Low)
    └─ 渲染结果
```

**关键算法：风险等级计算**

```javascript
function calculateRiskLevel(data) {
  // 1. 计算单日最大波幅
  const dailyVariances = [];
  for (let i = 0; i < data.market_cycle.length; i++) {
    let variance;
    if (i === 0 && data.market_cycle.length === 1) {
      // 只有当前一天，与 benchmark 比较
      variance = data.market_cycle[0].absolute_price - data.benchmark_price;
    } else if (i > 0) {
      // 与昨天比较
      variance = data.market_cycle[i].absolute_price - data.market_cycle[i - 1].absolute_price;
    }
    if (variance !== undefined) {
      dailyVariances.push(Math.abs(variance));
    }
  }
  const maxDailyVariance = Math.max(...dailyVariances, 0);
  
  // 2. 计算周期平均和预测变动
  const cycleAvg = data.market_cycle.length > 0
    ? data.market_cycle.reduce((sum, r) => sum + r.absolute_price, 0) / data.market_cycle.length
    : 0;
  
  const predictedChange = cycleAvg - data.benchmark_price - data.interrupter_total;
  const currentRiskVariance = Math.abs(predictedChange);
  
  // 3. 分级规则
  if (currentRiskVariance >= 5.0 || maxDailyVariance >= 6.0) {
    return { level: 'Alert', color: '#ef4444', label: '极危' };
  } else if (currentRiskVariance >= 4.0) {
    return { level: 'High', color: '#f97316', label: '高危' };
  } else if (currentRiskVariance >= 3.0) {
    return { level: 'Medium', color: '#eab308', label: '中危' };
  } else {
    return { level: 'Low', color: '#22c55e', label: '低危' };
  }
}
```

**单位转换**:
```javascript
// D1 返回的 rbob_cad_base 是 "CAD/Gal"
// 需要转换为 "¢/L" 供前端展示

function convertTocentPerLiter(rbobCadBase) {
  // rbobCadBase: CAD/Gal
  // 1 Gal (US) = 3.7854 L
  // Result: (CAD/Gal) / 3.7854 × 100 = ¢/L
  return (rbobCadBase / 3.7854) * 100;
}

// 示例
const rbobCadBase = 4.1234;  // CAD/Gal
const centPerLiter = (4.1234 / 3.7854) * 100;
console.log(centPerLiter);  // ~109.06 ¢/L
```

---

### 3.3 历史图表：HistoryChart.jsx

**使用 ECharts 绘制双 Y 轴图表**

```javascript
const option = {
  xAxis: {
    type: 'category',
    data: dates
  },
  yAxis: [
    {
      name: 'EUB Max Price (¢/L)',
      type: 'value',
      position: 'left',
      axisLabel: { formatter: '{value}' }
    },
    {
      name: 'Market RBOB Cost (×100)',
      type: 'value',
      position: 'right'
    }
  ],
  series: [
    {
      name: 'EUB Limit',
      type: 'line',
      step: 'end',      // 关键: 绘制阶梯线，不是光滑曲线
      yAxisIndex: 0,
      data: eubPrices,
      lineStyle: { color: '#00236f', width: 4 },
      symbol: 'none'
    },
    {
      name: 'Market Price',
      type: 'line',
      smooth: true,     // 光滑曲线
      yAxisIndex: 1,
      data: marketPrices,
      lineStyle: { color: '#3b82f6' },
      areaStyle: { color: 'rgba(59, 130, 246, 0.1)' }
    }
  ]
};
```

**为什么 EUB 用阶梯线 (step: 'end')?**
```
官方限价是"台阶型"的 - 它在某个日期有效，直到下一个调整日

❌ 不用阶梯线的后果:
  价格
  180 ┌────────╱──────────╱
      │      ╱          ╱
  170 └────╱──────────╱────

✅ 用阶梯线的效果:
  价格
  180 ├────────┤        ├─────────┤
      │        │        │         │
  170 └────────┼────────┼─────────┘
      日期 A   日期 B   日期 C
      
  这样能准确表达"从 A 日到 B 日都是 180¢"的含义
```

---

## 第 4 部分：数据管道设计 (Python)

### 4.1 数据清洗约束

#### Ghost Data (幽灵数据)

问题: Yahoo Finance 可能在假期返回 NaN

```python
# ❌ 错误做法
rbob = yf.download("RB=F", start=start_date, end=end_date)
# 可能包含假期的空行

# ✅ 正确做法
rbob = yf.download("RB=F", start=start_date, end=end_date)
rbob = rbob.dropna(subset=['Close'])  # 必须过滤
```

#### 汇率缺失处理

问题: 汇率数据可能比商品价格缺少一天

```python
market_df = rbob.join(cad, how='left')

# ❌ 不处理
# 可能导致后续 NaN 错误

# ✅ 正确处理
market_df['cad_rate'] = market_df['cad_rate'].ffill()  # 前向填充
market_df = market_df.dropna(subset=['rbob_usd'])      # 只需 rbob
```

### 4.2 熔断判定逻辑

```python
def detect_interrupter(eub_df):
    """
    标记官方的非常规调价（熔断）
    
    常规: 每个周四发布新价格，周五生效
    熔断: 其他日期生效的价格调整
    """
    eub_df['is_interrupter'] = eub_df['effective_date'].apply(
        lambda d: 1 if d.weekday() != 4 else 0
    )
    
    # 计算与前一条记录的差值 (仅为熔断标记)
    eub_df['prev_price'] = eub_df['price'].shift(1)
    eub_df['interrupter_variance'] = eub_df.apply(
        lambda row: (row['price'] - row['prev_price']) if (
            pd.notnull(row['prev_price']) and row['is_interrupter'] == 1
        ) else 0,
        axis=1
    )
    
    return eub_df
```

⚠️ **重要**: 必须在全量数据上计算 interrupter_variance，然后再 `tail(10)` 进行增量更新。否则会遗漏历史熔断信息。

### 4.3 Epoch 时间处理

官方 EUB Excel 使用 Windows OLE 2 Epoch 日期格式

```python
# xlrd 自动转换，但有时差
# 使用 pandas to_datetime 统一处理

import pandas as pd
import io

df = pd.read_excel(io.BytesIO(response.content), sheet_name='Current', engine='xlrd')
df['date'] = pd.to_datetime(df['date'], errors='coerce', format='mixed')
```

---

## 第 5 部分：时区和日期约束

### 5.1 所有时间使用 Moncton 时区 (America/Moncton)

**原因**:
- 官方 EUB 限价在 Moncton 当地时间的周四下午 13:00 发布
- 周期计算必须基于 Moncton 的本地日期，不是 UTC

**实现**:

```javascript
// 前端
const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Moncton',
    year: 'numeric', month: '2-digit', day: '2-digit'
});
const todayMoncton = formatter.format(new Date());

// Python
import pytz
tz = pytz.timezone('America/Moncton')
now_moncton = datetime.now(tz)
```

### 5.2 日期格式统一为 'YYYY-MM-DD'

所有数据库、API 响应、前端逻辑都使用这个格式，不包含时间戳。

```javascript
// 正确
'2026-03-24'

// 错误
'2026-03-24T00:00:00Z'
'2026-03-24 12:00:00'
```

---

## 第 6 部分：错误处理约束

### 6.1 API 错误响应格式

所有 API 都遵循统一的错误格式:

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

**常见错误代码**:

| 代码 | HTTP 状态 | 原因 |
|------|----------|------|
| `NO_DATA` | 404 | 数据库中没有任何记录 |
| `DATABASE_ERROR` | 500 | D1 查询失败 |
| `SERVER_ERROR` | 500 | Workers 内部错误 |
| `INVALID_PARAMS` | 400 | 非法查询参数 |

### 6.2 前端错误处理

```javascript
// 好的做法
fetch('/api/v1/cycle/current')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {
    if (data.status === 'error') {
      // 处理业务错误
      console.error(data.error.message);
    } else {
      // 成功
      setData(data.data);
    }
  })
  .catch(err => {
    // 处理网络或解析错误
    setError(err.message);
  });
```

---

## 第 7 部分：缓存策略

### 7.1 API 响应缓存

所有 API 都设置 30 分钟的浏览器缓存:

```javascript
headers: {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=1800'  // 1800 秒 = 30 分钟
}
```

**原因**:
- 数据每天更新一次 (GitHub Actions)
- 30 分钟的缓存能显著减少 D1 查询
- 对用户体验没有明显影响（3-4 次刷新内看不到变化）

### 7.2 前端静态资源缓存 (GitHub Pages)

```yaml
# GitHub 自动配置
- 图片: 1 年
- JS/CSS: 自动版本化 (hash) 后能无限缓存
- HTML: 无缓存 (确保总是最新)
```

---

## 第 8 部分：安全考虑

### 8.1 CORS 配置

所有 API 允许来自任何域的跨域请求:

```javascript
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Methods': 'GET, OPTIONS'
'Access-Control-Allow-Headers': 'Content-Type'
```

**合理性**: 
- 这是一个只读的数据接口
- 没有认证或用户数据
- 数据完全公开

### 8.2 敏感信息

- ✅ Cloudflare Worker 部署使用 xxxxx 密钥管理
- ✅ D1 数据库 ID 可公开（只能通过密钥访问）
- ❌ 不要在代码中硬编码 Cloudflare API 密钥

---

## 总结

| 组件 | 技术 | 关键约束 |
|------|------|---------|
| 数据库 | D1 SQLite | 虚拟列计算、LOCF 锚点、时区一致 |
| API | Express-like 路由 | CORS 开放、缓存 30min、错误格式统一 |
| 前端 | React + ECharts | 阶梯线图、单位转换、风险算法 |
| 数据管道 | Python ETL | ghost 数据过滤、熔断检测、Epoch 处理 |

**下一步**: 
- 详细实现 → [BACKEND_GUIDE.md](BACKEND_GUIDE.md) 或 [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md)
- API 完全参考 → [API_REFERENCE.md](API_REFERENCE.md)
