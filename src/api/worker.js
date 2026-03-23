/**
 * NB Gas Pulse - Cloudflare Worker (The Brain)
 * 职责：整合专家建议的 3日滚动均值逻辑 + 法定静默期判定
 * 版本：2.1.0 (Expert Algorithm Integration)
 */

export default {
  async fetch(request, env) {
    const { D1_DB } = env; // 保持与当前配置一致使用 D1_DB

    try {
      // 1. 获取 EUB 官方底层锚点 (绝对基石)
      const eub_history = await D1_DB.prepare(
        "SELECT * FROM eub_regulations ORDER BY effective_date DESC LIMIT 2"
      ).all();

      if (!eub_history.results || eub_history.results.length === 0) {
        return Response.json({ error: "No data" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      const latest_eub = eub_history.results[0];
      const prev_eub = eub_history.results[1];
      const nb_delta = prev_eub ? (latest_eub.max_retail_price - prev_eub.max_retail_price) : 0;
      const activeBase = latest_eub.active_eub_base || (latest_eub.max_retail_price / 1.15 - 45); // 优先使用数据库底牌

      const now_nb = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Moncton"}));
      const current_iso = now_nb.toISOString().split('T')[0];
      const day_of_week = now_nb.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

      // 2. 获取最近 10 个交易日的市场数据 (确保覆盖计价窗口)
      const market_data = await D1_DB.prepare(`
        SELECT trading_date, base_cad_liter, rbob_usd_gal, cad_usd_rate
        FROM nymex_market_data 
        WHERE is_holiday = 0 AND trading_date <= ?
        ORDER BY trading_date DESC 
        LIMIT 10
      `).bind(current_iso).all();

      if (market_data.results.length < 3) throw new Error("市场数据不足");
      const recentTrades = market_data.results;

      // 3. 获取最近一次熔断记录 (Context)
      const last_interrupter = await D1_DB.prepare(`
        SELECT effective_date FROM eub_regulations 
        WHERE is_interrupter = 1 
        ORDER BY effective_date DESC LIMIT 1
      `).first();

      // 4. 熔断机制判定 (Interrupter Clause) - 专家算法
      let interrupter_alert = false;
      let interrupter_type = "none";
      let interrupter_reason = "市场平稳";
      let cumulative_delta = 0;

      // 铁律：排除周二 (2) 和 周三 (3) 的法定静默期
      const is_blackout = (day_of_week === 2 || day_of_week === 3);
      
      if (!is_blackout) {
        const last3Days = recentTrades.slice(0, 3);
        const rollingAvg3Days = last3Days.reduce((sum, row) => sum + row.base_cad_liter, 0) / 3;
        cumulative_delta = rollingAvg3Days - activeBase;

        if (Math.abs(cumulative_delta) >= 5.0) {
          interrupter_alert = true;
          interrupter_type = cumulative_delta > 0 ? "hike" : "drop";
          interrupter_reason = `触发累计红线: 偏离达 ${cumulative_delta.toFixed(2)} ¢`;
        }
      } else {
        interrupter_reason = "处于法定调价静默期 (周二/周三)";
      }

      // 5. 构造 5 日窗口明细表 (用于 UI 日历)
      const days_to_thu = (4 - day_of_week + 7) % 7 || 7;
      const next_thu = new Date(now_nb.getTime() + days_to_thu * 24 * 60 * 60 * 1000);
      const window_dates = [];
      for (let i = 8; i >= 2; i--) {
          const d = new Date(next_thu.getTime() - i * 24 * 60 * 60 * 1000);
          if (d.getDay() !== 0 && d.getDay() !== 6) window_dates.push(d.toISOString().split('T')[0]);
      }
      const target_5_days = window_dates.slice(-5);
      const market_map = new Map(recentTrades.map(r => [r.trading_date, r.base_cad_liter]));

      // 6. 精准窗口预测 (Only average the dates within target_5_days)
      const windowTrades = recentTrades.filter(r => target_5_days.includes(r.trading_date));
      const routineAvg = windowTrades.length > 0 
          ? windowTrades.reduce((sum, row) => sum + row.base_cad_liter, 0) / windowTrades.length 
          : recentTrades[0].base_cad_liter;
      const display_total = Math.round((routineAvg - activeBase) * 1.15 * 10) / 10;
      
      // 归因分析 (针对即时 Spot 价)
      const cur_rbob = recentTrades[0].rbob_usd_gal;
      const cur_fx = recentTrades[0].cad_usd_rate;
      const ref_rbob = latest_eub.rbob_usd_gal || (recentTrades.length > 1 ? recentTrades[recentTrades.length - 1].rbob_usd_gal : cur_rbob);
      const ref_fx = latest_eub.cad_usd_rate || (recentTrades.length > 1 ? recentTrades[recentTrades.length - 1].cad_usd_rate : cur_fx);

      const comm_impact = ((cur_rbob - ref_rbob) * ref_fx / 3.7854) * 1.15 * 100;
      const fx_impact = (cur_rbob * (cur_fx - ref_fx) / 3.7854) * 1.15 * 100;

      const breakdown = target_5_days.map(date_str => {
          const val = market_map.get(date_str);
          return {
              date: new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
              day: new Date(date_str + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
              diff: val ? Math.round((val - activeBase) * 1.15 * 10) / 10 : null
          };
      });

      // 6. 历史趋势数据 (近 2 年) - 保持图表功能
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

      // 7. 组装响应
      return Response.json({
        metadata: {
          last_sync: now_nb.toISOString(),
          nb_last_date: latest_eub.effective_date,
          market_data_last_date: recentTrades[0].trading_date,
          last_interrupter_date: last_interrupter ? last_interrupter.effective_date : null,
          current_nb_price: latest_eub.max_retail_price,
          nb_delta: Math.round(nb_delta * 10) / 10,
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
                locked_days: recentTrades.filter(r => target_5_days.includes(r.trading_date)).length,
                progress: Math.round((recentTrades.filter(r => target_5_days.includes(r.trading_date)).length / 5) * 100),
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
