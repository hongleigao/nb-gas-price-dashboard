import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const payload = data?.data || {};
  const { current_eub, market_cycle, benchmark_price } = payload;

  // --- 新增：将 加元/加仑 转换为 加分/升 ---
  const GAL_TO_LITER = 3.7854;
  const benchmark_price_cl = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;

  // 构建公式推演字符串
  const validDays = market_cycle || [];
  const n = validDays.length;
  const variances = validDays.map(d => {
      // 在计算每日偏离值前先转换单位
      const absolute_price_cl = (d.absolute_price / GAL_TO_LITER) * 100;
      const v = absolute_price_cl - benchmark_price_cl;
      return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  });
  const sumStr = variances.join(' ');
  
  const intVar = (current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0;
  const intVarStr = intVar > 0 ? `+${intVar.toFixed(2)}` : intVar.toFixed(2);

  let avgVariance = 0;
  if (n > 0) {
      const sum = validDays.reduce((acc, d) => {
          const absolute_price_cl = (d.absolute_price / GAL_TO_LITER) * 100;
          return acc + (absolute_price_cl - benchmark_price_cl);
      }, 0);
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
            <div className="inline-flex items-center gap-3">
              {/* 仅保留了唯一的法定基准，删除了伪造的 Logistics/Market Add */}
              <div className="flex flex-col items-center bg-surface-container-lowest px-6 py-3 rounded-xl border-l-4 border-primary shadow-sm min-w-[200px]">
                <span className="text-xs text-outline-variant font-bold uppercase tracking-wider mb-1">BENCHMARK (PREV CYCLE)</span>
                <span className="font-headline font-extrabold text-primary text-xl">NYMEX RBOB</span>
                {benchmark_price_cl > 0 && <span className="text-sm font-bold text-secondary mt-1">{benchmark_price_cl.toFixed(2)} ¢/L</span>}
              </div>
            </div>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-surface-container-low to-transparent pointer-events-none"></div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-end justify-between px-2">
          <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase">5-Day Pricing Cycle</h2>
          <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Ordered: Thu-Wed</span>
        </div>
        
        <div className="space-y-3">
          {validDays.map((day, idx) => {
            // 前端基于架构契约计算偏离值，并完成单位转换
            const absolute_price_cl = (day.absolute_price / GAL_TO_LITER) * 100;
            const variance = absolute_price_cl - benchmark_price_cl;
            const isSurplus = variance < 0;
            const isLast = idx === validDays.length - 1;
            
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
                    <p className="text-xs font-mono text-on-surface-variant">NYMEX Close: {absolute_price_cl.toFixed(2)} ¢/L</p>
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