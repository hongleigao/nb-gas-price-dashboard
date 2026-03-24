CREATE TABLE IF NOT EXISTS market_data (
    date TEXT PRIMARY KEY,
    rbob_usd_close REAL NOT NULL,
    cad_usd_rate REAL NOT NULL,
    rbob_cad_base REAL GENERATED ALWAYS AS (rbob_usd_close * cad_usd_rate) VIRTUAL,
    is_weekend INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_market_date ON market_data(date);

CREATE TABLE IF NOT EXISTS eub_prices (
    effective_date TEXT PRIMARY KEY,
    published_date TEXT NOT NULL,
    max_price REAL NOT NULL,
    is_interrupter INTEGER NOT NULL DEFAULT 0,
    interrupter_variance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eub_effective_desc ON eub_prices(effective_date DESC);
