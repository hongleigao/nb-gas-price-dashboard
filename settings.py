# NB Gas Price Dashboard - Configuration Settings

# 1. 数据源设置
NBEUB_XLS_URL = 'https://nbeub.ca/images/documents/petroleum_pricing/Historical%20Petroleum%20Prices.xls'
EXCEL_SHEET_NAME = 'Current'

# 2. 定位关键词 (用于动态解析 Excel)
ROW_KEYWORD_DATE = 'Date'
ROW_KEYWORD_PRICE = 'Regular Unleaded  Maximum with Delivery'

# 3. 金融数据设置 (Yahoo Finance Tickers)
TICKER_RBOB = 'RB=F'   # NYMEX RBOB Gasoline Futures
TICKER_CAD = 'CAD=X'    # USD to CAD Exchange Rate

# 4. 经济学参数
PROVINCIAL_TAX_RATE = 1.15  # NB 省 15% HST
GALLON_TO_LITER = 3.78541

# 5. 系统设置
ROLLING_WINDOW_DAYS = 730   # 数据保留天数 (2年)
INCREMENTAL_FETCH_DAYS = 30 # 增量更新抓取的天数 (抓取最近30天以确保覆盖假期和时差)
DATA_FILE = 'data.json'
