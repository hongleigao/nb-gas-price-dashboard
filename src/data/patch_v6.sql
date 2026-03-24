-- V6.0 Patch with Duplicates handling
-- 1. 先删除依赖视图
DROP VIEW IF EXISTS v_gas_stats_latest;
DROP VIEW IF EXISTS v_commodity_stats;
DROP VIEW IF EXISTS v_attribution_benchmarks;
DROP VIEW IF EXISTS v_daily_market_final;

-- 2. 修复 eub_history: 增加唯一约束
DROP TABLE IF EXISTS eub_history_old;
ALTER TABLE eub_history RENAME TO eub_history_old;
CREATE TABLE eub_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity_id TEXT REFERENCES commodities(id),
    effective_date DATE NOT NULL,
    max_retail_price REAL NOT NULL,
    active_base REAL,
    is_interrupter INTEGER DEFAULT 0,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(commodity_id, effective_date)
);
INSERT OR IGNORE INTO eub_history (commodity_id, effective_date, max_retail_price, active_base, is_interrupter, captured_at)
SELECT commodity_id, effective_date, max_retail_price, active_base, is_interrupter, captured_at FROM eub_history_old;
DROP TABLE eub_history_old;

-- 3. 修复 market_quotes: 增加唯一约束
DROP TABLE IF EXISTS market_quotes_old;
ALTER TABLE market_quotes RENAME TO market_quotes_old;
CREATE TABLE market_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commodity_id TEXT REFERENCES commodities(id),
    trading_date DATE NOT NULL,
    price_usd_gal REAL NOT NULL,
    fx_rate REAL NOT NULL,
    base_cad_liter REAL GENERATED ALWAYS AS (price_usd_gal * fx_rate / 3.78541178) VIRTUAL,
    status TEXT DEFAULT 'INTRA',
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(commodity_id, trading_date, status)
);
-- 使用 GROUP BY 确保每个 (commodity_id, trading_date, status) 只有一条最新记录
INSERT INTO market_quotes (commodity_id, trading_date, price_usd_gal, fx_rate, status, captured_at)
SELECT commodity_id, trading_date, price_usd_gal, fx_rate, status, max(captured_at)
FROM market_quotes_old
GROUP BY commodity_id, trading_date, status;
DROP TABLE market_quotes_old;

-- 4. 重新创建视图
CREATE VIEW v_daily_market_final AS
SELECT * FROM market_quotes 
WHERE status = 'FINAL' 
OR (id IN (SELECT max(id) FROM market_quotes GROUP BY commodity_id, trading_date));

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

CREATE VIEW v_commodity_stats AS
SELECT 
    w.commodity_id,
    w.window_avg,
    w.days_count,
    m.price_usd_gal AS current_rbob,
    m.fx_rate AS current_fx,
    b.max_retail_price AS current_eub_price,
    b.ref_rbob,
    b.ref_fx,
    CAST(((m.price_usd_gal - b.ref_rbob) * b.ref_fx / 3.78541178) * 1.15 * 100 AS REAL) AS commodity_impact_cents,
    CAST((m.price_usd_gal * (m.fx_rate - b.ref_fx) / 3.78541178) * 1.15 * 100 AS REAL) AS fx_impact_cents
FROM (
    SELECT 
        commodity_id,
        avg(base_cad_liter) AS window_avg,
        count(*) AS days_count
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commodity_id ORDER BY trading_date DESC) as row_num
        FROM v_daily_market_final
    ) WHERE row_num <= 5 GROUP BY commodity_id
) w
JOIN (
    SELECT commodity_id, price_usd_gal, fx_rate FROM v_daily_market_final 
    WHERE (commodity_id, trading_date) IN (SELECT commodity_id, max(trading_date) FROM v_daily_market_final GROUP BY commodity_id)
) m ON m.commodity_id = w.commodity_id
JOIN v_attribution_benchmarks b ON b.commodity_id = w.commodity_id
WHERE b.adjustment_date = (SELECT max(adjustment_date) FROM v_attribution_benchmarks WHERE commodity_id = w.commodity_id);

CREATE VIEW v_gas_stats_latest AS 
SELECT * FROM v_commodity_stats WHERE commodity_id = 'gasoline';
