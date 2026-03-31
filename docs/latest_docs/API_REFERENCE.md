# API 完整参考 - NB Gas Price Dashboard

## 概述

本文档是 NB Gas Price Dashboard API 的完整参考。所有端点都遵循 RESTful 约定，使用 JSON 数据格式。

**基础 URL**: `https://nb-gas-pulse-api.honglei-gao.workers.dev`

**支持的 HTTP 方法**: `GET`, `OPTIONS`

---

## 端点列表

| 端点 | 方法 | 用途 | 认证 |
|------|------|------|------|
| [`/api/v1/cycle/current`](#1-当前周期洞察-apiv1cyclecurrent) | GET | 获取当前周期预测 | ❌ 无 |
| [`/api/v1/history`](#2-历史查询-apiv1history) | GET | 获取历史数据 | ❌ 无 |

---

## 1. 当前周期洞察 - `/api/v1/cycle/current`

### 请求

```
GET /api/v1/cycle/current HTTP/1.1
Host: nb-gas-pulse-api.honglei-gao.workers.dev
Accept: application/json
Origin: https://gas.jgao.app
```

### 查询参数

无参数

### 请求示例

```bash
# 使用 curl
curl -X GET "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current" \
  -H "Accept: application/json"

# 使用 JavaScript fetch
fetch('https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current')
  .then(res => res.json())
  .then(data => console.log(data))

# 使用 Python requests
import requests
response = requests.get('https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current')
data = response.json()
```

### 成功响应

**HTTP 状态码**: `200 OK`

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
    "interrupter_total": 0.0,
    "market_cycle": [
      {
        "date": "2026-03-20",
        "absolute_price": 4.0956,
        "is_weekend": 0
      },
      {
        "date": "2026-03-21",
        "absolute_price": 4.1156,
        "is_weekend": 0
      },
      {
        "date": "2026-03-22",
        "absolute_price": 4.1167,
        "is_weekend": 0
      },
      {
        "date": "2026-03-23",
        "absolute_price": 4.1156,
        "is_weekend": 0
      },
      {
        "date": "2026-03-24",
        "absolute_price": 4.1234,
        "is_weekend": 0
      }
    ]
  },
  "meta": {
    "last_sync_time": "2026-03-24",
    "timezone": "America/Moncton"
  }
}
```

**响应字段说明**:

| 路径 | 类型 | 说明 |
|------|------|------|
| `status` | String | 请求状态 (`success` 或 `error`) |
| `data.current_eub.effective_date` | String | 当前官方限价的生效日期 (YYYY-MM-DD) |
| `data.current_eub.max_price` | Number | 官方最高零售价 (¢/L) |
| `data.current_eub.is_interrupter` | Integer | 是否为熔断调整 (0=否, 1=是) |
| `data.current_eub.interrupter_variance` | Number | 熔断的差值 (¢/L)，仅当 is_interrupter=1 时有效 |
| `data.benchmark_price` | Number | 前一个周期的平均市场基准价 (CAD/Gal) |
| `data.interrupter_total` | Number | 本周期内所有熔断的累计差值 (¢/L) |
| `data.market_cycle[].date` | String | 日期 (YYYY-MM-DD) |
| `data.market_cycle[].absolute_price` | Number | 该日 RBOB 市场价 (CAD/Gal) |
| `data.market_cycle[].is_weekend` | Integer | 是否为周末/非交易日 (0=否, 1=是) |
| `meta.last_sync_time` | String | 数据库最后一次更新时间 |
| `meta.timezone` | String | 时区标识符 |

### 错误响应

**HTTP 状态码**: `404 Not Found` (无数据)

```json
{
  "status": "error",
  "error": {
    "code": "NO_DATA",
    "message": "No EUB price data available"
  }
}
```

**HTTP 状态码**: `500 Internal Server Error` (服务器错误)

```json
{
  "status": "error",
  "error": {
    "code": "SERVER_ERROR",
    "message": "D1_DB is not defined"
  }
}
```

### 缓存行为

```
Cache-Control: public, max-age=1800
(30 分钟缓存)
```

浏览器会缓存该响应 30 分钟。如果需要强制刷新，使用:
```javascript
fetch(url, { cache: 'no-store' })
```

---

## 2. 历史查询 - `/api/v1/history`

### 请求

```
GET /api/v1/history?days=90 HTTP/1.1
Host: nb-gas-pulse-api.honglei-gao.workers.dev
Accept: application/json
```

### 查询参数

| 参数名 | 类型 | 必需 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `days` | 整数 | ❌ | 30 | 查询过去多少天的数据 |

**范围**: `1 ~ 9999` (理论上可任意大)

### 请求示例

```bash
# 查询过去 30 天 (默认)
curl "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history"

# 查询过去 90 天
curl "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history?days=90"

# 查询过去 1 年
curl "https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history?days=365"

# JavaScript
const days = 90;
fetch(`/api/v1/history?days=${days}`)
  .then(res => res.json())
  .then(data => console.log(data.data.eub_history, data.data.market_history))
