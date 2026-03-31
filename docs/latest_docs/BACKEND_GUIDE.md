# 后端实现指南 - Cloudflare Workers + D1

## 概述

本章节详细讲解后端的实现细节、现有代码结构、以及如何扩展 API 端点。

---

## 第 1 部分：项目结构

```
api/
├── package.json                      # 依赖管理
├── wrangler.toml                     # Cloudflare Worker 配置
├── src/
│   ├── index.js                      # Worker 入口、CORS 处理
│   ├── router.js                     # 路由分发
│   └── handlers/
│       ├── cycle.js                  # 周期洞察处理器
│       └── history.js                # 历史查询处理器
└── node_modules/                     # 已安装依赖
```

---

## 第 2 部分：入口文件 (src/index.js)

### 代码

```javascript
import router from './router.js';

export default {
    async fetch(request, env, ctx) {
        // 1. 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        try {
            // 2. 转发到路由器
            return await router.handle(request, env);
        } catch (e) {
            // 3. 捕获任何未处理的错误
            return new Response(JSON.stringify({ 
                error: e.message 
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },
};
```

### 关键点

1. **OPTIONS 预检**: 浏览器发送 OPTIONS 请求检查 CORS 权限，必须立即响应
2. **全局错误捕获**: 即使具体的 handler 抛出异常，Worker 也能返回 500 错误
3. **CORS 开放**: `Access-Control-Allow-Origin: *` 允许任何域跨域访问

---

## 第 3 部分：路由层 (src/router.js)

### 代码

```javascript
import { handleCycle } from './handlers/cycle.js';
import { handleHistory } from './handlers/history.js';

const router = {
    async handle(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // 根据 path 路由到不同的 handler
        if (path === '/api/v1/cycle/current') {
            return await handleCycle(request, env);
        } else if (path === '/api/v1/history') {
            return await handleHistory(request, env);
        }

        // 404 处理
        return new Response(JSON.stringify({ 
            error: 'Not Found' 
        }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    },
};

export default router;
```

### 添加新路由的步骤

```javascript
// 1. 创建 handler (src/handlers/new.js)
export async function handleNew(request, env) {
    // ... 业务逻辑
    return new Response(...);
}

// 2. 在 router.js 中导入
import { handleNew } from './handlers/new.js';

// 3. 添加路由条件
if (path === '/api/v1/new') {
    return await handleNew(request, env);
}
```

---

## 第 4 部分：Handler - 周期洞察 (src/handlers/cycle.js)

### 完整代码解析

