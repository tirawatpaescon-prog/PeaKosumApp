import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  Filter,
  Check,
  X,
  Zap,
  FileSpreadsheet,
  Clock3,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { RecloserLog } from '../types';
import { PRESET_RECLOSERS, formatThaiDateFull, formatThaiDateShort } from './RecloserTab';

interface RecloserExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  recloserLogs: RecloserLog[];
  initialSelectedDate?: string | null;
  onDeleteLog?: (id: string) => void | Promise<void>;
  onDeleteBatchLogs?: (ids: string[]) => void | Promise<void>;
}

export const RecloserExportModal: React.FC<RecloserExportModalProps> = ({
  isOpen,
  onClose,
  recloserLogs,
  initialSelectedDate = null,
  onDeleteLog,
  onDeleteBatchLogs
}) => {
  // Filter states
  const [dateScope, setDateScope] = useState<'selected' | 'today' | '7days' | '30days' | 'custom' | 'all'>(
    initialSelectedDate ? 'selected' : 'all'
  );
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [targetRecloser, setTargetRecloser] = useState<string>('all');
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessNotice, setExportSuccessNotice] = useState<string | null>(null);
  const [showItemManagement, setShowItemManagement] = useState(false);
  const [confirmDeleteAllInReport, setConfirmDeleteAllInReport] = useState(false);

  // Filter logs based on criteria
  const filteredLogs = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    return recloserLogs.filter((log) => {
      // 1. Recloser point filter
      if (targetRecloser !== 'all' && log.recloserId !== targetRecloser) {
        return false;
      }

      // 2. Date Scope filter
      const logDate = log.recordDate || '';
      if (!logDate) return dateScope === 'all';

      if (dateScope === 'selected' && initialSelectedDate) {
        return logDate === initialSelectedDate;
      }
      if (dateScope === 'today') {
        return logDate === todayStr;
      }
      if (dateScope === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        const limitStr = d.toISOString().split('T')[0];
        return logDate >= limitStr && logDate <= todayStr;
      }
      if (dateScope === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        const limitStr = d.toISOString().split('T')[0];
        return logDate >= limitStr && logDate <= todayStr;
      }
      if (dateScope === 'custom') {
        if (customStartDate && logDate < customStartDate) return false;
        if (customEndDate && logDate > customEndDate) return false;
        return true;
      }

      return true; // 'all'
    }).sort((a, b) => {
      // Sort chronologically (date asc, then time asc) for reports
      const dateCmp = a.recordDate.localeCompare(b.recordDate);
      if (dateCmp !== 0) return dateCmp;
      return a.recordTime.localeCompare(b.recordTime);
    });
  }, [recloserLogs, targetRecloser, dateScope, initialSelectedDate, customStartDate, customEndDate]);

  // Statistics calculation for the document
  const stats = useMemo(() => {
    let totalTripBR = 0;
    let maxCurrentA = 0;
    let maxCurrentB = 0;
    let maxCurrentC = 0;
    let maxCurrentG = 0;
    const uniqueReclosers = new Set<string>();
    const uniqueDates = new Set<string>();

    filteredLogs.forEach((l) => {
      uniqueReclosers.add(l.recloserId);
      uniqueDates.add(l.recordDate);
      if (l.counterBR !== undefined) totalTripBR += l.counterBR;
      if (l.currentA !== undefined && l.currentA > maxCurrentA) maxCurrentA = l.currentA;
      if (l.currentB !== undefined && l.currentB > maxCurrentB) maxCurrentB = l.currentB;
      if (l.currentC !== undefined && l.currentC > maxCurrentC) maxCurrentC = l.currentC;
      if (l.currentG !== undefined && l.currentG > maxCurrentG) maxCurrentG = l.currentG;
    });

    return {
      totalRecords: filteredLogs.length,
      pointCount: uniqueReclosers.size,
      dayCount: uniqueDates.size,
      totalTripBR,
      maxCurrentA,
      maxCurrentB,
      maxCurrentC,
      maxCurrentG
    };
  }, [filteredLogs]);

  // Date range summary string
  const dateRangeSummary = useMemo(() => {
    if (dateScope === 'selected' && initialSelectedDate) {
      return `วันที่ ${formatThaiDateFull(initialSelectedDate)}`;
    }
    if (dateScope === 'today') {
      return `วันที่ ${formatThaiDateFull(new Date().toISOString().split('T')[0])}`;
    }
    if (dateScope === '7days') {
      return 'ย้อนหลัง 7 วัน';
    }
    if (dateScope === '30days') {
      return 'ย้อนหลัง 30 วัน';
    }
    if (dateScope === 'custom') {
      return `ตั้งแต่วันที่ ${formatThaiDateShort(customStartDate)} ถึง ${formatThaiDateShort(customEndDate)}`;
    }
    return 'ข้อมูลประวัติทั้งหมด';
  }, [dateScope, initialSelectedDate, customStartDate, customEndDate]);

  if (!isOpen) return null;

  // 1. PRINT / PDF DOCUMENT HANDLER
  const handlePrintDocument = () => {
    if (filteredLogs.length === 0) {
      alert('ไม่พบข้อมูลในช่วงเวลาและเงื่อนไขที่เลือก');
      return;
    }

    setIsExporting(true);

    const printWindow = window.open('', '_blank', 'width=1000,height=900');
    if (!printWindow) {
      alert('กรุณาอนุญาต Pop-up Window ในเบราว์เซอร์เพื่อเปิดเอกสารสำหรับพิมพ์ / PDF');
      setIsExporting(false);
      return;
    }

    const reportTitle = dateScope === 'selected' && initialSelectedDate
      ? `รายงานบันทึกค่า Recloser ประจำวันที่ ${formatThaiDateFull(initialSelectedDate)}`
      : `รายงานบันทึกค่า Recloser (${filteredLogs.length} รายการ)`;

    const nowThaiDate = formatThaiDateFull(new Date().toISOString().split('T')[0]);
    const nowThaiTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    const printHtml = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>${reportTitle}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap');
    
    @page {
      size: A4 portrait;
      margin: 12mm 10mm 15mm 10mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: #111827;
      background-color: #ffffff;
      margin: 0;
      padding: 15px;
    }

    .report-header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .logo-area {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .pea-badge {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      font-weight: 800;
      font-size: 16px;
      padding: 8px 14px;
      border-radius: 8px;
      letter-spacing: 1px;
      display: inline-block;
      text-align: center;
    }

    .header-text h1 {
      margin: 0;
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
    }

    .header-text h2 {
      margin: 2px 0 0 0;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
    }

    .doc-meta {
      text-align: right;
      font-size: 12px;
      color: #334155;
    }

    .doc-meta .meta-tag {
      display: inline-block;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      color: #0369a1;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    /* Summary Stats Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }

    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
    }

    .summary-card .label {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 2px;
      display: block;
    }

    .summary-card .value {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }

    /* Table Styles */
    table.report-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 11.5px;
    }

    table.report-table th, 
    table.report-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
      text-align: center;
    }

    table.report-table th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      font-size: 11px;
    }

    table.report-table th.main-header {
      background-color: #e2e8f0;
      font-size: 12px;
    }

    table.report-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    table.report-table td.text-left {
      text-align: left;
    }

    table.report-table td.font-mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 600;
    }

    table.report-table .highlight-col {
      background-color: #fef3c7;
      font-weight: 700;
      color: #92400e;
    }

    .footer-note {
      margin-top: 25px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      color: #64748b;
    }

    .no-print-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
      z-index: 9999;
    }

    .no-print-bar button {
      background: #f59e0b;
      color: #000;
      font-weight: 700;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }

    .no-print-bar button:hover {
      background: #fbbf24;
    }

    @media print {
      .no-print-bar {
        display: none !important;
      }
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>

  <!-- Screen-only Action Bar -->
  <div class="no-print-bar">
    <div style="font-weight: 600; font-size: 14px;">
      📄 พรีวิวเอกสารรายงาน Recloser (${filteredLogs.length} รายการ)
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()">🖨️ สั่งพิมพ์ / บันทึกเป็น PDF</button>
      <button style="background: #e2e8f0; color: #333;" onclick="window.close()">ปิดหน้าต่าง</button>
    </div>
  </div>

  <div style="height: 35px;" class="no-print-bar-spacer"></div>

  <!-- Document Header -->
  <div class="report-header">
    <div class="logo-area">
      <div class="pea-badge">PEA</div>
      <div class="header-text">
        <h1>รายงานบันทึกค่า Recloser</h1>
        <h2>อุปกรณ์ตัดตอนอัตโนมัติในระบบจำหน่ายไฟฟ้า • ช่วงข้อมูล: ${dateRangeSummary}</h2>
      </div>
    </div>
    <div class="doc-meta">
      <div class="meta-tag">วันที่-เวลาที่ออกเอกสาร</div>
      <div><strong>วันที่:</strong> ${nowThaiDate}</div>
      <div><strong>เวลา:</strong> ${nowThaiTime} น.</div>
    </div>
  </div>

  <!-- Summary Statistics Grid -->
  <div class="summary-grid">
    <div class="summary-card">
      <span class="label">จำนวนรายการที่บันทึก</span>
      <span class="value">${stats.totalRecords} รายการ</span>
    </div>
    <div class="summary-card">
      <span class="label">จุดติดตั้งที่บันทึก</span>
      <span class="value">${stats.pointCount} จุด</span>
    </div>
    <div class="summary-card">
      <span class="label">จำนวนวันที่มีข้อมูล</span>
      <span class="value">${stats.dayCount} วัน</span>
    </div>
    <div class="summary-card" style="background: #fef3c7; border-color: #fde68a;">
      <span class="label" style="color: #92400e;">กระแสสูงสุดที่ตรวจพบ (A)</span>
      <span class="value" style="color: #b45309;">Ia:${stats.maxCurrentA} / Ib:${stats.maxCurrentB} / Ic:${stats.maxCurrentC}</span>
    </div>
  </div>

  <!-- Data Table -->
  <table class="report-table">
    <thead>
      <tr>
        <th rowspan="2" style="width: 28px;">ที่</th>
        <th rowspan="2" style="width: 85px;">วันที่</th>
        <th rowspan="2" style="width: 55px;">เวลา</th>
        <th rowspan="2" style="width: 80px;">รหัส Recloser</th>
        <th rowspan="2" style="width: 120px;">สถานที่ติดตั้ง</th>
        <th colspan="5" class="main-header" style="background: #e0f2fe; color: #0369a1;">1. Counter (ครั้ง)</th>
        <th colspan="4" class="main-header" style="background: #ccfbf1; color: #0f766e;">2. Current โหลด (A)</th>
        <th rowspan="2">หมายเหตุ</th>
      </tr>
      <tr>
        <!-- Counter subheaders -->
        <th style="width: 40px; background: #e0f2fe;">B/R</th>
        <th style="width: 35px; background: #f0f9ff;">A</th>
        <th style="width: 35px; background: #f0f9ff;">B</th>
        <th style="width: 35px; background: #f0f9ff;">C</th>
        <th style="width: 35px; background: #f0f9ff;">G</th>
        <!-- Current subheaders -->
        <th style="width: 40px; background: #ccfbf1;">Ia</th>
        <th style="width: 40px; background: #ccfbf1;">Ib</th>
        <th style="width: 40px; background: #ccfbf1;">Ic</th>
        <th style="width: 40px; background: #ccfbf1;">Ig</th>
      </tr>
    </thead>
    <tbody>
      ${filteredLogs.map((log, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td class="font-mono">${log.recordDate}</td>
          <td class="font-mono">${log.recordTime} น.</td>
          <td class="font-mono" style="font-weight: 700; color: #0369a1;">${log.recloserId}</td>
          <td class="text-left" style="font-weight: 600;">${log.recloserName}</td>
          <td class="font-mono ${log.counterBR && log.counterBR > 0 ? 'highlight-col' : ''}">${log.counterBR ?? '-'}</td>
          <td class="font-mono">${log.counterA ?? '-'}</td>
          <td class="font-mono">${log.counterB ?? '-'}</td>
          <td class="font-mono">${log.counterC ?? '-'}</td>
          <td class="font-mono">${log.counterG ?? '-'}</td>
          <td class="font-mono" style="color: #0f766e; font-weight: 700;">${log.currentA !== undefined ? log.currentA : '-'}</td>
          <td class="font-mono" style="color: #0f766e; font-weight: 700;">${log.currentB !== undefined ? log.currentB : '-'}</td>
          <td class="font-mono" style="color: #0f766e; font-weight: 700;">${log.currentC !== undefined ? log.currentC : '-'}</td>
          <td class="font-mono" style="color: #0f766e; font-weight: 700;">${log.currentG !== undefined ? log.currentG : '-'}</td>
          <td class="text-left" style="font-size: 11px; color: #475569;">${log.notes || '-'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- Document Footer Note -->
  <div class="footer-note">
    <div>พิมพ์จากระบบเมื่อ: ${nowThaiDate} เวลา ${nowThaiTime} น.</div>
    <div>จำนวนรายการทั้งหมด: ${filteredLogs.length} รายการ</div>
  </div>

</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();

    setIsExporting(false);
    setExportSuccessNotice('เปิดหน้าต่างเตรียมพิมพ์ / บันทึก PDF สำเร็จ');
    setTimeout(() => setExportSuccessNotice(null), 3500);
  };

  // 2. EXCEL / CSV EXPORT HANDLER
  const handleExportExcelSpreadsheet = () => {
    if (filteredLogs.length === 0) {
      alert('ไม่พบข้อมูลในช่วงเวลาและเงื่อนไขที่เลือก');
      return;
    }

    const headers = [
      'ลำดับ',
      'วันที่',
      'เวลา',
      'รหัส Recloser',
      'สถานที่ติดตั้ง',
      'Counter B/R (ครั้ง)',
      'Counter A',
      'Counter B',
      'Counter C',
      'Counter G',
      'Current Ia (A)',
      'Current Ib (A)',
      'Current Ic (A)',
      'Current Ig (A)',
      'หมายเหตุ'
    ];

    const rows = filteredLogs.map((log, idx) => [
      idx + 1,
      `"${log.recordDate}"`,
      `"${log.recordTime}"`,
      `"${log.recloserId}"`,
      `"${log.recloserName}"`,
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

    const metadataHeader = [
      `"รายงานบันทึกค่า Recloser"`,
      `"ช่วงวันที่ข้อมูล: ${dateRangeSummary}"`,
      `"วันที่และเวลาที่ส่งออกข้อมูล: ${formatThaiDateFull(new Date().toISOString().split('T')[0])} ${new Date().toLocaleTimeString('th-TH')}"`,
      `"จำนวนทั้งหมด: ${filteredLogs.length} รายการ"`,
      ''
    ];

    const csvContent = '\uFEFF' + [
      ...metadataHeader,
      headers.join(','),
      ...rows.map((r) => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateTag = dateScope === 'selected' && initialSelectedDate 
      ? initialSelectedDate 
      : new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `PEA_Recloser_Report_${dateTag}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportSuccessNotice('ดาวน์โหลดเอกสาร Excel (CSV) เรียบร้อย');
    setTimeout(() => setExportSuccessNotice(null), 3500);
  };

  // 3. TEXT MEMO / SUMMARY EXPORT HANDLER
  const handleExportTextDocument = () => {
    if (filteredLogs.length === 0) {
      alert('ไม่พบข้อมูลในช่วงเวลาและเงื่อนไขที่เลือก');
      return;
    }

    let text = `==========================================================\n`;
    text += `⚡ รายงานผลการตรวจสอบและบันทึกค่า RECLOSER ⚡\n`;
    text += `📅 ช่วงข้อมูล: ${dateRangeSummary}\n`;
    text += `⏰ วันที่และเวลาที่ออกรายงาน: ${formatThaiDateFull(new Date().toISOString().split('T')[0])} เวลา ${new Date().toLocaleTimeString('th-TH')} น.\n`;
    text += `==========================================================\n\n`;

    text += `📊 ข้อมูลสรุปภาพรวม:\n`;
    text += ` • จำนวนรายการที่ตรวจสอบ: ${stats.totalRecords} รายการ\n`;
    text += ` • จำนวนจุดติดตั้ง: ${stats.pointCount} จุด\n`;
    text += ` • จำนวนวันที่มีข้อมูล: ${stats.dayCount} วัน\n\n`;
    text += `----------------------------------------------------------\n`;
    text += `📝 รายละเอียดการบันทึกแต่ละจุด:\n`;
    text += `----------------------------------------------------------\n`;

    filteredLogs.forEach((log, index) => {
      text += `\n[รายการที่ ${index + 1}] จุดติดตั้ง: ${log.recloserId} (${log.recloserName})\n`;
      text += `📅 วันที่: ${formatThaiDateShort(log.recordDate)} เวลา: ${log.recordTime} น.\n`;
      text += `🔢 1. Counter (ครั้ง):\n`;
      text += `   - B/R: ${log.counterBR ?? '-'} ครั้ง\n`;
      text += `   - A: ${log.counterA ?? '-'} | B: ${log.counterB ?? '-'} | C: ${log.counterC ?? '-'} | G: ${log.counterG ?? '-'}\n`;
      text += `📈 2. Current โหลด (Ampere):\n`;
      text += `   - Ia: ${log.currentA !== undefined ? `${log.currentA} A` : '-'}\n`;
      text += `   - Ib: ${log.currentB !== undefined ? `${log.currentB} A` : '-'}\n`;
      text += `   - Ic: ${log.currentC !== undefined ? `${log.currentC} A` : '-'}\n`;
      text += `   - Ig: ${log.currentG !== undefined ? `${log.currentG} A` : '-'}\n`;
      if (log.notes) {
        text += `📝 หมายเหตุ: ${log.notes}\n`;
      }
      text += `----------------------------------------------------------\n`;
    });

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateTag = dateScope === 'selected' && initialSelectedDate 
      ? initialSelectedDate 
      : new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `PEA_Recloser_Memo_${dateTag}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportSuccessNotice('ดาวน์โหลดเอกสารสรุปข้อความเรียบร้อย');
    setTimeout(() => setExportSuccessNotice(null), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div 
        className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="bg-gradient-to-r from-purple-900/80 via-slate-900 to-indigo-900/80 p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                <span>ออกเอกสารรายงาน Recloser</span>
                <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                  PEA Export
                </span>
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5 text-slate-500" />
                <span>แสดงข้อมูลพร้อมวันที่และเวลา</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* NOTIFICATION BANNER */}
        {exportSuccessNotice && (
          <div className="bg-emerald-950 border-b border-emerald-500/50 px-4 py-2 flex items-center gap-2 text-xs text-emerald-200 font-bold animate-fadeIn shrink-0">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{exportSuccessNotice}</span>
          </div>
        )}

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* SECTION 1: SCOPE & DATE FILTERS */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>1. กำหนดช่วงข้อมูลที่ต้องการออกเอกสาร:</span>
              </label>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                พบ {filteredLogs.length} รายการ
              </span>
            </div>

            {/* Quick scope radio buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              {initialSelectedDate && (
                <button
                  type="button"
                  onClick={() => setDateScope('selected')}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer truncate ${
                    dateScope === 'selected'
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  📅 วันที่กำลังดู ({formatThaiDateShort(initialSelectedDate)})
                </button>
              )}

              <button
                type="button"
                onClick={() => setDateScope('all')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  dateScope === 'all'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                📜 ข้อมูลทั้งหมด ({recloserLogs.length})
              </button>

              <button
                type="button"
                onClick={() => setDateScope('today')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  dateScope === 'today'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                ⚡ วันนี้เท่านั้น
              </button>

              <button
                type="button"
                onClick={() => setDateScope('7days')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  dateScope === '7days'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                7 วันล่าสุด
              </button>

              <button
                type="button"
                onClick={() => setDateScope('30days')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  dateScope === '30days'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                30 วันล่าสุด
              </button>

              <button
                type="button"
                onClick={() => setDateScope('custom')}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                  dateScope === 'custom'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                ⚙️ กำหนดช่วงเอง
              </button>
            </div>

            {/* Custom Date Range Picker */}
            {dateScope === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 animate-fadeIn">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">ตั้งแต่วันที่:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">ถึงวันที่:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full bg-slate-900 text-white p-2 rounded-xl border border-slate-700 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: RECLOSER TARGET FILTER */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
            <label className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
              <Filter className="w-4 h-4 text-amber-400" />
              <span>2. เลือกจุดติดตั้ง Recloser ที่จะออกรายงาน:</span>
            </label>

            <select
              value={targetRecloser}
              onChange={(e) => setTargetRecloser(e.target.value)}
              className="w-full bg-slate-900 text-white border border-slate-700 p-2.5 rounded-xl font-mono text-xs focus:border-amber-400 focus:outline-none"
            >
              <option value="all">⚡ รวมทุกจุดติดตั้ง (ทั้ง 7 จุดหลัก)</option>
              {PRESET_RECLOSERS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.id} - {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* PREVIEW SUMMARY BADGE */}
          <div className="bg-amber-950/40 border border-amber-500/30 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-[11px] text-slate-300">
                <span className="font-bold text-amber-300">ความพร้อมเอกสาร:</span> {filteredLogs.length} รายการ ({stats.pointCount} จุด, {stats.dayCount} วัน)
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {stats.totalTripBR > 0 ? `Trip B/R รวม: ${stats.totalTripBR}` : 'ไม่มี Trip'}
            </span>
          </div>

          {/* ITEM MANAGEMENT & DELETE SECTION (OPTIONAL EXPANDABLE) */}
          {onDeleteLog && filteredLogs.length > 0 && (
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-2.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowItemManagement(!showItemManagement)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>จัดการ / ลบรายการในรายงาน ({filteredLogs.length})</span>
                  {showItemManagement ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {showItemManagement && !confirmDeleteAllInReport && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAllInReport(true)}
                    className="text-[10px] font-bold text-rose-400 hover:text-white bg-rose-950/50 hover:bg-rose-600 border border-rose-500/30 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                  >
                    ลบทั้งหมดในรายงานนี้
                  </button>
                )}
              </div>

              {/* Confirm Delete All in report */}
              {confirmDeleteAllInReport && (
                <div className="bg-rose-950/60 border border-rose-500/50 p-2.5 rounded-xl text-xs text-rose-200 flex flex-col gap-2 animate-fadeIn">
                  <p className="font-bold">
                    ⚠️ ยืนยันการลบทั้ง {filteredLogs.length} รายการที่เลือกในรายงานนี้หรือไม่?
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAllInReport(false)}
                      className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-[11px] font-bold hover:bg-slate-800 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ids = filteredLogs.map((l) => l.id);
                        setConfirmDeleteAllInReport(false);
                        if (onDeleteBatchLogs) {
                          await onDeleteBatchLogs(ids);
                        } else if (onDeleteLog) {
                          for (const id of ids) {
                            await onDeleteLog(id);
                          }
                        }
                        setExportSuccessNotice(`ลบ ${ids.length} รายการในรายงานเรียบร้อย`);
                        setTimeout(() => setExportSuccessNotice(null), 3000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                    >
                      ยืนยันลบทั้งหมด
                    </button>
                  </div>
                </div>
              )}

              {/* List of items with individual delete buttons */}
              {showItemManagement && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 animate-fadeIn">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-900 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-1 rounded text-[10px]">
                            {log.recloserId}
                          </span>
                          <span className="font-mono text-slate-400 text-[10px]">
                            {log.recordDate} {log.recordTime} น.
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {log.recloserName} • B/R: {log.counterBR ?? '-'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (onDeleteLog) {
                            await onDeleteLog(log.id);
                            setExportSuccessNotice(`ลบรายการ ${log.recloserId} เรียบร้อย`);
                            setTimeout(() => setExportSuccessNotice(null), 2500);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="ลบรายการนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER ACTIONS */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
          {/* Primary Action 1: Print / PDF */}
          <button
            id="btn-export-pdf"
            type="button"
            onClick={handlePrintDocument}
            disabled={filteredLogs.length === 0 || isExporting}
            className="flex-1 min-h-[46px] py-2.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>🖨️ พิมพ์ / บันทึกเป็น PDF</span>
          </button>

          {/* Secondary Action 2: Excel / Spreadsheet */}
          <button
            id="btn-export-excel"
            type="button"
            onClick={handleExportExcelSpreadsheet}
            disabled={filteredLogs.length === 0}
            className="min-h-[46px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-emerald-300 hover:text-white font-bold text-xs rounded-2xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            title="ดาวน์โหลดเป็นไฟล์ Excel ตารางสรุป"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel (.CSV)</span>
          </button>

          {/* Secondary Action 3: Text Memo */}
          <button
            id="btn-export-text"
            type="button"
            onClick={handleExportTextDocument}
            disabled={filteredLogs.length === 0}
            className="min-h-[46px] py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white font-bold text-xs rounded-2xl border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
            title="ดาวน์โหลดเป็นเอกสารข้อความสรุป"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Text Memo</span>
          </button>
        </div>

      </div>
    </div>
  );
};
