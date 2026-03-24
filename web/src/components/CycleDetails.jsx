import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const payload = data?.data || {};
  const { current_eub, market_cycle, benchmark_price } = payload;

  // --- 单位转换：加元/加仑 转换为 加分/升 ---
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
        <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase px-2">Active Calculation Formula</h2>
        
        {/* 完全展示动态数学方程式的区块 */}
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 shadow-sm">
            <h3 className="text-xs font-bold text-outline-variant uppercase tracking-wider mb-4">Calculation Breakdown</h3>
            <div className="font-mono text-sm md:text-base text-on-surface bg-surface-container-low p-4 rounded-lg overflow-x-auto whitespace-nowrap">
                ( {sumStr || '0.00'} ) / {n || 1} - ({intVarStr}) = <span className="font-bold text-primary">{finalStr} ¢</span>
            </div>
            {/* 移除了中文，替换为纯英文专业注释 */}
            <p className="text-[11px] text-on-surface-variant mt-3">
                * 5-day variance average ({n} actual closing days) - Interrupter variance applied in current cycle
            </p>
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
            
            // 对于消费者，variance < 0 代表油价下跌（好事，绿色），variance > 0 代表油价上涨（坏事，红色）
            const isFalling = variance < 0; 
            const isLast = idx === validDays.length - 1;
            
            // 修复时区陷阱：手动拆分字符串生成本地日期，防止 UTC 偏移导致日期退后一天
            const [y, m, d] = day.date.split('-');
            const localDate = new Date(y, m - 1, d);
            
            return (
              <div key={day.date} className="group flex items-center justify-between p-5 bg-surface-container-lowest rounded-xl hover:translate-x-1 transition-all">
                <div className="flex items-center gap-5">
                  <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${isLast ? 'bg-primary' : 'bg-surface-container-low'}`}>
                    <span className={`text-[10px] font-bold uppercase ${isLast ? 'text-on-primary/70' : 'text-outline-variant'}`}>
                      {localDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className={`font-headline font-extrabold text-lg leading-tight ${isLast ? 'text-on-primary' : 'text-primary'}`}>
                      {localDate.getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="font-headline font-bold text-on-surface text-base">Day {idx + 1}</p>
                    <p className="text-xs font-mono text-on-surface-variant">NYMEX Close: {absolute_price_cl.toFixed(2)} ¢/L</p>
                  </div>
                </div>
                <div className="text-right">
                  {/* 红色警示上涨，绿色表示下跌 */}
                  <p className={`font-headline font-extrabold text-lg ${isFalling ? 'text-tertiary-fixed' : 'text-error'}`}>
                    {variance > 0 ? '+' : ''}{variance.toFixed(2)}c
                  </p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${isFalling ? 'bg-tertiary-fixed/20 text-tertiary-fixed' : 'bg-error/20 text-error'}`}>
                    {isFalling ? 'Falling' : 'Rising'}
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