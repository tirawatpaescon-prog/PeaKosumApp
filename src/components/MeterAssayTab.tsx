import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Compass,
  MapPin,
  Search,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Navigation,
  Sparkles,
  Share2,
  Trash2,
  RefreshCw,
  LocateFixed,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  ListFilter,
  Layers,
  ArrowUpDown,
  PlusCircle,
  FileSpreadsheet,
  CheckCircle,
  X
} from 'lucide-react';
import {
  ActiveTab,
  IndexedRecord,
  MeterAssayItem,
  MeterAssayMeasureId,
  MeterAssayMeasureMeta,
  MeterAssayStatusType
} from '../types';
import { calculateHaversineDistanceMeters, formatDistance } from '../utils/routeSequencer';
import {
  subscribeToMeterAssayRecords,
  saveMeterAssayItemToFirestore,
  bulkSaveMeterAssayItemsToFirestore,
  deleteMeterAssayItemFromFirestore,
  deleteBatchMeterAssayItemsFromFirestore
} from '../lib/firebase';

const STORAGE_KEY = 'pea_meter_assay_items_v1';

// Definition of the 6 Measures requested by user
export const MEASURE_METAS: MeterAssayMeasureMeta[] = [
  {
    id: 'm1',
    name: 'มาตรการณ์ 1',
    shortName: 'ม.1',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ 1 (กลุ่มเร่งด่วน/ผิดปกติ)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    accentColor: '#f59e0b'
  },
  {
    id: 'm2',
    name: 'มาตรการณ์ 2',
    shortName: 'ม.2',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ 2 (กลุ่มหมุนช้า/หน่วยเป็นศูนย์)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    accentColor: '#10b981'
  },
  {
    id: 'm3',
    name: 'มาตรการณ์ 3',
    shortName: 'ม.3',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ 3 (กลุ่มละเมิด/ดัดแปลง)',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    accentColor: '#f43f5e'
  },
  {
    id: 'm8',
    name: 'มาตรการณ์ 8',
    shortName: 'ม.8',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ 8 (กลุ่มหนี้ค้าง/งดจ่ายไฟ)',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    accentColor: '#a855f7'
  },
  {
    id: 'mn1',
    name: 'มาตรการณ์ N1',
    shortName: 'ม.N1',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ N1 (งานสุ่มตรวจพิเศษ)',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    accentColor: '#06b6d4'
  },
  {
    id: 'mn2',
    name: 'มาตรการณ์ N2',
    shortName: 'ม.N2',
    description: 'ตรวจสอบมิเตอร์ตามมาตรการณ์ N2 (งานตรวจสอบตามแผนงาน)',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    accentColor: '#3b82f6'
  }
];

interface MeterAssayTabProps {
  indexedRecords: IndexedRecord[];
  onNavigateHome?: () => void;
}

