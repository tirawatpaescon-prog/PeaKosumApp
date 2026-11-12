import React, { useState, useMemo } from 'react';
import { 
  Zap, 
  Plus, 
  Search, 
  Download, 
  Trash2, 
  Calendar, 
  Clock, 
  User, 
  Check, 
  X, 
  Copy, 
  Activity, 
  Gauge, 
  History, 
  CheckCircle2, 
  ChevronRight, 
  ArrowLeft,
  CalendarDays,
  Sparkles,
  Share2,
  FileText,
  Clock3,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Cloud,
  Database
} from 'lucide-react';
import { RecloserLog, PresetRecloser } from '../types';
import { RecloserExportModal } from './RecloserExportModal';

export const PRESET_RECLOSERS: PresetRecloser[] = [
  { id: 'STT6R-31', name: 'ปั้มน้ำมัน ตัว 2' },
  { id: 'STT2R-31', name: '4 แยกนาหมู' },
  { id: 'STT6R-32', name: 'โรงพยาบาล' },
  { id: 'STT2R-32', name: '4 แยกลานอ้อย' },
  { id: 'STT6R-33', name: 'โรงน้ำแข็ง' },
  { id: 'STT9R-31', name: 'ทางเข้าปั้ม' },
  { id: 'STT6R-34', name: 'ไทยวา' },
];

export const formatThaiDateShort = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthsThai = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const thaiYear = year > 2400 ? year : year + 543;
    return `${day} ${monthsThai[month - 1]} ${thaiYear}`;
  } catch {
    return dateStr;
  }
};

export const formatThaiDateFull = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const daysThai = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const monthsFullThai = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const dayName = daysThai[dateObj.getDay()];
    const thaiYear = year > 2400 ? year : year + 543;
    return `วัน${dayName}ที่ ${day} ${monthsFullThai[month - 1]} ${thaiYear}`;
  } catch {
    return dateStr;
  }
};

export type DeleteConfirmTarget =
  | { type: 'single'; log: RecloserLog }
  | { type: 'day'; date: string; count: number; logIds: string[] }
  | null;

interface RecloserTabProps {
  recloserLogs: RecloserLog[];
  onSaveLog: (log: RecloserLog) => void | Promise<void>;
  onDeleteLog: (id: string) => void | Promise<void>;
  onDeleteBatchLogs?: (ids: string[]) => void | Promise<void>;
  isSyncing?: boolean;
  lastSyncTime?: Date | null;
  cloudConnected?: boolean;
  onRefresh?: () => void;
}

