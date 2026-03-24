# NB Gas Pulse - V6.0 数据库与计算规范

## 1. 数据库架构 (D1)

### Table: `market_quotes` (行情事实)
| 字段 | 类型 | 含义 |
| :--- | :--- | :--- |
| `trading_date` | DATE | 市场交易日期 |
| `price_usd_gal` | REAL | NYMEX RBOB 收盘价 (USD/gal) |
| `fx_rate` | REAL | 当日汇率结算 (USD/CAD) |
| `base_cad_liter` | REAL | 虚拟列：`(price * fx / 3.78541178)` |
| `status` | TEXT | `FINAL` 代表已收盘 |

### Table: `eub_history` (监管基准)
| 字段 | 类型 | 含义 |
| :--- | :--- | :--- |
| `effective_date` | DATE | 调价生效日 (通常为周五) |
| `max_retail_price`| REAL | 官方最高零售价 (¢/L) |
| `active_base` | REAL | 监管固定成本锚点 (默认 45.42) |

---

## 2. 自动化视图逻辑

### `v_gas_stats_latest`
该视图通过以下 SQL 实现逻辑下沉：
1. **Windowing**: 选取 `market_quotes` 中最新的 5 条 `FINAL` 记录。
2. **Attribution**: 关联 `eub_history` 找到上一次调价时的 `ref_rbob`。
3. **Calculation**:
   - `commodity_impact`: `(cur_rbob - ref_rbob) * ref_fx / 3.7854 * 1.15 * 100`
   - `fx_impact`: `cur_rbob * (cur_fx - ref_fx) / 3.7854 * 1.15 * 100`

## 3. 部署规范
- **后端**: Cloudflare Worker (Thin Logic)
- **数据库**: Cloudflare D1 (SQL First)
- **CI/CD**: GitHub Actions (Daily 08:00 & 22:30 UTC)
