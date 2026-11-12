import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
  Search,
  Filter,
  Share2,
  Copy,
  Check,
  Zap,
  Building2,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  TrendingUp,
  RefreshCw,
  Cloud,
  Wifi,
  CheckCheck,
  Navigation,
  Route,
  LocateFixed,
  Car
} from 'lucide-react';
import { STREETLIGHT_TRANSFORMERS, STREETLIGHT_VILLAGES, StreetlightTransformer } from '../data/streetlightSurveyData';
import { StreetlightSurveyStatusType } from '../types';
import {
  subscribeToStreetlightSurveys,
  setTransformerSurveyStatus,
  bulkSetTransformerSurveyStatuses,
  testFirestoreConnection
} from '../lib/firebase';
import {
  RouteSortMode,
  TransformerCoord,
  RouteStop,
  RoutePlan,
  getTransformerCoords,
  formatDistance,
  sequenceRoute,
  generateRouteSummaryText
} from '../utils/routeSequencer';

const STORAGE_KEY = 'pea_streetlight_survey_statuses_v1';

interface StoredStatus {
  status: StreetlightSurveyStatusType;
  updatedAt: number;
}

interface StreetlightTabProps {
  initialVillage?: string | null;
}

export const StreetlightTab: React.FC<StreetlightTabProps> = ({ initialVillage = null }) => {
  // 1. Status state loaded from localStorage, with fallback to initial status in dataset
  const [statusMap, setStatusMap] = useState<Record<string, StoredStatus>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load streetlight survey statuses:', e);
    }
    // Default from dataset
    const defaults: Record<string, StoredStatus> = {};
    STREETLIGHT_TRANSFORMERS.forEach((item) => {
      defaults[item.peano] = {
        status: item.initialSurveyStatus,
        updatedAt: Date.now()
      };
    });
    return defaults;
  });

  // Central Cloud/Server Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [cloudConnected, setCloudConnected] = useState<boolean>(true);

  // Subscribe to Real-time Firebase Firestore updates
  useEffect(() => {
    setIsSyncing(true);

    const unsubscribe = subscribeToStreetlightSurveys(
      (remoteStatuses) => {
        setIsSyncing(false);
        setCloudConnected(true);
        setLastSyncTime(new Date());

        setStatusMap((prev) => {
          const remoteKeys = Object.keys(remoteStatuses);

          // If Cloud Database is completely blank on very first launch, initialize it with dataset
          if (remoteKeys.length === 0 && Object.keys(prev).length > 0) {
            bulkSetTransformerSurveyStatuses(prev).catch((err) => {
              console.warn('Initial cloud seed error:', err);
            });
            return prev;
          }

          // Merge real-time changes from cloud
          return {
            ...prev,
            ...remoteStatuses
          };
        });
      },
      (err) => {
        console.warn('[Firebase] Firestore sync error, using local data:', err);
        setCloudConnected(false);
        setIsSyncing(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Save to localStorage as local offline backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
    } catch (e) {
      console.error('Failed to persist streetlight survey statuses:', e);
    }
  }, [statusMap]);

  // 2. Active village tab state ('all' or village name)
  const [activeVillage, setActiveVillage] = useState<string>(initialVillage || 'all');

  // 3. Status filter: 'all' | 'pending' | 'in_progress' | 'completed'
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');

  // 4. Search text
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 5. Toast / Feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 6. Route Sequencing State for "กำลังทำ"
  const [routeSortMode, setRouteSortMode] = useState<RouteSortMode>('nearest_from_user');
  const [userLocation, setUserLocation] = useState<TransformerCoord | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);

  // Geolocation fetcher for Route Sequencing
  const handleGetLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator?.geolocation) {
      showToast('⚠️ อุปกรณ์ไม่รองรับ Geolocation GPS');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const coords: TransformerCoord = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setUserLocation(coords);
        showToast(`📍 บันทึกพิกัด GPS ปัจจุบันแล้ว (ความแม่นยำ ±${Math.round(pos.coords.accuracy)} ม.)`);
      },
      (err) => {
        setIsLocating(false);
        console.warn('[GPS] Geolocation error:', err);
        showToast('⚠️ ไม่สามารถอ่านพิกัด GPS ได้ (กรุณากดเปิดอนุญาตพิกัดตำแหน่ง)');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  // Auto-acquire current GPS position when switching to "กำลังทำ" tab
  useEffect(() => {
    if (statusFilter === 'in_progress' && !userLocation && !isLocating) {
      handleGetLocation();
    }
  }, [statusFilter, userLocation, isLocating, handleGetLocation]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Manual Sync / Check Connection
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const ok = await testFirestoreConnection();
      setCloudConnected(ok);
      setLastSyncTime(new Date());
      showToast(ok ? '☁️ เชื่อมต่อ Cloud Database สำเร็จ (Real-time ทุกเครื่อง)' : '⚠️ โหมดออฟไลน์ (กำลังรอสัญญาณ)');
    } catch (e) {
      setCloudConnected(false);
      showToast('⚠️ ไม่สามารถเชื่อมต่อระบบ Cloud ได้');
    } finally {
      setIsSyncing(false);
    }
  };

  // Set status handler (ยังไม่สำรวจ / กำลังดำเนินการ / สำรวจแล้ว) with Real-time Cloud Sync
  const handleSetStatus = async (peano: string, newStatus: StreetlightSurveyStatusType) => {
    const now = Date.now();
    const item = STREETLIGHT_TRANSFORMERS.find((t) => t.peano === peano);

    // 1. Optimistic instant local update
    setStatusMap((prev) => ({
      ...prev,
      [peano]: {
        status: newStatus,
        updatedAt: now
      }
    }));

    const label =
      newStatus === 'สำรวจแล้ว'
        ? `✅ บันทึกหม้อแปลง ${peano} เป็น "สำรวจแล้ว" (ซิงค์ทุกเครื่อง)`
        : newStatus === 'กำลังดำเนินการ'
        ? `⚡ บันทึกหม้อแปลง ${peano} เป็น "กำลังดำเนินการ" (ซิงค์ทุกเครื่อง)`
        : `⏳ ปรับหม้อแปลง ${peano} เป็น "ยังไม่สำรวจ" (ซิงค์ทุกเครื่อง)`;

    showToast(label);

    // 2. Real-time broadcast to all mobile devices via Cloud Firestore
    try {
      await setTransformerSurveyStatus(peano, newStatus, item?.village);
      setCloudConnected(true);
      setLastSyncTime(new Date());
    } catch (err) {
      console.warn('Firebase sync write error:', err);
      setCloudConnected(false);
    }
  };

  // Reset to original status from CSV file with Cloud broadcast
  const handleResetToDefault = async () => {
    if (window.confirm('ต้องการรีเซ็ตสถานะการสำรวจทั้งหมดกลับเป็นค่าเริ่มต้นตามไฟล์ระบบ (ทุกเครื่องจะถูกปรับเป็นค่าเริ่มต้นด้วย) หรือไม่?')) {
      const defaults: Record<string, StoredStatus> = {};
      const now = Date.now();
      STREETLIGHT_TRANSFORMERS.forEach((item) => {
        defaults[item.peano] = {
          status: item.initialSurveyStatus,
          updatedAt: now
        };
      });
      setStatusMap(defaults);

      try {
        await bulkSetTransformerSurveyStatuses(defaults);
        showToast('🔄 รีเซ็ตและซิงค์ข้อมูลเริ่มต้นไปยังมือถือทุกเครื่องแล้ว');
        setCloudConnected(true);
        setLastSyncTime(new Date());
      } catch (e) {
        showToast('🔄 รีเซ็ตในเครื่องเรียบร้อยแล้ว');
      }
    }
  };

  // Village Navigation helpers
  const handlePrevVillage = () => {
    if (activeVillage === 'all') return;
    const idx = STREETLIGHT_VILLAGES.indexOf(activeVillage);
    if (idx > 0) {
      setActiveVillage(STREETLIGHT_VILLAGES[idx - 1]);
    } else {
      setActiveVillage('all');
    }
  };

  const handleNextVillage = () => {
    if (activeVillage === 'all') {
      if (STREETLIGHT_VILLAGES.length > 0) {
        setActiveVillage(STREETLIGHT_VILLAGES[0]);
      }
      return;
    }
    const idx = STREETLIGHT_VILLAGES.indexOf(activeVillage);
    if (idx < STREETLIGHT_VILLAGES.length - 1) {
      setActiveVillage(STREETLIGHT_VILLAGES[idx + 1]);
    } else {
      setActiveVillage('all');
    }
  };

  // Statistics calculation
  const overallStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    let totalAffected = 0;
    const villageCounts: Record<
      string,
      { total: number; completed: number; inProgress: number; pending: number; affected: number }
    > = {};

    STREETLIGHT_VILLAGES.forEach((v) => {
      villageCounts[v] = { total: 0, completed: 0, inProgress: 0, pending: 0, affected: 0 };
    });

    STREETLIGHT_TRANSFORMERS.forEach((t) => {
      const currentSt = statusMap[t.peano]?.status || t.initialSurveyStatus;
      const isCompleted = currentSt === 'สำรวจแล้ว';
      const isInProgress = currentSt === 'กำลังดำเนินการ';

      if (isCompleted) {
        completed++;
      } else if (isInProgress) {
        inProgress++;
      } else {
        pending++;
      }
      totalAffected += t.affected;

      if (villageCounts[t.village]) {
        villageCounts[t.village].total += 1;
        if (isCompleted) villageCounts[t.village].completed += 1;
        else if (isInProgress) villageCounts[t.village].inProgress += 1;
        else villageCounts[t.village].pending += 1;
        villageCounts[t.village].affected += t.affected;
      }
    });

    const total = STREETLIGHT_TRANSFORMERS.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      pending,
      percent,
      totalAffected,
      villageCounts
    };
  }, [statusMap]);

  // Current selected village stats
  const selectedVillageStats = useMemo(() => {
    if (activeVillage === 'all') {
      return overallStats;
    }
    const c = overallStats.villageCounts[activeVillage] || {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      affected: 0
    };
    const percent = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
    return {
      total: c.total,
      completed: c.completed,
      inProgress: c.inProgress,
      pending: c.pending,
      percent,
      totalAffected: c.affected
    };
  }, [activeVillage, overallStats]);

  // 1. Base Filtered transformers (filtered by village, status, search)
  const baseFilteredTransformers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return STREETLIGHT_TRANSFORMERS.filter((item) => {
      // 1. Village filter
      if (activeVillage !== 'all' && item.village !== activeVillage) {
        return false;
      }

      // 2. Status filter
      const currentStatus = statusMap[item.peano]?.status || item.initialSurveyStatus;
      if (statusFilter === 'completed' && currentStatus !== 'สำรวจแล้ว') {
        return false;
      }
      if (statusFilter === 'in_progress' && currentStatus !== 'กำลังดำเนินการ') {
        return false;
      }
      if (statusFilter === 'pending' && currentStatus !== 'ยังไม่สำรวจ') {
        return false;
      }

      // 3. Search query
      if (q) {
        const matchPeano = item.peano.toLowerCase().includes(q);
        const matchLoc = item.location.toLowerCase().includes(q);
        const matchVillage = item.village.toLowerCase().includes(q);
        const matchPhase = item.phase.toLowerCase().includes(q);
        const matchKva = item.kva.toString().includes(q);
        if (!matchPeano && !matchLoc && !matchVillage && !matchPhase && !matchKva) {
          return false;
        }
      }

      return true;
    });
  }, [activeVillage, statusFilter, searchQuery, statusMap]);

  // 2. Route Sequencing calculation for "กำลังทำ" (In Progress)
  const inProgressRoutePlan = useMemo<RoutePlan | null>(() => {
    if (statusFilter !== 'in_progress') {
      return null;
    }
    return sequenceRoute(baseFilteredTransformers, routeSortMode, userLocation);
  }, [statusFilter, baseFilteredTransformers, routeSortMode, userLocation]);

  // 3. Final display list: sequenced in optimal travel order if in_progress, else regular filtered
  const filteredTransformers = useMemo(() => {
    if (statusFilter === 'in_progress' && inProgressRoutePlan) {
      return inProgressRoutePlan.stops.map((s) => s.transformer);
    }
    return baseFilteredTransformers;
  }, [statusFilter, inProgressRoutePlan, baseFilteredTransformers]);

  // 4. Map for instant O(1) lookup of stop details by peano
  const routeStopMap = useMemo(() => {
    if (!inProgressRoutePlan) return {};
    const map: Record<string, RouteStop> = {};
    for (const stop of inProgressRoutePlan.stops) {
      map[stop.transformer.peano] = stop;
    }
    return map;
  }, [inProgressRoutePlan]);

  // Copy Route Plan for LINE sharing
  const handleCopyRoutePlan = () => {
    if (!inProgressRoutePlan || inProgressRoutePlan.stops.length === 0) {
      showToast('⚠️ ไม่มีหม้อแปลงที่กำลังทำในรายการ');
      return;
    }
    const text = generateRouteSummaryText(inProgressRoutePlan, activeVillage, routeSortMode);
    navigator.clipboard.writeText(text);
    showToast('📋 คัดลอกแผนจัดลำดับเดินทางสำหรับส่ง LINE แล้ว');
  };

  // Copy details helper
  const handleCopyDetails = (item: StreetlightTransformer) => {
    const currentStatus = statusMap[item.peano]?.status || item.initialSurveyStatus;
    const text = `หม้อแปลง: ${item.peano} (${item.phase} ${item.kva} kVA)\nหมู่บ้าน: ${item.village}\nสถานที่: ${item.location}\nสถานะสำรวจโคมไฟ: ${currentStatus}\nพิกัด: ${item.latlong || `${item.latitude}, ${item.longitude}`}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.peano);
    showToast(`คัดลอกข้อมูลหม้อแปลง ${item.peano} แล้ว`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy LINE summary memo
  const handleCopyLineSummary = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    let msg = `⚡ สรุปผลสำรวจโคมไฟส่องสว่าง PEA.TKT ⚡\n`;
    msg += `📅 วันที่: ${dateStr}\n`;
    if (activeVillage !== 'all') {
      msg += `🏘️ หมู่บ้าน: ${activeVillage}\n`;
      msg += `📊 ความคืบหน้า: สำรวจแล้ว ${selectedVillageStats.completed}/${selectedVillageStats.total} เครื่อง (${selectedVillageStats.percent}%)\n`;
      msg += `⚡ กำลังดำเนินการ: ${selectedVillageStats.inProgress} เครื่อง\n`;
      msg += `⏳ คงเหลือยังไม่สำรวจ: ${selectedVillageStats.pending} เครื่อง\n`;
    } else {
      msg += `📊 ภาพรวมทั้งหมด 23 หมู่บ้าน:\n`;
      msg += `✅ สำรวจแล้ว: ${overallStats.completed}/${overallStats.total} เครื่อง (${overallStats.percent}%)\n`;
      msg += `⚡ กำลังดำเนินการ: ${overallStats.inProgress} เครื่อง\n`;
      msg += `⏳ คงเหลือยังไม่สำรวจ: ${overallStats.pending} เครื่อง\n`;
      msg += `👥 ผู้ใช้ไฟได้รับผลกระทบรวม: ${overallStats.totalAffected.toLocaleString()} ราย\n`;
    }

    msg += `\n📝 รายการหม้อแปลง (${filteredTransformers.length} เครื่อง):\n`;
    filteredTransformers.forEach((item, idx) => {
      const st = statusMap[item.peano]?.status || item.initialSurveyStatus;
      const mark = st === 'สำรวจแล้ว' ? '✅' : st === 'กำลังดำเนินการ' ? '⚡' : '⏳';
      msg += `${idx + 1}. [${mark} ${st}] ${item.peano} (${item.kva} kVA) - ${item.location}\n`;
    });

    navigator.clipboard.writeText(msg);
    showToast('📋 คัดลอกสรุปผลสำรวจสำหรับส่ง LINE เรียบร้อย');
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'ลำดับ',
      'รหัสหม้อแปลง (PEA No)',
      'สถานะสำรวจโคมไฟ',
      'หมู่บ้าน',
      'ระบบเฟส',
      'ขนาด kVA',
      'สถานที่ติดตั้ง',
      'ผู้ใช้ไฟกระทบ',
      'ละติจูด',
      'ลองจิจูด',
      'พิกัด LatLong',
      'ลิงก์ Google Maps'
    ];

    const rows = filteredTransformers.map((item, idx) => {
      const st = statusMap[item.peano]?.status || item.initialSurveyStatus;
      const gmap = item.latitude && item.longitude 
        ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
        : '';
      return [
        idx + 1,
        `"${item.peano}"`,
        `"${st}"`,
        `"${item.village}"`,
        `"${item.phase}"`,
        item.kva,
        `"${item.location}"`,
        item.affected,
        item.latitude ?? '',
        item.longitude ?? '',
        `"${item.latlong}"`,
        `"${gmap}"`
      ];
    });

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const villageTag = activeVillage === 'all' ? 'All_Villages' : activeVillage.replace(/\s+/g, '_');
    link.download = `PEA_Streetlight_Survey_${villageTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('💾 ดาวน์โหลดตาราง CSV สรุปสถานะเรียบร้อย');
  };

  return (
    <div className="w-full flex flex-col gap-3 pb-24 max-w-md mx-auto animate-fadeIn select-none">
      
      {/* FLOATING TOAST */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-amber-400 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-fadeIn flex items-center gap-2 max-w-[90vw]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP HEADER & OVERALL PROGRESS CARD */}
      <div className="bg-gradient-to-br from-amber-950/70 via-slate-900 to-indigo-950/70 border border-amber-500/30 rounded-3xl p-3.5 sm:p-4 shadow-xl relative overflow-hidden">
        {/* Glow decorative effect */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-2 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
              <Lightbulb className="w-5 h-5 fill-slate-950 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-white tracking-tight">
                  สำรวจโคมไฟส่องสว่าง
                </h2>
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full font-mono">
                  106 หม้อแปลง
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                กฟส.ท่าคันโท • 23 หมู่บ้าน
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${cloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {cloudConnected ? 'Cloud Sync' : 'ออฟไลน์'}
                </span>
                {lastSyncTime && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    • {lastSyncTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              title="ตรวจสอบการเชื่อมต่อและดึงข้อมูลล่าสุดจาก Cloud"
              className="px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">
                {isSyncing ? 'ซิงค์...' : 'รีเฟรช'}
              </span>
            </button>

            <button
              onClick={handleResetToDefault}
              title="รีเซ็ตสถานะเป็นค่าเริ่มต้น"
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* PROGRESS BAR & STATS GRID */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-200 truncate">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                {activeVillage === 'all' ? 'ความคืบหน้ารวม' : activeVillage}
              </span>
            </div>
            <span className="font-mono font-black text-amber-300 text-xs shrink-0 ml-1">
              {selectedVillageStats.completed}/{selectedVillageStats.total} ({selectedVillageStats.percent}%)
            </span>
          </div>

          {/* Progress Bar Track */}
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-emerald-400 to-emerald-500 rounded-full transition-all duration-500 shadow-sm"
              style={{ width: `${selectedVillageStats.percent}%` }}
            />
          </div>

          {/* Mini Stats Badges */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
            <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl py-1.5 px-1">
              <span className="text-[10px] text-slate-400 block truncate">ทั้งหมด</span>
              <span className="text-xs font-mono font-black text-white">
                {selectedVillageStats.total}
              </span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl py-1.5 px-1">
              <span className="text-[10px] text-emerald-400 block truncate">สำรวจแล้ว</span>
              <span className="text-xs font-mono font-black text-emerald-300">
                {selectedVillageStats.completed}
              </span>
            </div>
            <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl py-1.5 px-1">
              <span className="text-[10px] text-sky-400 block truncate">กำลังทำ</span>
              <span className="text-xs font-mono font-black text-sky-300">
                {selectedVillageStats.inProgress}
              </span>
            </div>
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl py-1.5 px-1">
              <span className="text-[10px] text-amber-400 block truncate">ยังไม่ทำ</span>
              <span className="text-xs font-mono font-black text-amber-300">
                {selectedVillageStats.pending}
              </span>
            </div>
          </div>
        </div>

        {/* QUICK SHARE ACTIONS */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleCopyLineSummary}
            className="flex-1 py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>ส่งสรุป LINE</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="py-1.5 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
            <span>โหลด CSV</span>
          </button>
        </div>
      </div>

      {/* 2. VILLAGE SELECTION DROPDOWN */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-md">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>เลือกหมู่บ้าน:</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {activeVillage === 'all' ? '23 หมู่บ้าน' : `ที่ ${STREETLIGHT_VILLAGES.indexOf(activeVillage) + 1}/23`}
          </span>
        </div>

        {/* Dropdown Box with Prev/Next Buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Prev Village Button */}
          <button
            type="button"
            onClick={handlePrevVillage}
            disabled={activeVillage === 'all'}
            title="หมู่บ้านก่อนหน้า"
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Main Select Dropdown */}
          <div className="relative flex-1 min-w-0">
            <select
              id="village-dropdown-select"
              value={activeVillage}
              onChange={(e) => setActiveVillage(e.target.value)}
              className="w-full appearance-none bg-slate-950 text-white font-bold text-xs sm:text-sm py-2.5 pl-3.5 pr-9 rounded-xl border border-slate-800 hover:border-amber-500/50 focus:border-amber-400 focus:outline-none transition-all cursor-pointer truncate shadow-inner"
            >
              <option value="all">
                🏘️ ทุกหมู่บ้าน ({overallStats.completed}/{overallStats.total} สำรวจแล้ว)
              </option>
              {STREETLIGHT_VILLAGES.map((v, idx) => {
                const c = overallStats.villageCounts[v] || { total: 0, completed: 0, inProgress: 0, pending: 0 };
                const isFinished = c.total > 0 && c.completed === c.total;
                return (
                  <option key={v} value={v}>
                    {idx + 1}. {v} ({c.completed}/{c.total}{isFinished ? ' ✓' : ''})
                  </option>
                );
              })}
            </select>
            <ChevronDown className="w-4 h-4 text-amber-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Quick Next Village Button */}
          <button
            type="button"
            onClick={handleNextVillage}
            title="หมู่บ้านถัดไป"
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Selected Village Info & Quick Actions */}
        {activeVillage !== 'all' && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                selectedVillageStats.completed === selectedVillageStats.total && selectedVillageStats.total > 0
                  ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                  : selectedVillageStats.inProgress > 0
                  ? 'bg-sky-400 ring-2 ring-sky-400/30'
                  : 'bg-amber-400 ring-2 ring-amber-400/30'
              }`} />
              <span className="font-bold text-white truncate">
                {activeVillage}
              </span>
              <span className="text-[11px] text-slate-400 font-mono shrink-0">
                ({selectedVillageStats.completed}/{selectedVillageStats.total})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveVillage('all')}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 py-0.5 px-2 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer shrink-0 ml-1"
            >
              ดูทั้งหมด
            </button>
          </div>
        )}

        {/* Quick Route Shortcut if there are tasks in progress and user is not yet on the in_progress tab */}
        {selectedVillageStats.inProgress > 0 && statusFilter !== 'in_progress' && (
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className="mt-2 w-full py-2 px-3 rounded-xl bg-gradient-to-r from-sky-950/80 to-blue-950/80 hover:from-sky-900/80 hover:to-blue-900/80 border border-sky-500/30 text-sky-300 font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-400 animate-pulse shrink-0" />
              <span>มี {selectedVillageStats.inProgress} เครื่องกำลังทำ</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-sky-300 font-bold">
              <span>🧭 ดูจัดลำดับเส้นทาง Lat/Long</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </button>
        )}
      </div>

      {/* 3. SEARCH & STATUS FILTER ROW */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 shadow-md flex flex-col gap-2">
        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหารหัสหม้อแปลง เช่น 20-001352, ขนาด kVA..."
            className="w-full bg-slate-950 text-white placeholder-slate-500 text-xs rounded-xl pl-9 pr-8 py-2 border border-slate-800 focus:outline-none focus:border-amber-400 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Buttons (มีแท็บ กำลังดำเนินการ) */}
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-600'
                : 'bg-slate-950 text-slate-400 border-slate-800/80 hover:bg-slate-800'
            }`}
          >
            <span className="truncate">ทั้งหมด</span>
            <span className="text-[10px] font-mono text-slate-400">({selectedVillageStats.total})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                : 'bg-slate-950 text-amber-400/90 border-slate-800/80 hover:bg-amber-950/30'
            }`}
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span className="truncate">ยังไม่สำรวจ</span>
            <span className="text-[10px] font-mono opacity-80">({selectedVillageStats.pending})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
              statusFilter === 'in_progress'
                ? 'bg-sky-500 text-slate-950 border-sky-400 font-black'
                : 'bg-slate-950 text-sky-400/90 border-slate-800/80 hover:bg-sky-950/30'
            }`}
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span className="truncate">กำลังทำ</span>
            <span className="text-[10px] font-mono opacity-80">({selectedVillageStats.inProgress})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 border ${
              statusFilter === 'completed'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                : 'bg-slate-950 text-emerald-400/90 border-slate-800/80 hover:bg-emerald-950/30'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="truncate">สำรวจแล้ว</span>
            <span className="text-[10px] font-mono opacity-80">({selectedVillageStats.completed})</span>
          </button>
        </div>
      </div>

      {/* 🧭 IN-PROGRESS ROUTE SEQUENCING CONTROL PANEL (อิงตำแหน่งปัจจุบันของผู้ใช้: ใกล้ ➔ ไกล) */}
      {statusFilter === 'in_progress' && (
        <div className="bg-gradient-to-br from-sky-950/70 via-slate-900 to-slate-950 border border-sky-500/40 rounded-3xl p-3.5 sm:p-4 shadow-xl shadow-sky-950/30 space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                <Navigation className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                  <span>จัดลำดับจากจุดที่คุณอยู่ (ใกล้ ➔ ไกล)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500 text-slate-950 font-black">
                    {inProgressRoutePlan?.validStopsCount || 0} เครื่อง
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  คำนวณระยะทางจริงจากตำแหน่ง GPS ของคุณไปยังหม้อแปลงแต่ละเครื่อง
                </p>
              </div>
            </div>

            {/* GPS Locate / Refresh Button */}
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={isLocating}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95 ${
                userLocation
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-sky-500 text-slate-950 border-sky-400 hover:bg-sky-400 font-black shadow-md'
              }`}
              title="ดึงพิกัด GPS ตำแหน่งปัจจุบันของคุณ"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'กำลังค้นหา...' : userLocation ? 'รีเฟรช GPS' : 'ดึงพิกัด GPS'}</span>
            </button>
          </div>

          {/* User Location Status Bar */}
          <div
            className={`p-2.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
              userLocation
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  userLocation
                    ? 'bg-emerald-400 ring-2 ring-emerald-400/40 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="text-[11px] font-mono truncate">
                {userLocation
                  ? `จุดที่คุณอยู่: ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}`
                  : 'ยังไม่ได้ระบุพิกัด GPS ปัจจุบันของคุณ'}
              </span>
            </div>

            {!userLocation && (
              <button
                type="button"
                onClick={handleGetLocation}
                className="py-1 px-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-[11px] shrink-0 hover:bg-amber-300 transition-all cursor-pointer active:scale-95"
              >
                กดจับพิกัด
              </button>
            )}
          </div>

          {/* Stats Bar: Closest, Farthest & Route Distance */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-950/90 p-2.5 rounded-2xl border border-slate-800/90 text-xs text-center">
            <div className="p-1">
              <span className="text-[10px] text-slate-400 block">ใกล้ที่สุด</span>
              <span className="font-mono font-black text-emerald-400 text-xs sm:text-sm">
                {inProgressRoutePlan?.closestDistanceMeters !== null
                  ? formatDistance(inProgressRoutePlan?.closestDistanceMeters)
                  : '-'}
              </span>
            </div>
            <div className="p-1 border-x border-slate-800">
              <span className="text-[10px] text-slate-400 block">ไกลที่สุด</span>
              <span className="font-mono font-black text-amber-400 text-xs sm:text-sm">
                {inProgressRoutePlan?.farthestDistanceMeters !== null
                  ? formatDistance(inProgressRoutePlan?.farthestDistanceMeters)
                  : '-'}
              </span>
            </div>
            <div className="p-1">
              <span className="text-[10px] text-slate-400 block">ระยะรวมทั้งสาย</span>
              <span className="font-mono font-black text-sky-400 text-xs sm:text-sm">
                ~{formatDistance(inProgressRoutePlan?.totalDistanceMeters || 0)}
              </span>
            </div>
          </div>

          {/* Sequencing Mode Selection (วัดจากจุดปัจจุบัน: ใกล้ไปไกล vs แวะต่อเนื่อง) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRouteSortMode('nearest_from_user')}
              className={`py-2 px-2.5 rounded-2xl font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-xs text-center ${
                routeSortMode === 'nearest_from_user'
                  ? 'bg-sky-500 text-slate-950 border-sky-400 font-black shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-1 font-black">
                <Navigation className="w-3.5 h-3.5 shrink-0" />
                <span>ใกล้ ➔ ไกล</span>
              </div>
              <span
                className={`text-[10px] ${
                  routeSortMode === 'nearest_from_user'
                    ? 'text-slate-900 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                เรียงตามระยะห่างจริงจากจุดคุณ
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRouteSortMode('nearest_chain')}
              className={`py-2 px-2.5 rounded-2xl font-bold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 text-xs text-center ${
                routeSortMode === 'nearest_chain'
                  ? 'bg-sky-500 text-slate-950 border-sky-400 font-black shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-1 font-black">
                <Route className="w-3.5 h-3.5 shrink-0" />
                <span>แวะต่อกันทีละจุด</span>
              </div>
              <span
                className={`text-[10px] ${
                  routeSortMode === 'nearest_chain'
                    ? 'text-slate-900 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                วนต่อจุดใกล้สุดไปเรื่อยๆ
              </span>
            </button>
          </div>

          {/* Action Buttons: Open multi-stop Google Maps / Copy for LINE */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {inProgressRoutePlan?.googleMapsUrl ? (
              <a
                href={inProgressRoutePlan.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-sky-950/40 cursor-pointer transition-all active:scale-95"
              >
                <Route className="w-4 h-4 shrink-0" />
                <span className="truncate">เปิด Maps นำทางทั้งเส้น</span>
                <ExternalLink className="w-3 h-3 opacity-80 shrink-0" />
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="py-2.5 px-3 rounded-2xl bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
              >
                <Route className="w-4 h-4 shrink-0" />
                <span>ไม่มีพิกัดนำทาง</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyRoutePlan}
              className="py-2.5 px-3 rounded-2xl bg-slate-950 hover:bg-slate-850 text-sky-300 border border-sky-500/30 hover:border-sky-500 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="คัดลอกลำดับการเดินทางพร้อมพิกัดเพื่อส่งต่อในกลุ่ม LINE"
            >
              <Share2 className="w-4 h-4 shrink-0 text-sky-400" />
              <span className="truncate">คัดลอกส่ง LINE</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. TRANSFORMER CARDS LIST */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1 text-xs text-slate-400 font-bold">
          <span>
            {activeVillage === 'all' ? 'รายการหม้อแปลงทั้งหมด' : `หม้อแปลงใน: ${activeVillage}`}
            {statusFilter === 'in_progress' && ' (เรียงตามลำดับเส้นทาง)'}
          </span>
          <span className="font-mono text-[11px] text-amber-300">
            แสดง {filteredTransformers.length} เครื่อง
          </span>
        </div>

        {filteredTransformers.length === 0 ? (
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-8 text-center">
            <Lightbulb className={`w-8 h-8 mx-auto mb-2 ${statusFilter === 'in_progress' ? 'text-sky-400/80' : 'text-slate-600'}`} />
            <p className="text-xs font-bold text-slate-200">
              {statusFilter === 'in_progress'
                ? 'ยังไม่มีหม้อแปลงในสถานะ "กำลังทำ"'
                : 'ไม่พบหม้อแปลงตามเงื่อนไขที่เลือก'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              {statusFilter === 'in_progress'
                ? 'กดปุ่ม [กำลังทำ] ที่การ์ดหม้อแปลงที่ต้องการลงพื้นที่สำรวจ เพื่อให้ระบบคำนวณและจัดลำดับเส้นทางเดินทาง (อิงพิกัด Lat/Long) ให้โดยอัตโนมัติ'
                : 'ลองเปลี่ยนตัวกรองสถานะ หรือคำค้นหา'}
            </p>
          </div>
        ) : (
          filteredTransformers.map((item, idx) => {
            const currentStatus = statusMap[item.peano]?.status || item.initialSurveyStatus;
            const isCompleted = currentStatus === 'สำรวจแล้ว';
            const isInProgress = currentStatus === 'กำลังดำเนินการ';
            const is3Phase = item.phase.includes('3');
            const routeStop = statusFilter === 'in_progress' ? routeStopMap[item.peano] : null;

            return (
              <div
                key={item.peano}
                className={`border rounded-3xl p-3.5 transition-all shadow-md ${
                  isCompleted
                    ? 'bg-slate-900/90 border-emerald-500/40 shadow-emerald-950/20'
                    : isInProgress
                    ? 'bg-slate-900/90 border-sky-500/50 shadow-sky-950/20 ring-1 ring-sky-500/20'
                    : 'bg-slate-900/95 border-slate-800 hover:border-amber-500/40'
                }`}
              >
                {/* 🧭 IN-PROGRESS ROUTE STOP HEADER (จัดลำดับจากจุดที่อยู่ปัจจุบัน: ใกล้ ➔ ไกล) */}
                {routeStop && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-sky-500/20 to-blue-500/10 border border-sky-500/30 px-3 py-1.5 rounded-2xl mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-sky-500 text-slate-950 font-black text-xs flex items-center justify-center font-mono shadow-sm shrink-0">
                        {routeStop.stopNumber}
                      </span>
                      <span className="text-xs font-black text-sky-200 truncate">
                        {routeStop.stopNumber === 1 ? 'จุดที่ 1 (ใกล้คุณที่สุด)' : `จุดที่ ${routeStop.stopNumber}`}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono font-bold text-sky-300 text-right shrink-0">
                      {routeStop.distanceFromUserMeters !== null ? (
                        <span className="inline-flex items-center gap-1 bg-slate-950/70 px-2 py-0.5 rounded-lg border border-sky-500/25">
                          <span className="text-slate-400 font-normal text-[10px]">ห่างจากคุณ:</span>
                          <span className="text-emerald-400 font-black">
                            {formatDistance(routeStop.distanceFromUserMeters)}
                          </span>
                        </span>
                      ) : routeStop.distanceFromPrevMeters !== null ? (
                        <span>ห่างจากจุดก่อน: {formatDistance(routeStop.distanceFromPrevMeters)}</span>
                      ) : null}
                    </div>
                  </div>
                )}
                {/* ROW 1: BADGES & IDENTIFIERS */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Phase Badge */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border font-mono ${
                      is3Phase
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    }`}>
                      {item.phase}
                    </span>

                    {/* kVA Badge */}
                    <span className="text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-lg font-mono">
                      {item.kva} kVA
                    </span>

                    {/* Affected users badge */}
                    {item.affected > 0 && (
                      <span className="text-[10px] text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg font-mono">
                        กระทบ {item.affected} ราย
                      </span>
                    )}
                  </div>

                  {/* Village tag */}
                  <span className="text-[10px] text-slate-400 font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg truncate max-w-[130px]">
                    {item.village}
                  </span>
                </div>

                {/* ROW 2: PEA TR NO & LOCATION */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm sm:text-base font-black text-white font-mono tracking-tight">
                        {item.peano}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyDetails(item)}
                        className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                        title="คัดลอกข้อมูล"
                      >
                        {copiedId === item.peano ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 font-medium mt-0.5 leading-snug">
                      {item.location}
                    </p>
                  </div>
                </div>

                {/* ROW 3: STATUS SELECTION */}
                <div className="pt-2 border-t border-slate-800/80 mb-2.5">
                  <div className="flex items-center justify-between text-[11px] mb-1.5 font-bold">
                    <span className="text-slate-400">สถานะ:</span>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 ${
                        isCompleted
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : isInProgress
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {isCompleted && (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>สำรวจแล้ว</span>
                        </>
                      )}
                      {isInProgress && (
                        <>
                          <Zap className="w-3 h-3 text-sky-400 animate-pulse" />
                          <span>กำลังทำ</span>
                        </>
                      )}
                      {!isCompleted && !isInProgress && (
                        <>
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>ยังไม่สำรวจ</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-inner">
                    {/* ปุ่ม: ยังไม่สำรวจ */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(item.peano, 'ยังไม่สำรวจ')}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                        !isCompleted && !isInProgress
                          ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                          : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
                      }`}
                      title="ปรับสถานะเป็น ยังไม่สำรวจ"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">ยังไม่สำรวจ</span>
                    </button>

                    {/* ปุ่ม: กำลังดำเนินการ */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(item.peano, 'กำลังดำเนินการ')}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                        isInProgress
                          ? 'bg-sky-500 text-slate-950 font-black shadow-md'
                          : 'text-slate-400 hover:text-sky-300 hover:bg-slate-900'
                      }`}
                      title="ปรับสถานะเป็น กำลังดำเนินการ"
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">กำลังทำ</span>
                    </button>

                    {/* ปุ่ม: สำรวจแล้ว */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(item.peano, 'สำรวจแล้ว')}
                      className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 ${
                        isCompleted
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                          : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-900'
                      }`}
                      title="ปรับสถานะเป็น สำรวจแล้ว"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">สำรวจแล้ว</span>
                    </button>
                  </div>
                </div>

                {/* ROW 4: ACTION LINKS & UTILITIES */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
                  {/* Direct Driving Navigation link */}
                  {item.latitude && item.longitude && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition-all font-bold active:scale-95"
                      title="เริ่มนำทาง GPS ด้วยรถยนต์ไปยังหม้อแปลงนี้"
                    >
                      <Navigation className="w-3 h-3 text-sky-400" />
                      <span>นำทางไปจุดนี้</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}

                  {/* Copy Latitude & Longitude Button */}
                  {item.latitude && item.longitude && (
                    <button
                      type="button"
                      onClick={() => {
                        const str = `${item.latitude}, ${item.longitude}`;
                        navigator.clipboard?.writeText(str);
                        showToast(`📋 คัดลอกละติจูด ลองติจูด ${item.peano} เรียบร้อย: ${str}`);
                      }}
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl bg-slate-950 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-slate-800 hover:border-amber-400 transition-all font-bold cursor-pointer active:scale-95"
                      title="คัดลอกละติจูด ลองติจูด ของหม้อแปลงลูกนี้"
                    >
                      <Copy className="w-3 h-3 text-amber-400" />
                      <span>คัดลอกพิกัด</span>
                    </button>
                  )}

                  {/* Google Maps search link */}
                  {item.latitude && item.longitude && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-sky-300 border border-slate-800 hover:border-sky-500/30 transition-all font-bold"
                    >
                      <MapPin className="w-3 h-3 text-sky-400" />
                      <span>เปิด Maps</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}

                  {/* Meter Sheets link */}
                  {item.meter && (
                    <a
                      href={item.meter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-slate-800 hover:border-emerald-500/30 transition-all font-bold"
                      title="ดูตารางข้อมูล Meter ต่อหม้อแปลง"
                    >
                      <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                      <span>ข้อมูล Meter</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}

                  {/* Image / Plan link */}
                  {item.plan && (
                    <a
                      href={`https://drive.google.com/file/d/${item.plan}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-purple-300 border border-slate-800 hover:border-purple-500/30 transition-all font-bold"
                      title="ดูแผนผังหม้อแปลง"
                    >
                      <FileText className="w-3 h-3 text-purple-400" />
                      <span>แผนผัง</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                    </a>
                  )}

                  {/* LatLong text pill */}
                  {item.latlong && (
                    <span className="text-[10px] text-slate-500 font-mono py-1 px-2 bg-slate-950/60 rounded-xl truncate max-w-[150px]">
                      {item.latlong}
                    </span>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
