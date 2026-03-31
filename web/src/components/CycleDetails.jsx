import React from 'react';
import { useTranslation } from 'react-i18next'; // ✅ 添加多语言支持

const CycleDetails = ({ onBack, data }) => {
  const { t } = useTranslation(); // ✅ 获取翻译函数
  const payload = data?.data;

  // ==========================================
  // 1. 幽默空状态保护 (全英文 UI)
  // ==========================================
  if (!payload || !payload.current_eub || !payload.market_cycle) {
    return (
      <div className="space-y-8 pb-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="text-blue-900 hover:bg-slate-200/50 p-2 rounded-full active:scale-95 transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-blue-900 font-manrope font-bold text-lg">Cycle Analysis</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center space-y-4 bg-surface-container-lowest rounded-3xl border border-dashed border-outline-variant/30">
          <span className="text-5xl drop-shadow-sm grayscale opacity-50">⛽</span>
          <p className="text-on-surface-variant text-sm font-medium">
            Our data pipeline is temporarily out of gas...<br/>Please return to the dashboard and try again.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. 正常渲染逻辑
  // ==========================================
  const { current_eub, market_cycle, benchmark_price, interrupter_total } = payload;
  const GAL_TO_LITER = 3.7854;
  const HST_RATE = 1.15; 
  const benchmark_price_cl_pretax = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;
  const marketDays = market_cycle || [];
  
  const getCycleDates = () => {
    if (marketDays.length === 0) return [];
    const firstDay = new Date(marketDays[0].date + 'T12:00:00'); 
    const offsets = [0, 1, 4, 5, 6]; 
    return offsets.map(offset => {
      const d = new Date(firstDay);
      d.setDate(firstDay.getDate() + offset);
      return d.toISOString().split('T')[0];
    });
  };

  const cycleDates = getCycleDates();
  
  let sumPostTaxVariance = 0;
  let countForAvg = 0;

  const timelineEvents = cycleDates.map((dateStr, idx) => {
    const marketEntry = marketDays.find(d => d.date === dateStr);
    if (marketEntry) {
      const absolute_price_cl_pretax = (marketEntry.absolute_price / GAL_TO_LITER) * 100;
      const preTaxVariance = absolute_price_cl_pretax - benchmark_price_cl_pretax;
      const postTaxVariance = preTaxVariance * HST_RATE;
      sumPostTaxVariance += postTaxVariance;
      countForAvg++;
      return {
        type: 'market',
        date: dateStr,
        dayIndex: idx + 1,
        absolute_price_cl_pretax,
        postTaxVariance,
        isFalling: postTaxVariance < 0,
        isPending: false
      };
    } else {
      return {
        type: 'market',
        date: dateStr,
        dayIndex: idx + 1,
        isPending: true
      };
    }
  });

  if (current_eub?.is_interrupter === 1 && current_eub?.effective_date) {
    const exists = timelineEvents.some(e => e.type === 'interrupter' && e.date === current_eub.effective_date);
    if (!exists) {
        timelineEvents.push({
            type: 'interrupter',
            date: current_eub.effective_date,
            variance: current_eub.interrupter_variance || 0
        });
    }
  }

  timelineEvents.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.type === 'interrupter' ? 1 : -1;
  });

  const intVar = interrupter_total !== undefined ? interrupter_total : ((current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0);
  const avgPostTaxVariance = countForAvg > 0 ? (sumPostTaxVariance / countForAvg) : 0;
  
  // 架构师修复：如果没有有效的平均数据，让最终结果等于 0，避免 0 - 熔断值的错误
  const finalPred = countForAvg === 0 ? 0 : (avgPostTaxVariance - intVar);
  const finalStr = finalPred > 0 ? `+${finalPred.toFixed(2)}` : finalPred.toFixed(2);

  return (
    <div className="space-y-10 pb-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="text-blue-900 hover:bg-slate-200/50 p-2 rounded-full active:scale-95 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-blue-900 font-manrope font-bold text-lg">Cycle Analysis (Retail Impact)</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase px-2">Active Calculation Formula</h2>
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 shadow-sm">
            <h3 className="text-xs font-bold text-outline-variant uppercase tracking-wider mb-4">Post-Tax Calculation</h3>
            <div className="font-mono text-sm md:text-base text-on-surface bg-surface-container-low p-4 rounded-lg overflow-x-auto whitespace-nowrap">
                {avgPostTaxVariance.toFixed(2)}c (Avg) - ({intVar.toFixed(2)}c <span className="text-[10px] text-outline-variant">Total Int.</span>) = <span className="font-bold text-primary">{finalStr} ¢</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-3 text-secondary">
                * Formula: (Avg of {countForAvg} days market variance) - (Total interrupter adjustment in this cycle)
            </p>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between px-2">
          <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase">5-Day Pricing Cycle</h2>
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">ORDERED: THU-WED</span>
        </div>
        
        <div className="space-y-3">
          {timelineEvents.map((event, idx) => {
            if (!event.date) return null; // 安全拦截
            const [y, m, d] = event.date.split('-').map(Number);
            const localDate = new Date(y, m - 1, d);
            
            if (event.type === 'interrupter') {
               return (
                  <div key={`int-${event.date}-${idx}`} className="group flex items-center justify-between p-5 bg-error/10 border border-error/20 rounded-xl">
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-error text-white shadow-sm">
                        <span className="text-[10px] font-bold uppercase">{localDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="font-headline font-extrabold text-lg leading-tight">{localDate.getDate()}</span>
                      </div>
                      <div>
                        <p className="font-headline font-bold text-error text-base">Latest Adjustment</p>
                        <p className="text-xs font-medium text-error/80">Scheduled or Unscheduled</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-headline font-extrabold text-lg text-error">
                        {event.variance > 0 ? '+' : ''}{event.variance.toFixed(2)}c
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-error text-white">
                        Triggered
                      </span>
                    </div>
                  </div>
               );
            }

            return (
              <div key={`mkt-${event.date}-${idx}`} className={`group flex items-center justify-between p-5 rounded-xl border transition-all ${event.isPending ? 'bg-slate-50 border-dashed border-slate-200 opacity-60' : 'bg-surface-container-lowest border-transparent hover:translate-x-1'}`}>
                <div className="flex items-center gap-5">
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${event.isPending ? 'bg-slate-200' : 'bg-primary'}`}>
                    <span className={`text-[10px] font-bold uppercase ${event.isPending ? 'text-slate-500' : 'text-on-primary/70'}`}>
                      {localDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`font-headline font-extrabold text-lg leading-tight ${event.isPending ? 'text-slate-500' : 'text-on-primary'}`}>
                      {localDate.getDate()}
                    </span>
                  </div>
                  <div>
                    <p className={`font-headline font-bold text-base ${event.isPending ? 'text-slate-400' : 'text-on-surface'}`}>Day {event.dayIndex}</p>
                    <p className={`text-xs font-mono ${event.isPending ? 'text-slate-400 italic' : 'text-on-surface-variant'}`}>
                      {event.isPending ? 'Market not closed' : `Market Close: ${event.absolute_price_cl_pretax.toFixed(2)} ¢/L`}
                    </p>
                  </div>
                </div>
                {!event.isPending && (
                  <div className="text-right">
                    <p className={`font-headline font-extrabold text-lg ${event.isFalling ? 'text-tertiary-fixed' : 'text-error'}`}>
                      {event.postTaxVariance > 0 ? '+' : ''}{event.postTaxVariance.toFixed(2)}c
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${event.isFalling ? 'bg-tertiary-fixed/20 text-tertiary-fixed' : 'bg-error/20 text-error'}`}>
                      Pump Impact
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default CycleDetails;