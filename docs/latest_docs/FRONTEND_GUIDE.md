# 前端实现指南 - React + Vite + Tailwind

## 概述

本章节详细讲解前端的项目结构、组件设计、UI 规范以及关键算法的实现。

---

## 第 1 部分：项目结构

```
web/
├── index.html                         # HTML 入口点
├── package.json                       # 依赖和脚本
├── vite.config.js                     # Vite 构建配置
├── tailwind.config.js                 # Tailwind 主题配置
├── postcss.config.js                  # PostCSS 配置
├── public/
│   └── CNAME                          # GitHub Pages 自定义域名
└── src/
    ├── main.jsx                       # React 根入口
    ├── App.jsx                        # 根组件、页面路由、全局状态
    ├── index.css                      # 全局样式 + Tailwind 指令
    ├── components/
    │   ├── HeroBoard.jsx              # 主预测看板
    │   ├── CycleDetails.jsx           # 周期详情页
    │   └── HistoryChart.jsx           # 历史趋势图表
    └── services/                      # API 客户端（可选）
```

---

## 第 2 部分：根组件 (src/App.jsx)

### 完整代码

```javascript
import React, { useState, useEffect } from 'react';
import HeroBoard from './components/HeroBoard';
import CycleDetails from './components/CycleDetails';
import HistoryChart from './components/HistoryChart';

function App() {
  const [activeTab, setActiveTab] = useState('market');  // 'market' 或 'trends'
  const [showCycleDetails, setShowCycleDetails] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // 获取周期数据
  useEffect(() => {
    const API_BASE = 'https://nb-gas-pulse-api.honglei-gao.workers.dev';

    fetch(`${API_BASE}/api/v1/cycle/current`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 分享逻辑：尝试原生分享，否则复制链接
  const handleShare = async () => {
    const shareData = {
      title: 'NB Gas Guru',
      text: 'Check out the latest gas price forecast!',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // 用户取消，继续执行复制逻辑
      }
    }

    // 桌面端回退：复制链接
    const textArea = document.createElement("textarea");
    textArea.value = window.location.href;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-manrope font-bold text-blue-900">
        Loading NB Gas Guru...
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-slate-50 flex items-center justify-between w-full px-6 h-16 fixed top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-blue-900 font-manrope font-extrabold tracking-tight text-xl">
            NB Gas Guru
          </span>
        </div>
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-50 active:scale-95 transition-all"
        >
          <span className="text-[18px]">
            {copied ? '✓' : '↗'}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider">
            {copied ? 'Copied!' : 'Share'}
          </span>
        </button>
      </header>

      {/* Main Content */}
      <main className="pt-20 px-4">
        {/* 如果显示周期详情，隐藏底部导航 */}
        {showCycleDetails ? (
          <>
            <button
              onClick={() => setShowCycleDetails(false)}
              className="mb-4 px-4 py-2 bg-slate-200 rounded-lg hover:bg-slate-300 transition-colors"
            >
              ← Back
            </button>
            <CycleDetails data={data} />
          </>
        ) : (
          <>
            {/* Hero Board */}
            <HeroBoard
              data={data}
              onViewDetails={() => setShowCycleDetails(true)}
            />

            {/* 标签切换 */}
            <div className="mt-8 flex gap-2 mb-6 border-b border-slate-200">
              <button
                onClick={() => setActiveTab('market')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'market'
                    ? 'text-blue-900 border-b-2 border-blue-900'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Market Trends
              </button>
              <button
                onClick={() => setActiveTab('trends')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'trends'
                    ? 'text-blue-900 border-b-2 border-blue-900'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                90-Day History
              </button>
            </div>

            {/* 内容区域 */}
            {activeTab === 'market' && (
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <p className="text-slate-600">Market analysis...</p>
                {/* 可以放置更多市场分析组件 */}
              </div>
            )}

            {activeTab === 'trends' && (
              <HistoryChart />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
```

### 关键点

| 功能 | 实现 |
|------|------|
| 数据获取 | `useEffect` 中 fetch 周期数据 |
| 页面切换 | 通过 `showCycleDetails` 状态 |
| 分享功能 | Web Share API + 剪贴板回退 |
| 响应式 | Tailwind flex + sm/md/lg 断点 |

---

## 第 3 部分：Hero 看板 (src/components/HeroBoard.jsx)

### 完整代码