export const RecloserTab: React.FC<RecloserTabProps> = ({
  recloserLogs,
  onSaveLog,
  onDeleteLog,
  onDeleteBatchLogs,
  isSyncing = false,
  lastSyncTime = null,
  cloudConnected = true,
  onRefresh
}) => {
  const [viewMode, setViewMode] = useState<'form' | 'history'>('form');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_RECLOSERS[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // In-app Delete Confirmation Dialog State
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<DeleteConfirmTarget>(null);
  const [deleteToastMsg, setDeleteToastMsg] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // History date drill-down state (null = show all date cards, string = viewing specific date)
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [historySearchFilter, setHistorySearchFilter] = useState('');
  const [subRecloserFilter, setSubRecloserFilter] = useState<string>('all');

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportInitialDate, setExportInitialDate] = useState<string | null>(null);

  const openExportModal = (initialDate: string | null = null) => {
    setExportInitialDate(initialDate);
    setShowExportModal(true);
  };

  // Execute confirmed deletion
  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget || isDeleting) return;
    setIsDeleting(true);

    try {
      if (deleteConfirmTarget.type === 'single') {
        const targetLog = deleteConfirmTarget.log;
        await onDeleteLog(targetLog.id);
        setDeleteToastMsg(`ลบรายการ ${targetLog.recloserId} (${formatThaiDateShort(targetLog.recordDate)}) เรียบร้อย`);
      } else if (deleteConfirmTarget.type === 'day') {
        const { date, logIds } = deleteConfirmTarget;
        if (onDeleteBatchLogs) {
          await onDeleteBatchLogs(logIds);
        } else {
          for (const id of logIds) {
            await onDeleteLog(id);
          }
        }
        if (selectedHistoryDate === date) {
          setSelectedHistoryDate(null);
        }
        setDeleteToastMsg(`ลบรายงานบันทึกของวันที่ ${formatThaiDateShort(date)} ทั้งหมดเรียบร้อย`);
      }
    } catch (err) {
      console.error('Error during deletion:', err);
      setDeleteToastMsg('เกิดข้อผิดพลาดในการลบข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
      setTimeout(() => {
        setDeleteToastMsg(null);
      }, 3500);
    }
  };

  // Form State
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [recordTime, setRecordTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // 1. Counter State
  const [counterBR, setCounterBR] = useState<number | ''>('');
  const [counterA, setCounterA] = useState<number | ''>('');
  const [counterB, setCounterB] = useState<number | ''>('');
  const [counterC, setCounterC] = useState<number | ''>('');
  const [counterG, setCounterG] = useState<number | ''>('');

  // 2. Current State (Ampere)
  const [currentA, setCurrentA] = useState<number | ''>('');
  const [currentB, setCurrentB] = useState<number | ''>('');
  const [currentC, setCurrentC] = useState<number | ''>('');
  const [currentG, setCurrentG] = useState<number | ''>('');

  // Additional Meta
  const [notes, setNotes] = useState('');

  // Current selected preset object
  const currentPreset = useMemo(() => {
    return PRESET_RECLOSERS.find((p) => p.id === selectedPresetId) || PRESET_RECLOSERS[0];
  }, [selectedPresetId]);

  // Find previous record for selected Recloser
  const previousRecordForSelected = useMemo(() => {
    return recloserLogs.find((log) => log.recloserId === selectedPresetId);
  }, [recloserLogs, selectedPresetId]);

  // Quick Date Helpers for Form
  const setDateToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setRecordDate(today);
  };

  const setDateYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setRecordDate(d.toISOString().split('T')[0]);
  };

  const setTimeToNow = () => {
    const now = new Date();
    setRecordTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  };

  // Group recloser logs by Date
  const dateGroups = useMemo(() => {
    const groups: { [dateStr: string]: RecloserLog[] } = {};
    for (const log of recloserLogs) {
      const d = log.recordDate || 'ไม่ระบุวันที่';
      if (!groups[d]) {
        groups[d] = [];
      }
      groups[d].push(log);
    }

    // Sort dates descending
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((dateStr) => ({
      date: dateStr,
      logs: groups[dateStr]
    }));
  }, [recloserLogs]);

  // Filtered Date Groups in History List
  const filteredDateGroups = useMemo(() => {
    if (!historySearchFilter.trim()) return dateGroups;
    const q = historySearchFilter.toLowerCase().trim();
    return dateGroups.filter((group) => {
      const thaiShort = formatThaiDateShort(group.date).toLowerCase();
      const thaiFull = formatThaiDateFull(group.date).toLowerCase();
      const matchesDate = group.date.includes(q) || thaiShort.includes(q) || thaiFull.includes(q);
      const matchesAnyLog = group.logs.some(
        (l) =>
          l.recloserId.toLowerCase().includes(q) ||
          l.recloserName.toLowerCase().includes(q) ||
          (l.notes && l.notes.toLowerCase().includes(q))
      );
      return matchesDate || matchesAnyLog;
    });
  }, [dateGroups, historySearchFilter]);

  // Logs for currently selected date drill-down
  const logsForSelectedDate = useMemo(() => {
    if (!selectedHistoryDate) return [];
    const raw = recloserLogs.filter((l) => l.recordDate === selectedHistoryDate);
    if (subRecloserFilter === 'all') return raw;
    return raw.filter((l) => l.recloserId === subRecloserFilter);
  }, [recloserLogs, selectedHistoryDate, subRecloserFilter]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (counterBR === '' && counterA === '' && currentA === '') {
      if (!confirm('คุณยังไม่ได้กรอกค่า Counter หรือ Current ต้องการบันทึกข้อมูลหรือไม่?')) {
        return;
      }
    }

    const newLog: RecloserLog = {
      id: `rec-${Date.now()}`,
      recloserId: currentPreset.id,
      recloserName: currentPreset.name,
      recordDate,
      recordTime,
      counterBR: counterBR !== '' ? Number(counterBR) : undefined,
      counterA: counterA !== '' ? Number(counterA) : undefined,
      counterB: counterB !== '' ? Number(counterB) : undefined,
      counterC: counterC !== '' ? Number(counterC) : undefined,
      counterG: counterG !== '' ? Number(counterG) : undefined,
      currentA: currentA !== '' ? Number(currentA) : undefined,
      currentB: currentB !== '' ? Number(currentB) : undefined,
      currentC: currentC !== '' ? Number(currentC) : undefined,
      currentG: currentG !== '' ? Number(currentG) : undefined,
      notes: notes.trim() || undefined,
      createdAt: Date.now()
    };

    try {
      await onSaveLog(newLog);

      // Show Success feedback
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);

      // Reset numeric inputs
      setCounterBR('');
      setCounterA('');
      setCounterB('');
      setCounterC('');
      setCounterG('');
      setCurrentA('');
      setCurrentB('');
      setCurrentC('');
      setCurrentG('');
      setNotes('');

      // Update time to now for next entry
      setTimeToNow();
    } catch (err) {
      console.error('Save error in form:', err);
      setDeleteToastMsg('บันทึกข้อมูลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
      setTimeout(() => setDeleteToastMsg(null), 3500);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (recloserLogs.length === 0) {
      alert('ยังไม่มีข้อมูลการจดหน่วย Recloser สำหรับส่งออก');
      return;
    }

    const headers = [
      'ลำดับ',
      'รหัส Recloser',
      'สถานที่ติดตั้ง',
      'วันที่',
      'เวลา',
      'Counter B/R',
      'Counter A',
      'Counter B',
      'Counter C',
      'Counter G',
      'Current A (A)',
      'Current B (A)',
      'Current C (A)',
      'Current G (A)',
      'หมายเหตุ'
    ];

    const rows = recloserLogs.map((log, idx) => [
      idx + 1,
      `"${log.recloserId}"`,
      `"${log.recloserName}"`,
      `"${log.recordDate}"`,
      `"${log.recordTime}"`,
      log.counterBR ?? '',
      log.counterA ?? '',
      log.counterB ?? '',
      log.counterC ?? '',
      log.counterG ?? '',
      log.currentA ?? '',
      log.currentB ?? '',
      log.currentC ?? '',
      log.currentG ?? '',
      `"${log.notes || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PEA_Recloser_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy Single Summary to LINE
  const handleCopyLogSummary = (log: RecloserLog) => {
    const text = `⚡ [บันทึกค่า Recloser PEA] ⚡
📌 จุดติดตั้ง: ${log.recloserId} (${log.recloserName})
📅 วันที่: ${formatThaiDateFull(log.recordDate)} เวลา ${log.recordTime} น.
🔢 1. Counter:
 - B/R: ${log.counterBR ?? '-'} ครั้ง
 - A: ${log.counterA ?? '-'}
 - B: ${log.counterB ?? '-'}
 - C: ${log.counterC ?? '-'}
 - G: ${log.counterG ?? '-'}
📈 2. Current (Ampere):
 - A: ${log.currentA !== undefined ? `${log.currentA} A` : '-'}
 - B: ${log.currentB !== undefined ? `${log.currentB} A` : '-'}
 - C: ${log.currentC !== undefined ? `${log.currentC} A` : '-'}
 - G: ${log.currentG !== undefined ? `${log.currentG} A` : '-'}
${log.notes ? `📝 หมายเหตุ: ${log.notes}` : ''}`;

    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Copy Whole Day Summary to LINE
  const handleCopyDaySummary = (dateStr: string, logs: RecloserLog[]) => {
    let text = `⚡ [รายงานบันทึก Recloser PEA ประจำวัน] ⚡\n📅 วันที่: ${formatThaiDateFull(dateStr)}\n📊 จำนวนที่จดบันทึก: ${logs.length} จุด\n--------------------------------\n`;

    logs.forEach((log, index) => {
      text += `\n[${index + 1}] ${log.recloserId} (${log.recloserName}) | ${log.recordTime} น.
🔢 Counter B/R: ${log.counterBR ?? '-'} ครั้ง (A:${log.counterA ?? '-'} B:${log.counterB ?? '-'} C:${log.counterC ?? '-'} G:${log.counterG ?? '-'})
📈 Current A/B/C/G: ${log.currentA ?? '-'}/${log.currentB ?? '-'}/${log.currentC ?? '-'}/${log.currentG ?? '-'} A
${log.notes ? `📝 หมายเหตุ: ${log.notes}\n` : ''}`;
    });

    navigator.clipboard.writeText(text);
    setCopiedId(`day-${dateStr}`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="w-full flex flex-col gap-3 pb-6 max-w-md mx-auto animate-fadeIn">
      
      {/* HEADER CARD & SEGMENT SWITCHER */}
      <div className="bg-slate-900/95 border border-amber-500/40 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5 truncate">
                <span>บันทึกค่า Recloser</span>
                <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded-full shrink-0">
                  7 จุดหลัก
                </span>
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                1. Counter (B/R, A, B, C, G) | 2. Current (A, B, C, G)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-open-export-modal"
              type="button"
              onClick={() => openExportModal(null)}
              title="ออกเอกสารรายงาน (PDF / Excel / Memo)"
              className="bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95 shadow-md shadow-amber-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>ออกรายงาน</span>
            </button>

            <button
              onClick={handleExportCSV}
              title="ดาวน์โหลดไฟล์ CSV ทันที"
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 p-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* CLOUD FIRESTORE SYNC STATUS (ซิงค์ตอนเริ่ม/บันทึก) */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-2 px-3 flex items-center justify-between text-xs shadow-inner">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cloudConnected ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cloudConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <div className="flex items-center gap-1.5 text-[11px] truncate">
              <span className="font-bold text-slate-200 shrink-0 flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Cloud Sync:</span>
              </span>
              <span className="text-slate-400 truncate">
                {isSyncing
                  ? 'กำลังซิงค์ข้อมูลกับคลาวด์...'
                  : lastSyncTime
                    ? `ซิงค์ล่าสุด ${lastSyncTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
                    : 'ซิงค์เมื่อเริ่มแอปและตอนบันทึก'}
              </span>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isSyncing}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2 py-1 rounded-xl transition-all disabled:opacity-50 cursor-pointer active:scale-95 shrink-0 ml-1.5 shadow-sm"
              title="ดึงข้อมูลล่าสุดจาก Cloud Firestore"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-amber-300' : ''}`} />
              <span>{isSyncing ? 'ซิงค์...' : 'รีเฟรช'}</span>
            </button>
          )}
        </div>

        {/* TOP SEGMENT SWITCHER: [📝 บันทึกค่าใหม่] vs [📜 ดูย้อนหลังตามวันที่] */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
          <button
            id="btn-mode-form"
            type="button"
            onClick={() => setViewMode('form')}
            className={`flex items-center justify-center gap-1.5 min-h-[42px] py-2 px-2 rounded-xl text-xs transition-all cursor-pointer select-none active:scale-95 font-bold ${
              viewMode === 'form'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>📝 บันทึกค่าใหม่</span>
          </button>

          <button
            id="btn-mode-history"
            type="button"
            onClick={() => {
              setViewMode('history');
              setSelectedHistoryDate(null);
            }}
            className={`flex items-center justify-center gap-1.5 min-h-[42px] py-2 px-2 rounded-xl text-xs transition-all cursor-pointer select-none active:scale-95 font-bold truncate ${
              viewMode === 'history'
                ? 'bg-cyan-500 text-slate-950 font-black shadow-md shadow-cyan-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
            }`}
          >
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span className="truncate">📜 ดูย้อนหลัง ({dateGroups.length} วัน)</span>
          </button>
        </div>
      </div>

      {/* SUCCESS TOAST */}
      {saveSuccessMsg && (
        <div className="bg-emerald-950 border border-emerald-500/60 text-emerald-200 text-xs font-bold p-3 rounded-2xl flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>บันทึกและซิงค์ข้อมูล Recloser ขึ้น Cloud สำเร็จ! ⚡</span>
          </div>
          <button
            onClick={() => {
              setViewMode('history');
              setSelectedHistoryDate(recordDate);
            }}
            className="text-[11px] underline text-emerald-300 hover:text-white cursor-pointer font-black shrink-0 ml-2"
          >
            ดูของวันนี้ ({formatThaiDateShort(recordDate)})
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: RECORD FORM (บันทึกค่า) */}
      {/* ========================================================================= */}
      {viewMode === 'form' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          
          {/* STEP 1: SELECT MAIN RECLOSER */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-[10px] font-mono shadow-sm">1</span>
                <span>จุดติดตั้ง Recloser:</span>
              </label>
            </div>

            {/* 7 Recloser Buttons Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
              {PRESET_RECLOSERS.map((preset, index) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`flex items-center justify-between min-h-[44px] p-2.5 rounded-2xl border transition-all text-left cursor-pointer active:scale-98 ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 shadow-md shadow-amber-950/60 text-white ring-1 ring-amber-400/50'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md font-mono shrink-0 ${
                        isSelected 
                          ? 'bg-amber-500 text-slate-950' 
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {index + 1}. {preset.id}
                      </span>
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-amber-200' : 'text-slate-200'}`}>
                        {preset.name}
                      </span>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected device info banner */}
            <div className="bg-slate-950 rounded-2xl p-2.5 border border-amber-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-slate-400 text-[11px] shrink-0">เลือกแล้ว:</span>
                <span className="font-mono font-black text-amber-300 shrink-0">{currentPreset.id}</span>
                <span className="text-white font-bold truncate">{currentPreset.name}</span>
              </div>
              {previousRecordForSelected && (
                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                  ล่าสุด: {formatThaiDateShort(previousRecordForSelected.recordDate)}
                </span>
              )}
            </div>
          </div>

          {/* STEP 2: SELECT DATE & TIME */}
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3 text-slate-900">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-[10px] font-mono shadow-sm">2</span>
                <span>วันที่และเวลา:</span>
              </label>

              {/* Quick Date Chips */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={setDateToday}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-amber-400 hover:text-slate-950 text-[11px] font-bold text-slate-700 border border-slate-300 cursor-pointer active:scale-95 shadow-sm transition-all"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={setDateYesterday}
                  className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-amber-400 hover:text-slate-950 text-[11px] font-bold text-slate-700 border border-slate-300 cursor-pointer active:scale-95 shadow-sm transition-all"
                >
                  เมื่อวาน
                </button>
              </div>
            </div>

            {/* Date Display Pill Banner */}
            <div className="bg-amber-50 border border-amber-300/80 p-2.5 sm:p-3 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-[10px] text-amber-800 font-bold">วันที่บันทึก:</div>
                  <div className="text-xs sm:text-sm font-black text-slate-950 truncate">{formatThaiDateFull(recordDate)}</div>
                </div>
              </div>
              <span className="text-xs font-mono bg-white text-slate-900 border border-amber-300 px-2.5 py-1 rounded-xl font-black shrink-0 shadow-xs ml-1">
                {recordDate}
              </span>
            </div>

            {/* Date & Time Picker Controls */}
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              {/* Date Input */}
              <div className="bg-slate-50 p-2 sm:p-2.5 rounded-2xl border-2 border-slate-200 flex flex-col justify-between">
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    <span>วันที่</span>
                  </span>
                </label>
                <input
                  type="date"
                  required
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  style={{ colorScheme: 'light' }}
                  className="w-full bg-white text-slate-950 font-mono text-[15px] sm:text-sm font-black p-2 sm:p-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none cursor-pointer shadow-sm"
                />
              </div>

              {/* Time Input */}
              <div className="bg-slate-50 p-2 sm:p-2.5 rounded-2xl border-2 border-slate-200 flex flex-col justify-between">
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>เวลา</span>
                  </span>
                  <button
                    type="button"
                    onClick={setTimeToNow}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded-lg cursor-pointer transition-all"
                  >
                    ตอนนี้
                  </button>
                </label>
                <input
                  type="time"
                  required
                  value={recordTime}
                  onChange={(e) => setRecordTime(e.target.value)}
                  style={{ colorScheme: 'light' }}
                  className="w-full bg-white text-slate-950 font-mono text-[15px] sm:text-sm font-black p-2 sm:p-2.5 rounded-xl border-2 border-slate-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 focus:outline-none cursor-pointer shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* STEP 3: 1. COUNTER (B/R, A, B, C, G) */}
          <div className="bg-slate-900/95 border border-amber-500/40 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
                  1
                </div>
                <h3 className="text-sm font-black text-amber-300">
                  Counter
                </h3>
              </div>
            </div>

            {/* B/R Counter */}
            <div className="bg-slate-950 p-2.5 sm:p-3 rounded-2xl border border-amber-500/40">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-amber-400" />
                  <span>Counter (B/R)</span>
                </label>
                {previousRecordForSelected?.counterBR !== undefined && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    ครั้งก่อน: <b className="text-amber-400">{previousRecordForSelected.counterBR}</b>
                  </span>
                )}
              </div>
              <input
                type="number"
                min="0"
                value={counterBR}
                onChange={(e) => setCounterBR(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="ระบุตัวเลข B/R เช่น 148"
                className="w-full bg-slate-900 text-amber-300 text-lg font-black placeholder-slate-600 p-2.5 rounded-xl border border-amber-400/60 focus:border-amber-400 focus:outline-none font-mono text-center shadow-inner"
              />
            </div>

            {/* Phase Counters: A, B, C, G */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                แยกเฟส:
              </label>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 mb-1 text-center font-mono">A</span>
                  <input
                    type="number"
                    min="0"
                    value={counterA}
                    onChange={(e) => setCounterA(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="A"
                    className="w-full bg-slate-950 text-slate-100 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-slate-700 focus:border-amber-400 text-center"
                  />
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-slate-400 mb-1 text-center font-mono">B</span>
                  <input
                    type="number"
                    min="0"
                    value={counterB}
                    onChange={(e) => setCounterB(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="B"
                    className="w-full bg-slate-950 text-slate-100 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-slate-700 focus:border-amber-400 text-center"
                  />
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-slate-400 mb-1 text-center font-mono">C</span>
                  <input
                    type="number"
                    min="0"
                    value={counterC}
                    onChange={(e) => setCounterC(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="C"
                    className="w-full bg-slate-950 text-slate-100 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-slate-700 focus:border-amber-400 text-center"
                  />
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-slate-400 mb-1 text-center font-mono">G</span>
                  <input
                    type="number"
                    min="0"
                    value={counterG}
                    onChange={(e) => setCounterG(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="G"
                    className="w-full bg-slate-950 text-slate-100 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-slate-700 focus:border-amber-400 text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: CURRENT (A, B, C, G) */}
          <div className="bg-slate-900/95 border border-cyan-500/40 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500 text-slate-950 font-black flex items-center justify-center text-xs">
                  2
                </div>
                <h3 className="text-sm font-black text-cyan-300">
                  Current (Ampere)
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <div>
                <label className="block text-[10px] font-bold text-cyan-400 mb-1 text-center font-mono">A (Ia)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={currentA}
                  onChange={(e) => setCurrentA(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.0"
                  className="w-full bg-slate-950 text-cyan-300 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-cyan-500/40 focus:border-cyan-400 text-center shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-cyan-400 mb-1 text-center font-mono">B (Ib)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={currentB}
                  onChange={(e) => setCurrentB(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.0"
                  className="w-full bg-slate-950 text-cyan-300 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-cyan-500/40 focus:border-cyan-400 text-center shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-cyan-400 mb-1 text-center font-mono">C (Ic)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={currentC}
                  onChange={(e) => setCurrentC(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.0"
                  className="w-full bg-slate-950 text-cyan-300 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-cyan-500/40 focus:border-cyan-400 text-center shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-cyan-400 mb-1 text-center font-mono">G (Ig)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={currentG}
                  onChange={(e) => setCurrentG(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.0"
                  className="w-full bg-slate-950 text-cyan-300 font-mono text-[15px] sm:text-xs font-bold p-2 rounded-xl border border-cyan-500/40 focus:border-cyan-400 text-center shadow-inner"
                />
              </div>
            </div>
          </div>

          {/* STEP 5: NOTES */}
          <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                หมายเหตุเพิ่มเติม (ถ้ามี)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เช่น สภาพตู้คอนโทรลปกติ, ตัดกิ่งไม้ใกล้แนวสาย"
                className="w-full bg-slate-950 text-white placeholder-slate-500 p-2.5 rounded-xl border border-slate-700 focus:border-amber-400 text-[14px] sm:text-xs"
              />
            </div>
          </div>

          {/* SAVE BUTTON */}
          <button
            id="btn-submit-recloser"
            type="submit"
            className="w-full min-h-[50px] py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>บันทึกค่า {currentPreset.id} ({currentPreset.name})</span>
          </button>

          {/* RECENT RECORDS QUICK PREVIEW & DELETE */}
          {recloserLogs.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-lg flex flex-col gap-2.5 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-black text-white">บันทึกล่าสุด (สามารถลบหรือตรวจสอบได้)</h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('history');
                    setSelectedHistoryDate(null);
                  }}
                  className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
                >
                  ดูทั้งหมด ({recloserLogs.length}) →
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {recloserLogs.slice(0, 3).map((log) => (
                  <div
                    key={log.id}
                    className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                          {log.recloserId}
                        </span>
                        <span className="text-xs font-bold text-white truncate">
                          {log.recloserName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatThaiDateShort(log.recordDate)} {log.recordTime} น.
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                        <span>B/R: <b className="text-slate-200">{log.counterBR ?? '-'}</b></span>
                        <span>•</span>
                        <span>Ia: <b className="text-cyan-300">{log.currentA ?? '-'}A</b></span>
                        <span>Ib: <b className="text-cyan-300">{log.currentB ?? '-'}A</b></span>
                        <span>Ic: <b className="text-cyan-300">{log.currentC ?? '-'}A</b></span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmTarget({ type: 'single', log })}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-rose-500/30 bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                      title="ลบรายงานบันทึกนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>ลบ</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </form>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: HISTORY VIEW (ดูย้อนหลังแบบเลือกวันที่) */}
      {/* ========================================================================= */}
      {viewMode === 'history' && (
        <div className="flex flex-col gap-3">
          
          {/* --------------------------------------------------------------------- */}
          {/* LEVEL 1: LIST OF DATES (เลือกดูแบบวันที่ ที่บันทึก) */}
          {/* --------------------------------------------------------------------- */}
          {!selectedHistoryDate ? (
            <>
              {/* SEARCH BOX & QUICK EXPORT BAR */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={historySearchFilter}
                    onChange={(e) => setHistorySearchFilter(e.target.value)}
                    placeholder="ค้นหาวันที่, เดือน, รหัส Recloser หรือชื่อช่าง..."
                    className="w-full bg-slate-900/90 text-xs text-white placeholder-slate-500 pl-8.5 pr-8 py-2.5 rounded-2xl border border-slate-800 focus:outline-none focus:border-cyan-400 shadow-inner"
                  />
                  {historySearchFilter && (
                    <button
                      onClick={() => setHistorySearchFilter('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => openExportModal(null)}
                  title="ออกเอกสารรายงานรวม"
                  className="bg-slate-900 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 text-amber-300 py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 transition-all shadow-sm active:scale-95"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">ออกรายงาน</span>
                </button>
              </div>

              {/* DATE CARDS LIST */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4 text-cyan-400" />
                    <span>เลือกวันที่เพื่อดูข้อมูล ({filteredDateGroups.length} วัน):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openExportModal(null)}
                    className="text-[11px] font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    <span>พิมพ์รายงาน PDF</span>
                  </button>
                </div>

                {/* Banner to purge legacy demo data if present */}
                {recloserLogs.some((l) => l.id.startsWith('rec-demo-')) && (
                  <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs shadow-sm">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Trash2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-bold">ตรวจพบข้อมูลตัวอย่างตั้งต้น (Demo) ในระบบ</span>
                        <p className="text-[10px] text-amber-400/80">สามารถกดลบเพื่อเริ่มต้นใช้งานจริงด้วยข้อมูลที่คุณบันทึกเองเท่านั้น</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const demoIds = recloserLogs.filter((l) => l.id.startsWith('rec-demo-')).map((l) => l.id);
                        setDeleteConfirmTarget({
                          type: 'day',
                          date: 'ข้อมูลตัวอย่างตั้งต้น (Demo)',
                          count: demoIds.length,
                          logIds: demoIds
                        });
                      }}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs shrink-0 active:scale-95 transition-all cursor-pointer shadow-sm w-full sm:w-auto text-center"
                    >
                      ลบข้อมูลตัวอย่างทั้งหมด
                    </button>
                  </div>
                )}

                {filteredDateGroups.length > 0 ? (
                  filteredDateGroups.map((group) => {
                    const totalPoints = group.logs.length;
                    const latestTime = group.logs[0]?.recordTime || '';
                    const distinctReclosers = Array.from(new Set(group.logs.map((l) => l.recloserId)));
                    const recorders = Array.from(new Set(group.logs.map((l) => l.recorderName).filter(Boolean)));
                    const isFull7 = distinctReclosers.length >= 7;

                    return (
                      <div
                        key={group.date}
                        onClick={() => {
                          setSelectedHistoryDate(group.date);
                          setSubRecloserFilter('all');
                        }}
                        className="group relative overflow-hidden bg-slate-900/95 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/60 rounded-3xl p-4 cursor-pointer transition-all duration-200 shadow-lg hover:shadow-cyan-900/20 active:scale-[0.99] flex flex-col gap-2.5"
                      >
                        {/* Top Bar: Date & Count Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex flex-col items-center justify-center shrink-0 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div className="truncate">
                              <h3 className="text-sm font-black text-white group-hover:text-cyan-300 transition-colors">
                                {formatThaiDateFull(group.date)}
                              </h3>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {group.date} {latestTime && `• ล่าสุด ${latestTime} น.`}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-xs font-mono font-black px-2.5 py-1 rounded-xl border inline-flex items-center gap-1 ${
                              isFull7
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            }`}>
                              <span>{totalPoints} รายการ</span>
                            </span>
                          </div>
                        </div>

                        {/* Recloser Pills in this day */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-medium">จุดที่จด:</span>
                          {distinctReclosers.map((recId) => (
                            <span
                              key={recId}
                              className="text-[9px] font-mono font-bold bg-slate-950 border border-slate-800 text-amber-300 px-1.5 py-0.5 rounded-md"
                            >
                              {recId}
                            </span>
                          ))}
                        </div>

                        {/* Footer: Delete Day Report & Tap Hint */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmTarget({
                                type: 'day',
                                date: group.date,
                                count: group.logs.length,
                                logIds: group.logs.map((l) => l.id)
                              });
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-600 border border-rose-500/30 px-2.5 py-1 rounded-xl transition-all cursor-pointer active:scale-95 shadow-xs"
                            title="ลบรายงานบันทึกของวันนี้ทั้งหมด"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>ลบรายงานวันนี้ ({group.logs.length})</span>
                          </button>

                          <div className="flex items-center gap-1 font-bold text-cyan-400 group-hover:text-cyan-300 shrink-0">
                            <span>แตะดูบันทึก</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-6 text-center flex flex-col items-center justify-center">
                    <CalendarDays className="w-8 h-8 text-slate-600 mb-2" />
                    <h3 className="text-sm font-bold text-white">ยังไม่มีประวัติการบันทึก</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {historySearchFilter
                        ? 'ไม่พบวันที่ที่ตรงกับคำค้นหา'
                        : 'บันทึกค่า Recloser รายการแรกในแท็บ "บันทึกค่าใหม่"'}
                    </p>
                    <button
                      onClick={() => {
                        setHistorySearchFilter('');
                        setViewMode('form');
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 px-3.5 py-2 rounded-xl cursor-pointer shadow-md shadow-amber-500/20"
                    >
                      <Plus className="w-4 h-4" />
                      บันทึกค่าใหม่
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* --------------------------------------------------------------------- */
            /* LEVEL 2: DETAIL VIEW FOR SELECTED DATE (แสดงค่าการบันทึกของวันนั้นๆ) */
            /* --------------------------------------------------------------------- */
            <div className="flex flex-col gap-3">
              
              {/* BACK BUTTON & DAY SUMMARY HEADER */}
              <div className="bg-slate-900/95 border border-cyan-500/40 rounded-3xl p-4 shadow-xl flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedHistoryDate(null)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-cyan-500/30 px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 shadow-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>← เลือกวันที่อื่น</span>
                  </button>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => openExportModal(selectedHistoryDate)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-amber-300 transition-all cursor-pointer active:scale-95 shadow-sm"
                      title="ออกเอกสารรายงานเฉพาะวันนี้ (PDF / Excel)"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>ออกรายงานวันนี้</span>
                    </button>

                    <button
                      onClick={() => handleCopyDaySummary(selectedHistoryDate, logsForSelectedDate)}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                        copiedId === `day-${selectedHistoryDate}`
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 border-cyan-500/40'
                      }`}
                    >
                      {copiedId === `day-${selectedHistoryDate}` ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>ส่ง LINE</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setDeleteConfirmTarget({
                          type: 'day',
                          date: selectedHistoryDate,
                          count: logsForSelectedDate.length,
                          logIds: logsForSelectedDate.map((l) => l.id)
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/15 hover:bg-rose-600 hover:text-white text-rose-300 transition-all cursor-pointer active:scale-95 shadow-sm"
                      title="ลบรายงานบันทึกของวันนี้ทั้งหมด"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>ลบรายงานวันนี้</span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium">บันทึกประจำวันที่:</div>
                    <h2 className="text-sm sm:text-base font-black text-white">
                      {formatThaiDateFull(selectedHistoryDate)}
                    </h2>
                    <span className="text-[10px] font-mono text-cyan-400">
                      {selectedHistoryDate}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-1 rounded-xl">
                      {logsForSelectedDate.length} รายการ
                    </span>
                  </div>
                </div>

                {/* Sub-Filter for Reclosers on this day */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSubRecloserFilter('all')}
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                      subRecloserFilter === 'all'
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    ทุกจุดในวันนี้ ({recloserLogs.filter((l) => l.recordDate === selectedHistoryDate).length})
                  </button>

                  {PRESET_RECLOSERS.map((preset) => {
                    const hasLog = recloserLogs.some(
                      (l) => l.recordDate === selectedHistoryDate && l.recloserId === preset.id
                    );
                    if (!hasLog) return null;
                    const isSelected = subRecloserFilter === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSubRecloserFilter(preset.id)}
                        className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {preset.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LIST OF RECORDINGS FOR THIS SPECIFIC DATE */}
              <div className="flex flex-col gap-2.5">
                {logsForSelectedDate.length > 0 ? (
                  logsForSelectedDate.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-900/95 border border-slate-800 hover:border-amber-500/50 rounded-3xl p-3.5 shadow-lg transition-all flex flex-col gap-2.5"
                    >
                      {/* Top Bar */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-lg font-mono shadow-sm">
                            {log.recloserId}
                          </span>
                          <div>
                            <h4 className="text-xs font-black text-white">
                              {log.recloserName}
                            </h4>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-amber-300 font-mono font-bold flex items-center gap-1 justify-end">
                            <Clock3 className="w-3 h-3 text-amber-400" />
                            <span>{log.recordTime} น.</span>
                          </div>
                        </div>
                      </div>

                      {/* 1. Counter Display */}
                      <div className="bg-slate-950 rounded-2xl p-2.5 border border-amber-500/20">
                        <div className="text-[10px] font-bold text-amber-400 mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            <span>1. Counter</span>
                          </span>
                          {log.counterBR !== undefined && (
                            <span className="font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md font-black">
                              B/R: {log.counterBR} ครั้ง
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-center font-mono text-xs">
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                            <span className="text-[9px] text-slate-400 block font-sans">A</span>
                            <span className="font-bold text-slate-200">{log.counterA ?? '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                            <span className="text-[9px] text-slate-400 block font-sans">B</span>
                            <span className="font-bold text-slate-200">{log.counterB ?? '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                            <span className="text-[9px] text-slate-400 block font-sans">C</span>
                            <span className="font-bold text-slate-200">{log.counterC ?? '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                            <span className="text-[9px] text-slate-400 block font-sans">G</span>
                            <span className="font-bold text-slate-200">{log.counterG ?? '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Current Display */}
                      <div className="bg-slate-950 rounded-2xl p-2.5 border border-cyan-500/20">
                        <div className="text-[10px] font-bold text-cyan-400 mb-1.5 flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          <span>2. Current (Ampere)</span>
                        </div>

                        <div className="grid grid-cols-4 gap-1 text-center font-mono text-xs">
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-cyan-500/20">
                            <span className="text-[9px] text-cyan-400/80 block font-sans">Ia (A)</span>
                            <span className="font-black text-cyan-300">{log.currentA !== undefined ? `${log.currentA}` : '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-cyan-500/20">
                            <span className="text-[9px] text-cyan-400/80 block font-sans">Ib (A)</span>
                            <span className="font-black text-cyan-300">{log.currentB !== undefined ? `${log.currentB}` : '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-cyan-500/20">
                            <span className="text-[9px] text-cyan-400/80 block font-sans">Ic (A)</span>
                            <span className="font-black text-cyan-300">{log.currentC !== undefined ? `${log.currentC}` : '-'}</span>
                          </div>
                          <div className="bg-slate-900 p-1.5 rounded-xl border border-cyan-500/20">
                            <span className="text-[9px] text-cyan-400/80 block font-sans">Ig (A)</span>
                            <span className="font-black text-cyan-300">{log.currentG !== undefined ? `${log.currentG}` : '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Notes if any */}
                      {log.notes && (
                        <div className="text-[10px] text-slate-300 bg-slate-950 p-2 rounded-xl border border-slate-800">
                          <span className="text-amber-400 font-bold">หมายเหตุ:</span> {log.notes}
                        </div>
                      )}

                      {/* Footer Actions: Copy LINE & Delete */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 font-mono">
                          ID: {log.id}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleCopyLogSummary(log)}
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
                              copiedId === log.id
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                            }`}
                          >
                            {copiedId === log.id ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>คัดลอกเรียบร้อย</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>คัดลอกส่ง LINE</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmTarget({ type: 'single', log })}
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-950/40 hover:bg-rose-600 text-rose-300 hover:text-white transition-all cursor-pointer active:scale-95 shadow-xs"
                            title="ลบรายงานบันทึกนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                            <span>ลบบันทึกนี้</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-6 text-center">
                    <p className="text-xs text-slate-400">ไม่พบรายการบันทึกของจุดที่เลือกในวันนี้</p>
                    <button
                      onClick={() => setSubRecloserFilter('all')}
                      className="mt-2 text-xs text-cyan-400 underline font-bold"
                    >
                      ดูทุกจุดในวันนี้
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      )}

      {/* IN-APP MODAL: DELETE CONFIRMATION DIALOG */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div
            className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-950/90 via-slate-900 to-rose-950/90 p-4 border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center font-bold shadow-md shadow-rose-950/40">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    {deleteConfirmTarget.type === 'single'
                      ? 'ยืนยันลบรายการบันทึก Recloser'
                      : 'ยืนยันลบรายงานบันทึกประจำวัน'}
                  </h3>
                  <p className="text-[11px] text-rose-300/80">
                    ข้อมูลจะถูกลบออกจากฐานข้อมูล Cloud และเครื่องนี้ทันที
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmTarget(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex flex-col gap-3">
              {deleteConfirmTarget.type === 'single' ? (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">จุดติดตั้ง:</span>
                    <span className="font-mono font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                      {deleteConfirmTarget.log.recloserId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">สถานที่:</span>
                    <span className="font-bold text-white">
                      {deleteConfirmTarget.log.recloserName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">วันที่ / เวลา:</span>
                    <span className="font-mono text-cyan-300 font-bold">
                      {formatThaiDateFull(deleteConfirmTarget.log.recordDate)} เวลา {deleteConfirmTarget.log.recordTime} น.
                    </span>
                  </div>
                  {deleteConfirmTarget.log.counterBR !== undefined && (
                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                      <span className="text-slate-400">Counter B/R:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {deleteConfirmTarget.log.counterBR} ครั้ง
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5">
                    <span className="text-slate-400">โหลด Current:</span>
                    <span className="font-mono text-cyan-400">
                      Ia: {deleteConfirmTarget.log.currentA ?? '-'}A | Ib: {deleteConfirmTarget.log.currentB ?? '-'}A | Ic: {deleteConfirmTarget.log.currentC ?? '-'}A
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">วันที่ต้องการลบ:</span>
                    <span className="font-bold text-white">
                      {formatThaiDateFull(deleteConfirmTarget.date)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">จำนวนบันทึกที่จะถูกลบ:</span>
                    <span className="font-mono font-black text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/30">
                      {deleteConfirmTarget.count} รายการ
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 leading-relaxed">
                    ⚠️ คำเตือน: ข้อมูลบันทึก Recloser ทุกจุดของวันที่ <b>{formatThaiDateShort(deleteConfirmTarget.date)}</b> จะถูกลบถาวร
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400">
                คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>
            </div>

            {/* Modal Actions */}
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeleting ? 'กำลังลบข้อมูล...' : 'ยืนยันลบข้อมูล'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST: DELETE RESULT NOTIFICATION */}
      {deleteToastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-rose-500 text-white text-xs font-bold py-2.5 px-4 rounded-2xl shadow-2xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{deleteToastMsg}</span>
        </div>
      )}

      {/* RECLOSER REPORT EXPORT MODAL */}
      <RecloserExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        recloserLogs={recloserLogs}
        initialSelectedDate={exportInitialDate}
        onDeleteLog={onDeleteLog}
        onDeleteBatchLogs={onDeleteBatchLogs}
      />

    </div>
  );
};
