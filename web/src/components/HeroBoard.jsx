import React from 'react';

const HeroBoard = ({ data, onExplore }) => {
  const payload = data?.data || {};
  const { current_eub, benchmark_price, market_cycle, interrupter_total } = payload;
  
  const GAL_TO_LITER = 3.7854;
  const HST_RATE = 1.15; // NB省 15% HST
  const benchmark_price_cl_pretax = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;
  
  const pump_estimated = current_eub ? (current_eub.max_price - 5.5).toFixed(1) : '...';
  
  const validDays = market_cycle || [];
  const n = validDays.length;
  
  // 1. 【核心引擎】全部使用“税前(Pre-Tax)”计算平均偏离值
  let avgPreTaxVariance = 0;
  if (n > 0 && benchmark_price_cl_pretax) {
    const sum = validDays.reduce((acc, d) => {
        const absolute_price_cl_pretax = (d.absolute_price / GAL_TO_LITER) * 100;
        return acc + (absolute_price_cl_pretax - benchmark_price_cl_pretax);
    }, 0);
    avgPreTaxVariance = sum / n;
  }

  // 2. 【核心引擎】获取官方熔断值，并剥离 HST 还原为“税前”真实变动
  const rawIntVar = interrupter_total !== undefined 
      ? interrupter_total 
      : ((current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0);
  const intVarPreTax = rawIntVar / HST_RATE;
  
  // 3. 【核心引擎】税前最终预测值
  const predicted_change_preTax = avgPreTaxVariance - intVarPreTax;
  
  // 4. 【核心引擎】计算税前单日最大波幅
  let max_daily_variance_preTax = 0;
  if (n >= 2) {
      const today = (validDays[n-1].absolute_price / GAL_TO_LITER) * 100;
      const yesterday = (validDays[n-2].absolute_price / GAL_TO_LITER) * 100;
      max_daily_variance_preTax = Math.abs(today - yesterday);
  } else if (n === 1 && benchmark_price_cl_pretax) {
      const today = (validDays[0].absolute_price / GAL_TO_LITER) * 100;
      max_daily_variance_preTax = Math.abs(today - benchmark_price_cl_pretax);
  }

  // 5. ⭐️ 风险评估：严格基于“税前”底层数据与法规阈值 (5.0 & 6.0) 进行比对！
  let risk_level = 'Low';
  const current_risk_variance_preTax = Math.abs(predicted_change_preTax);
  
  if (current_risk_variance_preTax >= 5.0 || max_daily_variance_preTax >= 6.0) {
      risk_level = 'Alert';
  } else if (current_risk_variance_preTax >= 4.0) {
      risk_level = 'High';
  } else if (current_risk_variance_preTax >= 3.0) {
      risk_level = 'Medium';
  }

  // 6. 【UI展示】将最终预测结果转化为含税价 (Post-Tax)，给大众用户看
  const predicted_change_postTax = predicted_change_preTax * HST_RATE;
  let isFalling = predicted_change_postTax < 0;
  const formattedChange = Math.abs(predicted_change_postTax).toFixed(2);
  
  let riskMessage = 'Market variance is currently low. Stable outlook.';
  if (risk_level === 'Alert') riskMessage = 'Critical volatility detected. Interrupter conditions met.';
  else if (risk_level === 'High') riskMessage = 'High variance detected. Elevated risk of adjustment.';
  else if (risk_level === 'Medium') riskMessage = 'Market variance is currently within the moderate range, monitoring closely.';

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-primary-container p-8 shadow-sm">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="font-label text-[11px] font-semibold uppercase tracking-widest text-on-primary-container mb-2 block">Forecast: Next Cycle</span>
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
        <div className="bg-surface-container-lowest p-6 rounded-3xl flex flex-col justify-between">
          <div>
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-on-surface-variant block mb-4">Estimated Pump Price</span>
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

        <div className="bg-surface-container-lowest p-6 rounded-3xl">
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
              {riskMessage}
            </p>
          </div>
        </div>
      </div>

      <button onClick={onExplore} className="w-full bg-primary py-5 rounded-2xl group active:scale-[0.98] transition-all duration-200 shadow-xl shadow-primary/10 overflow-hidden relative">
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors"></div>
        <div className="flex items-center justify-center gap-3 relative z-10">
          <span className="text-white font-manrope font-bold text-lg">Explore Our Model</span>
          <span className="material-symbols-outlined text-white group-hover:translate-x-1 transition-transform">arrow_forward</span>
        </div>
      </button>
    </div>
  );
};

export default HeroBoard;