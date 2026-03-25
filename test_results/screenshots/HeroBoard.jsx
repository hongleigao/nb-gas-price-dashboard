import React from 'react';

const HeroBoard = ({ data, onExplore }) => {
  const payload = data?.data;
  
  // ==========================================
  // 1. 幽默空状态 / 故障状态处理 (纯英文 UI)
  // ==========================================
  if (!payload || !payload.current_eub || !payload.market_cycle) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center space-y-6 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/30">
        <span className="text-7xl drop-shadow-sm grayscale opacity-80">⛽</span>
        <div className="space-y-2">
          <h3 className="text-xl font-headline font-extrabold text-primary tracking-tight">Out of Gas!</h3>
          <p className="text-on-surface-variant text-sm font-medium">
            Our data pipeline is temporarily out of gas...
          </p>
        </div>
        <p className="text-xs text-outline leading-relaxed max-w-xs">
          We are currently fetching the latest prices from the market source.<br/>Please refresh the page in a moment.
        </p>
        <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-secondary/10 text-secondary font-bold rounded-full text-sm hover:bg-secondary/20 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  // ==========================================
  // 2. 数据解析与核心计算
  // ==========================================
  const { current_eub, benchmark_price, market_cycle, interrupter_total } = payload;
  const GAL_TO_LITER = 3.7854;
  const HST_RATE = 1.15; 
  const benchmark_price_cl_pretax = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;
  const pump_estimated = current_eub ? (current_eub.max_price - 5.5).toFixed(1) : '...';
  
  const validDays = market_cycle || [];
  const n = validDays.length;
  
  // 底层税前计算
  let avgPreTaxVariance = 0;
  if (n > 0 && benchmark_price_cl_pretax) {
    const sum = validDays.reduce((acc, d) => acc + (((d.absolute_price / GAL_TO_LITER) * 100) - benchmark_price_cl_pretax), 0);
    avgPreTaxVariance = sum / n;
  }

  const rawIntVar = interrupter_total !== undefined ? interrupter_total : ((current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0);
  const intVarPreTax = rawIntVar / HST_RATE;
  
  const predicted_change_preTax = avgPreTaxVariance - intVarPreTax;
  
  let max_daily_variance_preTax = 0;
  if (n >= 2) {
      max_daily_variance_preTax = Math.abs(((validDays[n-1].absolute_price / GAL_TO_LITER) * 100) - ((validDays[n-2].absolute_price / GAL_TO_LITER) * 100));
  } else if (n === 1 && benchmark_price_cl_pretax) {
      max_daily_variance_preTax = Math.abs(((validDays[0].absolute_price / GAL_TO_LITER) * 100) - benchmark_price_cl_pretax);
  }

  let risk_level = 'Low';
  const current_risk_variance_preTax = Math.abs(predicted_change_preTax);
  if (current_risk_variance_preTax >= 5.0 || max_daily_variance_preTax >= 6.0) risk_level = 'Alert';
  else if (current_risk_variance_preTax >= 4.0) risk_level = 'High';
  else if (current_risk_variance_preTax >= 3.0) risk_level = 'Medium';

  const predicted_change_postTax = predicted_change_preTax * HST_RATE;
  let isFalling = predicted_change_postTax < 0;
  const formattedChange = Math.abs(predicted_change_postTax).toFixed(2);

  // ==========================================
  // 3. 动态日期与上次调价历史解析
  // ==========================================
  const getNextAdjustmentDate = () => {
      const d = new Date();
      const day = d.getDay();
      let diff = 5 - day;
      if (diff <= 0) diff += 7; 
      d.setDate(d.getDate() + diff);
      return `FRI, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()} @ 00:01`;
  };

  const nextAdjDateText = risk_level === 'Alert' 
      ? 'EXPECTED ANYTIME (HIGH RISK)' 
      : `EST. NEXT ADJ: ${getNextAdjustmentDate()}`;

  let lastAdjText = '';
  if (current_eub?.effective_date) {
      const d = new Date(current_eub.effective_date + 'T12:00:00');
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (current_eub.is_interrupter === 1) {
          const sign = current_eub.interrupter_variance > 0 ? '+' : '';
          lastAdjText = `LAST CHANGE: ${dateStr} (INTERRUPTER ${sign}${current_eub.interrupter_variance}c)`;
      } else {
          lastAdjText = `LAST CHANGE: ${dateStr} (SET TO ${current_eub.max_price} ¢/L)`;
      }
  }

  // ==========================================
  // 4. 智能决策引擎 (Smart Recommendation - 4 Tiers)
  // ==========================================
  let recTheme = 'neutral'; 
  let recTitle = 'Buy As Needed';
  let recSubtitle = 'Prices are relatively stable. No major routine or emergency shifts expected.';
  let recIcon = 'local_gas_station';

  // Tier 1: 极度危险 (Alert)
  if (risk_level === 'Alert') {
      recTheme = 'alert';
      recIcon = 'warning';
      if (isFalling) {
          recTitle = 'Wait to Fill';
          recSubtitle = 'Critical volatility. An emergency price drop is expected ANYTIME.';
      } else {
          recTitle = 'Fill Up Immediately';
          recSubtitle = 'Critical volatility. An emergency price hike is expected ANYTIME.';
      }
  } 
  // Tier 2: 高危险，可能提前熔断 (High)
  else if (risk_level === 'High') {
      recTheme = isFalling ? 'wait' : 'buy';
      recIcon = isFalling ? 'trending_down' : 'trending_up';
      if (isFalling) {
          recTitle = 'Hold Off';
          recSubtitle = 'High risk of an unscheduled price drop. Avoid filling up if possible.';
      } else {
          recTitle = 'Fill Up Very Soon';
          recSubtitle = 'High risk of an unscheduled price hike. Do not wait until Friday.';
      }
  } 
  // Tier 3: 周五例行调价较大 (>= 3.0c)
  else if (Math.abs(predicted_change_postTax) >= 3.0) {
      recTheme = isFalling ? 'wait' : 'buy';
      recIcon = isFalling ? 'trending_down' : 'trending_up';
      if (isFalling) {
          recTitle = 'Wait for Friday';
          recSubtitle = `Market costs are down. Expecting a ~${formattedChange}c routine drop on Friday.`;
      } else {
          recTitle = 'Fill Up Before Friday';
          recSubtitle = `Market costs are up. Expecting a ~${formattedChange}c routine increase on Friday.`;
      }
  }

  const getThemeClasses = (theme) => {
      switch(theme) {
          case 'buy': return 'bg-error/10 text-error border-error/20'; 
          case 'wait': return 'bg-tertiary-fixed/30 text-teal-800 border-tertiary-fixed'; 
          case 'alert': return 'bg-orange-500/15 text-orange-700 border-orange-500/30';
          default: return 'bg-surface-container-high text-on-surface-variant border-transparent';
      }
  };

  return (
    <div className="space-y-6">
      
      {/* 智能决策横幅 (含上次调价历史) */}
      <div className={`flex items-start gap-4 p-4 rounded-2xl border ${getThemeClasses(recTheme)} shadow-sm transition-all`}>
        <div className="mt-0.5">
           <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{recIcon}</span>
        </div>
        <div className="flex-1">
           <h3 className="font-headline font-bold text-base tracking-tight">{recTitle}</h3>
           <p className="text-xs font-medium opacity-90 mt-0.5 leading-snug">{recSubtitle}</p>
           
           {/* 历史数据追踪标 */}
           {lastAdjText && (
               <div className="mt-2 pt-1.5 border-t border-current/10 flex items-center gap-1.5 opacity-80">
                   <span className="material-symbols-outlined text-[13px]">history</span>
                   <span className="text-[10px] font-bold uppercase tracking-wider">{lastAdjText}</span>
               </div>
           )}
        </div>
      </div>

      {/* 预测主卡片 */}
      <section className="relative overflow-hidden rounded-3xl bg-primary-container p-8 shadow-sm">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              {/* 动态显示的下一个生效时间 */}
              <span className={`font-label text-[11px] font-semibold uppercase tracking-widest mb-2 block ${risk_level === 'Alert' ? 'text-orange-300' : 'text-on-primary-container'}`}>
                {nextAdjDateText}
              </span>
              <h1 className="font-headline font-extrabold text-4xl text-white tracking-tight">
                {isFalling ? '-' : '+'}{formattedChange}c
              </h1>
              <span className="text-white/80 text-xs font-medium mt-1 block">≈ retail impact incl. HST</span>
            </div>
            <div className="bg-secondary/20 backdrop-blur-md rounded-full px-4 py-1.5 flex items-center gap-2 border border-secondary/30">
              <span className="material-symbols-outlined text-secondary-fixed text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                {isFalling ? 'trending_down' : 'trending_up'}
              </span>
              <span className="font-label font-bold text-secondary-fixed text-xs uppercase tracking-wider">
                {isFalling ? 'FALLING' : 'RISING'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-8">
            <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-secondary-fixed w-3/4 rounded-full"></div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-3xl flex flex-col justify-between border border-outline-variant/10 shadow-sm">
          <div>
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant block mb-4">Current Pump Price (Est.)</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline font-bold text-5xl text-primary">{pump_estimated}</span>
              <span className="font-headline font-bold text-xl text-on-surface-variant">c/L</span>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2 text-secondary font-semibold text-sm">
            <span className="material-symbols-outlined text-lg">verified</span>
            <span>Live Market Sync</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-3xl border border-outline-variant/10 shadow-sm">
          <span className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant block mb-6">Interrupter Risk Level</span>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-label text-sm font-bold text-on-surface">Current Status</span>
              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                ${risk_level === 'Alert' ? 'bg-error text-error-container' : 
                  risk_level === 'High' ? 'bg-orange-500 text-white' : 
                  risk_level === 'Medium' ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant' : 
                  'bg-secondary text-on-secondary'}
              `}>
                {risk_level}
              </div>
            </div>
            {/* 状态指示条 */}
            <div className="flex gap-1.5 h-2">
              <div className={`flex-1 rounded-full ${['Low', 'Medium', 'High', 'Alert'].includes(risk_level) ? 'bg-secondary' : 'bg-surface-container-high'}`}></div>
              <div className={`flex-1 rounded-full ${['Medium', 'High', 'Alert'].includes(risk_level) ? 'bg-tertiary-fixed' : 'bg-surface-container-high'}`}></div>
              <div className={`flex-1 rounded-full ${['High', 'Alert'].includes(risk_level) ? 'bg-orange-500' : 'bg-surface-container-high'}`}></div>
              <div className={`flex-1 rounded-full ${risk_level === 'Alert' ? 'bg-error' : 'bg-surface-container-high'}`}></div>
            </div>
            <p className="text-xs text-on-surface-variant leading-relaxed mt-4">
              {risk_level === 'Alert' ? 'Critical volatility detected. Interrupter conditions met.' :
               risk_level === 'High' ? 'High variance detected. Elevated risk of adjustment.' :
               risk_level === 'Medium' ? 'Market variance is currently within the moderate range, monitoring closely.' :
               'Market variance is currently low. Stable outlook.'}
            </p>
          </div>
        </div>
      </div>

      <button onClick={onExplore} className="w-full bg-primary py-5 rounded-2xl group active:scale-[0.98] transition-all duration-200 shadow-xl shadow-primary/10 overflow-hidden relative">
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors"></div>
        <div className="flex items-center justify-center gap-3 relative z-10">
          <span className="text-white font-manrope font-bold text-lg">Explore Math Model</span>
          <span className="material-symbols-outlined text-white group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </div>
      </button>
    </div>
  );
};

export default HeroBoard;