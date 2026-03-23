-- NB Gas Pulse - Cloudflare D1 (SQLite) Schema Definition
-- Version: 1.1.0 (Added UNIQUE constraint to prevent duplicates)

DROP TABLE IF EXISTS nymex_market_data;
CREATE TABLE nymex_market_data (
    trading_date DATE PRIMARY KEY,
    rbob_usd_gal REAL NOT NULL,
    cad_usd_rate REAL NOT NULL,
    base_cad_liter REAL NOT NULL,
    is_final INTEGER DEFAULT 1, -- 0: Intraday, 1: Final Close
    is_holiday BOOLEAN DEFAULT 0
);

DROP TABLE IF EXISTS eub_regulations;
CREATE TABLE eub_regulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    effective_date DATE UNIQUE NOT NULL, 
    max_retail_price REAL NOT NULL,
    actual_pump_price REAL NOT NULL,
    active_eub_base REAL NOT NULL,
    rbob_usd_gal REAL, -- 调价时的 RBOB 基准
    cad_usd_rate REAL, -- 调价时的汇率基准
    is_interrupter BOOLEAN DEFAULT 0 
);
