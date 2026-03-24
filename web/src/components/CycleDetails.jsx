import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const payload = data?.data || {};
  const { current_eub, market_cycle, benchmark_price, interrupter_total } = payload;

  // --- 单位转换：加元/加仑 转换为 加分/升 ---
  const GAL_TO_LITER = 3.7854;
  const benchmark_price_cl = benchmark_price ? (benchmark_price / GAL_TO_LITER) * 100 : 0;

  // 1. 处理公式的基础数学逻辑
  const validDays = market_cycle || [];
  const n = validDays.length;
  const variances = validDays.map(d => {
      const absolute_price_cl = (d.absolute_price / GAL_TO_LITER) * 100;
      const v = absolute_price_cl - benchmark_price_cl;
      return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
  });
  const sumStr = variances.join(' ');
  
  // 优先读取 API 的周期内多次熔断累计值
  const intVar = interrupter_total !== undefined 
      ? interrupter_total 
      : ((current_eub?.is_interrupter === 1) ? (current_eub.interrupter_variance || 0) : 0);
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

  // 2. 构建混合时间轴 (将市场日和熔断日融合排序)
  let timelineEvents = validDays.map((day, idx) => {
      const absolute_price_cl = (day.absolute_price / GAL_TO_LITER) * 100;
      const variance = absolute_price_cl - benchmark_price_cl;
      return {
          type: 'market',
          date: day.date,
          dayIndex: idx + 1, // 记录是第几个交易日
          absolute_price_cl,
          variance,
          isFalling: variance < 0
      };
  });

  // 如果当前周期有触发熔断，将其作为特殊事件插入时间轴
  if (current_eub?.is_interrupter === 1 && current_eub?.effective_date) {
      timelineEvents.push({
          type: 'interrupter',
          date: current_eub.effective_date,
          variance: current_eub.interrupter_variance || 0
      });
  }

  // 按照日期字符串 (YYYY-MM-DD) 进行升序排列
  timelineEvents.sort((a, b) => a.date.localeCompare(b.date));

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
          {timelineEvents.map((event, idx) => {
            // 修复时区陷阱：手动拆分字符串生成本地日期，防止 UTC 偏移
            const [y, m, d] = event.date.split('-').map(Number);
            const localDate = new Date(y, m - 1, d);
            
            // --- 渲染：熔断日特殊卡片 (红色警示) ---
            if (event.type === 'interrupter') {
               return (
                  <div key={`int-${event.date}`} className="group flex items-center justify-between p-5 bg-error/10 border border-error/20 rounded-xl hover:translate-x-1 transition-all">
                    <div className="flex items-center gap-5">
                      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-error text-white shadow-sm">
                        <span className="text-[10px] font-bold uppercase">{localDate.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="font-headline font-extrabold text-lg leading-tight">{localDate.getDate()}</span>
                      </div>
                      <div>
                        <p className="font-headline font-bold text-error text-base">Interrupter Applied</p>
                        <p className="text-xs font-medium text-error/80">Unscheduled Adjustment</p>
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

            // --- 渲染：常规交易日卡片 ---
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
                    <p className="text-xs font-mono text-on-surface-variant">NYMEX Close: {event.absolute_price_cl.toFixed(2)} ¢/L</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-headline font-extrabold text-lg ${event.isFalling ? 'text-tertiary-fixed' : 'text-error'}`}>
                    {event.variance > 0 ? '+' : ''}{event.variance.toFixed(2)}c
                  </p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${event.isFalling ? 'bg-tertiary-fixed/20 text-tertiary-fixed' : 'bg-error/20 text-error'}`}>
                    {event.isFalling ? 'Falling' : 'Rising'}
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