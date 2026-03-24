# Technical Specification: NB Gas Price Dashboard Reconstruction (v7.0)

## 1. Project Overview
A complete reconstruction of the New Brunswick Gasoline Price Prediction and Monitoring Dashboard. The system transition from a fragmented legacy structure to a strictly defined, high-authority Monorepo architecture based on the "Digital Architect" design system.

## 2. Architecture & Tech Stack
- **Architecture**: Monorepo (Single Repository, Multiple Packages/Directories).
- **Data Source**: EUB Official Prices (Excel) and Yahoo Finance (RBOB + CAD/USD).
- **Storage**: Cloudflare D1 (SQLite-based Serverless Database).
- **Backend**: Cloudflare Workers (Node.js/ES Modules).
- **Frontend**: React (Vite) + Tailwind CSS + ECharts.
- **Pipeline**: GitHub Actions for daily data synchronization and deployment.

## 3. Directory Structure (Monorepo)
```text
/ (Repository Root)
├── .github/workflows/   # CI/CD & Data Pipeline
├── api/                 # Cloudflare Worker (Backend)
│   ├── src/             # Route handlers and business logic
│   ├── package.json
│   └── wrangler.toml
├── web/                 # React Application (Frontend)
│   ├── src/             # Components, hooks, and services
│   ├── package.json
│   └── vite.config.js
├── scripts/             # Python Data Pipeline
│   ├── update_daily.py  # Consolidated scraping and DB sync
│   └── requirements.txt
├── database/            # D1 Schema and Migrations
│   └── schema.sql       # D1 table definitions
└── docs/                # Design documents and specs
```

## 4. Data Layer & Business Logic

### 4.1 Database Schema (D1)
- **`market_data`**: 
    - `date` (TEXT PRIMARY KEY)
    - `rbob_usd_close` (REAL)
    - `cad_usd_rate` (REAL)
    - `rbob_cad_base` (VIRTUAL: `rbob_usd_close * cad_usd_rate`)
- **`eub_prices`**: 
    - `effective_date` (TEXT PRIMARY KEY)
    - `published_date` (TEXT)
    - `max_price` (REAL)
    - `is_interrupter` (INTEGER)
    - `interrupter_variance` (REAL)

### 4.2 Pricing Engine Logic
- **Regular Cycle**: Thursday to Wednesday (5 trading days).
- **Benchmark**: The 5-day average of `rbob_cad_base` from the **previous** regular cycle.
- **Interrupter Rules**:
    - Daily Variance >= 6.0¢ OR Cumulative Variance >= 5.0¢.
    - Silent Days: Tuesday and Wednesday (Interrupters prohibited).
- **Calculated Metrics**:
    - `Pump Estimated Price`: `Max Retail Price - 5.5¢`.
    - `Risk Level`: Low (<3¢), Medium (3-4¢), High (4-5¢), Alert (>=5¢).

## 5. API Contract

### 5.1 GET `/api/v1/cycle/current`
Returns current cycle data, including:
- Current EUB price.
- Benchmark price.
- 5-day market data for the current window.
- Predicted change and risk level.

### 5.2 GET `/api/v1/history?days=90`
Returns dual-track historical data:
- EUB Step-line prices.
- Market RBOB smooth-line costs.

## 6. Frontend: "The Digital Architect" Design System

### 6.1 Design Principles
- **Editorial Clarity**: High-end briefing aesthetic, Manrope for headlines, Inter for data.
- **Tonal Depth**: No 1px borders. Use surface color shifts (`#f8f9fa` vs `#ffffff` vs `#f3f4f5`) for depth.
- **Authority**: Use Navy Blue (`#00236f`) as the regulatory primary color.

### 6.2 Key Components
- **`HeroBoard`**: Top-level dashboard. Displays forecast and risk level using bento-grid layout.
- **`CycleDetails`**: Sub-page showing the mathematical formula and 5-day cycle breakdown.
- **`HistoryChart`**: Step-line chart using ECharts to visualize price trends vs market costs.

## 7. Implementation Plan
1. **Scaffold**: Initialize Monorepo directories and `package.json` files.
2. **Database**: Apply `schema.sql` to Cloudflare D1.
3. **Data Pipeline**: Implement `update_daily.py` to populate initial data.
4. **Backend**: Build Workers API with caching and D1 integration.
5. **Frontend**: Build React UI following the "Digital Architect" prototypes.
6. **CI/CD**: Configure GitHub Actions for automated updates.