```javascript
import React from 'react';

function HeroBoard({ data, onViewDetails }) {
  if (!data) return <div>No data</div>;

  // 单位转换：CAD/Gal → ¢/L
  const convertTocentPerLiter = (pumpPrice) => {
    return ((pumpPrice / 3.7854) * 100).toFixed(2);
  };

  // 计算加油站预估价 = 官方限价 - 5.5¢
  const estimatedPumpPrice = data.current_eub.max_price - 5.5;

  // 计算周期平均市场价
  const cycleAvg = data.market_cycle.length > 0
    ? data.market_cycle.reduce((sum, r) => sum + r.absolute_price, 0) / data.market_cycle.length
    : 0;

  // 计算预测变动
  const predictedChange = cycleAvg - data.benchmark_price - data.interrupter_total;

  // 单日最大波幅
  const dailyVariances = [];
  for (let i = 0; i < data.market_cycle.length; i++) {
    let variance;
    if (i === 0) {
      variance = data.market_cycle[0].absolute_price - data.benchmark_price;
    } else {
      variance = Math.abs(data.market_cycle[i].absolute_price - data.market_cycle[i - 1].absolute_price);
    }
    dailyVariances.push(variance);
  }
  const maxDailyVariance = Math.max(...dailyVariances, 0);

  // 风险等级判定
  const currentRiskVariance = Math.abs(predictedChange);
  let riskLevel = { level: 'Low', color: '#22c55e', label: '低危' };

  if (currentRiskVariance >= 5.0 || maxDailyVariance >= 6.0) {
    riskLevel = { level: 'Alert', color: '#ef4444', label: '极危' };
  } else if (currentRiskVariance >= 4.0) {
    riskLevel = { level: 'High', color: '#f97316', label: '高危' };
  } else if (currentRiskVariance >= 3.0) {
    riskLevel = { level: 'Medium', color: '#eab308', label: '中危' };
  }

  return (
    <div className="space-y-6">
      {/* 主卡片：官方限价 */}
      <div className="bg-blue-900 text-white rounded-lg p-8 shadow-lg">
        <p className="text-sm font-inter text-blue-100 mb-2">Current EUB Max Price</p>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-5xl font-manrope font-extrabold">
            {data.current_eub.max_price}
          </span>
          <span className="text-xl font-inter">¢/L</span>
        </div>

        {/* 加油站预估价 */}
        <div className="bg-blue-800 rounded-lg p-4">
          <p className="text-xs font-inter text-blue-100 mb-1">Pump Estimated Price</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-manrope font-bold">
              {estimatedPumpPrice.toFixed(1)}
            </span>
            <span className="text-sm font-inter">¢/L (官方价 - 5.5¢)</span>
          </div>
        </div>
      </div>

      {/* 风险等级卡片 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 左：风险等级 */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <p className="text-xs font-inter text-slate-500 uppercase mb-3">Risk Level</p>
          <div
            className="inline-block px-4 py-2 rounded-full text-white font-bold"
            style={{ backgroundColor: riskLevel.color }}
          >
            {riskLevel.label}
          </div>
          <p className="text-xs font-inter text-slate-600 mt-3">
            Variance: {currentRiskVariance.toFixed(2)} ¢/L
          </p>
        </div>

        {/* 右：熔断信息 */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
          <p className="text-xs font-inter text-slate-500 uppercase mb-3">Interrupter</p>
          <p className="text-2xl font-manrope font-bold">
            {data.interrupter_total.toFixed(2)} ¢
          </p>
          <p className="text-xs font-inter text-slate-600 mt-3">
            {data.current_eub.is_interrupter ? 'Today: Yes' : 'None this cycle'}
          </p>
        </div>
      </div>

      {/* 周期分析 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
        <p className="text-sm font-semibold text-slate-800 mb-4">Weekly Analysis</p>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-slate-600">Benchmark (Prev Cycle)</span>
            <span className="font-semibold">{data.benchmark_price.toFixed(4)} CAD/Gal</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-600">Current Cycle Avg</span>
            <span className="font-semibold">{cycleAvg.toFixed(4)} CAD/Gal</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-slate-600">Max Daily Variance</span>
            <span className="font-semibold">{maxDailyVariance.toFixed(2)} ¢/L</span>
          </div>
        </div>
      </div>

      {/* 按钮 */}
      <button
        onClick={onViewDetails}
        className="w-full bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 active:scale-95 transition-all"
      >
        View Cycle Details →
      </button>
    </div>
  );
}

export default HeroBoard;
```

### 算法说明

