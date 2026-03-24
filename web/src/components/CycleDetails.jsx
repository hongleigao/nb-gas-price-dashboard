import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const payload = data?.data || {};
  const { current_eub, market_cycle, benchmark_price } = payload;

  // 构建公式推演字符串
  const validDays = market_cycle || [];
  const n = validDays.length;
  const variances = validDays.map(d => {
      const v = d.absolute_price - benchmark_price;
      return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  });
  const sumStr = variances.join(' ');
  
  const intVar = (current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0;
  const intVarStr = intVar > 0 ? `+${intVar.toFixed(2)}` : intVar.toFixed(2);

  let avgVariance = 0;
  if (n > 0) {
      const sum = validDays.reduce((acc, d) => acc + (d.absolute_price - benchmark_price), 0);
      avgVariance = sum / n;
  }
  const finalPred = avgVariance - intVar;
  const finalStr = finalPred > 0 ? `+${finalPred.toFixed(2)}` : finalPred.toFixed(2);

  return (
    <div className="space-y-10 pb-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="text-blue-900 hover:bg-slate-200/50 p-2 rounded-full active:scale-95 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-blue-900 font-manrope font-bold text-lg">Cycle Analysis</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase px-2">Active Calculation Formula</h2>
        
        {/* 按照用户需求：完全展示动态数学方程式的区块 */}
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 shadow-sm">
            <h3 className="text-xs font-bold text-outline-variant uppercase tracking-wider mb-4">Calculation Breakdown</h3>
            <div className="font-mono text-sm md:text-base text-on-surface bg-surface-container-low p-4 rounded-lg overflow-x-auto whitespace-nowrap">
                ( {sumStr || '0.00'} ) / {n || 1} - ({intVarStr}) = <span className="font-bold text-primary">{finalStr} ¢</span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-3">
                * 5日偏离均值 (实际获得收盘数据的 {n} 天) - 周期内已生效的熔断偏离值
            </p>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between px-2">
          <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase">5-Day Pricing Cycle</h2>
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Ordered: Thu-Wed</span>
        </div>
        
        <div className="space-y-3">
          {market_cycle?.map((day, idx) => {
            // 前端基于架构契约计算偏离值
            const variance = day.absolute_price - benchmark_price;
            const isSurplus = variance < 0;
            const isLast = idx === market_cycle.length - 1;
            
            return (
              <div key={day.date} className="group flex items-center justify-between p-5 bg-surface-container-lowest rounded-xl hover:translate-x-1 transition-all">
                <div className="flex items-center gap-5">
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${isLast ? 'bg-primary' : 'bg-surface-container-low'}`}>
                    <span className={`text-[10px] font-bold uppercase ${isLast ? 'text-on-primary/70' : 'text-outline-variant'}`}>
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Moncton' })}
                    </span>
                    <span className={`font-headline font-extrabold text-lg leading-tight ${isLast ? 'text-on-primary' : 'text-primary'}`}>
                      {new Date(day.date).getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="font-headline font-bold text-on-surface text-base">Day {idx + 1}</p>
                    <p className="text-xs font-mono text-on-surface-variant">NYMEX Close: {day.absolute_price.toFixed(3)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-headline font-extrabold text-lg ${isSurplus ? 'text-tertiary-fixed' : 'text-error'}`}>
                    {variance > 0 ? '+' : ''}{variance.toFixed(2)}c
                  </p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isSurplus ? 'bg-tertiary-fixed/20 text-tertiary-fixed' : 'bg-error/20 text-error'}`}>
                    {isSurplus ? 'Surplus' : 'Deficit'}
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