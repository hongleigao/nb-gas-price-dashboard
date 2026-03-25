import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const payload = data?.data || {};
  const { current_eub, market_cycle, benchmark_price, interrupter_total } = payload;

  const GAL_TO_LITER = 3.7854;
  const HST_RATE = 1.15; // NB省 15% HST
  
  // 1. 换算基准价为 CAD ¢/L (税前)
  const benchmark_price_cl_pretax = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;

  const validDays = market_cycle || [];
  const n = validDays.length;
  
  // 2. 计算每天的“含税零售变动影响 (Pump Impact)”
  let sumPostTaxVariance = 0;
  const timelineEvents = validDays.map((day, idx) => {
      const absolute_price_cl_pretax = (day.absolute_price / GAL_TO_LITER) * 100;
      const preTaxVariance = absolute_price_cl_pretax - benchmark_price_cl_pretax;
      const postTaxVariance = preTaxVariance * HST_RATE; // 乘以1.15，转化为用户感知的含税变动
      
      sumPostTaxVariance += postTaxVariance;
      
      return {
          type: 'market',
          date: day.date,
          dayIndex: idx + 1,
          absolute_price_cl_pretax,
          postTaxVariance,
          isFalling: postTaxVariance < 0
      };
  });

  const variancesStr = timelineEvents.map(e => e.postTaxVariance > 0 ? `+${e.postTaxVariance.toFixed(2)}` : e.postTaxVariance.toFixed(2)).join(' ');
  const sumStr = variancesStr;
  
  // 3. EUB 的熔断值本来就是含税的，展示时直接使用，无需再除以 1.15
  const intVar = interrupter_total !== undefined 
      ? interrupter_total 
      : ((current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0);
  const intVarStr = intVar > 0 ? `+${intVar.toFixed(2)}` : intVar.toFixed(2);

  // 4. 计算最终的含税预测值
  const avgPostTaxVariance = n > 0 ? (sumPostTaxVariance / n) : 0;
  const finalPred = avgPostTaxVariance - intVar;
  const finalStr = finalPred > 0 ? `+${finalPred.toFixed(2)}` : finalPred.toFixed(2);

  if (current_eub?.is_interrupter === 1 && current_eub?.effective_date) {
      timelineEvents.push({
          type: 'interrupter',
          date: current_eub.effective_date,
          variance: current_eub.interrupter_variance || 0
      });
  }

  timelineEvents.sort((a, b) => a.date.localeCompare(b.date));

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
            <h3 className="text-xs font-bold text-outline-variant uppercase tracking-wider mb-4">Post-Tax Calculation Breakdown</h3>
            <div className="font-mono text-sm md:text-base text-on-surface bg-surface-container-low p-4 rounded-lg overflow-x-auto whitespace-nowrap">
                ( {sumStr || '0.00'} ) / {n || 1} - ({intVarStr}) = <span className="font-bold text-primary">{finalStr} ¢</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-3 text-secondary">
                * All daily variances are scaled by 15% HST to show the exact impact at the pump.
            </p>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between px-2">
          <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase">5-Day Pricing Cycle</h2>
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Ordered: Thu-Wed</span>
        </div>
        
        <div className="space-y-3">
          {timelineEvents.map((event, idx) => {
            const [y, m, d] = event.date.split('-').map(Number);
            const localDate = new Date(y, m - 1, d);
            
            if (event.type === 'interrupter') {
               return (
                  <div key={`int-${event.date}`} className="group flex items-center justify-between p-5 bg-error/10 border border-error/20 rounded-xl hover:translate-x-1 transition-all">
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-error text-white shadow-sm">
                        <span className="text-[10px] font-bold uppercase">{localDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="font-headline font-extrabold text-lg leading-tight">{localDate.getDate()}</span>
                      </div>
                      <div>
                        <p className="font-headline font-bold text-error text-base">Latest Adjustment</p>
                        <p className="text-xs font-medium text-error/80">Most recent interrupter</p>
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

            const isLastMarket = event.dayIndex === n;
            return (
              <div key={`mkt-${event.date}`} className="group flex items-center justify-between p-5 bg-surface-container-lowest rounded-xl hover:translate-x-1 transition-all">
                <div className="flex items-center gap-5">
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${isLastMarket ? 'bg-primary' : 'bg-surface-container-low'}`}>
                    <span className={`text-[10px] font-bold uppercase ${isLastMarket ? 'text-on-primary/70' : 'text-outline-variant'}`}>
                      {localDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`font-headline font-extrabold text-lg leading-tight ${isLastMarket ? 'text-on-primary' : 'text-primary'}`}>
                      {localDate.getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="font-headline font-bold text-on-surface text-base">Day {event.dayIndex}</p>
                    <p className="text-xs font-mono text-on-surface-variant">Base Close: {event.absolute_price_cl_pretax.toFixed(2)} ¢/L</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-headline font-extrabold text-lg ${event.isFalling ? 'text-tertiary-fixed' : 'text-error'}`}>
                    {event.postTaxVariance > 0 ? '+' : ''}{event.postTaxVariance.toFixed(2)}c
                  </p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${event.isFalling ? 'bg-tertiary-fixed/20 text-tertiary-fixed' : 'bg-error/20 text-error'}`}>
                    Pump Impact
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default CycleDetails;