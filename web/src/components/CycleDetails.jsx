import React from 'react';

const CycleDetails = ({ onBack, data }) => {
  const { history_5d } = data || {};

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="text-blue-900 hover:bg-slate-200/50 p-2 rounded-full active:scale-95 transition-all">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-blue-900 font-manrope font-bold text-lg">Cycle Analysis</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-headline font-bold text-on-surface-variant tracking-tight text-sm uppercase px-2">Active Calculation Formula</h2>
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6">
          <div className="overflow-x-auto no-scrollbar whitespace-nowrap py-4">
            <div className="inline-flex items-center gap-3">
              <div className="flex flex-col items-center bg-surface-container-lowest px-6 py-2 rounded-xl border-l-4 border-primary shadow-sm">
                <span className="text-[10px] text-outline-variant font-bold uppercase tracking-wider">NYMEX RBOB BENCHMARK</span>
                <span className="font-headline font-bold text-primary text-base">RBOB_CAD_AVG</span>
              </div>
              <span className="text-primary font-bold text-xl">vs</span>
              <div className="flex flex-col items-center bg-primary text-on-primary px-6 py-2 rounded-xl shadow-lg">
                <span className="font-headline font-bold text-lg leading-tight">Current Window</span>
                <span className="text-[10px] opacity-80 font-bold uppercase">5-Day Rolling</span>
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
          {history_5d?.map((day, idx) => (
            <div key={day.date} className="group flex items-center justify-between p-5 bg-surface-container-lowest rounded-xl hover:translate-x-1 transition-all">
              <div className="flex items-center gap-5">
                <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${idx === 0 ? 'bg-primary' : 'bg-surface-container-low'}`}>
                  <span className={`text-[10px] font-bold uppercase ${idx === 0 ? 'text-on-primary/70' : 'text-outline-variant'}`}>
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className={`font-headline font-extrabold text-lg leading-tight ${idx === 0 ? 'text-on-primary' : 'text-primary'}`}>
                    {new Date(day.date).getDate()}
                  </span>
                </div>
                <div>
                  <p className="font-headline font-bold text-on-surface text-base">Day {5 - idx}</p>
                  <p className="text-xs font-mono text-on-surface-variant">RBOB_CAD: {day.rbob_cad_base.toFixed(2)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-headline font-extrabold text-secondary text-lg">{(day.rbob_cad_base - 100).toFixed(1)}c</p>
                <span className="bg-secondary-container text-on-secondary-container text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Sync</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default CycleDetails;
