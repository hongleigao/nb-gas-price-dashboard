# 数据管道 - Python ETL

## 概述

本章节详细讲解数据抓取、清洗、验证和同步的完整流程。数据管道通过 GitHub Actions 定时运行，无需手动干预。

---

## 第 1 部分：数据源

### 1.1 NYMEX RBOB 汽油期货

- **数据源**: Yahoo Finance (`yfinance`)
- **代码**: `RB=F`
- **周期**: 每个交易日 (周一到周五) 更新
- **内容**: 开盘价、最高价、最低价、收盘价、交易量

### 1.2 USD/CAD 汇率

- **数据源**: Yahoo Finance (`yfinance`)
- **代码**: `CAD=X`
- **周期**: 每个交易日更新
- **格式**: 美元对加元的汇率

### 1.3 官方 EUB 限价

- **数据源**: NBEUB 官网 Excel 文件
- **URL**: `https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls`
- **内容**: 历史和当前的官方最高限价
- **更新频率**: 每周四下午 13:00 Atlantic Time

---

## 第 2 部分：Python 脚本 - 日常增量更新 (update_daily.py)

### 完整代码

```python
import os
import sys
import argparse
import requests
import pandas as pd
import yfinance as yf
import io
import subprocess
from datetime import datetime, timedelta
import pytz
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 架构师修复：动态路径解析
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
WRANGLER_CONFIG_PATH = os.path.join(PROJECT_ROOT, 'api', 'wrangler.toml')

# EUB Excel 关键字 (必须完全匹配)
EUB_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
ROW_KEYWORD_DATE = 'Date'
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

def get_secure_session():
    """创建带 retry 机制的 HTTP session"""
    session = requests.Session()
    retry = Retry(connect=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

def get_latest_data():
    """获取最新的市场数据和官方限价"""
    tz = pytz.timezone('America/Moncton')
    now_moncton = datetime.now(tz)
    
    session = get_secure_session()
    headers = {
        'User-Agent': 'Mozilla/5.0 ...',  # 模拟浏览器
        'Accept': 'text/html,application/xhtml+xml...',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://nbeub.ca/current-petroleum-prices-2'
    }
    
    # 1. 抓取 EUB Excel
    response = session.get(EUB_URL, headers=headers, timeout=30)
    response.raise_for_status()
    
    if b'<html' in response.content[:20].lower():
        raise ValueError(f"被 NBEUB 服务器拦截！HTTP 状态码: {response.status_code}")

    df_raw = pd.read_excel(io.BytesIO(response.content), 
                          sheet_name='Current', header=None, engine='xlrd')
    
    # 2. 解析 Excel：找出日期行和价格行
    date_row = df_raw[df_raw.apply(
        lambda x: x.astype(str).str.contains(ROW_KEYWORD_DATE, case=False).any(), 
        axis=1)].index[0]
    
    price_row = df_raw[df_raw.apply(
        lambda x: x.astype(str).str.contains(ROW_KEYWORD_PRICE, case=False).any(), 
        axis=1)].index[0]
    
    # 3. 提取和清洗数据
    eub_dates = pd.to_datetime(df_raw.iloc[date_row].values, 
                              errors='coerce', format='mixed')
    eub_prices = pd.to_numeric(df_raw.iloc[price_row].values, errors='coerce')
    
    # 4. 计算熔断判定
    eub_df = pd.DataFrame({'Date': eub_dates, 'Price': eub_prices})
    eub_df = eub_df.dropna().sort_values('Date')
    
    eub_df['is_interrupter'] = eub_df['Date'].apply(
        lambda d: 1 if d.weekday() != 4 else 0  # 周四=4，其他=熔断
    )
    
    eub_df['prev_price'] = eub_df['Price'].shift(1)
    eub_df['interrupter_variance'] = eub_df.apply(
        lambda row: (row['Price'] - row['prev_price']) if (
            pd.notnull(row['prev_price']) and row['is_interrupter'] == 1
        ) else 0,
        axis=1
    )
    
    # 关键修复：先计算全量，再 tail
    eub_df = eub_df.tail(10)
    
    # 5. 获取市场数据
    end_date = now_moncton + timedelta(days=1)
    start_date = now_moncton - timedelta(days=7)
    
    rbob_raw = yf.download("RB=F", start=start_date.strftime('%Y-%m-%d'), 
                          end=end_date.strftime('%Y-%m-%d'))
    cad_raw = yf.download("CAD=X", start=start_date.strftime('%Y-%m-%d'), 
                         end=end_date.strftime('%Y-%m-%d'))

    def extract_close(df, name):
        if df.empty: 
            return pd.DataFrame(columns=[name])
        if isinstance(df.columns, pd.MultiIndex):
            return df['Close'].iloc[:, 0].to_frame(name=name)
        return df[['Close']].rename(columns={'Close': name})

    rbob = extract_close(rbob_raw, 'rbob_usd')
    cad = extract_close(cad_raw, 'cad_rate')
    
    # 6. 合并并清洗
    market_df = rbob.join(cad, how='left')
    market_df['cad_rate'] = market_df['cad_rate'].ffill()  # 汇率缺失处理
    market_df = market_df.dropna(subset=['rbob_usd'])  # 过滤 ghost data
    
    today_str = now_moncton.strftime('%Y-%m-%d')
    current_hour = now_moncton.hour
    
    # 如果当前时间 < 18:00 (美东下午 14:00)，不包括今天
    if current_hour < 18:
        market_df = market_df[market_df.index.strftime('%Y-%m-%d') < today_str]
    
    return eub_df, market_df

def generate_sql_statements(eub_df, market_df):
    """生成 INSERT/UPDATE SQL 语句"""
    sql_statements = []
    
    # EUB INSERT OR REPLACE
    for _, row in eub_df.iterrows():
        date_str = row['Date'].strftime('%Y-%m-%d')
        sql = f"""INSERT INTO eub_prices 
                  (effective_date, published_date, max_price, is_interrupter, interrupter_variance)
                  VALUES ('{date_str}', '{date_str}', {row['Price']}, {row['is_interrupter']}, {row['interrupter_variance']})
                  ON CONFLICT(effective_date) DO UPDATE SET
                      max_price = excluded.max_price,
                      is_interrupter = excluded.is_interrupter,
                      interrupter_variance = excluded.interrupter_variance;"""
        sql_statements.append(sql)
    
    # 市场数据 INSERT OR REPLACE
    for date_str, row in market_df.iterrows():
        date_iso = date_str.strftime('%Y-%m-%d')
        rbob_usd = float(row['rbob_usd'])
        cad_rate = float(row['cad_rate'])
        sql = f"""INSERT INTO market_data (date, rbob_usd_close, cad_usd_rate)
                  VALUES ('{date_iso}', {rbob_usd}, {cad_rate})
                  ON CONFLICT(date) DO UPDATE SET
                      rbob_usd_close = excluded.rbob_usd_close,
                      cad_usd_rate = excluded.cad_usd_rate;"""
        sql_statements.append(sql)
    
    return sql_statements

def execute_wrangler_commands(sql_statements):
    """通过 wrangler CLI 执行 SQL"""
    for sql in sql_statements:
        cmd = ['npx', 'wrangler', 'd1', 'execute', 'nb-gas-db', '--command', sql]
        result = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error executing SQL: {result.stderr}")
            raise Exception(f"Wrangler execution failed: {result.stderr}")
        print(f"✓ Executed: {sql[:60]}...")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='只生成 SQL，不执行')
    args = parser.parse_args()
    
    try:
        print("🔄 Fetching latest data...")
        eub_df, market_df = get_latest_data()
        
        print(f"📊 EUB rows: {len(eub_df)}, Market rows: {len(market_df)}")
        
        sql_statements = generate_sql_statements(eub_df, market_df)
        
        if args.dry_run:
            print("\n📝 Generated SQL (dry-run mode):")
            for sql in sql_statements:
                print(sql)
        else:
            print(f"\n⚙️  Executing {len(sql_statements)} SQL statements...")
            execute_wrangler_commands(sql_statements)
            print("✅ All data synchronized!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
```

