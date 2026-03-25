import React, { useState, useEffect } from 'react';
import HeroBoard from './components/HeroBoard';
import CycleDetails from './components/CycleDetails';
import HistoryChart from './components/HistoryChart';

function App() {
  const [activeTab, setActiveTab] = useState('market'); // 'market', 'trends'
  const [showCycleDetails, setShowCycleDetails] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false); // 新增分享状态

  useEffect(() => {
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? '[http://127.0.0.1:8787](http://127.0.0.1:8787)'
      : '[https://nb-gas-pulse-api.honglei-gao.workers.dev](https://nb-gas-pulse-api.honglei-gao.workers.dev)';

    fetch(`${API_BASE}/api/v1/cycle/current`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleShare = async () => {
    const shareData = {
      title: 'NB Gas Guru',
      text: 'Check out the latest gas price forecast and market trends for New Brunswick!',
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return; 
      } catch (e) {
      }
    }

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

  if (loading) return <div className="flex items-center justify-center h-screen font-headline font-bold text-primary">Loading NB Gas Guru...</div>;

  return (
    <div className="min-h-screen pb-24">
      <header className="bg-slate-50 flex items-center justify-between w-full px-6 h-16 fixed top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-blue-900 font-manrope font-extrabold tracking-tight text-xl">NB Gas Guru</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm text-slate-600 px-3 py-1.5 rounded-full hover:bg-slate-50 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">
              {copied ? 'check' : 'ios_share'}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider">
              {copied ? 'Copied!' : 'Share'}
            </span>
          </button>
        </div>
      </header>

      <main className="pt-20 px-6 max-w-4xl mx-auto">
        {showCycleDetails ? (
          <CycleDetails onBack={() => setShowCycleDetails(false)} data={data} />
        ) : activeTab === 'market' ? (
          <HeroBoard data={data} onExplore={() => setShowCycleDetails(true)} />
        ) : (
          <HistoryChart />
        )}
      </main>

      {!showCycleDetails && (
        <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-3 bg-white/80 backdrop-blur-md border-t border-slate-100 z-50 rounded-t-xl">
          <button 
            onClick={() => setActiveTab('market')}
            className={`flex flex-col items-center justify-center rounded-xl px-6 py-2 transition-all ${activeTab === 'market' ? 'bg-blue-50 text-blue-900' : 'text-slate-400'}`}
          >
            <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: activeTab === 'market' ? "'FILL' 1" : "'FILL' 0" }}>query_stats</span>
            <span className="font-inter text-[11px] font-semibold uppercase">Market</span>
          </button>
          <button 
            onClick={() => setActiveTab('trends')}
            className={`flex flex-col items-center justify-center rounded-xl px-6 py-2 transition-all ${activeTab === 'trends' ? 'bg-blue-50 text-blue-900' : 'text-slate-400'}`}
          >
            <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: activeTab === 'trends' ? "'FILL' 1" : "'FILL' 0" }}>trending_up</span>
            <span className="font-inter text-[11px] font-semibold uppercase">Trends</span>
          </button>
        </nav>
      )}
    </div>
  );
}

export default App;