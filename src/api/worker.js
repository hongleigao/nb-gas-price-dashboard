/**
 * NB Gas Pulse - Cloudflare Worker (The Brain)
 * 版本：2.3.0 (Comprehensive Debug + Chart Logic Fix)
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env;

    try {
      // --- 1. 获取基础锚点 ---
      const eub_history = await D1_DB.prepare(
        "SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 2"
      ).all();

      if (!eub_history.results || eub_history.results.length === 0) {
        return Response.json({ error: "No EUB data found" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      const latest_eub = eub_history.results[0];
      const prev_eub = eub_history.results[1];
      const activeBase = latest_eub.active_eub_base || (latest_eub.max_retail_price / 1.15 - 45);

      const now_nb = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Moncton"}));
      const current_iso = now_nb.toISOString().split('T')[0];
      const day_of_week = now_nb.getDay(); 

      // --- 2. 获取行情数据 (用于预测与归因) ---
      const market_data = await D1_DB.prepare(`
        SELECT trading_date, base_cad_liter, rbob_usd_gal, cad_usd_rate, is_final
        FROM nymex_market_data 
        WHERE is_holiday = 0 AND trading_date <= ?
        ORDER BY trading_date DESC 
        LIMIT 15
      `).bind(current_iso).all();

      if (market_data.results.length < 3) throw new Error("市场行情数据不足");
      const recentTrades = market_data.results;
      const latestFinal = recentTrades.find(r => r.is_final === 1 || r.is_final === null) || recentTrades[0];

      // --- 3. 5日窗口预测逻辑与调试 ---
      const days_to_thu = (4 - day_of_week + 7) % 7 || 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      const window_dates = [];
      for (let i = 8; i >= 2; i--) {
          const d = new Date(next_thu.getTime() - i * 24 * 60 * 60 * 1000);
          if (d.getDay() !== 0 && d.getDay() !== 6) window_dates.push(d.toISOString().split('T')[0]);
      }
      const target_5_days = window_dates.slice(-5);
      
      const windowFinalTrades = recentTrades.filter(r => target_5_days.includes(r.trading_date) && (r.is_final === 1 || r.is_final === null));
      const rawAvg = windowFinalTrades.length > 0 
          ? windowFinalTrades.reduce((sum, row) => sum + row.base_cad_liter, 0) / windowFinalTrades.length 
          : latestFinal.base_cad_liter;
      
      const display_total = Math.round((rawAvg - activeBase) * 1.15 * 10) / 10;

      // --- 4. 归因分析调试 ---
      const cur_rbob = latestFinal.rbob_usd_gal;
      const cur_fx = latestFinal.cad_usd_rate;
      let ref_source = "EUB_RECORD";
      let ref_rbob = latest_eub.rbob_usd_gal;
      let ref_fx = latest_eub.cad_usd_rate;

      if (!ref_rbob || !ref_fx) {
          ref_source = "WINDOW_BACKTRACE";
          ref_rbob = recentTrades.length > 1 ? recentTrades[recentTrades.length - 1].rbob_usd_gal : cur_rbob;
          ref_fx = recentTrades.length > 1 ? recentTrades[recentTrades.length - 1].cad_usd_rate : cur_fx;
      }

      const comm_impact = ((cur_rbob - ref_rbob) * ref_fx / 3.7854) * 1.15 * 100;
      const fx_impact = (cur_rbob * (cur_fx - ref_fx) / 3.7854) * 1.15 * 100;

      // --- 5. 图表趋势修复逻辑 (重要) ---
      const start_date_history = new Date(now_nb.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // A. 正序获取市场数据
      const history_market = await D1_DB.prepare(`
          SELECT trading_date, base_cad_liter FROM nymex_market_data 
          WHERE trading_date >= ? ORDER BY trading_date ASC
      `).bind(start_date_history).all();

      // B. 正序获取全量调价记录
      const history_eub = await D1_DB.prepare(`
          SELECT effective_date, max_retail_price FROM eub_regulations 
          WHERE effective_date >= ? ORDER BY effective_date ASC
      `).bind(start_date_history).all();
      const eub_map = new Map(history_eub.results.map(r => [r.effective_date, r.max_retail_price]));

      // C. 获取历史起点时的初始价格 (防止曲线从 0 开始或穿越)
      const initial_eub = await D1_DB.prepare(`
          SELECT max_retail_price FROM eub_regulations 
          WHERE effective_date < ? ORDER BY effective_date DESC LIMIT 1
      `).bind(history_market.results[0].trading_date).first();

      const dates = [], nymex_prices = [], nb_prices = [];
      let last_known_eub = initial_eub ? initial_eub.max_retail_price : (history_eub.results[0]?.max_retail_price || 0);

      history_market.results.forEach(row => {
          dates.push(row.trading_date);
          nymex_prices.push(row.base_cad_liter);
          // 如果这一天官方调价了，更新价格
          if (eub_map.has(row.trading_date)) {
              last_known_eub = eub_map.get(row.trading_date);
          }
          nb_prices.push(last_known_eub);
      });

      // --- 6. 构造响应 ---
      return Response.json({
        metadata: {
          last_sync: now_nb.toISOString(),
          nb_last_date: latest_eub.effective_date,
          market_data_last_date: latestFinal.trading_date,
          debug: {
              instant_drive: {
                  ref_source,
                  ref_rbob: parseFloat(ref_rbob.toFixed(4)),
                  cur_rbob: parseFloat(cur_rbob.toFixed(4)),
                  ref_fx: parseFloat(ref_fx.toFixed(4)),
                  cur_fx: parseFloat(cur_fx.toFixed(4)),
                  base_cad: parseFloat(activeBase.toFixed(2))
              },
              projected_vars: {
                  formula: "((Window_Avg - Base) * 1.15)",
                  window_avg: parseFloat(rawAvg.toFixed(4)),
                  base_cad: parseFloat(activeBase.toFixed(2)),
                  days_included: windowFinalTrades.length,
                  dates_used: windowFinalTrades.map(t => t.trading_date)
              }
          },
          prediction: {
            change: display_total,
            direction: display_total > 0.1 ? "up" : display_total < -0.1 ? "down" : "stable",
            spot_attribution: { 
                commodity: Math.round(comm_impact * 100) / 100, 
                fx: Math.round(fx_impact * 100) / 100 
            },
            window: { 
                locked_days: windowFinalTrades.length,
                progress: Math.round((windowFinalTrades.length / 5) * 100),
                breakdown: target_5_days.map(date_str => {
                    const row = market_map.get(date_str);
                    const isFinal = row ? (row.is_final === null ? 1 : row.is_final) : 0;
                    return {
                        date: date_str,
                        day: new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
                        raw_market: row ? parseFloat(row.base_cad_liter.toFixed(2)) : null,
                        diff: (row && isFinal === 1) ? Math.round((row.base_cad_liter - activeBase) * 1.15 * 10) / 10 : null,
                        is_final: isFinal
                    };
                })
            }
          }
        },
        dates, nymex_prices, nb_prices
      }, { headers: { "Access-Control-Allow-Origin": "*" } });

    } catch (e) {
      return Response.json({ error: e.message, stack: e.stack }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
