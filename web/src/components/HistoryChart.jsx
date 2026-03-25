import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

// 工具函数：生成严格连续的本地日历数组 (避免时区跳跃)
const generateDateRange = (startDateStr, endDateStr) => {
  const dates = [];
  let [sy, sm, sd] = startDateStr.split('-').map(Number);
  let [ey, em, ed] = endDateStr.split('-').map(Number);
  
  // 使用 UTC 进行循环运算，防止夏令时导致的跨天 Bug
  let current = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const HistoryChart = () => {
  const chartRef = useRef(null);
  const [data, setData] = useState(null);
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

  // 核心渲染逻辑：全日历填充与 LOCF 算法
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

    // 1. 将数据倒序排列（从最老的时间开始推演）
    const eubAsc = [...eubData].reverse();
    const marketAsc = [...marketData].reverse();

    // 2. 确定时间窗口的严格左右边界
    // API 已经通过 subquery 保证了 eubAsc[0] 可能是 30 天之前的上一次定价
    const startDate = meta.start_date; 
    // 图表终点以有市场数据的最后一天，或今天为准
    const endDate = marketAsc.length > 0 ? marketAsc[marketAsc.length - 1].date : new Date().toISOString().split('T')[0];

    // 3. 生成没有一天断档的全日历数组
    const fullDateRange = generateDateRange(startDate, endDate);

    // 4. LOCF 状态保持器
    let currentEub = null;
    let currentMarket = null;

    // 前置寻找：如果窗口开始前有官方定价，先继承下来（得益于后端卓越的 subquery）
    const initialEub = eubAsc.find(d => (d.date || d.effective_date) <= startDate);
    if (initialEub) currentEub = initialEub.max_price;

    // 5. 拉链式遍历：填充每一天的价格
    const mergedData = fullDateRange.map(date => {
       // 如果今天有官方新定价，更新它
       const eToday = eubAsc.find(d => (d.date || d.effective_date) === date);
       if (eToday) currentEub = eToday.max_price;
       
       // 如果今天市场开盘有新价格，更新它
       const mToday = marketAsc.find(d => d.date === date);
       if (mToday) currentMarket = (mToday.rbob_cad_base / GAL_TO_LITER) * 100;
       
       return { date, eubPrice: currentEub, marketPrice: currentMarket };
    });

    // 拆解渲染序列
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
          showSymbol: false, // UI 优化：关闭官方线上的圆点
          itemStyle: { color: '#00236f' },
          lineStyle: { width: 3 }
        },
        {
          name: 'Market RBOB Cost',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: marketPrices,
          showSymbol: false, // UI 优化：关闭市场线上的密集圆点，变专业
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