### 使用

```bash
# 运行数据更新
python scripts/update_daily.py

# 预览 (不执行)
python scripts/update_daily.py --dry-run
```

---

## 第 3 部分：Python 脚本 - 全量初始化 (seed_history.py)

### 概述

`seed_history.py` 用于系统首次部署时回溯和导入 2+ 年的历史数据。

### 关键代码片段

```python
def seed_full_history():
    """回溯 2 年的历史数据"""
    tz = pytz.timezone('America/Moncton')
    today = datetime.now(tz)
    
    # 回溯 2 年
    start_date = today - timedelta(days=730)
    
    # 获取历史 NYMEX 和汇率数据
    rbob_hist = yf.download("RB=F", start=start_date.strftime('%Y-%m-%d'), 
                            end=today.strftime('%Y-%m-%d'))
    cad_hist = yf.download("CAD=X", start=start_date.strftime('%Y-%m-%d'), 
                           end=today.strftime('%Y-%m-%d'))
    
    # 合并、清洗、生成 SQL
    # ... (类似 update_daily.py)
    
    execute_wrangler_commands(sql_statements)
```

**何时使用**:
- ✅ 新 D1 数据库初始化
- ✅ 灾难恢复 (完全重置)
- ❌ 日常更新 (使用 update_daily.py)

