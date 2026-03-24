-- NB Gas Pulse V6.0 - 工业级重构 Schema
-- 目标：数据规范化、逻辑下沉至 SQL 视图、支持多能源扩展

-- 1. 清理旧架构 (Big Wipe)
DROP VIEW IF EXISTS v_attribution_benchmarks;
DROP VIEW IF EXISTS v_daily_market_final;
DROP TABLE IF EXISTS eub_history;
DROP TABLE IF EXISTS market_quotes;
DROP TABLE IF EXISTS commodities;

-- 2. 能源种类表 (支持 V6.1 快速扩展 Diesel/Furnace Oil)
CREATE TABLE commodities (
    id TEXT PRIMARY KEY,          -- 'gasoline', 'diesel', 'furnace_oil'
    nymex_symbol TEXT NOT NULL,   -- 'RB=F', 'HO=F'
    display_name TEXT NOT NULL,
    tax_multiplier REAL DEFAULT 1.15, 
    fixed_fee REAL DEFAULT 0          
);

-- 3. 市场行情事实表 (Fact Table)
CREATE TABLE market_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity_id TEXT REFERENCES commodities(id),
    trading_date DATE NOT NULL,
    price_usd_gal REAL NOT NULL,
    fx_rate REAL NOT NULL,
    -- 虚拟列：自动计算 CAD/L，确保逻辑在数据库层闭环
    base_cad_liter REAL GENERATED ALWAYS AS (price_usd_gal * fx_rate / 3.78541178) VIRTUAL,
    status TEXT DEFAULT 'INTRA', -- 'INTRA' (盘中), 'FINAL' (收盘)
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_market_lookup ON market_quotes (commodity_id, trading_date, status);

-- 4. EUB 调价历史表 (Reference Table)
CREATE TABLE eub_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity_id TEXT REFERENCES commodities(id),
    effective_date DATE NOT NULL,
    max_retail_price REAL NOT NULL,
    active_base REAL, -- 调价时的基准锚点 (如 45.x)
    is_interrupter INTEGER DEFAULT 0,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. 初始数据注入 (默认初始化汽油项目)
INSERT INTO commodities (id, nymex_symbol, display_name) VALUES ('gasoline', 'RB=F', 'Regular Gasoline');

-- 6. 核心业务视图：每日最终有效报价
CREATE VIEW v_daily_market_final AS
SELECT * FROM market_quotes 
WHERE status = 'FINAL' 
OR (id IN (SELECT max(id) FROM market_quotes GROUP BY commodity_id, trading_date));

-- 7. 核心业务视图：归因基准寻找
-- 自动寻找最近一次官方调价时对应的市场收盘价
CREATE VIEW v_attribution_benchmarks AS
SELECT 
    e.commodity_id,
    e.effective_date AS adjustment_date,
    e.max_retail_price,
    m.price_usd_gal AS ref_rbob,
    m.fx_rate AS ref_fx,
    m.base_cad_liter AS ref_base_cad
FROM eub_history e
LEFT JOIN v_daily_market_final m ON m.commodity_id = e.commodity_id 
  AND m.trading_date = (
      SELECT max(trading_date) FROM v_daily_market_final 
      WHERE trading_date < e.effective_date
  );