```javascript
// 内部工具函数：获取基于 Moncton 时区的周期边界
function getMonctonCycleDates() {
    // 强制转换为 America/Moncton 时区的 YYYY-MM-DD
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Moncton', 
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const todayStr = formatter.format(new Date());
    
    // 修正：将 split 出来的字符串数组强制转换为 Number 类型
    const [y, m, d] = todayStr.split('-').map(Number);
    
    // 使用 UTC 构建 Date 对象，避免服务器本地时区干扰
    const todayDate = new Date(Date.UTC(y, m - 1, d)); 
    const dayOfWeek = todayDate.getUTCDay();  // 0(Sun) - 6(Sat)
    
    // 核心逻辑：寻找最近的"上一个星期四"作为本周期的起点
    let daysSinceThu = dayOfWeek - 4;
    
    // 关键修改: <= 而不是 <
    // 这样周四全天都展示上一周期的预测，直到周五凌晨跨日
    if (daysSinceThu <= 0) daysSinceThu += 7;

    const currentStart = new Date(todayDate);
    currentStart.setUTCDate(todayDate.getUTCDate() - daysSinceThu);
    
    const currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentStart.getUTCDate() + 6);
    
    const prevStart = new Date(currentStart);
    prevStart.setUTCDate(currentStart.getUTCDate() - 7);
    
    return {
        currentStartStr: currentStart.toISOString().split('T')[0],
        currentEndStr: currentEnd.toISOString().split('T')[0],
        prevStartStr: prevStart.toISOString().split('T')[0]
    };
}

export async function handleCycle(request, env) {
    const db = env.D1_DB;

    try {
        // 1. 计算日历窗口
        const { currentStartStr, currentEndStr, prevStartStr } = getMonctonCycleDates();

        // 2. 获取本周期内所有的 EUB 记录（应对多次熔断）
        const { results: cycleEubData } = await db.prepare(
            "SELECT effective_date, max_price, is_interrupter, interrupter_variance FROM eub_prices WHERE effective_date >= ? ORDER BY effective_date ASC"
        ).bind(currentStartStr).all();

        let currentEub = null;
        let interrupterTotal = 0.0;

        if (cycleEubData.length > 0) {
            currentEub = cycleEubData[cycleEubData.length - 1]; 
            // 累加所有熔断差值
            interrupterTotal = cycleEubData
                .filter(r => r.is_interrupter === 1)
                .reduce((sum, r) => sum + (r.interrupter_variance || 0), 0);
        } else {
            // 如果新周期刚开始还没有记录，向前查最新一条
            const { results: fallbackData } = await db.prepare(
                "SELECT effective_date, max_price, is_interrupter, interrupter_variance FROM eub_prices ORDER BY effective_date DESC LIMIT 1"
            ).all();
            if (fallbackData.length === 0) {
                return new Response(JSON.stringify({ 
                    status: "error", 
                    error: { code: "NO_DATA", message: 'No EUB price data available' } 
                }), { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
            }
            currentEub = fallbackData[0];
            interrupterTotal = currentEub.is_interrupter === 1 ? (currentEub.interrupter_variance || 0) : 0.0;
        }

        // 3. 获取市场数据（包括上一周期和当前周期）
        const { results: marketData } = await db.prepare(
            "SELECT * FROM market_data WHERE date >= ? ORDER BY date ASC"
        ).bind(prevStartStr).all();

        // 4. 计算上一周期的基准价
        const previousCycle = marketData.filter(r => r.date < currentStartStr && r.is_weekend === 0);
        let benchmarkPrice = 0.0;
        if (previousCycle.length > 0) {
            const sum = previousCycle.reduce((acc, row) => acc + row.rbob_cad_base, 0);
            benchmarkPrice = parseFloat((sum / previousCycle.length).toFixed(4));
        }

        // 5. 组装当前周期的市场数据
        const marketCycle = marketData
            .filter(r => r.date >= currentStartStr && r.date <= currentEndStr)
            .map(r => ({
                date: r.date,
                absolute_price: parseFloat(r.rbob_cad_base.toFixed(4)),
                is_weekend: r.is_weekend
            }));

        // 6. 获取最后同步时间
        const { results: syncData } = await db.prepare("SELECT max(date) as last_date FROM market_data").all();

        // 7. 组装响应
        const responseData = {
            status: "success",
            data: {
                current_eub: {
                    effective_date: currentEub.effective_date,
                    max_price: currentEub.max_price,
                    is_interrupter: currentEub.is_interrupter,
                    interrupter_variance: currentEub.interrupter_variance || 0.0
                },
                benchmark_price: benchmarkPrice,
                interrupter_total: parseFloat(interrupterTotal.toFixed(4)),
                market_cycle: marketCycle
            },
            meta: {
                last_sync_time: syncData[0]?.last_date || new Date().toISOString(),
                timezone: "America/Moncton"
            }
        };

        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ 
            status: "error", 
            error: { code: "SERVER_ERROR", message: e.message } 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
        });
    }
}
```

### 代码说明

| 步骤 | 说明 |
|------|------|
| 1 | 基于服务器当前时间和 Moncton 时区计算周期边界 |
| 2 | 查询本周期内的所有官方限价，并累加熔断 |
| 3 | 获取市场数据（包括前后两个周期） |
| 4 | 计算上一周期的 5 日平均价作为基准 |
| 5 | 提取本周期的 5 日市场数据 |
| 6 | 获取数据最后同步时间 |
| 7 | 组装最终 JSON 响应 |

---

## 第 5 部分：Handler - 历史查询 (src/handlers/history.js)

### 完整代码

```javascript
export async function handleHistory(request, env) {
    const db = env.D1_DB;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    try {
        // 1. 计算真实的日期边界
        const dateLimit = new Date();
        dateLimit.setUTCDate(dateLimit.getUTCDate() - days);
        const dateStr = dateLimit.toISOString().split('T')[0];

        // 2. LOCF 锚点 SQL：
        // 确保拿到日期窗口前最后一次生效的官方价格，防止图表左侧断线
        const { results: eubHistory } = await db.prepare(`
            SELECT effective_date as date, max_price, is_interrupter 
            FROM eub_prices 
            WHERE effective_date >= (
                SELECT IFNULL(MAX(effective_date), '1970-01-01') 
                FROM eub_prices 
                WHERE effective_date <= ?
            )
            ORDER BY effective_date DESC
        `).bind(dateStr).all();

        // 3. 市场数据：按日期边界提取
        const { results: marketHistory } = await db.prepare(
            "SELECT date, rbob_cad_base FROM market_data WHERE date >= ? ORDER BY date DESC"
        ).bind(dateStr).all();

        // 4. 统一 Envelope 响应结构
        return new Response(JSON.stringify({
            status: "success",
            data: {
                eub_history: eubHistory,
                market_history: marketHistory
            },
            meta: {
                query_days: days,
                start_date: dateStr
            }
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            },
        });
    } catch (e) {
        return new Response(JSON.stringify({ 
            status: "error", 
            error: { code: "DATABASE_ERROR", message: e.message } 
        }), { 
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
```

### 关键点

- **LOCF 算法**: 嵌套查询找到查询开始日期前的最后一条记录，确保图表无断线
- **降序排列**: 默认按 DESC，前端需要自行反序