```
⚙️ 风险等级计算流程:

1. 计算单日最大波幅 (maxDailyVariance)
   = max(|今天 - 昨天|, |昨天 - 前天|, ...)

2. 计算周期平均价 (cycleAvg)
   = sum(market_cycle 所有价格) / 数据点数

3. 计算预测变动 (predictedChange)
   = cycleAvg - benchmark_price - interrupter_total

4. 获取绝对值
   currentRiskVariance = |predictedChange|

5. 分级规则:
   if (currentRiskVariance >= 5.0 || maxDailyVariance >= 6.0)
     → Alert (极危)
   else if (currentRiskVariance >= 4.0)
     → High (高危)
   else if (currentRiskVariance >= 3.0)
     → Medium (中危)
   else
     → Low (低危)
```

---

## 第 4 部分：周期详情页 (src/components/CycleDetails.jsx)

### 完整代码

```javascript
import React from 'react';

function CycleDetails({ data }) {
  if (!data) return <div>No data</div>;

  // 将市场价格转换为 ¢/L
  const convertTocentPerLiter = (cad_gal) => {
    return ((cad_gal / 3.7854) * 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* 公式解释 */}
      <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Price Calculation Formula</h2>
        <div className="font-mono text-sm bg-white p-4 rounded border border-slate-200 overflow-x-auto">
          <div className="mb-2">
            <span className="text-slate-600">RBOB (USD/Gal) × USD/CAD Rate</span>
          </div>
          <div className="mb-2">
            <span className="text-slate-600">÷ 3.7854 (L per Gal) × 100</span>
          </div>
          <div className="text-blue-900 font-bold">
            = ¢/L (Canadian Cents per Liter)
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          All values are calculated in America/Moncton timezone
        </p>
      </div>

      {/* 周期行情 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">This Week Market Data</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-3 font-semibold">Date</th>
                <th className="text-right p-3 font-semibold">RBOB<br/>(CAD/Gal)</th>
                <th className="text-right p-3 font-semibold">RBOB<br/>(¢/L)</th>
                <th className="text-center p-3 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.market_cycle.map((day, idx) => (
                <tr key={day.date} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3">{day.date}</td>
                  <td className="p-3 text-right font-mono">{day.absolute_price.toFixed(4)}</td>
                  <td className="p-3 text-right font-mono font-semibold">
                    {convertTocentPerLiter(day.absolute_price)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      day.is_weekend 
                        ? 'bg-slate-200 text-slate-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {day.is_weekend ? 'Weekend' : 'Trading'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 官方限价信息 */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Current EUB Regulation</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-600">Effective Date</span>
            <span className="font-semibold">{data.current_eub.effective_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Max Price</span>
            <span className="font-semibold">{data.current_eub.max_price} ¢/L</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Type</span>
            <span className="font-semibold">
              {data.current_eub.is_interrupter ? 'Interrupter (Emergency)' : 'Regular (Thursday)'}
            </span>
          </div>
          {data.current_eub.is_interrupter && (
            <div className="flex justify-between">
              <span className="text-slate-600">Variance</span>
              <span className="font-semibold text-orange-600">
                {data.current_eub.interrupter_variance > 0 ? '↑' : '↓'} {Math.abs(data.current_eub.interrupter_variance)} ¢
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CycleDetails;
```

---

## 第 5 部分：历史图表 (src/components/HistoryChart.jsx)

### 完整代码

```javascript
import React, { useEffect, useState } from 'react';
import * as echarts from 'echarts';

function HistoryChart() {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    // 获取 90 天历史数据
    const API_BASE = 'https://nb-gas-pulse-api.honglei-gao.workers.dev';

    fetch(`${API_BASE}/api/v1/history?days=90`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setChartData(data.data);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!chartData) return;

    // 初始化 ECharts
    const chartDom = document.getElementById('history-chart');
    const myChart = echarts.init(chartDom);

    // 准备数据
    const dates = chartData.eub_history.map(d => d.date).reverse();  // 反序成升序
    const eubPrices = chartData.eub_history
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => d.max_price);

    const marketPrices = chartData.market_history
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ((d.rbob_cad_base / 3.7854) * 100).toFixed(2));

    // 图表配置
    const option = {
      responsive: true,
      maintainAspectRatio: true,
      title: {
        text: '90-Day Price Trend',
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'bold', color: '#1e3a8a' }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        textStyle: { color: '#1e3a8a' }
      },
      legend: {
        data: ['EUB Limit', 'Market Price'],
        bottom: 10
      },
      xAxis: {
        type: 'category',
        data: dates
      },
      yAxis: [
        {
          name: 'EUB (¢/L)',
          type: 'value',
          position: 'left',
          axisLabel: { formatter: '{value}' }
        },
        {
          name: 'Market (¢/L)',
          type: 'value',
          position: 'right'
        }
      ],
      series: [
        {
          name: 'EUB Limit',
          type: 'line',
          step: 'end',  // 关键：阶梯线
          yAxisIndex: 0,
          data: eubPrices,
          lineStyle: { color: '#00236f', width: 4 },
          symbolSize: 6,
          itemStyle: { color: '#00236f' }
        },
        {
          name: 'Market Price',
          type: 'line',
          smooth: true,  // 平滑曲线
          yAxisIndex: 1,
          data: marketPrices,
          lineStyle: { color: '#3b82f6', width: 2 },
          areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
          symbolSize: 4
        }
      ]
    };

    myChart.setOption(option);

    // 窗口响应式调整
    const handleResize = () => myChart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      myChart.dispose();
    };
  }, [chartData]);

  if (!chartData) {
    return <div className="h-96 flex items-center justify-center text-slate-600">Loading chart...</div>;
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
      <div id="history-chart" style={{ width: '100%', height: '400px' }}></div>
      <p className="text-xs text-slate-600 mt-4">
        Blue line shows official EUB maximum prices (阶梯式). Orange shows market RBOB costs (平滑曲线).
      </p>
    </div>
  );
}

export default HistoryChart;
```

