/**
 * NB Gas Pulse - Cloudflare Worker (The Brain)
 * 职责：整合专家建议的 3日滚动均值逻辑 + 法定静默期判定
 * 版本：2.2.2 (Debug Mode Enabled)
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env;

    try {
      // 1. 获取 EUB 官方底层锚点
      const eub_history = await D1_DB.prepare(
        "SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 2"
      ).all();

      if (!eub_history.results || eub_history.results.length === 0) {
        return Response.json({ error: "No data" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      const latest_eub = eub_history.results[0];
      const prev_eub = eub_history.results[1];
      const nb_delta = prev_eub ? (latest_eub.max_retail_price - prev_eub.max_retail_price) : 0;
      const activeBase = latest_eub.active_eub_base || (latest_eub.max_retail_price / 1.15 - 45);

      const now_nb = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Moncton"}));
      const current_iso = now_nb.toISOString().split('T')[0];
      const day_of_week = now_nb.getDay(); 

      // 2. 获取最近 10 个交易日的市场数据
      const market_data = await D1_DB.prepare(`
        SELECT trading_date, base_cad_liter, rbob_usd_gal, cad_usd_rate, is_final
        FROM nymex_market_data 
        WHERE is_holiday = 0 AND trading_date <= ?
        ORDER BY trading_date DESC 
        LIMIT 10
      `).bind(current_iso).all();

      if (market_data.results.length < 3) throw new Error("市场数据不足");
      const recentTrades = market_data.results;

      // 3. 获取最近一次收盘记录 (兼容处理：NULL 视为已收盘)
      const latestFinal = recentTrades.find(r => r.is_final === 1 || r.is_final === null) || recentTrades[0];

      // 4. 熔断机制判定
      let interrupter_alert = false;
      let interrupter_type = "none";
      let interrupter_reason = "市场平稳";
      let cumulative_delta = 0;

      const is_blackout = (day_of_week === 2 || day_of_week === 3);
      
      if (!is_blackout) {
        const finalTrades = recentTrades.filter(r => r.is_final === 1 || r.is_final === null).slice(0, 3);
        if (finalTrades.length >= 3) {
            const rollingAvg3Days = finalTrades.reduce((sum, row) => sum + row.base_cad_liter, 0) / 3;
            cumulative_delta = rollingAvg3Days - activeBase;

            if (Math.abs(cumulative_delta) >= 5.0) {
                interrupter_alert = true;
                interrupter_type = cumulative_delta > 0 ? "hike" : "drop";
                interrupter_reason = `触发累计红线: 偏离达 ${cumulative_delta.toFixed(2)} ¢`;
            }
        }
      } else {
        interrupter_reason = "处于法定调价静默期 (周二/周三)";
      }

      // 5. 构造 5 日窗口明细表
      const days_to_thu = (4 - day_of_week + 7) % 7 || 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      const window_dates = [];
      for (let i = 8; i >= 2; i--) {
          const d = new Date(next_thu.getTime() - i * 24 * 60 * 60 * 1000);
          if (d.getDay() !== 0 && d.getDay() !== 6) window_dates.push(d.toISOString().split('T')[0]);
      }
      const target_5_days = window_dates.slice(-5);
      const market_map = new Map(recentTrades.map(r => [r.trading_date, r]));

      // 6. 精准窗口预测
      const windowFinalTrades = recentTrades.filter(r => target_5_days.includes(r.trading_date) && (r.is_final === 1 || r.is_final === null));
      const routineAvg = windowFinalTrades.length > 0 
          ? windowFinalTrades.reduce((sum, row) => sum + row.base_cad_liter, 0) / windowFinalTrades.length 
          : latestFinal.base_cad_liter;
      const display_total = Math.round((routineAvg - activeBase) * 1.15 * 10) / 10;
      
      // 归因分析 (针对最新的已收盘价)
      const cur_rbob = latestFinal.rbob_usd_gal;
      const cur_fx = latestFinal.cad_usd_rate;
      
      // 调试用：确定基准来源
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

      const breakdown = target_5_days.map(date_str => {
          const row = market_map.get(date_str);
          const isFinal = row ? (row.is_final === null ? 1 : row.is_final) : 0;
          return {
              date: new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              day: new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
              diff: (row && isFinal === 1) ? Math.round((row.base_cad_liter - activeBase) * 1.15 * 10) / 10 : null,
              is_final: isFinal
          };
      });

      // 7. 获取最近一次熔断记录
      const last_interrupter = await D1_DB.prepare(`
        SELECT effective_date FROM eub_regulations 
        WHERE is_interrupter = 1 
        ORDER BY effective_date DESC LIMIT 1
      `).first();

      // 8. 历史趋势数据
      const start_date_history = new Date(now_nb.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const history_market = await D1_DB.prepare("SELECT trading_date, base_cad_liter FROM nymex_market_data WHERE trading_date >= ? ORDER BY trading_date ASC").bind(start_date_history).all();
      const history_eub = await D1_DB.prepare("SELECT effective_date, max_retail_price FROM eub_regulations WHERE effective_date >= ? ORDER BY effective_date ASC").bind(start_date_history).all();
      const eub_map = new Map(history_eub.results.map(r => [r.effective_date, r.max_retail_price]));
      
      const dates = [], nymex_prices = [], nb_prices = [];
      let last_known_eub = latest_eub.max_retail_price;
      history_market.results.forEach(row => {
          dates.push(row.trading_date);
          nymex_prices.push(row.base_cad_liter);
          if (eub_map.has(row.trading_date)) last_known_eub = eub_map.get(row.trading_date);
          nb_prices.push(last_known_eub);
      });

      // 9. 组装响应
      return Response.json({
        metadata: {
          last_sync: now_nb.toISOString(),
          nb_last_date: latest_eub.effective_date,
          market_data_last_date: latestFinal.trading_date,
          last_interrupter_date: last_interrupter ? last_interrupter.effective_date : null,
          current_nb_price: latest_eub.max_retail_price,
          nb_delta: Math.round(nb_delta * 10) / 10,
          debug: {
              ref_source,
              ref_rbob: parseFloat(ref_rbob.toFixed(4)),
              cur_rbob: parseFloat(cur_rbob.toFixed(4)),
              ref_fx: parseFloat(ref_fx.toFixed(4)),
              cur_fx: parseFloat(cur_fx.toFixed(4)),
              active_base: parseFloat(activeBase.toFixed(2))
          },
          prediction: {
            change: display_total,
            direction: display_total > 0.1 ? "up" : display_total < -0.1 ? "down" : "stable",
            risk_level: interrupter_alert ? "red" : (Math.abs(cumulative_delta) >= 3.5 ? "yellow" : "green"),
            is_blackout,
            interrupter_type,
            interrupter_reason,
            spot_attribution: { commodity: Math.round(comm_impact * 100) / 100, fx: Math.round(fx_impact * 100) / 100 },
            cumulative_drift: Math.round(cumulative_delta * 100) / 100,
            daily_spike: Math.round(Math.abs((recentTrades[0]?.base_cad_liter || 0) - (recentTrades[1]?.base_cad_liter || 0)) * 100) / 100,
            window: { 
                locked_days: windowFinalTrades.length,
                progress: Math.round((windowFinalTrades.length / 5) * 100),
                breakdown 
            }
          }
        },
        dates, nymex_prices, nb_prices
      }, { headers: { "Access-Control-Allow-Origin": "*" } });

    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