---

## 第 6 部分：D1 数据库操作

### 连接 D1

```javascript
const db = env.D1_DB;  // 从 Worker context 获取
```

### 基本查询

#### SELECT

```javascript
// 单条查询
const { results } = await db.prepare(
    "SELECT * FROM market_data WHERE date = ?"
).bind('2026-03-24').all();

// 多条查询
const { results } = await db.prepare(
    "SELECT * FROM market_data WHERE date > ?"
).bind('2026-03-20').all();
```

#### INSERT

```javascript
const { success } = await db.prepare(
    "INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate) VALUES (?, ?, ?)"
).bind('2026-03-24', 2.891, 1.3565).run();
```

#### UPDATE (ON CONFLICT)

```javascript
const { success } = await db.prepare(`
    INSERT INTO eub_prices (effective_date, published_date, max_price, is_interrupter, interrupter_variance)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(effective_date) DO UPDATE SET
        published_date = excluded.published_date,
        max_price = excluded.max_price,
        is_interrupter = excluded.is_interrupter,
        interrupter_variance = excluded.interrupter_variance
`).bind(effectiveDate, publishedDate, maxPrice, isInterrupter, variance).run();
```

---

## 第 7 部分：配置文件 (wrangler.toml)

```toml
name = "nb-gas-pulse-api"
main = "src/index.js"
compatibility_date = "2024-10-31"

# D1 数据库绑定
[[d1_databases]]
binding = "D1_DB"
database_name = "nb-gas-db"
database_id = "9088f5bb-cb62-4db3-a1e6-xxxxx"
```

### 说明

| 字段 | 说明 |
|------|------|
| `name` | Worker 名称 |
| `main` | 入口文件 |
| `compatibility_date` | Cloudflare 兼容性版本 |
| `binding` | 在代码中引用 D1 的名称 (env.D1_DB) |
| `database_name` | D1 的显示名称 |
| `database_id` | D1 的唯一标识 |

---

## 第 8 部分：本地开发

### 启动本地 Worker

```bash
cd api
npm install
wrangler dev
```

输出:
```
⛅️  wrangler 3.58.0 (update available 3.59.0)
▲ [wrangler:dev] server listening at http://localhost:8787
```

### 本地测试

```bash
# 测试周期洞察
curl http://localhost:8787/api/v1/cycle/current

# 测试历史查询
curl "http://localhost:8787/api/v1/history?days=30"
```

### 绑定本地 D1

默认情况下，开发环境会创建临时的本地 D1 副本。初始化数据：

```bash
# 复制 schema
wrangler d1 execute nb-gas-db --file database/schema.sql --local

# 插入测试数据
wrangler d1 execute nb-gas-db --command "INSERT INTO market_data ..." --local
```

---

## 第 9 部分：部署

### 预发布检查

```bash
# 检查依赖
npm list

# 检查语法
npm run build  # 如果存在

# 验证配置
wrangler publish --dry-run
```

### 发布到 Cloudflare

```bash
wrangler publish
```

输出:
```
▲ [wrangler:publish] Uploading...
▲ [wrangler:publish] Success! Your worker is live at:
https://xxxxx-yyyyyy-zzzzz.workers.dev
```

---

## 第 10 部分：监督和调试

### View Worker Logs

```bash
wrangler tail
```

### 分析响应时间

```javascript
// 在 handler 中添加
const start = Date.now();
// ... 处理逻辑
const duration = Date.now() - start;
console.log(`Request took ${duration}ms`);
```

### 测试缓存

```bash
# 第一次请求（空缓存）
curl -i http://localhost:8787/api/v1/cycle/current | grep Cache-Control

# 查看缓存信息
# 应该看到: Cache-Control: public, max-age=1800
```

---

## 第 11 部分：常见问题

### Q: env.D1_DB 为 undefined
**A**: 确保 `wrangler.toml` 中配置了 `[[d1_databases]]` 并且 `binding = "D1_DB"`

### Q: 跨域请求失败
**A**: 检查响应头中是否有 `Access-Control-Allow-Origin: *`

### Q: 查询返回空数组
**A**: 
1. 检查数据是否真的存在于 D1
2. 确保日期格式正确 ('YYYY-MM-DD')
3. 检查 WHERE 条件是否过于严格

### Q: 熔断值不正确
**A**: 检查是否按全量数据计算，然后才 tail，而不是先 tail 再计算

---

## 总结

| 组件 | 用途 |
|------|------|
| `index.js` | 入口、CORS、全局错误处理 |
| `router.js` | 路由分发 |
| `cycle.js` | 周期洞察算法 |
| `history.js` | 历史数据 LOCF 查询 |
| `wrangler.toml` | 配置和部署 |

**下一步**: [FRONTEND_GUIDE.md](FRONTEND_GUIDE.md) - 前端实现细节
