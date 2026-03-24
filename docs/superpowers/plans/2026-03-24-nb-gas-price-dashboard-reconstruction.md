# NB Gas Price Dashboard Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the NB Gas Price Dashboard from scratch following the v7.0 design and "Digital Architect" UI prototype.

**Architecture:** Monorepo with Cloudflare D1 (Database), Cloudflare Workers (API), and Cloudflare Pages (Frontend).

**Tech Stack:** Python (Data Scraping), Cloudflare D1 (SQLite), Cloudflare Workers (Node.js), React + Vite + Tailwind CSS (Frontend), ECharts (Data Vis).

---

### Task 1: Monorepo Scaffolding & Database Setup

**Files:**
- Create: `database/schema.sql`
- Create: `api/package.json`
- Create: `web/package.json`
- Create: `scripts/requirements.txt`
- Modify: `wrangler.toml` (Move to `api/wrangler.toml`)

- [ ] **Step 1: Create Monorepo directory structure**
Run: `mkdir -p api/src/handlers web/src/components web/src/services scripts database`

- [ ] **Step 2: Define D1 Database Schema**
File: `database/schema.sql`
```sql
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
```

- [ ] **Step 3: Setup Backend (`api/package.json`)**
File: `api/package.json`
```json
{
  "name": "nb-gas-api",
  "type": "module",
  "devDependencies": {
    "wrangler": "^3.90.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

- [ ] **Step 4: Setup Frontend (`web/package.json`)**
File: `web/package.json`
```json
{
  "name": "nb-gas-web",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "echarts": "^5.5.1",
    "lucide-react": "^0.454.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.10"
  }
}
```

- [ ] **Step 5: Apply D1 Schema to local dev environment**
Run: `wrangler d1 execute D1_DB --local --file=database/schema.sql` (Adjust if name varies)

- [ ] **Step 6: Commit Scaffold**
Run: `git add database/ api/ web/ scripts/ && git commit -m "chore: scaffold monorepo and database schema"`

---

### Task 2: Python Data Pipeline (update_daily.py)

**Files:**
- Create: `scripts/update_daily.py`
- Create: `scripts/requirements.txt`

- [ ] **Step 1: Install dependencies**
File: `scripts/requirements.txt`
```text
pandas
yfinance
requests
```
Run: `pip install -r scripts/requirements.txt`

- [ ] **Step 2: Implement Scraping Logic**
File: `scripts/update_daily.py` (Focus on RBOB + CAD/USD + EUB Excel)
- Implement `get_market_data()` using `yfinance`.
- Implement `get_eub_prices()` using `requests` and `pandas` for Excel.
- Implement `sync_to_d1()` using `wrangler d1 execute`.

- [ ] **Step 3: Test data pipeline locally**
Run: `python scripts/update_daily.py --dry-run`

- [ ] **Step 4: Commit Data Pipeline**
Run: `git add scripts/ && git commit -m "feat: implement daily data update script"`

---

### Task 3: Backend API (Cloudflare Workers)

**Files:**
- Create: `api/src/index.js`
- Create: `api/src/router.js`
- Create: `api/src/handlers/cycle.js`
- Create: `api/src/handlers/history.js`

- [ ] **Step 1: Implement Worker entry and Router**
File: `api/src/index.js`: Setup CORS and routing.
File: `api/src/router.js`: Map `/api/v1/cycle/current` and `/api/v1/history`.

- [ ] **Step 2: Implement Cycle Analysis logic**
File: `api/src/handlers/cycle.js`: Calculate benchmark, predicted change, and risks based on Section 3 of design.

- [ ] **Step 3: Implement History API**
File: `api/src/handlers/history.js`: Query `eub_prices` and `market_data` with a 90-day limit.

- [ ] **Step 4: Verify API locally**
Run: `npm run dev` in `api/` and test endpoints with `curl`.

- [ ] **Step 5: Commit API**
Run: `git add api/ && git commit -m "feat: build workers api with d1 integration"`

---

### Task 4: Frontend Development (The Digital Architect)

**Files:**
- Create: `web/src/App.jsx`
- Create: `web/src/components/HeroBoard.jsx`
- Create: `web/src/components/CycleDetails.jsx`
- Create: `web/src/components/HistoryChart.jsx`

- [ ] **Step 1: Implement "The Digital Architect" theme**
File: `web/tailwind.config.js`: Define the color palette from `DESIGN.md`.

- [ ] **Step 2: Build HeroBoard (Market Overview)**
File: `web/src/components/HeroBoard.jsx`: Implement current price display, falling/rising indicators, and risk gauge.

- [ ] **Step 3: Build CycleDetails (Formula Analysis)**
File: `web/src/components/CycleDetails.jsx`: Implement the 5-day pricing cycle list.

- [ ] **Step 4: Build HistoryChart (Trends)**
File: `web/src/components/HistoryChart.jsx`: Implement ECharts with dual Y-axes and step-line for EUB prices.

- [ ] **Step 5: Final Polish & Verification**
Run: `npm run dev` in `web/` and verify layout against prototypes.

- [ ] **Step 6: Commit Frontend**
Run: `git add web/ && git commit -m "feat: implement high-end editorial UI"`
