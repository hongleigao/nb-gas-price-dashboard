import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const HistoryChart = () => {
  const chartRef = useRef(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:8787'
      : 'https://nb-gas-pulse-api.honglei-gao.workers.dev';

    fetch(`${API_BASE}/api/v1/history?days=90`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!data || !chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    
    // Process data for step line and smooth line
    const eubDates = data.eub.map(d => d.date).reverse();
    const eubPrices = data.eub.map(d => d.max_price).reverse();
    
    const marketDates = data.market.map(d => d.date).reverse();
    const marketPrices = data.market.map(d => d.rbob_cad_base).reverse();

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        bottom: 0,
        data: ['EUB Max Price', 'Market RBOB Cost']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: Array.from(new Set([...eubDates, ...marketDates])).sort(),
        axisLine: { lineStyle: { color: '#e7e8e9' } }
      },
      yAxis: [
        {
          type: 'value',
          name: '¢/L (EUB)',
          axisLine: { lineStyle: { color: '#00236f' } },
          splitLine: { lineStyle: { color: '#e7e8e9' } }
        },
        {
          type: 'value',
          name: '¢/L (Market)',
          axisLine: { lineStyle: { color: '#4059aa' } },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'EUB Max Price',
          type: 'line',
          step: 'end',
          data: eubPrices,
          itemStyle: { color: '#00236f' },
          lineStyle: { width: 4 }
        },
        {
          name: 'Market RBOB Cost',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: marketPrices,
          itemStyle: { color: '#4059aa' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64, 89, 170, 0.2)' },
              { offset: 1, color: 'rgba(64, 89, 170, 0)' }
            ])
          }
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <section className="mb-8">
        <h2 className="font-headline font-bold text-3xl text-primary tracking-tight">Refined Trends</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase">Live Market Data</span>
          <span className="text-on-surface-variant text-xs font-medium">90 Day Divergence Analysis</span>
        </div>
      </section>

      <div className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-outline-variant/15">
        <div ref={chartRef} className="w-full h-[400px]"></div>
      </div>
    </div>
  );
};

export default HistoryChart;
