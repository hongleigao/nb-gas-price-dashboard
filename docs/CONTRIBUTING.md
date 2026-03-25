# Contributing to NB Gas Pulse (v7.0)

Welcome! This guide provides detailed instructions on how to set up, maintain, and contribute to the NB Gas Pulse project.

---

## 1. Project Structure

The project is divided into three main components:

- **`web/`**: The frontend application built with React, Vite, Tailwind CSS, and ECharts.
- **`api/`**: The backend API running on Cloudflare Workers (JavaScript) with D1 Database.
- **`scripts/`**: Python ETL (Extract, Transform, Load) scripts for market data processing.
- **`database/`**: SQL schema definitions for the D1 database.

## 2. Development Setup

### 2.1 Backend (API)
The API is built using Cloudflare Workers and managed with Wrangler.

```bash
cd api
npm install
# To run locally
npm run dev
# To deploy
npm run deploy
```

### 2.2 Frontend (Web)
The frontend is a modern React application.

```bash
cd web
npm install
# Start development server
npm run dev
# Build for production
npm run build
```

### 2.3 Data ETL (Python Scripts)
Python scripts are used to fetch market data and push it to the D1 database.

- **Requirements**: Python 3.10+
- **Installation**:
  ```bash
  pip install -r scripts/requirements.txt
  ```

## 3. Data Management

### Initial Setup
1. **Initialize Database**: Use `database/schema.sql` to set up your Cloudflare D1 database.
2. **Seed History**: Run `python scripts/seed_history.py` to import historical market data.

### Daily Updates
The system uses `scripts/update_daily.py` to fetch the latest benchmarks.

To run manually:
```powershell
$env:CLOUDFLARE_ACCOUNT_ID="your_id"
$env:CLOUDFLARE_API_TOKEN="your_token"
python scripts/update_daily.py --remote
```

## 4. Deployment & CI/CD

The project uses **GitHub Actions** (`.github/workflows/main.yml`) for automated deployment:
- **Data Pipeline**: Runs daily (08:00 and 22:30 UTC) to update the database.
- **API Deployment**: Deploys the Cloudflare Worker upon successful data updates.
- **Frontend Deployment**: Deploys the built web app to **GitHub Pages** (`gh-pages` branch).

### Required GitHub Secrets:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_DATABASE_ID` (if not specified in wrangler.toml)

---
Maintained by Jacky