```

### 成功响应

**HTTP 状态码**: `200 OK`

```json
{
  "status": "success",
  "data": {
    "eub_history": [
      {
        "date": "2025-12-26",
        "max_price": 182.0,
        "is_interrupter": 0
      },
      {
        "date": "2025-12-19",
        "max_price": 180.4,
        "is_interrupter": 0
      },
      {
        "date": "2025-12-12",
        "max_price": 178.9,
        "is_interrupter": 0
      }
    ],
    "market_history": [
      {
        "date": "2025-12-26",
        "rbob_cad_base": 4.1456
      },
      {
        "date": "2025-12-25",
        "rbob_cad_base": 4.1234
      },
      {
        "date": "2025-12-24",
        "rbob_cad_base": 4.1167
      }
    ]
  },
  "meta": {
    "query_days": 90,
    "start_date": "2025-12-24"
  }
}
```

**响应字段说明**:

| 路径 | 类型 | 说明 |
|------|------|------|
| `data.eub_history[]` | Array | 官方限价历史记录 |
| `data.eub_history[].date` | String | 生效日期 (YYYY-MM-DD) |
| `data.eub_history[].max_price` | Number | 官方最高限价 (¢/L) |
| `data.eub_history[].is_interrupter` | Integer | 是否为熔断 (0=否, 1=是) |
| `data.market_history[]` | Array | 市场价格历史 |
| `data.market_history[].date` | String | 交易日期 (YYYY-MM-DD) |
| `data.market_history[].rbob_cad_base` | Number | RBOB 市场价格 (CAD/Gal) |
| `meta.query_days` | Integer | 查询的天数 |
| `meta.start_date` | String | 实际查询的起始日期 |

### 错误响应

**HTTP 状态码**: `500 Internal Server Error`

```json
{
  "status": "error",
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Cannot read property 'all' of undefined"
  }
}
```

### 缓存行为

```
Cache-Control: public, max-age=1800
(30 分钟缓存)
```

### 性能考虑

- **小范围** (days ≤ 90): < 50ms
- **中等范围** (days ≤ 365): 50-100ms
- **大范围** (days > 365): 100-200ms

---

## CORS 预检请求

对于跨域请求，浏览器会自动发送 OPTIONS 预检请求。

### 预检请求

```
OPTIONS /api/v1/cycle/current HTTP/1.1
Host: nb-gas-pulse-api.honglei-gao.workers.dev
Origin: https://gas.jgao.app
Access-Control-Request-Method: GET
Access-Control-Request-Headers: content-type
```

### 预检响应

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

所以跨域请求通常允许，无需担心。

---

## 错误处理指南

### 通用错误格式

所有错误响应都遵循此格式:

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### 常见错误代码

| 代码 | HTTP | 原因 | 处理建议 |
|------|------|------|---------|
| `NO_DATA` | 404 | 数据库中没有任何记录 | 可能是第一次部署，需要运行 Python 脚本初始化数据 |
| `DATABASE_ERROR` | 500 | D1 查询报错 | 联系管理员检查 D1 权限或连接 |
| `SERVER_ERROR` | 500 | Workers 内部错误 | 检查依赖或环境变量 |

### 客户端错误处理示例

```javascript
async function fetchCycleData() {
  try {
    const response = await fetch('/api/v1/cycle/current');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'error') {
      console.error(`API Error: ${data.error.code} - ${data.error.message}`);
      // 根据 code 处理不同错误
      if (data.error.code === 'NO_DATA') {
        return { fallbackData: true };
      }
      throw new Error(data.error.message);
    }
    
    return data.data;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}
```

---

## 集成示例

### React

```javascript
import { useState, useEffect } from 'react';

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          'https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current'
        );
        const result = await response.json();
        
        if (result.status === 'error') {
          setError(result.error.message);
        } else {
          setData(result.data);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>${data.current_eub.max_price} ¢/L</h1>
      <p>Benchmark: {data.benchmark_price}</p>
    </div>
  );
}
```

### Python

```python
import requests
import json

def get_current_cycle():
    url = 'https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/cycle/current'
    response = requests.get(url)
    data = response.json()
    
    if data['status'] == 'error':
        raise Exception(f"API Error: {data['error']['message']}")
    
    return data['data']

def get_history(days=90):
    url = 'https://nb-gas-pulse-api.honglei-gao.workers.dev/api/v1/history'
    params = {'days': days}
    response = requests.get(url, params=params)
    data = response.json()
    
    if data['status'] == 'error':
        raise Exception(f"API Error: {data['error']['message']}")
    
    return data['data']

# 使用
try:
    cycle = get_current_cycle()
    print(f"Current EUB: {cycle['current_eub']['max_price']} ¢/L")
    
    history = get_history(days=30)
    print(f"Market history records: {len(history['market_history'])}")
except Exception as e:
    print(f"Failed: {e}")
```

---

## 限流和配额

目前 API 没有限流。但请合理使用:

- ✅ 前端页面每 5 分钟调用一次
- ✅ 分析脚本每天调用一次
- ❌ 不要频繁轮询 (秒级)

---

## 版本管理

| 版本 | 发布日期 | 变更 |
|------|---------|------|
| v1.0 | 2026-03-31 | 初始版本 |

---

下一步:[BACKEND_GUIDE.md](BACKEND_GUIDE.md) - 后端实现细节
