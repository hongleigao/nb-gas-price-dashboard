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
    if (!data || !data.data || !chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const payload = data.data;
    
    // 实施 6.3 节：数据拉链式合并与前向填充算法 (LOCF)
    const eubData = payload.eub_history || [];
    const marketData = payload.market_history || [];
    
    // 1. 提取并排序所有唯一日期
    const allDates = Array.from(new Set([
      ...eubData.map(d => d.effective_date),
      ...marketData.map(d => d.date)
    ])).sort();

    // 2. 状态保持器
    let lastEub = null;
    let lastMarket = null;
    
    // --- 单位转换常数 (1 US Gallon = 3.7854 Litres) ---
    const GAL_TO_LITER = 3.7854;

    const mergedData = allDates.map(date => {
       const eubMatch = eubData.find(d => d.effective_date === date);
       if (eubMatch) lastEub = eubMatch.max_price;
       
       const marketMatch = marketData.find(d => d.date === date);
       // 转换：将 加元/加仑 转为 加分/升
       if (marketMatch) lastMarket = (marketMatch.rbob_cad_base / GAL_TO_LITER) * 100;
       
       return { date, eubPrice: lastEub, marketPrice: lastMarket };
    });

    const xAxisDates = mergedData.map(d => d.date);
    // 过滤掉初期的 null 值，保持图表连贯
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
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value + ' ¢/L' : '-'}</b></div>`;
                } else {
                    html += `<div>${p.marker} ${p.seriesName}: <b>${p.value !== undefined ? p.value.toFixed(2) + ' ¢/L' : '-'}</b></div>`;
                }
            });
            return html;
        }
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
        data: xAxisDates,
        axisLine: { lineStyle: { color: '#e7e8e9' } }
      },
      // 实施 7.4 节：强制双 Y 轴对比
      yAxis: [
        {
          type: 'value',
          name: '¢/L (EUB)',
          axisLine: { lineStyle: { color: '#00236f' } }, // 保持官方权威的深蓝
          splitLine: { lineStyle: { color: '#e7e8e9' } },
          scale: true
        },
        {
          type: 'value',
          name: '¢/L (Market)',
          axisLine: { lineStyle: { color: '#059669' } }, // 换成醒目的翠绿色 (Emerald Green)
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
          itemStyle: { color: '#00236f' }, // 深蓝色
          lineStyle: { width: 3 }
        },
        {
          name: 'Market RBOB Cost',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: marketPrices,
          itemStyle: { color: '#059669' }, // 翠绿色
          areaStyle: {
            // 渐变色同步优化为绿色系
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(5, 150, 105, 0.2)' },
              { offset: 1, color: 'rgba(5, 150, 105, 0)' }
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
    <div className="space-y-6 pb-8">
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