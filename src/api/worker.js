/**
 * NB Gas Pulse - Cloudflare Worker (V6.0 Thin Edition)
 * 重构重点：逻辑下沉数据库，路由化 API
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env;
    const url = new URL(request.url);
    const headers = { 
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
    };

    try {
      // 路由 1: 最新决策接口 /api/latest (或者默认根目录)
      if (url.pathname === "/api/latest" || url.pathname === "/") {
        return await handleLatest(D1_DB, headers);
      }

      // 路由 2: 历史数据接口 /api/history (用于图表)
      if (url.pathname === "/api/history") {
        return await handleHistory(D1_DB, headers);
      }

      return new Response("Not Found", { status: 404, headers });

    } catch (e) {
      return Response.json({ error: e.message, stack: e.stack }, { status: 500, headers });
    }
  }
};

/**
 * 处理最新预测决策 (V6.0 逻辑下沉)
 */
async function handleLatest(db, headers) {
  // A. 直接调用 V6.0 自动化统计视图 (预测核心)
  const stats = await db.prepare("SELECT * FROM v_gas_stats_latest").first();
  
  // B. 获取 5 日窗口明细 (用于 UI 列表)
  const window_data = await db.prepare(`
    SELECT trading_date as date, base_cad_liter as raw_market, status 
    FROM v_daily_market_final 
    WHERE commodity_id = 'gasoline' 
    ORDER BY trading_date DESC LIMIT 5
  `).all();

  if (!stats) throw new Error("Database views not initialized or no data found");

  // V6.0 核心修正：stats.window_avg 是美元 ($1.12)，需要乘以 100 转换为分 (112.9c)
  const windowAvgCents = stats.window_avg * 100;
  
  // 计算预测涨跌 (分/升)
  // 公式：(窗口均值 - (当前官方零售价 / 1.15 - 45.42)) * 1.15
  const currentMarketBase = (stats.current_eub_price / 1.15) - 45.42;
  const change = Math.round((windowAvgCents - currentMarketBase) * 1.15 * 10) / 10;

  return Response.json({
    metadata: {
      last_sync: new Date().toISOString(),
      commodity: stats.commodity_id,
      debug: { 
          source: "V6.0_SQL_VIEW",
          window_avg_usd: parseFloat(stats.window_avg.toFixed(4)),
          window_avg_cents: parseFloat(windowAvgCents.toFixed(2)),
          current_eub_price_cents: stats.current_eub_price,
          active_base_cents: 45.42,
          impacts: {
              commodity: parseFloat(stats.commodity_impact_cents.toFixed(2)),
              fx: parseFloat(stats.fx_impact_cents.toFixed(2))
          },
          benchmarks: { 
              ref_rbob: stats.ref_rbob, 
              cur_rbob: stats.current_rbob,
              ref_fx: stats.ref_fx,
              cur_fx: stats.current_fx
          }
      }
    },
    prediction: {
      change: change,
      direction: change > 0.1 ? "up" : change < -0.1 ? "down" : "stable",
      spot_attribution: {
          commodity: Math.round(stats.commodity_impact_cents * 10) / 10,
          fx: Math.round(stats.fx_impact_cents * 10) / 10
      },
      window: {
          locked_days: stats.days_count,
          progress: Math.round((stats.days_count / 5) * 100),
          breakdown: window_data.results.reverse().map(r => ({
              ...r,
              day: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
              is_final: r.status === 'FINAL' ? 1 : 0
          }))
      }
    }
  }, { headers });
}

/**
 * 处理历史图表数据 (V6.0 历史追溯)
 */
async function handleHistory(db, headers) {
  const start_date = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // A. 正序获取市场数据
  const history_market = await db.prepare(`
      SELECT trading_date, base_cad_liter FROM v_daily_market_final 
      WHERE commodity_id = 'gasoline' AND trading_date >= ? ORDER BY trading_date ASC
  `).bind(start_date).all();

  // B. 获取全量调价记录 (用于阶梯图)
  const history_eub = await db.prepare(`
      SELECT effective_date, max_retail_price FROM eub_history 
      WHERE commodity_id = 'gasoline' AND effective_date >= ? ORDER BY effective_date ASC
  `).bind(start_date).all();
  
  const eub_map = new Map(history_eub.results.map(r => [r.effective_date, r.max_retail_price]));
  
  // C. 初始价格回溯
  const initial_eub = await db.prepare(`
      SELECT max_retail_price FROM eub_history 
      WHERE commodity_id = 'gasoline' AND effective_date < ? ORDER BY effective_date DESC LIMIT 1
  `).bind(history_market.results[0].trading_date).first();

  const dates = [], nymex_prices = [], nb_prices = [];
  let last_known_eub = initial_eub ? initial_eub.max_retail_price : (history_eub.results[0]?.max_retail_price || 0);

  history_market.results.forEach(row => {
      dates.push(row.trading_date);
      nymex_prices.push(row.base_cad_liter);
      if (eub_map.has(row.trading_date)) {
          last_known_eub = eub_map.get(row.trading_date);
      }
      nb_prices.push(last_known_eub);
  });

  return Response.json({ dates, nymex_prices, nb_prices }, { headers });
}
