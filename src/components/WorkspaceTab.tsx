import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  HardDrive,
  CloudUpload,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Folder,
  FileText,
  FileCode,
  Download,
  Calendar,
  Zap,
  Lightbulb,
  Compass,
  LogOut,
  ChevronRight,
  Database,
  ArrowRight
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { WorkspaceConfirmModal } from './WorkspaceConfirmModal';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken
} from '../lib/workspaceAuth';
import {
  listDriveFiles,
  findOrCreateAppFolder,
  createSpreadsheet,
  getSpreadsheetMetadata,
  getSpreadsheetValues,
  deleteDriveFile,
  exportRecloserLogsToGoogleSheet,
  exportMeterAssayToGoogleSheet,
  exportStreetlightSurveyToGoogleSheet,
  backupAppDataToGoogleDrive,
  DriveFileItem,
  SpreadsheetMetadata
} from '../lib/googleDriveSheets';
import { RecloserLog, MeterAssayItem, StreetlightSurveyStatusType } from '../types';

interface WorkspaceTabProps {
  recloserLogs: RecloserLog[];
  streetlightStatuses?: Record<string, { status: StreetlightSurveyStatusType; updatedAt: number; village?: string }>;
  meterAssayItems?: MeterAssayItem[];
  onNavigateTab: (tab: any) => void;
}

