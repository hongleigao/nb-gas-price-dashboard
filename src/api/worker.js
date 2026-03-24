/**
 * NB Gas Pulse - Cloudflare Worker (V6.1 Algorithmic Restoration)
 * 职责：回滚算法至 V5 精准逻辑，保留 V6 规范化数据库架构
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
      // 1. 获取 EUB 官方底层锚点 (V6 表名: eub_history)
      const eub_history = await D1_DB.prepare(
        "SELECT * FROM eub_history WHERE commodity_id = 'gasoline' ORDER BY effective_date DESC LIMIT 2"
      ).all();

      if (!eub_history.results || eub_history.results.length === 0) {
        throw new Error("EUB history data not found");
      }

      const latest_eub = eub_history.results[0];
      const prev_eub = eub_history.results[1];
      const activeBase = latest_eub.active_base || 45.42; // V6 默认基准

      const now_nb = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Moncton"}));
      const current_iso = now_nb.toISOString().split('T')[0];
      const day_of_week = now_nb.getDay(); 

      // 2. 获取最近 15 个交易日的市场数据 (V6 表名: market_quotes)
      // 我们只使用 FINAL 收盘价进行预测计算，确保精准度
      const market_data = await D1_DB.prepare(`
        SELECT trading_date, base_cad_liter, price_usd_gal as rbob_usd_gal, fx_rate as cad_usd_rate, status
        FROM market_quotes
        WHERE commodity_id = 'gasoline' AND trading_date <= ?
        ORDER BY trading_date DESC
        LIMIT 15
      `).bind(current_iso).all();

      if (market_data.results.length < 5) throw new Error("市场数据不足");
      
      // 核心修正：只取每交易日的最终记录 (FINAL)
      const dailyFinalTrades = [];
      const seenDates = new Set();
      for (const row of market_data.results) {
          if (!seenDates.has(row.trading_date) && row.status === 'FINAL') {
              dailyFinalTrades.push(row);
              seenDates.add(row.trading_date);
          }
      }
      // 如果没有足够的 FINAL 数据，回退到最新抓取
      const recentTrades = dailyFinalTrades.length >= 5 ? dailyFinalTrades : market_data.results;

      // 3. 熔断机制判定 (V5 原创算法)
      let interrupter_alert = false;
      let interrupter_reason = "市场平稳";
      let cumulative_delta = 0;
      const is_blackout = (day_of_week === 2 || day_of_week === 3);

      if (!is_blackout) {
        const last3Days = recentTrades.slice(0, 3);
        const rollingAvg3Days = (last3Days.reduce((sum, row) => sum + row.base_cad_liter, 0) / 3) * 100;
        cumulative_delta = rollingAvg3Days - (latest_eub.max_retail_price / 1.15 - activeBase);

        if (Math.abs(cumulative_delta) >= 5.0) {
          interrupter_alert = true;
          interrupter_reason = `触发累计红线: 偏离达 ${cumulative_delta.toFixed(2)} ¢`;
        }
      } else {
        interrupter_reason = "处于法定调价静默期 (周二/周三)";
      }

      // 4. 5日窗口精准预测 (V5 原创算法)
      const days_to_thu = (4 - day_of_week + 7) % 7 || 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      const window_dates = [];
      for (let i = 8; i >= 2; i--) {
          const d = new Date(next_thu.getTime() - i * 24 * 60 * 60 * 1000);
          if (d.getDay() !== 0 && d.getDay() !== 6) window_dates.push(d.toISOString().split('T')[0]);
      }
      const target_5_days = window_dates.slice(-5);
      
      const windowTrades = recentTrades.filter(r => target_5_days.includes(r.trading_date));
      const windowAvg = windowTrades.length > 0
          ? windowTrades.reduce((sum, row) => sum + row.base_cad_liter, 0) / windowTrades.length
          : recentTrades[0].base_cad_liter;
      
      // 公式对齐：(均值(c) - 基准(c)) * 1.15
      const change = Math.round((windowAvg * 100 - (latest_eub.max_retail_price / 1.15 - activeBase)) * 1.15 * 10) / 10;

      // 5. 归因分析
      const cur_rbob = recentTrades[0].rbob_usd_gal;
      const cur_fx = recentTrades[0].cad_usd_rate;
      
      // 寻找参考基准：上周调价时的市场价 (V6 View 思想的 JS 实现)
      const ref_trade = recentTrades.find(r => r.trading_date < latest_eub.effective_date) || recentTrades[recentTrades.length - 1];
      const ref_rbob = ref_trade.rbob_usd_gal;
      const ref_fx = ref_trade.cad_usd_rate;

      const comm_impact = ((cur_rbob - ref_rbob) * ref_fx / 3.7854) * 1.15 * 100;
      const fx_impact = (cur_rbob * (cur_fx - ref_fx) / 3.7854) * 1.15 * 100;

      // 路由处理
      if (url.pathname === "/api/latest" || url.pathname === "/") {
        return Response.json({
          metadata: {
            last_sync: now_nb.toISOString(),
            current_nb_price: latest_eub.max_retail_price,
            nb_last_date: latest_eub.effective_date,
            debug: { 
                algo: "V5_JS_RESTORED",
                window_avg_cents: parseFloat((windowAvg * 100).toFixed(2)),
                active_base: activeBase,
                ref_date: ref_trade.trading_date
            }
          },
          prediction: {
            change: change,
            direction: change > 0.1 ? "up" : change < -0.1 ? "down" : "stable",
            risk_level: interrupter_alert ? "red" : (Math.abs(cumulative_delta) >= 3.5 ? "yellow" : "green"),
            interrupter_reason,
            spot_attribution: { 
                commodity: Math.round(comm_impact * 10) / 10, 
                fx: Math.round(fx_impact * 10) / 10 
            },
            window: {
                locked_days: windowTrades.length,
                progress: Math.round((windowTrades.length / 5) * 100),
                breakdown: target_5_days.map(d => {
                    const trade = recentTrades.find(r => r.trading_date === d);
                    return {
                        date: d,
                        day: new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
                        raw_market: trade ? trade.base_cad_liter : null,
                        is_final: trade ? (trade.status === 'FINAL' ? 1 : 0) : 0
                    };
                })
            }
          }
        }, { headers });
      }

      // 历史趋势接口 (异步加载)
      if (url.pathname === "/api/history") {
        const start_date = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const history_market = await D1_DB.prepare("SELECT trading_date, base_cad_liter FROM v_daily_market_final WHERE commodity_id = 'gasoline' AND trading_date >= ? ORDER BY trading_date ASC").bind(start_date).all();
        const history_eub = await D1_DB.prepare("SELECT effective_date, max_retail_price FROM eub_history WHERE commodity_id = 'gasoline' AND effective_date >= ? ORDER BY effective_date ASC").bind(start_date).all();
        
        const eub_map = new Map(history_eub.results.map(r => [r.effective_date, r.max_retail_price]));
        const dates = [], nymex_prices = [], nb_prices = [];
        let last_known_eub = history_eub.results[0]?.max_retail_price || 0;

        history_market.results.forEach(row => {
            dates.push(row.trading_date);
            nymex_prices.push(row.base_cad_liter);
            if (eub_map.has(row.trading_date)) last_known_eub = eub_map.get(row.trading_date);
            nb_prices.push(last_known_eub);
        });

        return Response.json({ dates, nymex_prices, nb_prices }, { headers });
      }

      return new Response("Not Found", { status: 404, headers });

    } catch (e) {
      return Response.json({ error: e.message, stack: e.stack }, { status: 500, headers });
    }
  }
};
