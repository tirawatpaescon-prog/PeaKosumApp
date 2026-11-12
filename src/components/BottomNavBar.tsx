import React from 'react';
import { Home, Search, Zap, Lightbulb, Wrench, Compass } from 'lucide-react';
import { ActiveTab } from '../types';

interface BottomNavBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  recloserCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onTabChange,
  recloserCount = 0
}) => {
  return (
    <nav 
      aria-label="เมนูหลักด้านล่าง"
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] px-1 max-w-md w-full mx-auto shadow-2xl transition-all"
    >
      <div className="grid grid-cols-6 gap-0.5 items-center">
        
        {/* TAB 1: HOME */}
        <button
          id="tab-home"
          type="button"
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'home'
              ? 'text-purple-300 bg-purple-500/20 border border-purple-400/40 shadow-lg shadow-purple-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Home className={`w-3.5 h-3.5 ${activeTab === 'home' ? 'text-purple-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {activeTab === 'home' && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'home' ? 'text-purple-200 font-black' : 'text-slate-400'}`}>
            หน้าแรก
          </span>
        </button>

        {/* TAB 2: SEARCH CONSUMERS */}
        <button
          id="tab-search-consumer"
          type="button"
          onClick={() => onTabChange('search')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'search'
              ? 'text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 shadow-lg shadow-cyan-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Search className={`w-3.5 h-3.5 ${activeTab === 'search' ? 'text-cyan-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {activeTab === 'search' && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'search' ? 'text-cyan-200 font-black' : 'text-slate-400'}`}>
            ค้นหาพิกัด
          </span>
        </button>

        {/* TAB 3: METER ASSAY GPS */}
        <button
          id="tab-meter-assay"
          type="button"
          onClick={() => onTabChange('meter_assay')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'meter_assay'
              ? 'text-cyan-300 bg-cyan-500/25 border border-cyan-400/50 shadow-lg shadow-cyan-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Compass className={`w-3.5 h-3.5 ${activeTab === 'meter_assay' ? 'text-cyan-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {activeTab === 'meter_assay' && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'meter_assay' ? 'text-cyan-200 font-black' : 'text-slate-400'}`}>
            MeterAssay
          </span>
        </button>

        {/* TAB 4: STREETLIGHT SURVEY (สำรวจโคมไฟ) */}
        <button
          id="tab-streetlight"
          type="button"
          onClick={() => onTabChange('streetlight')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'streetlight'
              ? 'text-amber-300 bg-amber-500/20 border border-amber-400/40 shadow-lg shadow-amber-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Lightbulb className={`w-3.5 h-3.5 ${activeTab === 'streetlight' ? 'text-amber-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {activeTab === 'streetlight' && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'streetlight' ? 'text-amber-200 font-black' : 'text-slate-400'}`}>
            สำรวจไฟ
          </span>
        </button>

        {/* TAB 5: PATROL WORK */}
        <button
          id="tab-patrol-work"
          type="button"
          onClick={() => onTabChange('patrol_work')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'patrol_work' || activeTab === 'recloser_work'
              ? 'text-amber-300 bg-amber-500/20 border border-amber-400/40 shadow-lg shadow-amber-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Wrench className={`w-3.5 h-3.5 ${activeTab === 'patrol_work' || activeTab === 'recloser_work' ? 'text-amber-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {(activeTab === 'patrol_work' || activeTab === 'recloser_work') && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse ring-2 ring-slate-950" />
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'patrol_work' || activeTab === 'recloser_work' ? 'text-amber-200 font-black' : 'text-slate-400'}`}>
            Patrol
          </span>
        </button>

        {/* TAB 6: RECLOSER LOGS */}
        <button
          id="tab-recloser"
          type="button"
          onClick={() => onTabChange('recloser')}
          className={`flex flex-col items-center justify-center min-h-[46px] py-1 px-0.5 rounded-xl transition-all cursor-pointer select-none active:scale-95 relative ${
            activeTab === 'recloser'
              ? 'text-orange-300 bg-orange-500/20 border border-orange-400/40 shadow-lg shadow-orange-950/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <div className="relative">
            <Zap className={`w-3.5 h-3.5 ${activeTab === 'recloser' ? 'text-orange-300 scale-110' : 'text-slate-400'} transition-transform`} />
            {recloserCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 text-[8px] font-black px-1 rounded-full font-mono shadow-md ring-1 ring-slate-950">
                {recloserCount}
              </span>
            )}
          </div>
          <span className={`text-[9px] font-bold mt-1 tracking-tight truncate max-w-full ${activeTab === 'recloser' ? 'text-orange-200 font-black' : 'text-slate-400'}`}>
            จด RC
          </span>
        </button>

      </div>
    </nav>
  );
};


