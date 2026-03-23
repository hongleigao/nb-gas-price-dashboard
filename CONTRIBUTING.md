# Contributing to NB Gas Pulse

This guide explains how to maintain the system, update data, and modify the core logic.

---

## 1. Development Environment
- **Python**: 3.10+
- **Database**: Cloudflare D1
- **API Runtime**: Cloudflare Workers (JavaScript)

### Installation
```powershell
pip install pandas yfinance requests openpyxl xlrd pytz
```

## 2. Managing Data (The Pusher)
The system relies on daily synchronization between market benchmarks and the cloud database.

### Initial Seeding (Run once)
1. `python init_db.py`: Initializes the Cloudflare D1 schema.
2. `python seed_eub_history.py`: Imports historical NB EUB regulatory data.
3. `python seed_history.py`: Imports 2-year market benchmark history.

### Daily Maintenance
`update_data.py` is executed automatically via GitHub Actions. To run manually:
```powershell
# Set credentials first
$env:CLOUDFLARE_ACCOUNT_ID="..."
$env:CLOUDFLARE_DATABASE_ID="..."
$env:CLOUDFLARE_API_TOKEN="..."
python update_data.py
```

## 3. Modifying Logic (The Brain)
The core prediction logic resides in `worker.js`. 

### Manual Update
1. Modify `worker.js`.
2. Copy content to Cloudflare Worker Dashboard.
3. Deploy.

### Automated Deployment (Wrangler)
```bash
# Recommendation: Use Cloudflare Wrangler CLI
npm install -g wrangler
wrangler login
wrangler deploy worker.js --name nb-gas-pulse-api
```

## 4. GitHub Actions Configuration
Ensure the following Secrets are configured in your repository:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN`

---
*Maintained by NB Gas Pulse Engineering*
