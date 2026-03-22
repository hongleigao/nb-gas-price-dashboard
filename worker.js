/**
 * NB Gas Pulse - Cloudflare Worker (The Brain)
 * 职责：执行 SQL 聚合计算，输出预测结论、归因拆解与风险预警。
 * 版本：1.6.0 (排除非交易日，修复熔断日进度异常)
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env;

    try {
      const eub_history = await D1_DB.prepare(
        "SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 2"
      ).all();

      if (!eub_history.results || eub_history.results.length === 0) {
        return Response.json({ error: "No data" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      const latest_eub = eub_history.results[0];
      const prev_eub = eub_history.results[1];
      const nb_delta = prev_eub ? (latest_eub.max_retail_price - prev_eub.max_retail_price) : 0;

      const now_nb = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Moncton"}));
      const current_iso = now_nb.toISOString().split('T')[0];
      
      let days_to_thu = (4 - now_nb.getDay() + 7) % 7;
      if (days_to_thu === 0) days_to_thu = 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      const window_start = new Date(next_thu.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const window_end = new Date(next_thu.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // 3. 执行 SQL 聚合 (核心修复：只计算周一至周五的交易日)
      const window_stats = await D1_DB.prepare(`
        SELECT 
          AVG(base_cad_liter) as avg_new, 
          AVG(rbob_usd_gal) as avg_usd_new, 
          AVG(cad_usd_rate) as avg_fx_new, 
          COUNT(CASE WHEN strftime('%w', trading_date) NOT IN ('0', '6') THEN 1 END) as locked_days
        FROM nymex_market_data 
        WHERE trading_date BETWEEN ? AND ? AND trading_date <= ?
      `).bind(window_start, window_end, current_iso).first();

      // 4. 预测与风险逻辑
      const base_start = new Date(new Date(latest_eub.effective_date).getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const base_end = new Date(new Date(latest_eub.effective_date).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const base_stats = await D1_DB.prepare(`
        SELECT AVG(base_cad_liter) as avg_base, AVG(rbob_usd_gal) as avg_usd_base, AVG(cad_usd_rate) as avg_fx_base
        FROM nymex_market_data WHERE trading_date BETWEEN ? AND ?
      `).bind(base_start, base_end).first();

      const rolling_stats = await D1_DB.prepare(`
        SELECT AVG(base_cad_liter) as avg_rolling 
        FROM (SELECT base_cad_liter FROM nymex_market_data ORDER BY trading_date DESC LIMIT 3)
      `).first();

      const avg_base = base_stats.avg_base || 0;
      const avg_new = window_stats.avg_new || 0;
      let prediction_delta = 0, comm_impact = 0, fx_impact = 0, direction = "stable";

      if (avg_base > 0 && avg_new > 0) {
        prediction_delta = (avg_new - avg_base) * 1.15;
        comm_impact = (( (window_stats.avg_usd_new || 0) - (base_stats.avg_usd_base || 0) ) * (base_stats.avg_fx_base || 1.40) / 3.7854) * 100 * 1.15;
        fx_impact = (( (window_stats.avg_fx_new || 1.40) - (base_stats.avg_fx_base || 1.40) ) * (window_stats.avg_usd_new || 0) / 3.7854) * 100 * 1.15;
        direction = prediction_delta > 0.1 ? "up" : prediction_delta < -0.1 ? "down" : "stable";
      }
      const acc_change = avg_base > 0 ? (rolling_stats.avg_rolling - avg_base) : 0;
      const risk_level = Math.abs(acc_change) >= 5.5 ? "red" : Math.abs(acc_change) >= 3.0 ? "yellow" : "green";

      // 5. 趋势图表逻辑 (2年范围)
      const raw_market = await D1_DB.prepare("SELECT * FROM nymex_market_data ORDER BY trading_date DESC LIMIT 1000").all();
      const raw_eub = await D1_DB.prepare("SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 1000").all();
      const market_map = new Map(raw_market.results.map(r => [r.trading_date, r.base_cad_liter]));
      const eub_results = raw_eub.results || [];

      const dates = [], nymex_series = [], nb_series = [];
      for (let i = 729; i >= 0; i--) {
          const d = new Date(now_nb.getTime() - i * 24 * 60 * 60 * 1000);
          const d_str = d.toISOString().split('T')[0];
          dates.push(d_str);
          let m_val = market_map.get(d_str);
          if (m_val === undefined) {
              const prev = raw_market.results.find(r => r.trading_date <= d_str);
              m_val = prev ? prev.base_cad_liter : 0;
          }
          nymex_series.push(Math.round(m_val * 10) / 10);
          const curr_eub = eub_results.find(e => e.effective_date <= d_str);
          nb_series.push(curr_eub ? curr_eub.max_retail_price : latest_eub.max_retail_price);
      }

      return Response.json({
        metadata: {
          last_sync: now_nb.toISOString(),
          nb_last_date: latest_eub.effective_date,
          current_nb_price: latest_eub.max_retail_price,
          nb_delta: Math.round(nb_delta * 10) / 10,
          prediction: {
            change: Math.round(prediction_delta * 10) / 10,
            direction: direction,
            risk_level: risk_level,
            accumulated_change: Math.round(acc_change * 10) / 10,
            attribution: { commodity: Math.round(comm_impact * 10) / 10, fx: Math.round(fx_impact * 10) / 10 },
            window: { locked_days: window_stats.locked_days || 0, progress: Math.round(((window_stats.locked_days || 0) / 5) * 100) }
          }
        },
        dates, nymex_prices: nymex_series, nb_prices: nb_series
      }, { headers: { "Access-Control-Allow-Origin": "*" } });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
