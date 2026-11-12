import React from 'react';
import { 
  Search, 
  Zap, 
  Database, 
  Wifi, 
  WifiOff, 
  Sparkles,
  ChevronRight,
  Lightbulb,
  Wrench,
  Compass
} from 'lucide-react';
import { ActiveTab, RecloserLog } from '../types';
import peaBotMascotImg from '../assets/images/pea_bot_mascot_1786454271309.jpg';

interface HomeTabProps {
  totalRecordsCount: number;
  recloserLogs: RecloserLog[];
  syncStatus: 'live' | 'cached' | 'error';
  isOffline: boolean;
  lastSyncFullDate: string | null;
  onNavigateTab: (tab: ActiveTab) => void;
  onQuickSearch?: (query: string) => void;
}

export const HomeTab: React.FC<HomeTabProps> = ({
  totalRecordsCount,
  recloserLogs,
  syncStatus,
  isOffline,
  lastSyncFullDate,
  onNavigateTab
}) => {
  return (
    <div className="w-full flex flex-col gap-3 pb-6 max-w-md mx-auto animate-fadeIn">
      
      {/* 1. HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-950/90 via-slate-900 to-slate-950 border border-purple-500/30 p-4 sm:p-5 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px] font-bold mb-1.5">
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span>PEA Smart Field</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
              ระบบช่วยงานภาคสนาม<br />
              <span className="bg-gradient-to-r from-amber-300 via-purple-200 to-cyan-300 bg-clip-text text-transparent">
                กฟส.อำเภอท่าคันโท
              </span>
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              ค้นหาพิกัดผู้ใช้ไฟ • สำรวจโคมไฟ • จดบันทึก Recloser
            </p>
          </div>

          {/* 3D Mascot Avatar */}
          <div className="shrink-0 relative group">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border-2 border-amber-400/80 shadow-xl shadow-purple-950/80 bg-slate-900 p-0.5 transform transition-transform group-hover:scale-105">
              <img 
                src={peaBotMascotImg} 
                alt="PEA Bot 3D" 
                className="w-full h-full object-cover rounded-xl"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 text-[8px] font-black px-1.5 py-0.2 rounded-full border border-slate-900 shadow">
              ONLINE
            </div>
          </div>
        </div>

        {/* Quick System Stats Bar */}
        <div className="mt-3 pt-3 border-t border-purple-500/20 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm p-2 rounded-xl border border-purple-400/20">
            <Database className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="truncate">
              <div className="text-[10px] text-slate-400 font-medium">ข้อมูลผู้ใช้ไฟ</div>
              <div className="text-xs font-bold text-white font-mono">
                {totalRecordsCount > 0 ? `${totalRecordsCount.toLocaleString()} รายการ` : 'พร้อมใช้งาน'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm p-2 rounded-xl border border-purple-400/20">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="truncate">
              <div className="text-[10px] text-slate-400 font-medium">ประวัติ Recloser</div>
              <div className="text-xs font-bold text-amber-300 font-mono">
                {recloserLogs.length} รายการ
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PRIMARY FUNCTION CARDS */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>ฟังก์ชันการทำงาน</span>
          </span>
          <span className="text-[10px] text-slate-500">แตะเพื่อเข้าใช้งาน</span>
        </div>

        {/* FUNCTION 1: ค้นหาผู้ใช้ไฟ */}
        <div 
          id="btn-nav-search-consumer"
          onClick={() => onNavigateTab('search')}
          className="group relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 hover:from-purple-950/90 hover:via-indigo-900/80 hover:to-slate-900 border border-slate-800 hover:border-purple-500/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 shadow-md hover:shadow-purple-900/30 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-all shadow-inner shrink-0">
              <Search className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white group-hover:text-amber-300 transition-colors truncate">
                ค้นหาพิกัดผู้ใช้ไฟ
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                ค้นหาด้วย CA, PEA Meter, บ้านเลขที่ หรือชื่อผู้ใช้ไฟ
              </p>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 group-hover:bg-purple-600 group-hover:text-white text-slate-400 flex items-center justify-center shrink-0 transition-all">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* FUNCTION 2: MeterAssay GPS (6 มาตรการณ์) */}
        <div 
          id="btn-nav-meter-assay"
          onClick={() => onNavigateTab('meter_assay')}
          className="group relative overflow-hidden bg-gradient-to-r from-slate-900 via-cyan-950/60 to-slate-900 hover:from-cyan-950/90 hover:via-blue-950/80 hover:to-slate-900 border border-slate-800 hover:border-cyan-400/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 shadow-md hover:shadow-cyan-900/30 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all shadow-inner shrink-0">
              <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-base font-black text-white group-hover:text-cyan-300 transition-colors truncate">
                  MeterAssay GPS
                </h3>
                <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/20 px-1.5 py-0.2 rounded-full border border-cyan-500/30">
                  6 มาตรการณ์
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                ค้นหาหลายเครื่องพร้อมกัน • จัดเรียงใกล้ที่สุดอัตโนมัติ • นำทาง GPS (ม.1, 2, 3, 8, N1, N2)
              </p>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 group-hover:bg-cyan-500 group-hover:text-slate-950 text-slate-400 flex items-center justify-center shrink-0 transition-all">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* FUNCTION 3: สำรวจโคมไฟส่องสว่าง */}
        <div 
          id="btn-nav-streetlight"
          onClick={() => onNavigateTab('streetlight')}
          className="group relative overflow-hidden bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-900 hover:from-amber-950/80 hover:via-yellow-950/60 hover:to-slate-900 border border-slate-800 hover:border-amber-500/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 shadow-md hover:shadow-amber-900/20 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all shadow-inner shrink-0">
              <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white group-hover:text-amber-300 transition-colors truncate">
                สำรวจโคมไฟส่องสว่าง
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                บันทึกและติดตามสถานะหม้อแปลง 106 เครื่อง 23 หมู่บ้าน
              </p>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-400 flex items-center justify-center shrink-0 transition-all">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* FUNCTION 3: Patrol Work */}
        <div 
          id="btn-nav-patrol-work"
          onClick={() => onNavigateTab('patrol_work')}
          className="group relative overflow-hidden bg-gradient-to-r from-slate-900 via-amber-950/50 to-slate-900 hover:from-amber-950/90 hover:via-orange-950/80 hover:to-slate-900 border border-slate-800 hover:border-amber-400/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 shadow-md hover:shadow-amber-900/30 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 group-hover:bg-amber-400 group-hover:text-slate-950 transition-all shadow-inner shrink-0">
              <Wrench className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm sm:text-base font-black text-white group-hover:text-amber-300 transition-colors truncate">
                  Patrol Work
                </h3>
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                  ใหม่
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                ค้นหาตาม PEA หม้อแปลง • คัดลอกพิกัด Lat, Lng • จัดเรียงเส้นทางคุ้มค่าที่สุดจาก GPS
              </p>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 group-hover:bg-amber-400 group-hover:text-slate-950 text-slate-400 flex items-center justify-center shrink-0 transition-all">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* FUNCTION 4: จดหน่วย Recloser */}
        <div 
          id="btn-nav-recloser"
          onClick={() => onNavigateTab('recloser')}
          className="group relative overflow-hidden bg-gradient-to-r from-slate-900 via-orange-950/30 to-slate-900 hover:from-orange-950/70 hover:via-amber-950/50 hover:to-slate-900 border border-slate-800 hover:border-orange-500/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 cursor-pointer transition-all duration-200 shadow-md hover:shadow-orange-900/20 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 group-hover:bg-orange-500 group-hover:text-slate-950 transition-all shadow-inner shrink-0">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white group-hover:text-orange-300 transition-colors truncate">
                บันทึกค่า Recloser
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5 line-clamp-1">
                จดหน่วย Counter และ Current 7 จุดหลัก พร้อมออกรายงาน
              </p>
            </div>

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 group-hover:bg-orange-500 group-hover:text-slate-950 text-slate-400 flex items-center justify-center shrink-0 transition-all">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. SYSTEM STATUS PILL */}
      <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          {isOffline ? (
            <WifiOff className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="text-[11px] font-medium truncate">
            {isOffline ? 'โหมดออฟไลน์ (ใช้งานจากแคช)' : 'เชื่อมต่อฐานข้อมูล PEA พร้อมใช้งาน'}
          </span>
        </div>
        {lastSyncFullDate && (
          <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-1">
            ซิงค์: {lastSyncFullDate.split(' ')[1] || lastSyncFullDate}
          </span>
        )}
      </div>

    </div>
  );
};