### 图表说明

| 特性 | 说明 |
|------|------|
| `step: 'end'` | EUB 线使用阶梯式，表达"这个价格从 A 日到 B 日都有效" |
| `smooth: true` | 市场线使用平滑曲线，展示实际的市场变化趋势 |
| 双 Y 轴 | 左轴是 EUB (¢/L)，右轴是市场价 (¢/L) |
| 响应式 | 用 `resize` 事件监听窗口变化 |

---

## 第 6 部分：全局样式 (src/index.css)

```css
/* 导入 Tailwind 指令 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 自定义字体 */
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

/* 根元素 */
html {
  font-family: 'Inter', sans-serif;
  color-scheme: light;
}

body {
  background-color: #f8f9fa;
  color: #323232;
}

/* 自定义 Tailwind 类 */
@layer components {
  .font-manrope {
    @apply font-['Manrope'];
  }

  .font-inter {
    @apply font-['Inter'];
  }

  .card {
    @apply bg-white rounded-lg p-6 shadow-sm border border-slate-200;
  }

  .card-hover {
    @apply card hover:shadow-md transition-shadow;
  }

  .btn-primary {
    @apply px-4 py-2 bg-blue-900 text-white rounded-lg font-semibold hover:bg-blue-800 active:scale-95 transition-all;
  }

  .btn-secondary {
    @apply px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition-all;
  }
}

/* 响应式调整 */
@media (max-width: 640px) {
  .container {
    @apply px-4;
  }
}
```

---

## 第 7 部分：Tailwind 配置 (tailwind.config.js)

```javascript
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'surface': '#f8f9fa',
        'surface-container-low': '#f3f4f5',
        'surface-container-lowest': '#ffffff',
        'primary-container': '#1e3a8a',
      },
      fontFamily: {
        'manrope': ['Manrope', 'sans-serif'],
        'inter': ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

---

## 第 8 部分：本地开发

### 启动开发服务器

```bash
cd web
npm install
npm run dev
```

输出:
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
```

### 热更新 (HMR)

修改任何 `.jsx` 或 `.css` 文件时，页面会自动刷新。

---

## 第 9 部分：构建

### 生产构建

```bash
npm run build
```

输出:
```
dist/
├── index.html
├── assets/
│   ├── index-xxxxx.js
│   ├── index-yyyyy.css
│   └── ...
```

### 预览生产构建

```bash
npm run preview
```

---

## 第 10 部分：UI 设计规范

### 色彩系统

```
深蓝 (#1e3a8a)  - Hero 区域背景、标题
浅灰 (#f8f9fa)  - 页面背景
白色 (#ffffff)  - 卡片背景
灰色 (#757575)  - 说明文本
```

### 排版

```
标题: Manrope Bold 18-32px
说明: Inter Regular 12-14px
数据: Manrope ExtraBold 24-56px
标签: Inter SemiBold 12px
```

### 间距

```
页面 padding: 24px (mobile), 32px (desktop)
组件间距: 24px
组件内间距: 16px
```

---

## 总结

| 组件 | 用途 |
|------|------|
| App.jsx | 路由、标签、全局状态 |
| HeroBoard.jsx | 主预测区、风险计算 |
| CycleDetails.jsx | 周期详情、公式解释 |
| HistoryChart.jsx | 90 天趋势图表 |
| index.css | Tailwind 指令、自定义样式 |

**下一步**: [DATA_PIPELINE.md](DATA_PIPELINE.md) - 数据管道实现
