import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next'; // ✅ 添加多语言支持
import * as echarts from 'echarts';

const generateDateRange = (startDateStr, endDateStr) => {
  const dates = [];
  let [sy, sm, sd] = startDateStr.split('-').map(Number);
  let [ey, em, ed] = endDateStr.split('-').map(Number);
  
  let current = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const HistoryChart = () => {
  const { t } = useTranslation(); // ✅ 获取翻译函数
  const chartRef = useRef(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30); 
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:8787'
      : 'https://nb-gas-pulse-api.honglei-gao.workers.dev';

    fetch(`${API_BASE}/api/v1/history?days=${days}`)
      .then(res => res.json())
      .then(res => {
        setData(res);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, [days]);

  useEffect(() => {
    if (!data || !data.data || !chartRef.current) return;

    let chart = echarts.getInstanceByDom(chartRef.current);
    if (!chart) {
      chart = echarts.init(chartRef.current);
    }
    
    const payload = data.data;
    const meta = data.meta;
    const eubData = payload.eub_history || [];
    const marketData = payload.market_history || [];
    const GAL_TO_LITER = 3.7854;

    const eubAsc = [...eubData].reverse();
    const marketAsc = [...marketData].reverse();

    const startDate = meta.start_date; 
    const endDate = marketAsc.length > 0 ? marketAsc[marketAsc.length - 1].date : new Date().toISOString().split('T')[0];

    const fullDateRange = generateDateRange(startDate, endDate);

    let currentEub = null;
    let currentMarket = null;

    const initialEub = eubAsc.find(d => (d.date || d.effective_date) <= startDate);
    if (initialEub) currentEub = initialEub.max_price;

    const mergedData = fullDateRange.map(date => {
       const eToday = eubAsc.find(d => (d.date || d.effective_date) === date);
       if (eToday) currentEub = eToday.max_price;
       
       const mToday = marketAsc.find(d => d.date === date);
       // NYMEX RBOB 纯底层税前成本
       if (mToday) currentMarket = (mToday.rbob_cad_base / GAL_TO_LITER) * 100; 
       
       return { date, eubPrice: currentEub, marketPrice: currentMarket };
    });

    const xAxisDates = mergedData.map(d => d.date);
    const eubPrices = mergedData.map(d => d.eubPrice === null ? undefined : d.eubPrice);
    const marketPrices = mergedData.map(d => d.marketPrice === null ? undefined : d.marketPrice);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        formatter: function(params) {
            let html = `<div>${params[0].axisValue}</div>`;
            params.forEach(p => {
                if (p.seriesName === t('historychart.eubRetailPrice')) {
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value.toFixed(1) + ' ¢/L' : '-'}</b></div>`;
                } else {
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value.toFixed(2) + ' ¢/L' : '-'}</b></div>`;
                }
            });
            return html;
        }
      },
      legend: { bottom: 0, data: [t('historychart.eubRetailPrice'), t('historychart.nymexBaseCost')] },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xAxisDates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e7e8e9' } }
      },
      yAxis: [
        {
          type: 'value',
          name: t('historychart.postTaxUnit'),
          axisLine: { lineStyle: { color: '#00236f' } },
          splitLine: { lineStyle: { color: '#e7e8e9' } },
          scale: true
        },
        {
          type: 'value',
          name: t('historychart.preTaxUnit'),
          axisLine: { lineStyle: { color: '#059669' } },
          splitLine: { show: false },
          scale: true,
          axisLabel: { formatter: '{value}' }
        }
      ],
      series: [
        {
          name: t('historychart.eubRetailPrice'),
          type: 'line',
          step: 'end',
          data: eubPrices,
          showSymbol: false,
          itemStyle: { color: '#00236f' },
          lineStyle: { width: 3 }
        },
        {
          name: t('historychart.nymexBaseCost'),
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: marketPrices,
          showSymbol: false,
          itemStyle: { color: '#059669' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(5, 150, 105, 0.2)' },
              { offset: 1, color: 'rgba(5, 150, 105, 0)' }
            ])
          }
        }
      ]
    };

    chart.setOption(option, true);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  const getSubTitle = () => {
    if (days === 30) return t('historychart.subtitle30Day');
    if (days === 365) return t('historychart.subtitle365Day');
    return t('historychart.subtitle90Day');
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="mb-6">
        <h2 className="font-headline font-bold text-3xl text-primary tracking-tight">{t('historychart.title')}</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase">{t('historychart.liveData')}</span>
          <span className="text-on-surface-variant text-xs font-medium">{getSubTitle()}</span>
        </div>
      </section>

      <div className="bg-surface-container-low p-1.5 rounded-xl w-max flex items-center shadow-inner mb-2">
        {[
          { label: t('historychart.tab30d'), value: 30 },
          { label: t('historychart.tab90d'), value: 90 },
          { label: t('historychart.tab365d'), value: 365 }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setDays(tab.value)}
            className={`px-6 py-1.5 rounded-lg font-bold text-sm transition-all duration-200 ${
              days === tab.value 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-outline-variant/15 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-surface-container-lowest/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}
        <div ref={chartRef} className="w-full h-[400px]"></div>
      </div>
    </div>
  );
};

export default HistoryChart;