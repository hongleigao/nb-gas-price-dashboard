import React from 'react';

const HeroBoard = ({ data, onExplore }) => {
  // 按照 v1.9 契约，从 Envelope 结构中解析数据
  const payload = data?.data || {};
  const { current_eub, benchmark_price, market_cycle } = payload;
  
  // 1. 前端自行计算市区预估价 (限价 - 5.5)
  const pump_estimated = current_eub ? (current_eub.max_price - 5.5).toFixed(1) : '...';
  
  // 2. 修正：严格执行 5日均值减去熔断 的算法
  const validDays = market_cycle || [];
  const n = validDays.length;
  let avgVariance = 0;
  let currentCumulative = 0;

  if (n > 0 && benchmark_price) {
    const sum = validDays.reduce((acc, d) => acc + (d.absolute_price - benchmark_price), 0);
    avgVariance = sum / n;
    currentCumulative = Math.abs(avgVariance);
  }

  const intVar = (current_eub && current_eub.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0;
  
  // 最终预测值 = 平均偏离值 - 周期内已发生的熔断变化值
  let predicted_change = avgVariance - intVar;
  let isFalling = predicted_change < 0;

  // 3. 修正：修复熔断状态持久化的 Bug (不再受 current_eub 的历史影响)
  let risk_level = 'Low';
  if (currentCumulative >= 5.0) {
      risk_level = 'Alert';
  } else if (currentCumulative >= 4.0) {
      risk_level = 'High';
  } else if (currentCumulative >= 3.0) {
      risk_level = 'Medium';
  }

  const formattedChange = Math.abs(predicted_change).toFixed(2);
  
  // 基于风险等级本地映射静态文案，不依赖后端
  let riskMessage = 'Market variance is currently low. Stable outlook.';
  if (risk_level === 'Alert') riskMessage = 'Critical volatility detected. Interrupter conditions met.';
  else if (risk_level === 'High') riskMessage = 'High variance detected. Elevated risk of adjustment.';
  else if (risk_level === 'Medium') riskMessage = 'Market variance is currently within the moderate range, monitoring closely.';

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-primary-container p-8 shadow-sm">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <span className="font-label text-[11px] font-semibold uppercase tracking-widest text-on-primary-container mb-2 block">Forecast: Next Cycle</span>
              <h1 className="font-headline font-extrabold text-4xl text-white tracking-tight">
                {isFalling ? '-' : '+'}{formattedChange}c
              </h1>
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

      {/* Bento Grid */}
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
            {/* 4级状态条 */}
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