import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const HistoryChart = () => {
  const chartRef = useRef(null);
  const [data, setData] = useState(null);
  // 已按产品经理要求：将默认视图切换为 30 天，避免 90 天数据过于拥挤
  const [days, setDays] = useState(30); 
  const [isLoading, setIsLoading] = useState(true);

  // 动态请求数据
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

  // 渲染图表
  useEffect(() => {
    if (!data || !data.data || !chartRef.current) return;

    let chart = echarts.getInstanceByDom(chartRef.current);
    if (!chart) {
      chart = echarts.init(chartRef.current);
    }
    
    const payload = data.data;
    const eubData = payload.eub_history || [];
    const marketData = payload.market_history || [];
    
    // 提取所有日期并排序 (后端现在统一输出为 date 字段)
    const allDates = Array.from(new Set([
      ...eubData.map(d => d.date || d.effective_date),
      ...marketData.map(d => d.date)
    ])).sort();

    let lastEub = null;
    let lastMarket = null;
    const GAL_TO_LITER = 3.7854;

    const mergedData = allDates.map(date => {
       const eubMatch = eubData.find(d => (d.date || d.effective_date) === date);
       if (eubMatch) lastEub = eubMatch.max_price;
       
       const marketMatch = marketData.find(d => d.date === date);
       if (marketMatch) lastMarket = (marketMatch.rbob_cad_base / GAL_TO_LITER) * 100;
       
       return { date, eubPrice: lastEub, marketPrice: lastMarket };
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
                if (p.seriesName === 'EUB Max Price') {
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value.toFixed(1) + ' ¢/L' : '-'}</b></div>`;
                } else {
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value.toFixed(2) + ' ¢/L' : '-'}</b></div>`;
                }
            });
            return html;
        }
      },
      legend: { bottom: 0, data: ['EUB Max Price', 'Market RBOB Cost'] },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category',
        data: xAxisDates,
        axisLine: { lineStyle: { color: '#e7e8e9' } }
      },
      yAxis: [
        {
          type: 'value',
          name: '¢/L (EUB)',
          axisLine: { lineStyle: { color: '#00236f' } },
          splitLine: { lineStyle: { color: '#e7e8e9' } },
          scale: true
        },
        {
          type: 'value',
          name: '¢/L (Market)',
          axisLine: { lineStyle: { color: '#059669' } },
          splitLine: { show: false },
          scale: true,
          axisLabel: { formatter: '{value}' }
        }
      ],
      series: [
        {
          name: 'EUB Max Price',
          type: 'line',
          step: 'end',
          data: eubPrices,
          itemStyle: { color: '#00236f' },
          lineStyle: { width: 3 }
        },
        {
          name: 'Market RBOB Cost',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: marketPrices,
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
    if (days === 30) return "30 Day Volatility Snapshot";
    if (days === 365) return "1 Year Macro Trend Analysis";
    return "90 Day Divergence Analysis";
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="mb-6">
        <h2 className="font-headline font-bold text-3xl text-primary tracking-tight">Refined Trends</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase">Live Market Data</span>
          <span className="text-on-surface-variant text-xs font-medium">{getSubTitle()}</span>
        </div>
      </section>

      <div className="bg-surface-container-low p-1.5 rounded-xl w-max flex items-center shadow-inner mb-2">
        {[
          { label: '30D', value: 30 },
          { label: '90D', value: 90 },
          { label: '1Y', value: 365 }
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