export const MeterAssayTab: React.FC<MeterAssayTabProps> = ({
  indexedRecords,
  onNavigateHome
}) => {
  // Current active sub-tab: 'dashboard' or one of the 6 measures
  const [selectedSubTab, setSelectedSubTab] = useState<'dashboard' | MeterAssayMeasureId>('dashboard');

  // Master items stored in local state
  const [items, setItems] = useState<MeterAssayItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Could not read cached meter assay items:', e);
    }
    return [];
  });

  // Sync / Cloud state
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [isCloudOnline, setIsCloudOnline] = useState<boolean>(true);
  const [lastCloudSync, setLastCloudSync] = useState<Date | null>(null);

  // User GPS Location State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Multi-input search state inside a measure
  const [multiSearchText, setMultiSearchText] = useState<string>('');
  const [searchFeedback, setSearchFeedback] = useState<{
    foundCount: number;
    notFoundTokens: string[];
  } | null>(null);

  // Status Filter within measure
  const [statusFilter, setStatusFilter] = useState<'all' | MeterAssayStatusType>('all');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Save to LocalStorage whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Error caching meter assay items:', e);
    }
  }, [items]);

  // Real-time Firestore Sync
  useEffect(() => {
    setIsCloudSyncing(true);
    const unsubscribe = subscribeToMeterAssayRecords(
      (remoteItems) => {
        setIsCloudSyncing(false);
        setIsCloudOnline(true);
        setLastCloudSync(new Date());

        setItems((prev) => {
          if (!remoteItems || remoteItems.length === 0) return prev;
          // Merge by item ID, preferring newer updatedAt
          const map = new Map<string, MeterAssayItem>();
          prev.forEach((it) => map.set(it.id, it));
          remoteItems.forEach((rem) => {
            const cur = map.get(rem.id);
            if (!cur || rem.updatedAt >= cur.updatedAt) {
              map.set(rem.id, rem);
            }
          });
          return Array.from(map.values());
        });
      },
      (err) => {
        console.warn('[Firebase] MeterAssay offline mode:', err);
        setIsCloudSyncing(false);
        setIsCloudOnline(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Request User GPS location
  const requestLocation = useCallback((quiet = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('อุปกรณ์ไม่รองรับระบบตรวจจับพิกัด GPS');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
        setGpsAccuracy(Math.round(pos.coords.accuracy));
        if (!quiet) {
          showToast(`📍 อัปเดตพิกัด GPS สำเร็จ (ความแม่นยำ ±${Math.round(pos.coords.accuracy)} ม.)`);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณากดอนุญาตในบราวเซอร์');
        } else if (err.code === err.TIMEOUT) {
          setGpsError('หมดเวลาในการค้นหาตำแหน่ง GPS');
        } else {
          setGpsError('ไม่สามารถระบุพิกัด GPS ได้');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000
      }
    );
  }, [showToast]);

  // Request location automatically on mount
  useEffect(() => {
    requestLocation(true);
  }, [requestLocation]);

  // Multi-search handler: parses text, looks up in indexedRecords, adds to current measure
  const handleBatchAddMeters = () => {
    if (!selectedSubTab || selectedSubTab === 'dashboard') return;
    const raw = multiSearchText.trim();
    if (!raw) return;

    // Split text by newlines, commas, semicolons, tabs, spaces
    const tokens = raw
      .split(/[\r\n,;\t\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (tokens.length === 0) return;

    const matchedItems: MeterAssayItem[] = [];
    const notFoundTokens: string[] = [];
    const measureId = selectedSubTab;

    // Set of existing item IDs for this measure to prevent duplicates
    const existingKeys = new Set(
      items
        .filter((it) => it.measureId === measureId)
        .map((it) => `${it.ca}_${it.meter}`.toLowerCase())
    );

    tokens.forEach((tok) => {
      const cleanTok = tok.toLowerCase();
      const pureDigits = tok.replace(/[^0-9]/g, '');

      // Search matching record in indexedRecords
      const found = indexedRecords.find((rec) => {
        // Direct match with CA
        if (rec.pureCaDigits && pureDigits && rec.pureCaDigits === pureDigits) return true;
        if (rec.compactFields.ca && rec.compactFields.ca.toLowerCase() === cleanTok) return true;
        if (rec.rowCaLower.includes(cleanTok)) return true;

        // Direct match with Meter
        if (rec.pureMeterDigits && pureDigits && rec.pureMeterDigits === pureDigits) return true;
        if (rec.compactFields.meter && rec.compactFields.meter.toLowerCase() === cleanTok) return true;
        if (rec.rowMeterLower.includes(cleanTok)) return true;

        return false;
      });

      if (found) {
        const caVal = found.compactFields.ca || '';
        const meterVal = found.compactFields.meter || '';
        const key = `${caVal}_${meterVal}`.toLowerCase();

        if (!existingKeys.has(key)) {
          existingKeys.add(key);

          const latNum = found.lat ? parseFloat(found.lat) : null;
          const lonNum = found.lon ? parseFloat(found.lon) : null;

          const newItem: MeterAssayItem = {
            id: `${measureId}_${caVal || meterVal || Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            measureId,
            meter: meterVal,
            ca: caVal,
            fullName: found.compactFields.fullName || 'ผู้ใช้ไฟ PEA',
            address: found.compactFields.address || '-',
            phone: found.compactFields.phone || '',
            route: found.compactFields.route || '',
            lat: latNum && !isNaN(latNum) ? latNum : null,
            lon: lonNum && !isNaN(lonNum) ? lonNum : null,
            status: 'รอดำเนินการ',
            addedAt: Date.now(),
            updatedAt: Date.now()
          };

          matchedItems.push(newItem);
        }
      } else {
        if (!notFoundTokens.includes(tok)) {
          notFoundTokens.push(tok);
        }
      }
    });

    if (matchedItems.length > 0) {
      setItems((prev) => [...matchedItems, ...prev]);

      // Save to Firestore
      bulkSaveMeterAssayItemsToFirestore(matchedItems).catch((err) => {
        console.warn('Firestore bulk save fallback to local:', err);
      });

      showToast(`✅ เพิ่มมิเตอร์ใน ${MEASURE_METAS.find((m) => m.id === measureId)?.name} สำเร็จ ${matchedItems.length} เครื่อง`);
      setMultiSearchText('');
    } else if (notFoundTokens.length > 0) {
      showToast(`⚠️ ไม่พบข้อมูลสำหรับ ${notFoundTokens.length} รหัสที่ระบุ`);
    }

    setSearchFeedback({
      foundCount: matchedItems.length,
      notFoundTokens
    });
  };

  // Insert Quick Demo Meters into current measure
  const handleInsertSampleMeters = () => {
    if (!selectedSubTab || selectedSubTab === 'dashboard') return;
    const measureId = selectedSubTab;

    // Pick 3-5 sample records from indexedRecords
    const available = indexedRecords.filter((r) => r.lat && r.lon && (r.compactFields.meter || r.compactFields.ca));
    const samples = available.slice(0, 4);

    if (samples.length === 0) {
      showToast('⚠️ ไม่พบข้อมูลตัวอย่างในระบบ');
      return;
    }

    const sampleTokens = samples.map((s) => s.compactFields.meter || s.compactFields.ca).join('\n');
    setMultiSearchText(sampleTokens);
  };

  // Status Change handler: 'นำทาง' | 'กำลังดำเนินการ' | 'เสร็จสิ้น'
  const handleUpdateStatus = async (item: MeterAssayItem, newStatus: MeterAssayStatusType) => {
    const updatedAt = Date.now();
    const updatedItem: MeterAssayItem = {
      ...item,
      status: newStatus,
      updatedAt
    };

    // 1. Update local state
    setItems((prev) => prev.map((it) => (it.id === item.id ? updatedItem : it)));

    // 2. If 'นำทาง' was chosen, open Google Maps directions automatically
    if (newStatus === 'นำทาง' && item.lat && item.lon) {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}`;
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
      showToast(`🗺️ เปิด Google Maps นำทางไปยังมิเตอร์ ${item.meter || item.ca}`);
    } else {
      showToast(`เปลี่ยนสถานะเป็น "${newStatus}" เรียบร้อย`);
    }

    // 3. Sync to Firestore Cloud
    try {
      await saveMeterAssayItemToFirestore(updatedItem);
    } catch (err) {
      console.warn('Firestore status update error:', err);
    }
  };

  // Delete single item
  const handleDeleteItem = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    showToast('ลบรายการเรียบร้อย');
    try {
      await deleteMeterAssayItemFromFirestore(id);
    } catch (e) {
      console.warn('Error deleting from Firestore:', e);
    }
  };

  // Clear all items in current measure
  const handleClearCurrentMeasure = async () => {
    if (!selectedSubTab || selectedSubTab === 'dashboard') return;
    const measureMeta = MEASURE_METAS.find((m) => m.id === selectedSubTab);
    if (!confirm(`คุณต้องการลบมิเตอร์ทั้งหมดใน "${measureMeta?.name}" หรือไม่?`)) return;

    const measureItems = items.filter((it) => it.measureId === selectedSubTab);
    const ids = measureItems.map((it) => it.id);

    setItems((prev) => prev.filter((it) => it.measureId !== selectedSubTab));
    showToast(`ล้างรายการใน ${measureMeta?.name} แล้ว`);

    try {
      await deleteBatchMeterAssayItemsFromFirestore(ids);
    } catch (e) {
      console.warn(e);
    }
  };

  // Copy Single Meter Location
  const handleCopyCoord = (lat: number | null, lon: number | null, label: string) => {
    if (!lat || !lon) {
      showToast('⚠️ มิเตอร์นี้ไม่มีพิกัดในระบบ');
      return;
    }
    const text = `${lat},${lon}`;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`คัดลอกพิกัด ${label}: ${text}`);
    });
  };

  // Sorted items for current measure: Nearest first using user GPS
  const currentMeasureItemsWithDistance = useMemo(() => {
    if (!selectedSubTab || selectedSubTab === 'dashboard') return [];

    const measureItems = items.filter((it) => it.measureId === selectedSubTab);

    // Filter by status if selected
    const filtered = measureItems.filter((it) => {
      if (statusFilter === 'all') return true;
      return it.status === statusFilter;
    });

    // Calculate distance and sort closest first
    const withDist = filtered.map((it) => {
      let distanceMeters: number | null = null;
      if (userLocation && it.lat && it.lon) {
        distanceMeters = calculateHaversineDistanceMeters(
          userLocation.lat,
          userLocation.lng,
          it.lat,
          it.lon
        );
      }
      return {
        ...it,
        distanceMeters
      };
    });

    // Sort: Items with distance sorted ascending (nearest first); items without coordinates at end
    withDist.sort((a, b) => {
      if (a.distanceMeters !== null && b.distanceMeters !== null) {
        return a.distanceMeters - b.distanceMeters;
      }
      if (a.distanceMeters !== null) return -1;
      if (b.distanceMeters !== null) return 1;
      return b.addedAt - a.addedAt;
    });

    return withDist;
  }, [items, selectedSubTab, statusFilter, userLocation]);

  // Aggregate stats across all 6 measures for Dashboard
  const dashboardStats = useMemo(() => {
    let totalAll = 0;
    let totalNavigating = 0;
    let totalInProgress = 0;
    let totalCompleted = 0;
    let totalPending = 0;

    const measureBreakdowns = MEASURE_METAS.map((m) => {
      const mItems = items.filter((it) => it.measureId === m.id);
      let navigating = 0;
      let inProgress = 0;
      let completed = 0;
      let pending = 0;

      mItems.forEach((it) => {
        if (it.status === 'เสร็จสิ้น') completed++;
        else if (it.status === 'กำลังดำเนินการ') inProgress++;
        else if (it.status === 'นำทาง') navigating++;
        else pending++;
      });

      const total = mItems.length;
      const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

      totalAll += total;
      totalNavigating += navigating;
      totalInProgress += inProgress;
      totalCompleted += completed;
      totalPending += pending;

      return {
        meta: m,
        total,
        navigating,
        inProgress,
        completed,
        pending,
        progressPercent
      };
    });

    const overallProgress = totalAll > 0 ? Math.round((totalCompleted / totalAll) * 100) : 0;

    return {
      totalAll,
      totalNavigating,
      totalInProgress,
      totalCompleted,
      totalPending,
      overallProgress,
      breakdowns: measureBreakdowns
    };
  }, [items]);

  // Copy Comprehensive Report Text to clipboard (e.g. for sharing in LINE)
  const handleCopyReport = () => {
    const lines: string[] = [
      '📊 [รายงานสรุปผล MeterAssay GPS - กฟส.ท่าคันโท]',
      `🗓️ วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      `⏱️ เวลา: ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`,
      '----------------------------------------',
      `รวมทั้งหมด: ${dashboardStats.totalAll} เครื่อง`,
      `✅ ดำเนินการเสร็จสิ้น: ${dashboardStats.totalCompleted} เครื่อง (${dashboardStats.overallProgress}%)`,
      `⚡ กำลังดำเนินการ: ${dashboardStats.totalInProgress} เครื่อง`,
      `🗺️ กำลังนำทาง: ${dashboardStats.totalNavigating} เครื่อง`,
      `⏳ รอดำเนินการ: ${dashboardStats.totalPending} เครื่อง`,
      '----------------------------------------',
      'สรุปแยกตามแต่ละมาตรการณ์:'
    ];

    dashboardStats.breakdowns.forEach((b) => {
      lines.push(
        `• ${b.meta.name}: ${b.completed}/${b.total} เครื่อง (${b.progressPercent}%) [เสร็จ ${b.completed} | ทำอยู่ ${b.inProgress} | นำทาง ${b.navigating}]`
      );
    });

    lines.push('----------------------------------------');
    lines.push('ระบบปฏิบัติการภาคสนาม PEA Smart Field');

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 คัดลอกรายงานสรุปผลเรียบร้อย พร้อมส่งเข้า LINE');
    });
  };

  // Copy Measure Specific Report
  const handleCopyMeasureReport = (measureId: MeterAssayMeasureId) => {
    const meta = MEASURE_METAS.find((m) => m.id === measureId);
    const mItems = items.filter((it) => it.measureId === measureId);
    const completed = mItems.filter((it) => it.status === 'เสร็จสิ้น').length;
    const inProgress = mItems.filter((it) => it.status === 'กำลังดำเนินการ').length;
    const navigating = mItems.filter((it) => it.status === 'นำทาง').length;
    const pending = mItems.filter((it) => it.status === 'รอดำเนินการ').length;

    const lines: string[] = [
      `⚡ รายงาน ${meta?.name} - กฟส.ท่าคันโท`,
      `รวมทั้งหมด: ${mItems.length} เครื่อง`,
      `✅ เสร็จสิ้น: ${completed} เครื่อง`,
      `⏳ กำลังดำเนินการ: ${inProgress} เครื่อง`,
      `🗺️ นำทาง: ${navigating} เครื่อง`,
      `⏳ รอดำเนินการ: ${pending} เครื่อง`,
      '----------------------------------------',
      'รายการมิเตอร์:'
    ];

    mItems.forEach((it, idx) => {
      lines.push(`${idx + 1}. [${it.status}] PEA: ${it.meter || '-'} | CA: ${it.ca || '-'} | ${it.fullName}`);
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      showToast(`📋 คัดลอกรายงาน ${meta?.name} เรียบร้อยแล้ว`);
    });
  };

  return (
    <div className="w-full flex flex-col gap-3 pb-24 max-w-md mx-auto animate-fadeIn px-2 sm:px-0">
      
      {/* 1. TOP HEADER & SYSTEM BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-950 via-slate-900 to-indigo-950 border border-cyan-500/30 p-4 shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-36 h-36 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-6 -ml-6 w-28 h-28 bg-blue-500/15 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-[10px] font-bold mb-1">
              <Compass className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Smart MeterAssay GPS</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>MeterAssay GPS</span>
              <span className="text-[10px] bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 px-2 py-0.5 rounded-full font-mono font-bold">
                6 มาตรการณ์
              </span>
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
              ค้นหาหลายมิเตอร์พร้อมกัน • จัดเรียงใกล้ที่สุดอัตโนมัติ • นำทาง GPS
            </p>
          </div>

          <button
            type="button"
            onClick={() => requestLocation(false)}
            disabled={isLocating}
            className="p-2.5 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 transition-all cursor-pointer active:scale-95 shadow-md shrink-0 flex flex-col items-center gap-1"
            title="อัปเดตพิกัด GPS ปัจจุบัน"
          >
            <LocateFixed className={`w-4 h-4 ${isLocating ? 'animate-spin text-amber-400' : ''}`} />
            <span className="text-[8px] font-bold">GPS</span>
          </button>
        </div>

        {/* Live GPS & Cloud Status Strip */}
        <div className="mt-3 pt-2.5 border-t border-cyan-500/20 flex items-center justify-between text-[10px] text-slate-300">
          <div className="flex items-center gap-1.5 truncate">
            <span className={`w-2 h-2 rounded-full ${userLocation ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span className="truncate">
              {userLocation
                ? `GPS: ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)} (±${gpsAccuracy || 0}ม.)`
                : gpsError || 'กำลังค้นหาตำแหน่ง GPS...'}
            </span>
          </div>
          <div className="shrink-0 flex items-center gap-1 font-mono text-[9px] text-slate-400">
            <span>{isCloudOnline ? '☁️ คลาวด์ซิงก์' : '💾 โหมดออฟไลน์'}</span>
          </div>
        </div>
      </div>

      {/* 2. SUB-TAB SELECTOR (Dashboard รวม + 6 มาตรการณ์) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 shadow-md">
        <div className="text-[10px] font-bold text-slate-400 px-1 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span>เลือกแท็บย่อยใน MeterAssay:</span>
          </span>
          <span className="text-[9px] text-cyan-300 font-mono">
            บันทึกแล้ว {items.length} เครื่อง
          </span>
        </div>

        {/* Scrollable sub-tabs row */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {/* Sub-tab 0: Dashboard รวม */}
          <button
            type="button"
            onClick={() => setSelectedSubTab('dashboard')}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
              selectedSubTab === 'dashboard'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-900/40 ring-1 ring-cyan-400'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>แดชบอร์ดรวม</span>
            {items.length > 0 && (
              <span className="ml-0.5 text-[9px] bg-slate-950/60 px-1.5 py-0.2 rounded-full font-mono">
                {items.length}
              </span>
            )}
          </button>

          {/* Sub-tabs 1 to 6: The 6 measures */}
          {MEASURE_METAS.map((m) => {
            const count = items.filter((it) => it.measureId === m.id).length;
            const isSelected = selectedSubTab === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedSubTab(m.id)}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none active:scale-95 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-950/40 ring-1 ring-amber-300'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span>{m.shortName}</span>
                {count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected ? 'bg-slate-950 text-amber-300' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. VIEW 1: AGGREGATE DASHBOARD (Dashboard รวมแต่ละมาตรการณ์) */}
      {selectedSubTab === 'dashboard' && (
        <div className="flex flex-col gap-3 animate-fadeIn">
          
          {/* Main KPI Summary Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">แดชบอร์ดสรุปภาพรวม 6 มาตรการณ์</h3>
                  <p className="text-[10px] text-slate-400">สรุปผลการค้นหาและสถานะการตรวจสอบมิเตอร์ภาคสนาม</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopyReport}
                className="flex items-center gap-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/30 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                title="คัดลอกสรุปรายงานส่ง LINE"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>ส่ง LINE</span>
              </button>
            </div>

            {/* Overall Progress Bar */}
            <div className="mb-4 bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80">
              <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
                <span className="text-slate-300">ความสำเร็จภาพรวมทั้ง 6 มาตรการณ์:</span>
                <span className="text-emerald-400 font-mono text-sm">{dashboardStats.overallProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${dashboardStats.overallProgress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>เสร็จสิ้น {dashboardStats.totalCompleted} จาก {dashboardStats.totalAll} เครื่อง</span>
                <span>เหลือ {dashboardStats.totalAll - dashboardStats.totalCompleted} เครื่อง</span>
              </div>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-4 gap-1.5 text-center">
              <div className="bg-slate-950/70 border border-slate-800/80 p-2 rounded-2xl">
                <div className="text-[10px] text-slate-400 font-medium">รวมทั้งหมด</div>
                <div className="text-base font-black text-white font-mono mt-0.5">{dashboardStats.totalAll}</div>
              </div>
              <div className="bg-slate-950/70 border border-sky-500/30 p-2 rounded-2xl">
                <div className="text-[10px] text-sky-400 font-medium">นำทาง</div>
                <div className="text-base font-black text-sky-300 font-mono mt-0.5">{dashboardStats.totalNavigating}</div>
              </div>
              <div className="bg-slate-950/70 border border-amber-500/30 p-2 rounded-2xl">
                <div className="text-[10px] text-amber-400 font-medium">กำลังทำ</div>
                <div className="text-base font-black text-amber-300 font-mono mt-0.5">{dashboardStats.totalInProgress}</div>
              </div>
              <div className="bg-slate-950/70 border border-emerald-500/30 p-2 rounded-2xl">
                <div className="text-[10px] text-emerald-400 font-medium">เสร็จสิ้น</div>
                <div className="text-base font-black text-emerald-300 font-mono mt-0.5">{dashboardStats.totalCompleted}</div>
              </div>
            </div>
          </div>

          {/* Breakdown for Each of the 6 Measures */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>รายละเอียดแยกตามแต่ละมาตรการณ์ (6 รายการ)</span>
              </span>
              <span className="text-[10px] text-slate-500">แตะเพื่อเข้าจัดการ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {dashboardStats.breakdowns.map((b) => (
                <div
                  key={b.meta.id}
                  onClick={() => setSelectedSubTab(b.meta.id)}
                  className="group bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-3 cursor-pointer transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-cyan-950/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${b.meta.badgeClass}`}>
                        {b.meta.shortName}
                      </span>
                      <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                        {b.meta.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-xs font-mono font-bold text-slate-300">
                        {b.completed}/{b.total}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mb-2">
                    <div 
                      className="bg-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${b.progressPercent}%` }}
                    />
                  </div>

                  {/* Mini stats badges */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                    <span className="text-emerald-400">✅ เสร็จ {b.completed}</span>
                    <span className="text-amber-400">⚡ กำลังทำ {b.inProgress}</span>
                    <span className="text-sky-400">🗺️ นำทาง {b.navigating}</span>
                    <span className="text-slate-500">⏳ รอ {b.pending}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Guidance / Action Footer */}
          {dashboardStats.totalAll === 0 && (
            <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-3xl p-5 text-center text-slate-400">
              <Compass className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-80" />
              <h4 className="text-sm font-bold text-white mb-1">ยังไม่มีมิเตอร์ในระบบ</h4>
              <p className="text-xs text-slate-400 mb-3 max-w-xs mx-auto">
                เลือกแท็บย่อยมาตรการณ์ด้านบน แล้ววางเลข PEA Meter หรือ CA หลายๆ เครื่องพร้อมกันเพื่อเริ่มต้น
              </p>
              <button
                type="button"
                onClick={() => setSelectedSubTab('m1')}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                เริ่มที่ มาตรการณ์ 1
              </button>
            </div>
          )}

        </div>
      )}

      {/* 4. VIEW 2: SUB-TAB MEASURE VIEW (มาตรการณ์ 1, 2, 3, 8, N1, N2) */}
      {selectedSubTab !== 'dashboard' && (
        <div className="flex flex-col gap-3 animate-fadeIn">
          
          {/* Measure Info Banner */}
          {(() => {
            const currentMeta = MEASURE_METAS.find((m) => m.id === selectedSubTab);
            const mCount = items.filter((it) => it.measureId === selectedSubTab).length;
            const mCompleted = items.filter((it) => it.measureId === selectedSubTab && it.status === 'เสร็จสิ้น').length;
            const mPercent = mCount > 0 ? Math.round((mCompleted / mCount) * 100) : 0;

            return (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3.5 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${currentMeta?.badgeClass}`}>
                      {currentMeta?.shortName}
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-white">{currentMeta?.name}</h3>
                      <p className="text-[10px] text-slate-400 line-clamp-1">{currentMeta?.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyMeasureReport(selectedSubTab)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95 text-xs font-bold flex items-center gap-1 shrink-0"
                    title="คัดลอกรายงานมาตรการณ์นี้"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>รายงาน</span>
                  </button>
                </div>

                {/* Progress bar of current measure */}
                {mCount > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
                      <span>ความคืบหน้า: {mCompleted}/{mCount} เครื่อง</span>
                      <span className="text-emerald-400 font-mono">{mPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${mPercent}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* MULTI-INPUT SEARCH BOX (ค้นหา Pea meter หรือ CA ได้ทีละหลายๆ เครื่องในชุดข้อความเดียว) */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-3.5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-cyan-400" />
                <span>ค้นหาหลายเครื่องพร้อมกัน (Multi-Search)</span>
              </span>
              <button
                type="button"
                onClick={handleInsertSampleMeters}
                className="text-[10px] text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition-all cursor-pointer font-bold"
              >
                + ตัวอย่างเลข
              </button>
            </div>

            <p className="text-[10px] text-slate-400 mb-2">
              วางหรือพิมพ์เลข Pea meter หรือ CA มิเตอร์ หลายๆ เครื่องพร้อมกัน (คั่นด้วยเว้นวรรค, จุลภาค หรือขึ้นบรรทัดใหม่)
            </p>

            <div className="relative">
              <textarea
                value={multiSearchText}
                onChange={(e) => setMultiSearchText(e.target.value)}
                placeholder="ตัวอย่าง: 2001928374 2001928375 หรือ&#10;PEA-1029384, PEA-1029385..."
                rows={3}
                className="w-full bg-slate-950 text-white placeholder-slate-500 text-xs font-mono p-2.5 rounded-2xl border border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-all resize-none shadow-inner"
              />
              {multiSearchText && (
                <button
                  type="button"
                  onClick={() => setMultiSearchText('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                  title="ล้างข้อความ"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleBatchAddMeters}
                disabled={!multiSearchText.trim()}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-white font-black text-xs py-2 px-3 rounded-xl transition-all cursor-pointer active:scale-95 shadow-md flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>ค้นหาและเพิ่มลงรายการ</span>
              </button>
            </div>

            {/* Search Feedback Note */}
            {searchFeedback && (
              <div className="mt-2 text-[10px] font-medium p-2 rounded-xl bg-slate-950 border border-slate-800">
                {searchFeedback.foundCount > 0 && (
                  <div className="text-emerald-400 font-bold">
                    ✅ เพิ่มสำเร็จ {searchFeedback.foundCount} รายการ
                  </div>
                )}
                {searchFeedback.notFoundTokens.length > 0 && (
                  <div className="text-rose-400 mt-0.5">
                    ⚠️ ไม่พบในฐานข้อมูล {searchFeedback.notFoundTokens.length} รหัส: {searchFeedback.notFoundTokens.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AUTO-SORTING & STATUS FILTER BAR */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-300 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                <span>จัดเรียงใกล้ที่สุดอัตโนมัติจาก GPS</span>
              </span>
              <span className="text-[10px] text-cyan-300 font-mono">
                {currentMeasureItemsWithDistance.length} รายการ
              </span>
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] font-bold">
              {(['all', 'รอดำเนินการ', 'นำทาง', 'กำลังดำเนินการ', 'เสร็จสิ้น'] as const).map((st) => {
                const count = items
                  .filter((it) => it.measureId === selectedSubTab)
                  .filter((it) => (st === 'all' ? true : it.status === st)).length;

                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`shrink-0 px-2.5 py-1 rounded-xl transition-all cursor-pointer select-none ${
                      statusFilter === st
                        ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {st === 'all' ? 'ทั้งหมด' : st} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIST OF METERS SORTED BY DISTANCE */}
          <div className="flex flex-col gap-2.5">
            {currentMeasureItemsWithDistance.length === 0 ? (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-6 text-center text-slate-400">
                <Compass className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-300 mb-1">ยังไม่มีมิเตอร์ในรายการนี้</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  พิมพ์หรือวางเลข Pea meter / CA ด้านบนเพื่อค้นหาและนำเข้ามิเตอร์
                </p>
              </div>
            ) : (
              currentMeasureItemsWithDistance.map((item, index) => {
                const hasCoords = item.lat && item.lon;
                const distanceStr = formatDistance(item.distanceMeters);

                return (
                  <div
                    key={item.id}
                    className={`bg-slate-900/90 border rounded-3xl p-3.5 shadow-md transition-all ${
                      item.status === 'เสร็จสิ้น'
                        ? 'border-emerald-500/40 bg-emerald-950/10'
                        : item.status === 'กำลังดำเนินการ'
                        ? 'border-amber-500/50 bg-amber-950/10'
                        : item.status === 'นำทาง'
                        ? 'border-sky-500/50 bg-sky-950/10'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Top Row: Stop Index + Distance Badge + Status Badge */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[10px] font-black font-mono">
                          #{index + 1}
                        </span>

                        {hasCoords ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono flex items-center gap-1 ${
                            index === 0 && item.distanceMeters !== null
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                              : 'bg-slate-800 text-slate-300'
                          }`}>
                            <MapPin className="w-2.5 h-2.5 text-cyan-400" />
                            <span>{distanceStr}</span>
                            {index === 0 && <span className="text-[8px] font-black">(ใกล้สุด)</span>}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            ไม่มีพิกัด
                          </span>
                        )}
                      </div>

                      {/* Current Status Badge */}
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        item.status === 'เสร็จสิ้น'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : item.status === 'กำลังดำเนินการ'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : item.status === 'นำทาง'
                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    {/* Customer & Meter Information */}
                    <div className="flex flex-col gap-1 mb-3">
                      <h4 className="text-xs sm:text-sm font-black text-white leading-tight">
                        {item.fullName || 'ผู้ใช้ไฟ PEA'}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300 font-mono">
                        {item.meter && (
                          <span className="text-amber-300 font-bold">
                            Meter: {item.meter}
                          </span>
                        )}
                        {item.ca && (
                          <span className="text-cyan-300">
                            CA: {item.ca}
                          </span>
                        )}
                        {item.route && (
                          <span className="text-slate-400 text-[10px]">
                            สาย: {item.route}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {item.address || '-'}
                      </p>
                    </div>

                    {/* THE 3 STATUS BUTTONS: 1.นำทาง 2.กำลังดำเนินการ 3.เสร็จสิ้น */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/80">
                      
                      {/* BUTTON 1: นำทาง */}
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item, 'นำทาง')}
                        className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm ${
                          item.status === 'นำทาง'
                            ? 'bg-sky-500 text-slate-950 font-black ring-1 ring-sky-300'
                            : 'bg-sky-950/60 hover:bg-sky-900/80 text-sky-300 border border-sky-500/30'
                        }`}
                        title="เปิด Google Maps นำทางและตั้งสถานะเป็น นำทาง"
                      >
                        <Navigation className="w-3.5 h-3.5 shrink-0" />
                        <span>1.นำทาง</span>
                      </button>

                      {/* BUTTON 2: กำลังดำเนินการ */}
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item, 'กำลังดำเนินการ')}
                        className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm ${
                          item.status === 'กำลังดำเนินการ'
                            ? 'bg-amber-500 text-slate-950 font-black ring-1 ring-amber-300'
                            : 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-500/30'
                        }`}
                        title="ปรับสถานะเป็น กำลังดำเนินการ"
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>2.กำลังทำ</span>
                      </button>

                      {/* BUTTON 3: เสร็จสิ้น */}
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item, 'เสร็จสิ้น')}
                        className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-95 shadow-sm ${
                          item.status === 'เสร็จสิ้น'
                            ? 'bg-emerald-500 text-slate-950 font-black ring-1 ring-emerald-300'
                            : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30'
                        }`}
                        title="ปรับสถานะเป็น เสร็จสิ้น"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>3.เสร็จสิ้น</span>
                      </button>

                    </div>

                    {/* Secondary Actions Row: Copy coord / Delete */}
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/40 text-[10px] text-slate-500">
                      <div className="flex items-center gap-2">
                        {hasCoords && (
                          <button
                            type="button"
                            onClick={() => handleCopyCoord(item.lat, item.lon, item.meter || item.ca)}
                            className="hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>คัดลอกพิกัด</span>
                          </button>
                        )}
                        {hasCoords && (
                          <a
                            href={`https://www.google.com/maps?q=${item.lat},${item.lon}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-sky-300 flex items-center gap-1 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>ดูแผนที่</span>
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="ลบมิเตอร์นี้ออกจากมาตรการณ์"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* Measure Footer: Clear All Button */}
          {currentMeasureItemsWithDistance.length > 0 && (
            <div className="flex items-center justify-between pt-2 px-1">
              <button
                type="button"
                onClick={handleClearCurrentMeasure}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 p-1 font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ล้างรายการในมาตรการณ์นี้</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedSubTab('dashboard')}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 p-1 font-bold transition-colors cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>กลับไปดูแดชบอร์ดรวม</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-cyan-400/50 text-white text-xs font-bold py-2 px-4 rounded-2xl shadow-2xl backdrop-blur-md animate-bounce flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
};
