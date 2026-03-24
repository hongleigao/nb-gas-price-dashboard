-- V6.0 决策视图补全
-- 目标：逻辑彻底下沉，Worker 零计算

DROP VIEW IF EXISTS v_gas_stats_latest;
DROP VIEW IF EXISTS v_commodity_stats;

-- 1. 创建通用能源统计视图 (支持多能源扩展)
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
    -- 归因逻辑计算 (加元分/升)
    CAST(((m.price_usd_gal - b.ref_rbob) * b.ref_fx / 3.78541178) * 1.15 * 100 AS REAL) AS commodity_impact_cents,
    CAST((m.price_usd_gal * (m.fx_rate - b.ref_fx) / 3.78541178) * 1.15 * 100 AS REAL) AS fx_impact_cents
FROM (
    -- 获取最新的 5 个有效交易日的均值
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
    -- 获取当前的最新单日价格
    SELECT commodity_id, price_usd_gal, fx_rate FROM v_daily_market_final 
    WHERE (commodity_id, trading_date) IN (SELECT commodity_id, max(trading_date) FROM v_daily_market_final GROUP BY commodity_id)
) m ON m.commodity_id = w.commodity_id
JOIN v_attribution_benchmarks b ON b.commodity_id = w.commodity_id
WHERE b.adjustment_date = (SELECT max(adjustment_date) FROM v_attribution_benchmarks WHERE commodity_id = w.commodity_id);

-- 2. 快捷别名 (Worker 调用)
CREATE VIEW v_gas_stats_latest AS 
SELECT * FROM v_commodity_stats WHERE commodity_id = 'gasoline';
