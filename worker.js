/**
 * NB Gas Pulse - Cloudflare Worker (The Brain)
 * 职责：执行 SQL 聚合计算，输出预测结论、归因拆解与风险预警。
 * 版本：1.8.0 (新增 5 日计价明细表，支持熔断标注)
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env;

    try {
      // 1. 获取基础监管状态
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
      
      // 2. 确定 5 个计价交易日 (上周三至本周二)
      let days_to_thu = (4 - now_nb.getDay() + 7) % 7;
      if (days_to_thu === 0) days_to_thu = 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      
      const window_dates = [];
      for (let i = 8; i >= 2; i--) {
          const d = new Date(next_thu.getTime() - i * 24 * 60 * 60 * 1000);
          if (d.getDay() !== 0 && d.getDay() !== 6) { // 仅保留周一至周五
              window_dates.push(d.toISOString().split('T')[0]);
          }
      }
      // 确保取到的是最近的 5 个交易日
      const target_5_days = window_dates.slice(-5);
      const window_start = target_5_days[0];
      const window_end = target_5_days[4];

      // 3. 执行 SQL 聚合
      const window_stats = await D1_DB.prepare(`
        SELECT 
          AVG(base_cad_liter) as avg_new, 
          AVG(rbob_usd_gal) as avg_usd_new, 
          AVG(cad_usd_rate) as avg_fx_new, 
          COUNT(CASE WHEN trading_date <= ? THEN 1 END) as locked_days
        FROM nymex_market_data 
        WHERE trading_date BETWEEN ? AND ?
      `).bind(current_iso, window_start, window_end).first();

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
      
      // 4. 强制平衡逻辑
      let display_total = 0, display_comm = 0, display_fx = 0, direction = "stable";
      if (avg_base > 0 && avg_new > 0) {
        display_total = Math.round((avg_new - avg_base) * 1.15 * 10) / 10;
        const raw_comm = (( (window_stats.avg_usd_new || 0) - (base_stats.avg_usd_base || 0) ) * (base_stats.avg_fx_base || 1.40) / 3.7854) * 100 * 1.15;
        display_comm = Math.round(raw_comm * 100) / 100;
        display_fx = Math.round((display_total - display_comm) * 100) / 100;
        direction = display_total > 0.1 ? "up" : display_total < -0.1 ? "down" : "stable";
      }

      // 5. 核心：构建 5 日明细明细表 (Breakdown)
      const daily_market = await D1_DB.prepare(
          "SELECT trading_date, base_cad_liter FROM nymex_market_data WHERE trading_date BETWEEN ? AND ?"
      ).bind(window_start, window_end).all();
      
      const daily_eub = await D1_DB.prepare(
          "SELECT effective_date, is_interrupter FROM eub_regulations WHERE effective_date BETWEEN ? AND ?"
      ).bind(window_start, window_end).all();

      const market_map = new Map(daily_market.results.map(r => [r.trading_date, r.base_cad_liter]));
      const interrupter_set = new Set(daily_eub.results.filter(r => r.is_interrupter).map(r => r.effective_date));

      const breakdown = target_5_days.map(date_str => {
          const val = market_map.get(date_str);
          const day_name = new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
          const display_date = new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          return {
              date: display_date,
              day: day_name,
              diff: val ? Math.round((val - avg_base) * 1.15 * 10) / 10 : null,
              is_interrupter: interrupter_set.has(date_str)
          };
      });

      // 6. 趋势图表与响应 (扩展至 730 天 / 2 年)
      const acc_change = avg_base > 0 ? (rolling_stats.avg_rolling - avg_base) : 0;
      const raw_market = await D1_DB.prepare("SELECT * FROM nymex_market_data ORDER BY trading_date DESC LIMIT 1000").all();
      const raw_eub = await D1_DB.prepare("SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 1000").all();
      
      const market_hist_map = new Map(raw_market.results.map(r => [r.trading_date, r.base_cad_liter]));
      const eub_hist_results = raw_eub.results || [];

      const dates = [], nymex_series = [], nb_series = [];
      // 核心：循环 730 天
      for (let i = 729; i >= 0; i--) { 
          const d = new Date(now_nb.getTime() - i * 24 * 60 * 60 * 1000);
          const d_str = d.toISOString().split('T')[0];
          dates.push(d_str);

          // 市场数据平滑
          let m_val = market_hist_map.get(d_str);
          if (m_val === undefined) {
              const prev = raw_market.results.find(r => r.trading_date <= d_str);
              m_val = prev ? prev.base_cad_liter : 0;
          }
          nymex_series.push(Math.round(m_val * 10) / 10);

          // 监管价格平滑
          const curr_eub = eub_hist_results.find(e => e.effective_date <= d_str);
          nb_series.push(curr_eub ? curr_eub.max_retail_price : latest_eub.max_retail_price);
      }

      return Response.json({
        metadata: {
          last_sync: now_nb.toISOString(),
          nb_last_date: latest_eub.effective_date,
          current_nb_price: latest_eub.max_retail_price,
          nb_delta: Math.round(nb_delta * 10) / 10,
          prediction: {
            change: display_total, direction, risk_level: Math.abs(acc_change) >= 5.5 ? "red" : Math.abs(acc_change) >= 3.0 ? "yellow" : "green",
            accumulated_change: Math.round(acc_change * 10) / 10,
            attribution: { commodity: display_comm, fx: display_fx },
            window: { locked_days: window_stats.locked_days || 0, progress: Math.round(((window_stats.locked_days || 0) / 5) * 100), breakdown }
          }
        },
        dates, nymex_prices: nymex_series, nb_prices: nb_series
      }, { headers: { "Access-Control-Allow-Origin": "*" } });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