export const WorkspaceTab: React.FC<WorkspaceTabProps> = ({
  recloserLogs,
  streetlightStatuses = {},
  meterAssayItems = [],
  onNavigateTab
}) => {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Sub-tabs in Workspace Hub: 'sheets' | 'drive' | 'backup'
  const [subTab, setSubTab] = useState<'sheets' | 'drive' | 'backup'>('sheets');

  // Status banner
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; link?: string } | null>(null);

  // Drive files state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);
  const [driveSearch, setDriveSearch] = useState<string>('');
  const [driveFilter, setDriveFilter] = useState<'all' | 'spreadsheet' | 'folder'>('all');

  // Sheets Reader state
  const [sheetInputId, setSheetInputId] = useState<string>('');
  const [isReadingSheet, setIsReadingSheet] = useState<boolean>(false);
  const [readMetadata, setReadMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>('');
  const [sheetRows, setSheetRows] = useState<any[][]>([]);

  // Export progress
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Backup progress
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);

  // Destructive Action Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    affectedItems?: string[];
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: async () => {}
  });

  // Initialize auth state
  useEffect(() => {
    setIsAuthLoading(true);
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setIsAuthLoading(false);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
        setIsAuthLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch Drive files when token is available or subTab changes
  const fetchDriveFilesList = useCallback(async (tokenToUse?: string) => {
    const token = tokenToUse || accessToken;
    if (!token) return;

    setIsDriveLoading(true);
    try {
      const files = await listDriveFiles(token, {
        pageSize: 40,
        mimeTypeFilter: driveFilter === 'all' ? undefined : driveFilter,
        searchTerm: driveSearch
      });
      setDriveFiles(files);
    } catch (err: any) {
      console.warn('Drive files fetch error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'ไม่สามารถโหลดรายการไฟล์จาก Google Drive ได้'
      });
    } finally {
      setIsDriveLoading(false);
    }
  }, [accessToken, driveFilter, driveSearch]);

  useEffect(() => {
    if (accessToken) {
      fetchDriveFilesList();
    }
  }, [accessToken, driveFilter, fetchDriveFilesList]);

  // Handle Login
  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessToken(result.accessToken);
        setStatusMessage({
          type: 'success',
          text: `เชื่อมต่อ Google สำเร็จ: ${result.user.displayName || result.user.email}`
        });
        fetchDriveFilesList(result.accessToken);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'การเข้าสู่ระบบ Google ล้มเหลว กรุณาลองใหม่อีกครั้ง'
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'ออกจากระบบ Google Workspace',
      description: 'คุณต้องการออกจากระบบ Google และยกเลิกการเข้าถึง Google Drive / Sheets ในเซสชันนี้หรือไม่?',
      affectedItems: [currentUser?.email || 'บัญชี Google ปัจจุบัน'],
      action: async () => {
        await logout();
        setCurrentUser(null);
        setAccessToken(null);
        setDriveFiles([]);
        setReadMetadata(null);
        setSheetRows([]);
        setStatusMessage({
          type: 'info',
          text: 'ออกจากระบบ Google เรียบร้อยแล้ว'
        });
      }
    });
  };

  // 1. EXPORT RECLOSER LOGS TO GOOGLE SHEET
  const handleExportRecloser = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบ Google ก่อนดำเนินการ' });
      return;
    }
    if (recloserLogs.length === 0) {
      setStatusMessage({ type: 'error', text: 'ไม่พบรายการบันทึก Recloser สำหรับส่งออก' });
      return;
    }

    setIsExporting(true);
    setStatusMessage(null);
    try {
      const res = await exportRecloserLogsToGoogleSheet(accessToken, recloserLogs);
      setStatusMessage({
        type: 'success',
        text: `สร้าง Google Sheet บันทึกค่า Recloser สำเร็จ (${res.rowCount} รายการ)`,
        link: res.spreadsheetUrl
      });
      fetchDriveFilesList();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ส่งออกข้อมูล Recloser ไม่สำเร็จ: ${err?.message || err}`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 2. EXPORT METER ASSAY TO GOOGLE SHEET
  const handleExportMeterAssay = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบ Google ก่อนดำเนินการ' });
      return;
    }
    if (meterAssayItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'ไม่พบรายการ Meter Assay สำหรับส่งออก' });
      return;
    }

    setIsExporting(true);
    setStatusMessage(null);
    try {
      const res = await exportMeterAssayToGoogleSheet(accessToken, meterAssayItems);
      setStatusMessage({
        type: 'success',
        text: `สร้าง Google Sheet ข้อมูล Meter Assay สำเร็จ (${res.rowCount} รายการ)`,
        link: res.spreadsheetUrl
      });
      fetchDriveFilesList();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ส่งออก Meter Assay ไม่สำเร็จ: ${err?.message || err}`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 3. EXPORT STREETLIGHT SURVEY TO GOOGLE SHEET
  const handleExportStreetlight = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบ Google ก่อนดำเนินการ' });
      return;
    }
    const count = Object.keys(streetlightStatuses).length;
    if (count === 0) {
      setStatusMessage({ type: 'error', text: 'ยังไม่มีข้อมูลการสำรวจโคมไฟสำหรับส่งออก' });
      return;
    }

    setIsExporting(true);
    setStatusMessage(null);
    try {
      const res = await exportStreetlightSurveyToGoogleSheet(accessToken, streetlightStatuses);
      setStatusMessage({
        type: 'success',
        text: `สร้าง Google Sheet ผลสำรวจโคมไฟสำเร็จ (${res.rowCount} หม้อแปลง)`,
        link: res.spreadsheetUrl
      });
      fetchDriveFilesList();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ส่งออกผลสำรวจโคมไฟไม่สำเร็จ: ${err?.message || err}`
      });
    } finally {
      setIsExporting(false);
    }
  };

  // 4. READ GOOGLE SPREADSHEET
  const handleReadSpreadsheet = async (sheetIdOrUrlToRead?: string) => {
    const rawInput = (sheetIdOrUrlToRead || sheetInputId).trim();
    if (!accessToken || !rawInput) return;

    // Extract Spreadsheet ID from URL if full URL is pasted
    let spreadsheetId = rawInput;
    const urlMatch = rawInput.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch && urlMatch[1]) {
      spreadsheetId = urlMatch[1];
    }

    setIsReadingSheet(true);
    setStatusMessage(null);
    try {
      // 1. Fetch metadata to avoid hardcoded sheet names
      const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
      setReadMetadata(meta);

      // Default to first sheet title
      const firstTab = meta.sheets[0]?.title || 'Sheet1';
      setSelectedSheetTab(firstTab);

      // 2. Fetch rows
      const rows = await getSpreadsheetValues(accessToken, spreadsheetId, `'${firstTab}'!A1:Z50`);
      setSheetRows(rows);

      setStatusMessage({
        type: 'success',
        text: `อ่านข้อมูลสเปรดชีต "${meta.title}" สำเร็จ (${rows.length} แถว)`
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ไม่สามารถเปิดอ่าน Google Sheet: ${err?.message || err}`
      });
    } finally {
      setIsReadingSheet(false);
    }
  };

  // Change tab when reading sheet
  const handleChangeSheetTab = async (tabTitle: string) => {
    if (!accessToken || !readMetadata) return;
    setSelectedSheetTab(tabTitle);
    setIsReadingSheet(true);
    try {
      const rows = await getSpreadsheetValues(accessToken, readMetadata.spreadsheetId, `'${tabTitle}'!A1:Z50`);
      setSheetRows(rows);
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: `ไม่สามารถอ่านแท็บ ${tabTitle}: ${e.message}` });
    } finally {
      setIsReadingSheet(false);
    }
  };

  // 5. FULL CLOUD BACKUP TO GOOGLE DRIVE
  const handleFullBackup = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'กรุณาเข้าสู่ระบบ Google ก่อนดำเนินการ' });
      return;
    }

    setIsBackingUp(true);
    setStatusMessage(null);
    try {
      const backupFile = await backupAppDataToGoogleDrive(accessToken, {
        recloserLogs,
        meterAssayItems,
        streetlightStatuses,
        customLabel: `สำรองข้อมูลระบบภาคสนาม PEA (${recloserLogs.length} Reclosers, ${meterAssayItems.length} Meter Assay, ${Object.keys(streetlightStatuses).length} Streetlights)`
      });

      setStatusMessage({
        type: 'success',
        text: `สำรองข้อมูลลง Google Drive สำเร็จ: "${backupFile.name}"`,
        link: backupFile.webViewLink
      });
      fetchDriveFilesList();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `สำรองข้อมูลไม่สำเร็จ: ${err?.message || err}`
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  // 6. DELETE FILE WITH MANDATORY USER CONFIRMATION DIALOG
  const requestDeleteFile = (file: DriveFileItem) => {
    if (!accessToken) return;

    setConfirmModal({
      isOpen: true,
      title: 'ยืนยันการลบไฟล์จาก Google Drive',
      description: `คุณต้องการลบไฟล์ "${file.name}" อย่างถาวรจาก Google Drive ของคุณหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      affectedItems: [
        `ชื่อไฟล์: ${file.name}`,
        `รหัสไฟล์: ${file.id}`,
        `ประเภท: ${file.mimeType}`
      ],
      action: async () => {
        await deleteDriveFile(accessToken, file.id);
        setStatusMessage({
          type: 'success',
          text: `ลบไฟล์ "${file.name}" จาก Google Drive เรียบร้อยแล้ว`
        });
        setDriveFiles((prev) => prev.filter((f) => f.id !== file.id));
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-3.5 pb-20 animate-fadeIn">
      {/* 1. TOP HEADER & ACCOUNT CARD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-teal-950/60 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-black text-white tracking-tight">
                  Google Workspace
                </h2>
                <span className="text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full font-mono">
                  Drive & Sheets
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ส่งออกตาราง, จัดการไฟล์ และสำรองข้อมูลลง Google Drive
              </p>
            </div>
          </div>
        </div>

        {/* AUTH STATUS & USER PROFILE */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-800/80">
          {isAuthLoading ? (
            <div className="flex items-center justify-center py-2 text-xs text-slate-400 gap-2">
              <span className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              <span>กำลังตรวจสอบสถานะบัญชี Google...</span>
            </div>
          ) : currentUser && accessToken ? (
            <div className="flex items-center justify-between gap-2 bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Google User'}
                    className="w-8 h-8 rounded-full border border-teal-400 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center shrink-0 text-xs">
                    {(currentUser.displayName || currentUser.email || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <span>{currentUser.displayName || 'ผู้ใช้งาน Google'}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950" title="เชื่อมต่อแล้ว" />
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {currentUser.email}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 transition-colors cursor-pointer shrink-0"
                title="ออกจากระบบ Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex flex-col items-center gap-2 text-center">
              <div className="text-xs text-slate-300">
                เข้าสู่ระบบ Google เพื่อเชื่อมต่อ Google Drive และ Google Sheets สำหรับงานภาคสนาม
              </div>
              <GoogleSignInButton
                onClick={handleSignIn}
                isLoading={isLoggingIn}
                label="ลงชื่อเข้าใช้ด้วย Google (Sign in)"
                className="w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. STATUS NOTIFICATION BANNER */}
      {statusMessage && (
        <div
          className={`p-3 rounded-2xl border flex items-start gap-2.5 text-xs animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              : 'bg-cyan-950/50 border-cyan-500/40 text-cyan-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold">{statusMessage.text}</div>
            {statusMessage.link && (
              <a
                href={statusMessage.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold text-amber-300 hover:text-amber-200 underline mt-1"
              >
                <span>เปิดดูใน Google Sheets / Drive ทันที</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* 3. WORKSPACE SUB-TABS */}
      <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('sheets')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            subTab === 'sheets'
              ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Google Sheets</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('drive')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            subTab === 'drive'
              ? 'bg-teal-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Google Drive</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('backup')}
          className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            subTab === 'backup'
              ? 'bg-cyan-500 text-slate-950 font-black shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <CloudUpload className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Cloud Backup</span>
        </button>
      </div>

      {/* 4. SUB-TAB CONTENT: GOOGLE SHEETS */}
      {subTab === 'sheets' && (
        <div className="space-y-3.5 animate-fadeIn">
          {/* QUICK EXPORT CARDS */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 space-y-3">
            <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>ส่งออกข้อมูลไปยัง Google Sheets สด</span>
            </h3>

            <div className="grid grid-cols-1 gap-2">
              {/* Export Recloser */}
              <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>บันทึกค่า Recloser</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {recloserLogs.length} รายการ (Counter & กระแสโหลด)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportRecloser}
                  disabled={!accessToken || isExporting || recloserLogs.length === 0}
                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 shrink-0 flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>สร้าง Sheet</span>
                </button>
              </div>

              {/* Export Meter Assay */}
              <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Meter Assay (6 มาตรการ)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {meterAssayItems.length} รายการ พร้อมพิกัด GPS
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportMeterAssay}
                  disabled={!accessToken || isExporting || meterAssayItems.length === 0}
                  className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 shrink-0 flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>สร้าง Sheet</span>
                </button>
              </div>

              {/* Export Streetlight */}
              <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span>ผลสำรวจโคมไฟส่องสว่าง</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate font-mono">
                    {Object.keys(streetlightStatuses).length} หม้อแปลง
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportStreetlight}
                  disabled={!accessToken || isExporting || Object.keys(streetlightStatuses).length === 0}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 disabled:opacity-40 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 shrink-0 flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>สร้าง Sheet</span>
                </button>
              </div>
            </div>
          </div>

          {/* SPREADSHEET READER & VIEWER */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 space-y-3">
            <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-teal-400" />
              <span>เปิดอ่านข้อมูลจาก Google Sheet (ID หรือ ลิงก์)</span>
            </h3>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="วางลิงก์ Google Sheets หรือ ID สเปรดชีต..."
                value={sheetInputId}
                onChange={(e) => setSheetInputId(e.target.value)}
                className="flex-1 bg-slate-950 text-white text-xs p-2.5 rounded-xl border border-slate-800 focus:border-teal-400 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => handleReadSpreadsheet()}
                disabled={!accessToken || isReadingSheet || !sheetInputId.trim()}
                className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                {isReadingSheet ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>อ่านข้อมูล</span>
                )}
              </button>
            </div>

            {/* PREVIEW READ SHEET TABLE */}
            {readMetadata && (
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-black text-white truncate">{readMetadata.title}</h4>
                    <a
                      href={readMetadata.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-teal-400 hover:underline flex items-center gap-1"
                    >
                      <span>เปิดใน Google Sheets</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>

                  {/* Tabs selector */}
                  {readMetadata.sheets.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto max-w-[50%]">
                      {readMetadata.sheets.map((tab) => (
                        <button
                          key={tab.sheetId}
                          type="button"
                          onClick={() => handleChangeSheetTab(tab.title)}
                          className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold whitespace-nowrap cursor-pointer ${
                            selectedSheetTab === tab.title
                              ? 'bg-teal-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {tab.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Table display */}
                {sheetRows.length > 0 ? (
                  <div className="max-h-52 overflow-x-auto overflow-y-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-[11px] text-left border-collapse font-sans">
                      <thead>
                        <tr className="bg-slate-900 border-b border-slate-800 text-slate-300">
                          {sheetRows[0]?.map((col: any, idx: number) => (
                            <th key={idx} className="p-1.5 font-bold whitespace-nowrap border-r border-slate-800 last:border-0">
                              {col || `คอลัมน์ ${idx + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.slice(1).map((row: any[], rIdx: number) => (
                          <tr key={rIdx} className="border-b border-slate-800/60 hover:bg-slate-900/50">
                            {row.map((cell: any, cIdx: number) => (
                              <td key={cIdx} className="p-1.5 text-slate-200 whitespace-nowrap border-r border-slate-800/40 last:border-0 font-mono">
                                {cell ?? ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-slate-500">
                    ไม่พบข้อมูลแถวในแท็บนี้
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SUB-TAB CONTENT: GOOGLE DRIVE */}
      {subTab === 'drive' && (
        <div className="space-y-3.5 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-teal-400" />
                <span>สำรวจไฟล์ใน Google Drive</span>
              </h3>

              <button
                type="button"
                onClick={() => fetchDriveFilesList()}
                disabled={!accessToken || isDriveLoading}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors cursor-pointer"
                title="รีเฟรชรายการไฟล์"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDriveLoading ? 'animate-spin text-teal-400' : ''}`} />
              </button>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDriveFilter('all')}
                className={`px-2.5 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                  driveFilter === 'all'
                    ? 'bg-teal-500 text-slate-950 font-black'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setDriveFilter('spreadsheet')}
                className={`px-2.5 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                  driveFilter === 'spreadsheet'
                    ? 'bg-emerald-500 text-slate-950 font-black'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                }`}
              >
                เฉพาะ Sheets
              </button>
              <button
                type="button"
                onClick={() => setDriveFilter('folder')}
                className={`px-2.5 py-1 rounded-xl font-bold cursor-pointer transition-all ${
                  driveFilter === 'folder'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                }`}
              >
                โฟลเดอร์
              </button>
            </div>

            {/* File List */}
            {isDriveLoading ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                <span className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                <span>กำลังโหลดรายการไฟล์จาก Google Drive...</span>
              </div>
            ) : driveFiles.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                {driveFiles.map((file) => {
                  const isSheet = file.mimeType.includes('spreadsheet');
                  const isFolder = file.mimeType.includes('folder');
                  const isJson = file.mimeType.includes('json');

                  return (
                    <div
                      key={file.id}
                      className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-2.5 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isSheet
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : isFolder
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : isJson
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {isSheet && <FileSpreadsheet className="w-4 h-4" />}
                          {isFolder && <Folder className="w-4 h-4" />}
                          {isJson && <FileCode className="w-4 h-4" />}
                          {!isSheet && !isFolder && !isJson && <FileText className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate" title={file.name}>
                            {file.name}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 font-mono">
                            <span>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString('th-TH') : ''}</span>
                            {isSheet && (
                              <button
                                type="button"
                                onClick={() => handleReadSpreadsheet(file.id)}
                                className="text-emerald-400 hover:underline cursor-pointer font-sans font-bold"
                              >
                                • อ่านข้อมูล
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-white bg-slate-900 rounded-xl border border-slate-800 transition-colors"
                            title="เปิดใน Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => requestDeleteFile(file)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-900 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                          title="ลบไฟล์ (ต้องยืนยัน)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                {!accessToken ? 'กรุณาลงชื่อเข้าใช้ Google เพื่อดูรายการไฟล์' : 'ไม่พบไฟล์ใน Google Drive ตามเงื่อนไข'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. SUB-TAB CONTENT: CLOUD BACKUP & RESTORE */}
      {subTab === 'backup' && (
        <div className="space-y-3.5 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3.5 space-y-3">
            <h3 className="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <CloudUpload className="w-4 h-4 text-cyan-400" />
              <span>สำรองข้อมูลระบบภาคสนามลง Google Drive (Cloud Backup)</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              บันทึกข้อมูล Recloser ทั้งหมด, ข้อมูล Meter Assay และสถานะการสำรวจโคมไฟถนน เก็บไว้ในโฟลเดอร์ <strong className="text-teal-300">"PEA TKT Field Operations"</strong> ใน Google Drive ของคุณโดยอัตโนมัติ
            </p>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>บันทึกค่า Recloser:</span>
                <span className="font-mono font-bold text-amber-300">{recloserLogs.length} รายการ</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>งานสำรวจ Meter Assay:</span>
                <span className="font-mono font-bold text-cyan-300">{meterAssayItems.length} รายการ</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>ผลสำรวจโคมไฟถนน:</span>
                <span className="font-mono font-bold text-emerald-300">{Object.keys(streetlightStatuses).length} หม้อแปลง</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFullBackup}
              disabled={!accessToken || isBackingUp}
              className="w-full py-3 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 disabled:opacity-40 text-slate-950 font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-950/60 active:scale-95 transition-all"
            >
              {isBackingUp ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>กำลังอัปโหลดข้อมูลลง Google Drive...</span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-4 h-4" />
                  <span>สำรองข้อมูลทั้งหมดลง Google Drive ทันที</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 7. MANDATORY DESTRUCTIVE CONFIRMATION MODAL */}
      <WorkspaceConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        description={confirmModal.description}
        affectedItems={confirmModal.affectedItems}
        confirmButtonText="ยืนยันการลบ / ดำเนินการ"
        confirmButtonVariant="danger"
        onConfirm={async () => {
          try {
            await confirmModal.action();
          } finally {
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
