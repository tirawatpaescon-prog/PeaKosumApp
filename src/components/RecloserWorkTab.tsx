import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  CircleDot,
  RotateCcw,
  Sparkles,
  Share2,
  Navigation,
  Route,
  LocateFixed,
  Car,
  AlertTriangle,
  Info,
  Layers,
  Wrench,
  ChevronDown,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { STREETLIGHT_TRANSFORMERS, STREETLIGHT_VILLAGES, StreetlightTransformer } from '../data/streetlightSurveyData';
import { RecloserWorkStatusType } from '../types';
import {
  subscribeToRecloserWorkSurveys,
  setRecloserWorkStatus,
  bulkSetRecloserWorkStatuses
} from '../lib/firebase';
import {
  sequenceRoute,
  formatDistance,
  generateRecloserWorkSummaryText,
  RouteSortMode,
  TransformerCoord,
  getTransformerCoords
} from '../utils/routeSequencer';

const STORAGE_KEY = 'pea_recloser_work_status_v1';

interface RecloserWorkTabProps {
  initialVillage?: string;
}

export const RecloserWorkTab: React.FC<RecloserWorkTabProps> = ({ initialVillage }) => {
  // 1. Status state map for each transformer PEA number
  const [statusMap, setStatusMap] = useState<Record<string, { status: RecloserWorkStatusType; updatedAt: number }>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading cached recloser work statuses:', e);
    }
    // Default: all start at 'ยังไม่ดำเนินการ'
    const defaults: Record<string, { status: RecloserWorkStatusType; updatedAt: number }> = {};
    STREETLIGHT_TRANSFORMERS.forEach((item) => {
      defaults[item.peano] = {
        status: 'ยังไม่ดำเนินการ',
        updatedAt: Date.now()
      };
    });
    return defaults;
  });

  // Cloud/Server Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudConnected, setCloudConnected] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Subscribe to Real-time Firebase Firestore updates
  useEffect(() => {
    setIsSyncing(true);

    const unsubscribe = subscribeToRecloserWorkSurveys(
      (remoteStatuses) => {
        setIsSyncing(false);
        setCloudConnected(true);
        setLastSyncTime(new Date());

        setStatusMap((prev) => {
          const remoteKeys = Object.keys(remoteStatuses);
          // If cloud has records, merge them
          if (remoteKeys.length > 0) {
            return {
              ...prev,
              ...remoteStatuses
            };
          }
          return prev;
        });
      },
      (err) => {
        console.warn('[Firebase] Recloser work sync operating in local/cached mode:', err);
        setCloudConnected(false);
        setIsSyncing(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Save to localStorage as local backup
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(statusMap));
    } catch (e) {
      console.error('Failed to persist recloser work statuses:', e);
    }
  }, [statusMap]);

  // 2. Filters & Search state
  const [activeFilter, setActiveFilter] = useState<'all' | RecloserWorkStatusType>('all');
  const [selectedVillage, setSelectedVillage] = useState<string>(initialVillage || 'all');
  const [searchPea, setSearchPea] = useState<string>('');

  // 3. Geolocation & Permissions State
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unsupported' | 'checking'>('checking');
  const [userLocation, setUserLocation] = useState<TransformerCoord | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // 4. Route Optimization Mode for "กำลังดำเนินการ"
  const [routeSortMode, setRouteSortMode] = useState<RouteSortMode>('nearest_chain');

  // 5. UI Feedback & Toast
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Trigger Toast Notification
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Check Geolocation Permission Status
  const checkPermission = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionStatus('unsupported');
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionStatus(result.state);
        result.onchange = () => {
          setPermissionStatus(result.state);
          if (result.state === 'granted') {
            requestUserLocation(false);
          }
        };
      } catch (e) {
        // Fallback if permissions query fails
        setPermissionStatus('prompt');
      }
    } else {
      setPermissionStatus('prompt');
    }
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Request & Fetch User GPS Location
  const requestUserLocation = useCallback((forcePrompt: boolean = true) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionStatus('unsupported');
      setLocationError('อุปกรณ์หรือบราวเซอร์ไม่รองรับ GPS');
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setPermissionStatus('granted');
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setLocationAccuracy(Math.round(pos.coords.accuracy));
        setLocationError(null);
        showToast('📍 อัปเดตพิกัด GPS ปัจจุบันเรียบร้อยแล้ว');
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionStatus('denied');
          setLocationError('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาเปิดสิทธิ์ในบราวเซอร์');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationError('ไม่สามารถระบุตำแหน่ง GPS ได้ในขณะนี้');
        } else if (err.code === err.TIMEOUT) {
          setLocationError('หมดเวลาในการค้นหาตำแหน่ง GPS กรุณาลองใหม่อีกครั้ง');
        } else {
          setLocationError(err.message || 'เกิดข้อผิดพลาดในการดึงพิกัด');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    );
  }, [showToast]);

  // Auto-request location once if user opens "กำลังดำเนินการ" and permission not denied
  useEffect(() => {
    if (activeFilter === 'กำลังดำเนินการ' && !userLocation && permissionStatus !== 'denied' && !isLocating) {
      requestUserLocation(false);
    }
  }, [activeFilter, userLocation, permissionStatus, isLocating, requestUserLocation]);

  // Update Status for single transformer
  const handleStatusChange = async (peano: string, newStatus: RecloserWorkStatusType, village?: string) => {
    const updatedAt = Date.now();
    // 1. Update local state immediately
    setStatusMap((prev) => ({
      ...prev,
      [peano]: { status: newStatus, updatedAt }
    }));

    // 2. Sync to Firestore Cloud
    try {
      await setRecloserWorkStatus(peano, newStatus, village);
    } catch (err) {
      console.warn('Firestore update fallback to server API:', err);
    }

    // 3. Also post to backend server API
    try {
      fetch('/api/recloser-work/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peano, status: newStatus, updatedAt })
      }).catch(() => {});
    } catch (e) {
      // Ignored
    }

    showToast(`ปรับสถานะ PEA ${peano} เป็น "${newStatus}"`);
  };

  // Reset all to "ยังไม่ดำเนินการ"
  const handleResetAll = async () => {
    const resetData: Record<string, { status: RecloserWorkStatusType; updatedAt: number }> = {};
    STREETLIGHT_TRANSFORMERS.forEach((item) => {
      resetData[item.peano] = {
        status: 'ยังไม่ดำเนินการ',
        updatedAt: Date.now()
      };
    });
    setStatusMap(resetData);
    setShowResetConfirm(false);

    try {
      await bulkSetRecloserWorkStatuses(resetData);
    } catch (e) {
      console.warn('Error bulk resetting in Firestore:', e);
    }

    try {
      fetch('/api/recloser-work/status/reset', { method: 'POST' }).catch(() => {});
    } catch (e) {}

    showToast('รีเซ็ตสถานะทั้งหมดเป็น "ยังไม่ดำเนินการ" เรียบร้อยแล้ว');
  };

  // Copy to Clipboard
  const handleCopy = (text: string, id: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      showToast(`คัดลอก ${label} แล้ว`);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // 6. Statistics Calculations
  const stats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let waitingImport = 0;
    let completed = 0;

    STREETLIGHT_TRANSFORMERS.forEach((tr) => {
      const st = statusMap[tr.peano]?.status || 'ยังไม่ดำเนินการ';
      if (st === 'ดำเนินการเสร็จสิ้น') completed++;
      else if (st === 'รอนำเข้าระบบ') waitingImport++;
      else if (st === 'กำลังดำเนินการ') inProgress++;
      else pending++;
    });

    const total = STREETLIGHT_TRANSFORMERS.length;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, pending, inProgress, waitingImport, completed, progressPercent };
  }, [statusMap]);

  // 7. Filter items by Search and Village
  const filteredBaseItems = useMemo(() => {
    const q = searchPea.trim().toLowerCase();

    return STREETLIGHT_TRANSFORMERS.filter((item) => {
      // Filter by Village
      if (selectedVillage !== 'all' && item.village !== selectedVillage) {
        return false;
      }

      // Filter by PEA Search (also checks location or extra)
      if (q) {
        const matchPea = item.peano.toLowerCase().includes(q);
        const matchLoc = item.location.toLowerCase().includes(q);
        const matchVillage = item.village.toLowerCase().includes(q);
        const matchKva = String(item.kva).includes(q);
        const matchExtra = item.extra ? item.extra.toLowerCase().includes(q) : false;
        if (!matchPea && !matchLoc && !matchVillage && !matchKva && !matchExtra) {
          return false;
        }
      }

      // Filter by Status Tab
      const currentStatus = statusMap[item.peano]?.status || 'ยังไม่ดำเนินการ';
      if (activeFilter !== 'all' && currentStatus !== activeFilter) {
        return false;
      }

      return true;
    });
  }, [searchPea, selectedVillage, activeFilter, statusMap]);

  // 8. Route Sequencing for "กำลังดำเนินการ" Category
  const inProgressRoutePlan = useMemo(() => {
    // Only compute route sequencing if we are in "กำลังดำเนินการ" or inspecting in-progress
    if (activeFilter === 'กำลังดำเนินการ') {
      return sequenceRoute(filteredBaseItems, routeSortMode, userLocation);
    }
    return null;
  }, [filteredBaseItems, routeSortMode, userLocation, activeFilter]);

  // Items to render
  const displayItems = useMemo(() => {
    if (activeFilter === 'กำลังดำเนินการ' && inProgressRoutePlan) {
      return inProgressRoutePlan.stops.map((stop) => stop.transformer);
    }
    return filteredBaseItems;
  }, [activeFilter, inProgressRoutePlan, filteredBaseItems]);

  return (
    <div className="w-full flex flex-col gap-3 pb-24 max-w-md mx-auto animate-fadeIn select-none">
      
      {/* TOAST ALERT */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900/95 text-amber-300 border border-amber-500/40 px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md text-xs font-bold flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. HEADER BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/30 p-4 sm:p-5 shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-36 h-36 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-bold mb-1.5">
              <Wrench className="w-3 h-3 text-amber-400 shrink-0" />
              <span>PEA Patrol Operations</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug flex items-center gap-2">
              <span>Patrol Work</span>
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                106 หม้อแปลง
              </span>
            </h1>
            <p className="text-xs text-slate-300 mt-1 font-medium">
              จัดการงาน Patrol • ค้นหาตาม PEA หม้อแปลง • คัดลอกละติจูด ลองติจูด • จัดเรียงเส้นทางคุ้มค่าที่สุด
            </p>
          </div>

          {/* Reset All Button */}
          <button
            id="btn-recloser-work-reset"
            type="button"
            onClick={() => setShowResetConfirm(true)}
            title="รีเซ็ตสถานะทั้งหมด"
            className="shrink-0 p-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-700/60 transition-all active:scale-95 cursor-pointer shadow-md"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Status Counters Bar */}
        <div className="mt-3.5 pt-3 border-t border-amber-500/20 grid grid-cols-4 gap-1.5 text-center">
          <div 
            onClick={() => setActiveFilter('ยังไม่ดำเนินการ')}
            className={`p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'ยังไม่ดำเนินการ'
                ? 'bg-slate-800/90 border-sky-400/50 shadow-md ring-1 ring-sky-400/40'
                : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60'
            }`}
          >
            <div className="text-[9.5px] sm:text-[10px] font-bold text-sky-300 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>1. ยังไม่เริ่ม</span>
            </div>
            <div className="text-base font-black text-sky-200 font-mono mt-0.5">
              {stats.pending}
            </div>
          </div>

          <div 
            onClick={() => setActiveFilter('กำลังดำเนินการ')}
            className={`p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'กำลังดำเนินการ'
                ? 'bg-amber-950/60 border-amber-400/60 shadow-md ring-1 ring-amber-400/40'
                : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60'
            }`}
          >
            <div className="text-[9.5px] sm:text-[10px] font-bold text-amber-300 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>2. กำลังทำ</span>
            </div>
            <div className="text-base font-black text-amber-300 font-mono mt-0.5">
              {stats.inProgress}
            </div>
          </div>

          <div 
            onClick={() => setActiveFilter('รอนำเข้าระบบ')}
            className={`p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'รอนำเข้าระบบ'
                ? 'bg-purple-950/60 border-purple-400/60 shadow-md ring-1 ring-purple-400/40'
                : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60'
            }`}
          >
            <div className="text-[9.5px] sm:text-[10px] font-bold text-purple-300 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span>3. รอนำเข้า</span>
            </div>
            <div className="text-base font-black text-purple-300 font-mono mt-0.5">
              {stats.waitingImport}
            </div>
          </div>

          <div 
            onClick={() => setActiveFilter('ดำเนินการเสร็จสิ้น')}
            className={`p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer ${
              activeFilter === 'ดำเนินการเสร็จสิ้น'
                ? 'bg-emerald-950/60 border-emerald-400/60 shadow-md ring-1 ring-emerald-400/40'
                : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60'
            }`}
          >
            <div className="text-[9.5px] sm:text-[10px] font-bold text-emerald-300 flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>4. เสร็จสิ้น</span>
            </div>
            <div className="text-base font-black text-emerald-300 font-mono mt-0.5">
              {stats.completed}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
            <span>ความคืบหน้ารวม</span>
            <span className="text-emerald-400 font-mono">{stats.progressPercent}% ({stats.completed}/{stats.total})</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. GEOLOCATION PERMISSION & GPS STATUS CARD */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3.5 shadow-md">
        {permissionStatus === 'denied' ? (
          <div className="flex flex-col gap-2 bg-rose-950/30 border border-rose-500/40 rounded-2xl p-3">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>ไม่ได้อนุญาตการเข้าถึงพิกัด GPS</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              ระบบต้องการพิกัดปัจจุบันเพื่อจัดลำดับหม้อแปลงที่กำลังดำเนินการจากจุดที่คุณยืนอยู่
              กรุณาเปิดสิทธิ์: แตะไอคอนแม่กุญแจที่แถบ URL ➔ การตั้งค่าไซต์ ➔ อนุญาตตำแหน่งที่ตั้ง
            </p>
            <button
              id="btn-recloser-retry-gps"
              type="button"
              onClick={() => requestUserLocation(true)}
              className="mt-1 py-1.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>ลองขอสิทธิ์ใหม่อีกครั้ง</span>
            </button>
          </div>
        ) : !userLocation ? (
          <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <LocateFixed className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-300 truncate">
                  ขอสิทธิ์เข้าถึงพิกัด GPS ตำแหน่งปัจจุบัน
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  เพื่อจัดเรียงลำดับจากจุดที่คุณอยู่ไปยังหม้อแปลงที่ใกล้ที่สุด
                </div>
              </div>
            </div>

            <button
              id="btn-recloser-request-gps"
              type="button"
              onClick={() => requestUserLocation(true)}
              disabled={isLocating}
              className="py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shrink-0 transition-all active:scale-95 cursor-pointer shadow disabled:opacity-50"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'กำลังค้นหา...' : 'ขอสิทธิ์ GPS'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-emerald-500/30 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-emerald-300 truncate flex items-center gap-1">
                  <span>พิกัดปัจจุบัน:</span>
                  <span className="font-mono text-white text-xs">{userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}</span>
                </div>
                {locationAccuracy !== null && (
                  <div className="text-[9px] text-slate-400">
                    ความแม่นยำ: ±{locationAccuracy} ม. (อ้างอิงตำแหน่งปัจจุบันของคุณในเวลานี้)
                  </div>
                )}
              </div>
            </div>

            <button
              id="btn-recloser-refresh-gps"
              type="button"
              onClick={() => requestUserLocation(true)}
              disabled={isLocating}
              className="py-1 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all active:scale-95 cursor-pointer"
            >
              <LocateFixed className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
              <span>รีเฟรช GPS</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. SEARCH & FILTERS SECTION */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 flex flex-col gap-2.5 shadow-md">
        
        {/* PEA Transformer Search Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-amber-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="input-recloser-search-pea"
            type="text"
            value={searchPea}
            onChange={(e) => setSearchPea(e.target.value)}
            placeholder="ค้นหาตาม PEA หม้อแปลง (เช่น 20-001352)..."
            className="w-full pl-9 pr-9 py-2.5 bg-slate-950/80 border border-slate-800 focus:border-amber-400/80 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400/50 transition-all font-mono"
          />
          {searchPea && (
            <button
              type="button"
              onClick={() => setSearchPea('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Village Dropdown Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              id="select-recloser-village"
              value={selectedVillage}
              onChange={(e) => setSelectedVillage(e.target.value)}
              className="w-full py-2 pl-3 pr-8 bg-slate-950/80 border border-slate-800 focus:border-amber-400/80 rounded-xl text-xs text-slate-200 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="all">🏘️ ทุกหมู่บ้าน (23 หมู่บ้าน)</option>
              {STREETLIGHT_VILLAGES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {selectedVillage !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedVillage('all')}
              className="px-2 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs shrink-0 cursor-pointer"
            >
              ล้าง
            </button>
          )}
        </div>

        {/* Status Filter Segmented Buttons */}
        <div className="grid grid-cols-5 gap-1 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80 text-[10px] sm:text-[11px] font-bold">
          <button
            id="filter-recloser-all"
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ทั้งหมด ({stats.total})
          </button>
          <button
            id="filter-recloser-pending"
            type="button"
            onClick={() => setActiveFilter('ยังไม่ดำเนินการ')}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              activeFilter === 'ยังไม่ดำเนินการ'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            1.ยังไม่เริ่ม ({stats.pending})
          </button>
          <button
            id="filter-recloser-inprogress"
            type="button"
            onClick={() => setActiveFilter('กำลังดำเนินการ')}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              activeFilter === 'กำลังดำเนินการ'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            2.กำลังทำ ({stats.inProgress})
          </button>
          <button
            id="filter-recloser-waiting-import"
            type="button"
            onClick={() => setActiveFilter('รอนำเข้าระบบ')}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              activeFilter === 'รอนำเข้าระบบ'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            3.รอนำเข้า ({stats.waitingImport})
          </button>
          <button
            id="filter-recloser-completed"
            type="button"
            onClick={() => setActiveFilter('ดำเนินการเสร็จสิ้น')}
            className={`py-1.5 rounded-xl transition-all cursor-pointer ${
              activeFilter === 'ดำเนินการเสร็จสิ้น'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            4.เสร็จ ({stats.completed})
          </button>
        </div>
      </div>

      {/* 4. OPTIMIZED ROUTE CONTROLS FOR "กำลังดำเนินการ" */}
      {activeFilter === 'กำลังดำเนินการ' && inProgressRoutePlan && inProgressRoutePlan.stops.length > 0 && (
        <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-3.5 shadow-xl flex flex-col gap-3">
          
          <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <Route className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black text-amber-300 truncate">
                  จัดลำดับเส้นทางจากจุดที่คุณอยู่ (ใกล้ ➔ ไกล)
                </h3>
                <p className="text-[10px] text-slate-400 truncate">
                  อ้างอิงจุดเริ่มต้นของผู้ใช้งานในเวลานี้ • คำนวณระยะทางที่คุ้มค่าที่สุด
                </p>
              </div>
            </div>

            <div className="shrink-0 bg-amber-500/20 text-amber-300 text-xs font-black font-mono px-2 py-0.5 rounded-full border border-amber-500/30">
              {inProgressRoutePlan.stops.length} จุด
            </div>
          </div>

          {/* Mode Switcher: คุ้มค่าที่สุด (แวะต่อเนื่อง) vs เรียงตรงใกล้ไปไกล */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/90 rounded-2xl border border-slate-800 text-[11px] font-bold">
            <button
              id="btn-recloser-sort-chain"
              type="button"
              onClick={() => setRouteSortMode('nearest_chain')}
              className={`py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                routeSortMode === 'nearest_chain'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Car className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">เส้นทางคุ้มค่าที่สุด (แวะต่อเนื่อง)</span>
            </button>

            <button
              id="btn-recloser-sort-direct"
              type="button"
              onClick={() => setRouteSortMode('nearest_from_user')}
              className={`py-2 px-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                routeSortMode === 'nearest_from_user'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">เรียงตรง (ใกล้ ➔ ไกล)</span>
            </button>
          </div>

          {/* Route Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800/80">
            <div>
              <div className="text-[10px] text-slate-400">ใกล้ที่สุด</div>
              <div className="text-xs font-black text-emerald-400 font-mono mt-0.5">
                {formatDistance(inProgressRoutePlan.closestDistanceMeters)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">ไกลที่สุด</div>
              <div className="text-xs font-black text-amber-400 font-mono mt-0.5">
                {formatDistance(inProgressRoutePlan.farthestDistanceMeters)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">ระยะทางรวม</div>
              <div className="text-xs font-black text-sky-400 font-mono mt-0.5">
                {formatDistance(inProgressRoutePlan.totalDistanceMeters)}
              </div>
            </div>
          </div>

          {/* Action Buttons: Open Maps & Share LINE */}
          <div className="grid grid-cols-2 gap-2">
            {inProgressRoutePlan.googleMapsUrl ? (
              <a
                id="btn-recloser-open-maps"
                href={inProgressRoutePlan.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span className="truncate">เปิด Maps นำทางทั้งเส้น</span>
              </a>
            ) : (
              <button
                disabled
                className="py-2.5 px-3 rounded-2xl bg-slate-800 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed"
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span>ไม่มีพิกัดแผนที่</span>
              </button>
            )}

            <button
              id="btn-recloser-copy-line"
              type="button"
              onClick={() => {
                const text = generateRecloserWorkSummaryText(inProgressRoutePlan, selectedVillage, routeSortMode);
                handleCopy(text, 'line_summary', 'สรุปแผนงานส่ง LINE');
              }}
              className="py-2.5 px-3 rounded-2xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow"
            >
              <Share2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">คัดลอกส่ง LINE</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. LIST OF TRANSFORMERS */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <span className="font-bold text-slate-300">
          รายการหม้อแปลง ({displayItems.length} เครื่อง)
        </span>
        {activeFilter === 'กำลังดำเนินการ' && (
          <span className="text-[11px] text-amber-400 font-medium">
            ⚡ เรียงจากใกล้สุดไปไกลสุด
          </span>
        )}
      </div>

      {displayItems.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-300">ไม่พบรายการหม้อแปลง</div>
          <div className="text-xs text-slate-500 max-w-xs">
            ลองปรับคำค้นหาตาม PEA หม้อแปลง หรือเลือกตัวกรองสถานะ/หมู่บ้านอื่น
          </div>
          {(searchPea || selectedVillage !== 'all' || activeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchPea('');
                setSelectedVillage('all');
                setActiveFilter('all');
              }}
              className="mt-2 py-1.5 px-3 rounded-xl bg-slate-800 text-amber-300 text-xs font-bold cursor-pointer"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {displayItems.map((item, index) => {
            const currentStatus = statusMap[item.peano]?.status || 'ยังไม่ดำเนินการ';
            const coords = getTransformerCoords(item);

            // Find route stop info if in-progress plan exists
            const routeStop = inProgressRoutePlan?.stops.find((s) => s.transformer.peano === item.peano);

            return (
              <div
                key={item.peano}
                id={`card-recloser-${item.peano}`}
                className={`rounded-3xl border p-4 transition-all duration-200 shadow-md ${
                  currentStatus === 'ดำเนินการเสร็จสิ้น'
                    ? 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-500/50'
                    : currentStatus === 'รอนำเข้าระบบ'
                    ? 'bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-950 border-purple-500/50 hover:border-purple-400 shadow-purple-950/20'
                    : currentStatus === 'กำลังดำเนินการ'
                    ? 'bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-950 border-amber-500/50 hover:border-amber-400 shadow-amber-950/20'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* IN-PROGRESS ROUTE STOP HEADER */}
                {routeStop && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-amber-500/20 to-orange-500/10 border border-amber-500/40 px-3 py-1.5 rounded-2xl mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                        {routeStop.stopNumber}
                      </span>
                      <span className="text-xs font-black text-amber-200 truncate">
                        {routeStop.stopNumber === 1 ? 'จุดที่ 1 (ใกล้คุณที่สุด)' : `จุดที่ ${routeStop.stopNumber}`}
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-amber-300 shrink-0">
                      {routeStop.distanceFromUserMeters !== null ? (
                        <span className="inline-flex items-center gap-1 bg-slate-950/70 px-2 py-0.5 rounded-lg border border-amber-500/30">
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

                {/* Card Title & Specs */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-black text-amber-300 font-mono tracking-wide bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-xl">
                        PEA {item.peano}
                      </span>
                      <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-lg">
                        {item.kva} kVA
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.phase}
                      </span>
                      {currentStatus === 'กำลังดำเนินการ' && (
                        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          2. กำลังดำเนินการ
                        </span>
                      )}
                      {currentStatus === 'รอนำเข้าระบบ' && (
                        <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          3. รอนำเข้าระบบ
                        </span>
                      )}
                      {currentStatus === 'ดำเนินการเสร็จสิ้น' && (
                        <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          4. ดำเนินการเสร็จสิ้น
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-white leading-snug mt-1">
                      {item.location}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      🏘️ {item.village} • ผู้ใช้ไฟกระทบ: <span className="font-mono text-amber-300 font-bold">{item.affected}</span> ราย
                    </p>
                  </div>

                  {/* Single Stop Navigation Shortcut */}
                  {coords && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="นำทางไปยังหม้อแปลงนี้ด้วย Google Maps"
                      className="p-2.5 rounded-2xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-300 border border-slate-700 transition-all active:scale-95 cursor-pointer shrink-0 shadow"
                    >
                      <Navigation className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {/* Coordinates & Dedicated Copy Lat/Lng Button */}
                {coords ? (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800/90 shadow-inner">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                          <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <div className="font-mono text-xs text-slate-300 truncate">
                          <div className="text-[10px] text-slate-400 font-sans font-medium">พิกัด GPS หม้อแปลง</div>
                          <span className="text-amber-300 font-bold">{coords.lat.toFixed(6)}</span>
                          <span className="text-slate-500 mx-1">,</span>
                          <span className="text-amber-300 font-bold">{coords.lng.toFixed(6)}</span>
                        </div>
                      </div>

                      {/* Prominent Copy Latitude/Longitude Button */}
                      <button
                        id={`btn-copy-latlng-${item.peano}`}
                        type="button"
                        onClick={() => handleCopy(`${coords.lat}, ${coords.lng}`, `coord-${item.peano}`, 'ละติจูด ลองติจูด')}
                        className={`w-full sm:w-auto px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 border ${
                          copiedId === `coord-${item.peano}`
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-emerald-500/20'
                            : 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border-amber-500/40 hover:border-amber-400 shadow-amber-950/20'
                        }`}
                        title="คัดลอกละติจูดและลองติจูดของหม้อแปลงลูกนี้"
                      >
                        {copiedId === `coord-${item.peano}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0 text-slate-950" />
                            <span>คัดลอกพิกัดแล้ว!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 shrink-0" />
                            <span>คัดลอกละติจูด ลองติจูด</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick navigation and maps buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-2.5 rounded-xl bg-slate-900/90 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        title="เปิด Google Maps ขับรถนำทางไปยังหม้อแปลงลูกนี้"
                      >
                        <Navigation className="w-3 h-3 text-emerald-400" />
                        <span>นำทาง GPS</span>
                      </a>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        title="เปิดดูตำแหน่งหม้อแปลงบนแผนที่ Google Maps"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                        <span>เปิดแผนที่ Maps</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500 italic">
                    ไม่มีข้อมูลพิกัดละติจูด ลองติจูด
                  </div>
                )}

                {/* 4 STATUS ACTION BUTTONS (ยังไม่ดำเนินการ, กำลังดำเนินการ, รอนำเข้าระบบ, ดำเนินการเสร็จสิ้น) */}
                <div className="mt-3 pt-3 border-t border-slate-800/80">
                  <div className="text-[10px] font-bold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>ปรับสถานะการดำเนินงาน (1 ➔ 2 ➔ 3 ➔ 4):</span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {statusMap[item.peano]?.updatedAt ? new Date(statusMap[item.peano].updatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {/* STATUS : ยังไม่ดำเนินการ */}
                    <button
                      id={`btn-status-pending-${item.peano}`}
                      type="button"
                      onClick={() => handleStatusChange(item.peano, 'ยังไม่ดำเนินการ', item.village)}
                      className={`py-2 px-1 rounded-2xl text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center text-center border ${
                        currentStatus === 'ยังไม่ดำเนินการ'
                          ? 'bg-sky-500 text-slate-950 border-sky-400 font-black shadow-md'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-sky-300'
                      }`}
                    >
                      <span className="truncate max-w-full">ยังไม่ดำเนินการ</span>
                    </button>

                    {/* STATUS : กำลังดำเนินการ */}
                    <button
                      id={`btn-status-inprogress-${item.peano}`}
                      type="button"
                      onClick={() => handleStatusChange(item.peano, 'กำลังดำเนินการ', item.village)}
                      className={`py-2 px-1 rounded-2xl text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center text-center border ${
                        currentStatus === 'กำลังดำเนินการ'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-amber-300'
                      }`}
                    >
                      <span className="truncate max-w-full">กำลังดำเนินการ</span>
                    </button>

                    {/* STATUS : รอนำเข้าระบบ */}
                    <button
                      id={`btn-status-waiting-import-${item.peano}`}
                      type="button"
                      onClick={() => handleStatusChange(item.peano, 'รอนำเข้าระบบ', item.village)}
                      className={`py-2 px-1 rounded-2xl text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center text-center border ${
                        currentStatus === 'รอนำเข้าระบบ'
                          ? 'bg-purple-600 text-white border-purple-400 font-black shadow-md shadow-purple-900/30'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-purple-300'
                      }`}
                    >
                      <span className="truncate max-w-full">รอนำเข้าระบบ</span>
                    </button>

                    {/* STATUS : ดำเนินการเสร็จสิ้น */}
                    <button
                      id={`btn-status-completed-${item.peano}`}
                      type="button"
                      onClick={() => handleStatusChange(item.peano, 'ดำเนินการเสร็จสิ้น', item.village)}
                      className={`py-2 px-1 rounded-2xl text-[10.5px] sm:text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center justify-center text-center border ${
                        currentStatus === 'ดำเนินการเสร็จสิ้น'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-md'
                          : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-emerald-300'
                      }`}
                    >
                      <span className="truncate max-w-full">ดำเนินการเสร็จสิ้น</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL FOR RESET ALL */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full shadow-2xl flex flex-col gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-black text-white">รีเซ็ตสถานะทั้งหมด?</h3>
              <p className="text-xs text-slate-400 mt-1">
                การกระทำนี้จะเปลี่ยนสถานะหม้อแปลงทั้ง 106 เครื่อง ให้กลับเป็น "ยังไม่ดำเนินการ"
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black hover:bg-amber-400 cursor-pointer shadow"
              >
                ยืนยันรีเซ็ต
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