---

## 第 4 部分：GitHub Actions 自动化

### Workflow 文件 (.github/workflows/main.yml)

```yaml
name: Auto ETL Pipeline

on:
  schedule:
    # 每天 UTC 08:00 (美东 03:00)
    - cron: '0 8 * * *'
    # 每天 UTC 22:30 (美东 17:30)
    - cron: '30 22 * * *'
  # 支持手动触发
  workflow_dispatch:

jobs:
  update_data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -q yfinance pandas requests xlrd
      
      - name: Run ETL script
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_API_KEY: ${{ secrets.CLOUDFLARE_API_KEY }}
        run: |
          cd scripts
          python update_daily.py
      
      - name: Git commit & push
        run: |
          git config user.email "action@github.com"
          git config user.name "GitHub Action"
          git add -A
          git commit -m "🤖 Auto data sync: $(date -u +'%Y-%m-%d %H:%M:%S')" || true
          git push

  deploy_frontend:
    needs: update_data
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Build & Deploy
        run: |
          cd web
          npm install
          npm run build
          # GitHub Pages 自动从 dist/ 部署
```

### 在 GitHub 中设置 Secrets

1. 进入 Settings → Secrets and variables → Actions
2. 添加:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_API_KEY` (可选)

---

## 第 5 部分：数据清洗约束

### Ghost Data (幽灵数据)

**问题**: Yahoo Finance 在假期返回 NaN 值

```python
# ❌ 错误
rbob = yf.download("RB=F", start=start, end=end)
# 可能包含假期的 NaN

# ✅ 正确
rbob = yf.download("RB=F", start=start, end=end)
rbob = rbob.dropna(subset=['Close'])  # 必须过滤
```

### 汇率缺失 (FFill)

**问题**: 汇率可能比 RBOB 少一天

```python
# ✅ 正确处理
market_df['cad_rate'] = market_df['cad_rate'].ffill()
market_df = market_df.dropna(subset=['rbob_usd'])
```

---

## 第 6 部分：故障恢复

### 场景 1: 某天数据缺失

```bash
# 重新运行前一天的数据
python scripts/update_daily.py
```

SQL 的 `ON CONFLICT DO UPDATE` 会自动覆盖。

### 场景 2: 完全数据损坏

```bash
# 1. 重置 D1
wrangler d1 execute nb-gas-db --file database/schema.sql

# 2. 重新导入全量数据
python scripts/seed_history.py

# 3. 运行日常更新
python scripts/update_daily.py
```

### 场景 3: API 拉取失败

GitHub Actions 重试机制:
- 每个 SQL 语句都有 5 次重试 (Retry 机制)
- 时间间隔: 指数退避 (1s, 2s, 4s, 8s, 16s)

---

## 第 7 部分：监控和日志

### 查看 GitHub Actions 日志

1. 进入 GitHub 仓库的 Actions 标签
2. 选择最新运行
3. 查看 `Run ETL script` 的输出

### 本地调试

```bash
# 启用详细日志
python -u scripts/update_daily.py 2>&1 | tee etl.log

# 检查生成的 SQL
python scripts/update_daily.py --dry-run > sql_preview.txt
```

---

## 第 8 部分：依赖管理 (requirements.txt)

```
yfinance==0.2.41
pandas==2.1.3
requests==2.31.0
xlrd==2.0.1
```

### 安装

```bash
pip install -r scripts/requirements.txt
```

### 更新

```bash
pip install --upgrade -r scripts/requirements.txt
```

---

## 总结

| 组件 | 用途 |
|------|------|
| update_daily.py | 日常增量更新 (自动运行) |
| seed_history.py | 全量历史初始化 (手动) |
| requirements.txt | Python 依赖声明 |
| GitHub Actions | 调度和自动化 |

**下一步**: [DEPLOYMENT.md](DEPLOYMENT.md) - 部署和配置
