import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { SplashScreen } from './components/SplashScreen';
import { HomeTab } from './components/HomeTab';
import { StreetlightTab } from './components/StreetlightTab';
import { RecloserWorkTab } from './components/RecloserWorkTab';
import { RecloserTab } from './components/RecloserTab';
import { MeterAssayTab } from './components/MeterAssayTab';
import { BottomNavBar } from './components/BottomNavBar';
import { ActiveTab, RecloserLog } from './types';
import { startBackgroundHeartbeat, stopBackgroundHeartbeat } from './lib/backgroundKeepAlive';
import {
  fetchRecloserLogsFromFirestore,
  saveRecloserLogToFirestore,
  deleteRecloserLogFromFirestore,
  deleteBatchRecloserLogsFromFirestore,
  subscribeToRecloserLogs
} from './lib/firebase';
import { 
  User, 
  Home, 
  Share2, 
  WifiOff, 
  Map, 
  Copy, 
  Sun, 
  Moon, 
  CloudDownload, 
  CheckCircle2, 
  Send, 
  Sparkles, 
  Trash2,
  Search,
  History,
  X,
  Mic,
  MicOff,
  MessageCircle,
  Check,
  ExternalLink,
  Filter,
  Zap,
  Lightbulb,
  Wrench,
  Compass
} from 'lucide-react';

import peaBotMascotImg from './assets/images/pea_bot_mascot_1786454271309.jpg';

export interface PeaRecord {
  [key: string]: string;
}

export interface CompactFields {
  fullName: string;
  address: string;
  ca: string;
  meter: string;
  phone: string;
  route: string;
  otherFields: { key: string; val: string }[];
}

export interface IndexedRecord {
  record: PeaRecord;
  rowMeterLower: string;
  rowCaLower: string;
  rowNameAddrNorm: string;
  rowAddressNorm: string;
  rowAddressSkel: string;
  rawSearchStr: string;
  pureMeterDigits: string;
  pureCaDigits: string;
  fullNameSkel: string;
  rowNameAddrSkel: string;
  lat: string | null;
  lon: string | null;
  compactFields: CompactFields;
  matchScore?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  results?: IndexedRecord[];
  extractedSummary?: string;
}

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1EHZXgV7i7sLntVXgqjNxRMpSvYcDupb-7Oh_X7Nzofg/export?format=csv';

// Convert Thai digits (๐-๙) to Arabic digits (0-9)
export const convertThaiDigitsToArabic = (text: string): string => {
  if (!text) return '';
  return text.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));
};

// Normalize Thai text for smart address matching
const normalizeThaiAddress = (text: string): string => {
  if (!text) return '';
  let s = convertThaiDigitsToArabic(text).toLowerCase();

  s = s.replace(/(หมู่บ้าน|หมู่ที่|หมู่|ม\.|ม)\s*0*(\d+)/g, 'ม.$2');
  s = s.replace(/ตำบล\s*/g, 'ต.');
  s = s.replace(/อำเภอ\s*/g, 'อ.');
  s = s.replace(/จังหวัด\s*/g, 'จ.');
  s = s.replace(/ถนน\s*/g, 'ถ.');
  s = s.replace(/ซอย\s*/g, 'ซ.');

  s = s.replace(/\s+/g, ' ').trim();
  return s;
};

// Structured House / Moo Query Parameters
export interface HouseQueryParams {
  rawHouseNumber?: string; // e.g. "12/3", "5", "105/2"
  rawMooNumber?: string;   // e.g. "1", "10"
  textTerms: string[];     // other words e.g. ["ต.ท่าทอง"]
  hasAnyCriteria: boolean;
}

// Parse house address search query into strictly typed components
export const parseHouseAddressQuery = (queryText: string): HouseQueryParams => {
  let cleaned = convertThaiDigitsToArabic(queryText.trim());
  
  // Remove search command prefix words
  cleaned = cleaned.replace(/^(บ้านเลขที่|เลขที่บ้าน|เลขที่|บ้าน|ที่อยู่)\s*/gi, '');
  cleaned = normalizeThaiAddress(cleaned);

  let rawMooNumber: string | undefined;
  // Match and extract Moo: e.g. ม.1, หมู่ 1, หมู่ที่ 1, ม 1, หมู่01
  const mooMatch = cleaned.match(/(?:หมู่บ้าน|หมู่ที่|หมู่|ม\.|ม)\s*0*(\d+)/i);
  if (mooMatch) {
    rawMooNumber = String(parseInt(mooMatch[1], 10));
    // Remove the moo part from cleaned text to isolate house number & other terms
    cleaned = cleaned.replace(mooMatch[0], ' ');
  }

  let rawHouseNumber: string | undefined;
  // Match house number with optional slashes: e.g. "12/3", "12/3/1", "105", "5"
  const houseNumMatch = cleaned.match(/(?:^|\s|[^\d\/])(\d+(?:\/\d+)+|\d+)(?:$|\s|[^\d\/])/);
  if (houseNumMatch) {
    rawHouseNumber = houseNumMatch[1];
    cleaned = cleaned.replace(houseNumMatch[1], ' ');
  }

  const textTerms = cleaned
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t !== '/' && !/^\d+$/.test(t));

  return {
    rawHouseNumber,
    rawMooNumber,
    textTerms,
    hasAnyCriteria: !!(rawHouseNumber || rawMooNumber || textTerms.length > 0)
  };
};

// Verify 100% exact numerical match for house numbers and moo
export const isExactHouseMatch = (item: IndexedRecord, parsed: HouseQueryParams): boolean => {
  if (!parsed.hasAnyCriteria) return false;

  const rawAddr = (item.compactFields.address || item.rowAddressNorm || item.record['ที่อยู่'] || item.rawSearchStr || '');
  const normAddr = normalizeThaiAddress(convertThaiDigitsToArabic(rawAddr)).toLowerCase();

  // 1. Strict Exact House Number Match
  // Must NOT be preceded or followed by any digit or slash (preventing 12 matching 12/3, 5 matching 50, 12/3 matching 112/3)
  if (parsed.rawHouseNumber) {
    const escaped = parsed.rawHouseNumber.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const houseRegex = new RegExp(`(?<![\\d\\/])${escaped}(?![\\d\\/])`, 'i');
    if (!houseRegex.test(normAddr)) {
      return false;
    }
  }

  // 2. Strict Exact Moo Number Match
  // Must NOT match e.g. ม.10 or ม.11 when looking for ม.1
  if (parsed.rawMooNumber) {
    const mooNum = parsed.rawMooNumber;
    const mooRegex = new RegExp(`(?:ม\\.|หมู่ที่|หมู่|ม)\\s*0*${mooNum}(?!\\d)`, 'i');
    if (!mooRegex.test(normAddr)) {
      return false;
    }
  }

  // 3. Strict Text/Location tokens (if specified e.g. Tambon/Amphoe)
  if (parsed.textTerms.length > 0) {
    const fullSearchStr = (normAddr + ' ' + (item.rowNameAddrNorm || '')).toLowerCase();
    for (const term of parsed.textTerms) {
      if (!fullSearchStr.includes(term)) {
        return false;
      }
    }
  }

  return true;
};

// Strip Thai name prefixes (นาย, นาง, นางสาว, น.ส., etc.)
const stripThaiNamePrefix = (name: string): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|พระครู|พระ|คุณ|หจก\.|บริษัท|บจก\.)\s*/i, '')
    .trim();
};

// Phonetic & Vowel-insensitive Thai skeleton generator
const getThaiPhoneticSkeleton = (text: string): string => {
  if (!text) return '';
  let s = text.toLowerCase();
  
  // Remove tone marks and garun (่ ้ ๊ ๋ ็ ์)
  s = s.replace(/[\u0E48-\u0E4C]/g, '');
  
  // Unify interchangeable Thai vowels (ิ ี ึ ื -> ิ, ุ ู -> ุ, ะ า ำ -> ะ, เ แ โ ใ ไ -> เ)
  s = s.replace(/[ิีึื]/g, 'ิ');
  s = s.replace(/[ุู]/g, 'ุ');
  s = s.replace(/[ะาำ]/g, 'ะ');
  s = s.replace(/[เแโใไ]/g, 'เ');
  
  return s;
};

// Fast Levenshtein distance calculation
const getLevenshteinDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let row = Array.from({ length: n + 1 }, (_, i) => i);
  let nextRow = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    nextRow[0] = i;
    const charA = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = charA === b[j - 1] ? 0 : 1;
      nextRow[j] = Math.min(
        row[j] + 1,
        nextRow[j - 1] + 1,
        row[j - 1] + cost
      );
    }
    for (let k = 0; k <= n; k++) {
      row[k] = nextRow[k];
    }
  }

  return row[n];
};

// Calculate Thai similarity score with precomputed skeletons
const calculateThaiSimilarity = (
  query: string,
  fullName: string,
  normRowText: string,
  fSkel: string,
  rowSkel: string
): number => {
  if (!query) return 0;
  const qNorm = query.toLowerCase().trim();
  const fNorm = (fullName || '').toLowerCase().trim();
  const rowNorm = (normRowText || '').toLowerCase().trim();

  // 1. Direct exact substring match -> 100%
  if (fNorm.includes(qNorm) || rowNorm.includes(qNorm)) {
    return 100;
  }

  // Fast pre-check: if query first character is completely absent, skip
  const firstChar = qNorm.charAt(0);
  if (firstChar && !fNorm.includes(firstChar) && !rowNorm.includes(firstChar)) {
    return 0;
  }

  // 2. Thai Phonetic / Vowel Skeleton Comparison for full query string
  const qSkel = getThaiPhoneticSkeleton(qNorm);
  if (qSkel.length >= 3 && fSkel.length >= 3) {
    if (fSkel === qSkel) return 99;
    if (fSkel.includes(qSkel)) {
      const ratio = qSkel.length / Math.max(qSkel.length, fSkel.length);
      return Math.round(95 + ratio * 4);
    }
  }

  // 3. Multi-token comparison: EVERY query token must match a token in fullName!
  const qTokens = qNorm.split(/\s+/).filter(Boolean);
  const fTokens = stripThaiNamePrefix(fNorm).split(/\s+/).filter(Boolean);

  if (qTokens.length === 0 || fTokens.length === 0) return 0;

  let totalMatchedScore = 0;

  for (const qTok of qTokens) {
    if (qTok.length < 2) return 0; // Skip noisy 1-character tokens
    const qTokSkel = getThaiPhoneticSkeleton(qTok);

    let bestTokScore = 0;

    for (const fTok of fTokens) {
      const fTokSkel = getThaiPhoneticSkeleton(fTok);

      // Exact match
      if (fTok === qTok) {
        bestTokScore = Math.max(bestTokScore, 100);
        continue;
      }
      // Prefix match (e.g. "นน" starts "นนทบุรี", "นนทะบุตร")
      if (qTok.length >= 2 && fTok.startsWith(qTok)) {
        bestTokScore = Math.max(bestTokScore, 98);
        continue;
      }
      // Substring match only if length >= 3
      if (qTok.length >= 3 && fTok.includes(qTok)) {
        bestTokScore = Math.max(bestTokScore, 96);
        continue;
      }
      // Phonetic skeleton match
      if (qTokSkel.length >= 3 && fTokSkel.length >= 3) {
        if (fTokSkel === qTokSkel) {
          bestTokScore = Math.max(bestTokScore, 96);
        } else if (fTokSkel.startsWith(qTokSkel)) {
          bestTokScore = Math.max(bestTokScore, 95);
        }
      }
    }

    // CRITICAL: If ANY query token cannot be matched, whole query fails!
    if (bestTokScore === 0) {
      return 0;
    }

    totalMatchedScore += bestTokScore;
  }

  return Math.round(totalMatchedScore / qTokens.length);
};

// Resolve latitude & longitude
const resolveCoordinates = (record: PeaRecord) => {
  let lat: string | null = null;
  let lon: string | null = null;

  for (const [key, value] of Object.entries(record)) {
    const normKey = key.toLowerCase().trim();
    const valStr = value?.toString().trim();
    if (!valStr) continue;

    if (
      normKey === 'lat' || normKey === 'latitude' || normKey.includes('ละติจูด') ||
      normKey === 'y' || normKey.includes('พิกัด y') || normKey.includes('latitude_y')
    ) {
      if (!isNaN(parseFloat(valStr))) lat = valStr;
    }

    if (
      normKey === 'lon' || normKey === 'lng' || normKey === 'longitude' ||
      normKey.includes('ลองจิจูด') || normKey === 'x' || normKey.includes('พิกัด x') ||
      normKey.includes('longitude_x')
    ) {
      if (!isNaN(parseFloat(valStr))) lon = valStr;
    }
  }

  if (!lat || !lon) {
    for (const [key, value] of Object.entries(record)) {
      const normKey = key.toLowerCase().trim();
      const valStr = value?.toString().trim();
      if (!valStr) continue;

      if (!lat && (normKey.includes('lat') || normKey.includes('ละติ'))) {
        if (!isNaN(parseFloat(valStr))) lat = valStr;
      }
      if (!lon && (normKey.includes('lon') || normKey.includes('lng') || normKey.includes('ลองจิ'))) {
        if (!isNaN(parseFloat(valStr))) lon = valStr;
      }
    }
  }

  return { lat, lon };
};

const getPrimaryTitle = (record: PeaRecord): string => {
  const titleKeys = ['ชื่อ', 'ชื่อ-นามสกุล', 'ชื่อ - นามสกุล', 'ผู้ใช้ไฟ', 'name', 'customer', 'ชื่อผู้ใช้ไฟ', 'รายละเอียด'];
  for (const key of titleKeys) {
    const foundKey = Object.keys(record).find(k => k.toLowerCase().trim().includes(key));
    if (foundKey && record[foundKey]) {
      return record[foundKey];
    }
  }
  return Object.values(record)[0] || 'ข้อมูลผู้ใช้ไฟฟ้า PEA';
};

const extractCompactFields = (record: PeaRecord): CompactFields => {
  let fullName = '';
  let prefix = '';
  let firstName = '';
  let lastName = '';
  let addressParts: string[] = [];
  let ca = '';
  let meter = '';
  let phone = '';
  let route = '';
  let otherFields: { key: string; val: string }[] = [];

  for (const [key, val] of Object.entries(record)) {
    if (!val) continue;
    const v = String(val).trim();
    if (!v) continue;
    const kNorm = key.toLowerCase().trim();

    if (kNorm === 'prefix' || kNorm === 'คำนำหน้า') {
      prefix = v;
    } else if (kNorm === 'customername' || kNorm === 'ชื่อ' || kNorm.includes('first name') || kNorm === 'fname') {
      firstName = v;
    } else if (kNorm === 'customersirname' || kNorm === 'customersurname' || kNorm === 'นามสกุล' || kNorm.includes('last name') || kNorm === 'lname') {
      lastName = v;
    } else if (
      kNorm.includes('ชื่อ - นามสกุล') || kNorm.includes('ชื่อ-นามสกุล') || kNorm.includes('ชื่อนามสกุล') ||
      kNorm.includes('ชื่อผู้ใช้ไฟ') || kNorm === 'name' || kNorm === 'fullname'
    ) {
      if (!fullName) fullName = v;
    } else if (
      kNorm === 'addressno' || kNorm === 'moo' || kNorm === 'tumbol' || kNorm === 'amphoe' || kNorm === 'changwat' || kNorm === 'postcode' ||
      kNorm.includes('ที่อยู่') || kNorm.includes('บ้านเลขที่') || kNorm.includes('หมู่') ||
      kNorm.includes('ตำบล') || kNorm.includes('อำเภอ') || kNorm.includes('address')
    ) {
      addressParts.push(v);
    } else if (
      kNorm === 'ca' || kNorm.includes('ca') || kNorm.includes('บัญชี') || kNorm.includes('contract') ||
      kNorm.includes('เลขผู้ใช้ไฟ') || kNorm.includes('รหัสคู่ค้า') || kNorm === 'bp' || kNorm === 'account'
    ) {
      if (!ca) ca = v;
    } else if (
      kNorm === 'pea meter' || kNorm.includes('meter') || kNorm.includes('เครื่องวัด') || kNorm.includes('มิเตอร์')
    ) {
      if (!meter) meter = v;
    } else if (
      kNorm.includes('เบอร์') || kNorm.includes('โทร') || kNorm.includes('phone') ||
      kNorm.includes('tel') || kNorm.includes('mobile')
    ) {
      if (!phone) phone = v;
    } else if (
      kNorm === 'เส้นทางการจดหน่วย' || kNorm.includes('สาย') || kNorm.includes('เส้นทาง') || kNorm.includes('route') ||
      kNorm.includes('สายการอ่าน') || kNorm.includes('mr')
    ) {
      if (!route) route = v;
    } else if (
      kNorm !== 'lat' && kNorm !== 'latitude' && !kNorm.includes('ละติจูด') &&
      kNorm !== 'lon' && kNorm !== 'lng' && kNorm !== 'longitude' && !kNorm.includes('ลองจิจูด') &&
      kNorm !== 'x' && kNorm !== 'y'
    ) {
      otherFields.push({ key, val: v });
    }
  }

  // Address construction: Check explicit Kosum Phisai address columns
  let address = '';
  const addrNo = (record['ADDRESSNO'] || record['addressno'])?.trim();
  const moo = (record['MOO'] || record['moo'])?.trim();
  const tumbol = (record['TUMBOL'] || record['tumbol'])?.trim();
  const amphoe = (record['AMPHOE'] || record['amphoe'])?.trim();
  const changwat = (record['CHANGWAT'] || record['changwat'])?.trim();
  const postcode = (record['POSTCODE'] || record['postcode'])?.trim();

  if (addrNo || tumbol || amphoe || changwat) {
    const parts = [
      addrNo ? `บ้านเลขที่ ${addrNo}` : '',
      moo ? (moo.startsWith('ม.') ? moo : `ม.${moo}`) : '',
      tumbol ? (tumbol.startsWith('ต.') ? tumbol : `ต.${tumbol}`) : '',
      amphoe ? (amphoe.startsWith('อ.') ? amphoe : `อ.${amphoe}`) : '',
      changwat ? (changwat.startsWith('จ.') ? changwat : `จ.${changwat}`) : '',
      postcode || ''
    ].filter(Boolean);
    address = parts.join(' ');
  } else {
    const uniqueAddressParts = Array.from(new Set(addressParts));
    const cleanedParts = uniqueAddressParts.filter((part) => {
      return !uniqueAddressParts.some((other) => other !== part && other.length > part.length && other.includes(part));
    });
    address = cleanedParts.join(' ');
    if (/จ\.|จังหวัด|อ\.|อำเภอ/.test(address)) {
      address = address.replace(/(จ\.[^\s\d]+|จังหวัด[^\s\d]+)(\s+[\d\/\-\.\w]+)+$/, '$1');
    }
  }

  // Full name construction
  let constructedName = '';
  if (firstName || lastName) {
    constructedName = [prefix, firstName, lastName].filter(Boolean).join(' ');
  }

  const finalFullName = constructedName || fullName || getPrimaryTitle(record);

  return {
    fullName: finalFullName,
    address,
    ca,
    meter,
    phone,
    route,
    otherFields
  };
};


// ----------------------------------------------------------------------
// SUB-COMPONENTS (ISOLATED & MEMOIZED FOR MAXIMUM PERFORMANCE)
// ----------------------------------------------------------------------

// 1. Header Section
const HeaderSection = React.memo(({
  totalRecordsCount,
  loading,
  isSyncing,
  isDarkMode,
  activeTab,
  onTabChange,
  onForceSync,
  onClearChat,
  onShowSplash,
  onToggleTheme,
}: {
  totalRecordsCount: number;
  loading: boolean;
  isSyncing: boolean;
  isDarkMode: boolean;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onForceSync: () => void;
  onClearChat: () => void;
  onShowSplash: () => void;
  onToggleTheme: () => void;
}) => {
  return (
    <header className="w-full max-w-md mx-auto mb-1.5 flex flex-col gap-1.5 shrink-0">
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3 shadow-xl flex items-center justify-between gap-2">
        <div 
          onClick={() => onTabChange('search')}
          className="flex items-center gap-2 sm:gap-2.5 min-w-0 cursor-pointer group"
          title="ค้นหาพิกัดผู้ใช้ไฟ การไฟฟ้า.โกสุมพิสัย"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl border-2 border-sky-400 overflow-hidden shrink-0 shadow-md bg-slate-950 transform group-hover:scale-105 transition-all">
            <img src={peaBotMascotImg} alt="PEA Bot 3D" className="w-full h-full object-cover" />
          </div>
          
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-black text-white tracking-tight font-display truncate">
                การไฟฟ้า.โกสุมพิสัย
              </h1>
              <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-400/30 px-1.5 py-0.2 rounded-full font-mono font-bold">
                PEA โกสุมพิสัย
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 truncate">
              ระบบค้นหาพิกัดผู้ใช้ไฟ • อ.โกสุมพิสัย จ.มหาสารคาม
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={loading || isSyncing}
            onClick={onForceSync}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sky-300 rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="ซิงก์ข้อมูลสดจากเซิร์ฟเวอร์ PEA"
          >
            <CloudDownload className={`w-4 h-4 ${isSyncing ? 'animate-bounce text-yellow-300' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClearChat}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="ล้างประวัติการค้นหา"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onShowSplash}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-purple-300 rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="ดูอนิเมชั่นต้อนรับ"
          >
            <Sparkles className="w-4 h-4 text-purple-300" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 sm:p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl border border-slate-700 transition-all cursor-pointer active:scale-95 shadow-sm"
            title="สลับธีม สว่าง/มืด"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-300" />}
          </button>
        </div>
      </div>

      {/* ACTIVE SEARCH TAB INDICATOR (OTHER TABS TEMPORARILY CLOSED) */}
      <div className="flex items-center justify-between bg-slate-900/95 px-3 py-1.5 rounded-2xl border border-cyan-500/30 text-xs shadow-inner">
        <div className="flex items-center gap-2 font-bold text-cyan-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse ring-2 ring-cyan-950" />
          <span>ค้นหาพิกัดผู้ใช้ไฟ</span>
          <span className="text-[10px] text-slate-400 font-normal">| การไฟฟ้า.โกสุมพิสัย</span>
        </div>
        <span className="text-[10px] font-mono font-bold bg-cyan-950 text-cyan-200 border border-cyan-500/40 px-2 py-0.5 rounded-full">
          {totalRecordsCount > 0 ? `${totalRecordsCount.toLocaleString()} รายการ` : 'กำลังโหลดข้อมูล...'}
        </span>
      </div>
    </header>
  );
});

// 2. Sync Status Bar
const SyncStatusBar = React.memo(({
  lastSyncFullDate,
  lastUpdated,
  syncStatus,
  isOffline
}: {
  lastSyncFullDate: string | null;
  lastUpdated: string | null;
  syncStatus: 'live' | 'cached' | 'error';
  isOffline: boolean;
}) => {
  return (
    <section className="w-full max-w-md mx-auto mb-1.5 shrink-0">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <span className={`w-2 h-2 rounded-full ${syncStatus === 'live' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
          <span className="text-slate-300">ซิงก์ล่าสุด: {lastSyncFullDate || lastUpdated || 'ยังไม่อัปเดต'}</span>
        </div>
        {isOffline ? (
          <span className="text-amber-400 flex items-center gap-1 shrink-0 font-black">
            <WifiOff className="w-3 h-3" /> Offline
          </span>
        ) : (
          <span className="text-emerald-400 flex items-center gap-1 shrink-0 font-black">
            <CheckCircle2 className="w-3 h-3" /> Online
          </span>
        )}
      </div>
    </section>
  );
});

// 3. 3D Mascot Banner Component
const PeaBot3DMascot = React.memo(({ isThinking }: { isThinking: boolean }) => {
  return (
    <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40 border border-purple-500/20 rounded-xl p-2 mb-1 flex items-center gap-2 relative overflow-hidden shadow-xs backdrop-blur-sm group shrink-0">
      <div className={`absolute -right-6 -bottom-6 w-20 h-20 rounded-full blur-xl transition-all duration-500 ${isThinking ? 'bg-amber-500/30 animate-pulse scale-125' : 'bg-sky-500/10'}`} />
      
      <div className="relative shrink-0">
        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border transition-all duration-300 shadow-xs ${isThinking ? 'border-amber-400 animate-bounce' : 'border-sky-400/80 group-hover:scale-105'}`}>
          <img 
            src={peaBotMascotImg} 
            alt="3D PEA Bot Mascot" 
            className={`w-full h-full object-cover transition-all duration-300 ${isThinking ? 'brightness-110 contrast-125' : ''}`}
          />
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center border text-[7px] shadow-xs ${isThinking ? 'bg-amber-400 border-yellow-200 text-slate-950 animate-spin' : 'bg-emerald-400 border-emerald-200 text-slate-950'}`}>
          ⚡
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-amber-300 font-display">PEA Bot 3D</span>
          <span className={`text-[8px] px-1.5 py-0.2 rounded-full font-bold ${isThinking ? 'bg-amber-400/30 text-amber-300 animate-pulse border border-amber-400/50' : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'}`}>
            {isThinking ? 'ค้นหา...' : 'พร้อมใช้งาน'}
          </span>
        </div>
        <p className="text-[10px] text-slate-300 truncate leading-tight">
          {isThinking ? 'กำลังสแกนหาพิกัดให้อยู่คร้าบ แป๊บเดียว...' : 'พิมพ์ CA, Meter หรือชื่อบ้านเลขที่ส่งมาได้เลยครับ'}
        </p>
      </div>
    </div>
  );
});

// Helper to generate the exact formatted text matching copy & share requirements
export const formatPeaShareText = (fields: CompactFields, lat: string | null, lon: string | null): string => {
  const mapsUrl = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}` : '-';
  return [
    `ชื่อ นามสกุล: ${fields.fullName || '-'}`,
    `ที่อยู่: ${fields.address || '-'}`,
    `Pea meter: ${fields.meter || '-'}`,
    `CA: ${fields.ca || '-'}`,
    `Google map: ${mapsUrl}`
  ].join('\n');
};

// 4. Share Options Modal Component
interface ShareModalProps {
  item: { fields: CompactFields; lat: string | null; lon: string | null } | null;
  onClose: () => void;
}

const ShareModal = React.memo(({ item, onClose }: ShareModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const { fields, lat, lon } = item;
  const shareText = formatPeaShareText(fields, lat, lon);
  const mapsUrl = (lat && lon) ? `https://www.google.com/maps?q=${lat},${lon}` : null;

  const handleShareLine = () => {
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
    window.open(lineUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `พิกัด PEA - ${fields.fullName || 'ผู้ใช้ไฟ'}`,
        text: shareText
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  const handleCopy = () => {
    const markDone = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(markDone).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = shareText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        markDone();
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      markDone();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-4 text-slate-100 shadow-2xl space-y-3.5 relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white font-display">แชร์ข้อมูลและพิกัดผู้ใช้ไฟ</h3>
              <p className="text-[11px] text-slate-400">เลือกช่องทางที่ต้องการส่งต่อข้อมูล</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text Preview Box */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs font-mono text-slate-300 space-y-1.5 select-text">
          <div className="text-[11px] font-bold text-amber-400 mb-1 flex items-center justify-between">
            <span>📄 รายละเอียดที่จะถูกส่ง:</span>
            <span className="text-[10px] text-emerald-400 font-sans font-bold">✓ ตรงกับปุ่มคัดลอก</span>
          </div>
          <div className="text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
            {shareText}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {/* Direct LINE Share Button */}
          <button
            type="button"
            onClick={handleShareLine}
            className="w-full min-h-[44px] bg-[#06C755] hover:bg-[#05b34c] text-white font-black py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-md"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>แชร์เข้า LINE ทันที</span>
          </button>

          {/* Native Mobile Share */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full min-h-[44px] bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-md"
          >
            <Share2 className="w-4 h-4" />
            <span>แชร์แอปอื่นๆ (Share)</span>
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="w-full min-h-[42px] bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-bold py-2 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'คัดลอกเรียบร้อยแล้ว!' : 'คัดลอกข้อความ'}</span>
          </button>

          {/* Open Google Map */}
          {mapsUrl && (
            <button
              type="button"
              onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
              className="w-full min-h-[42px] bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-bold py-2 px-3 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span>เปิด Google Maps</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// 5. Result Card Component (Self-contained Copy & LINE Share state)
interface ResultCardProps {
  item: IndexedRecord;
  onOpenMap: (lat: string, lon: string) => void;
  onShare: (fields: CompactFields, lat: string | null, lon: string | null) => void;
}

const ResultCard = React.memo(({ item, onOpenMap, onShare }: ResultCardProps) => {
  const [copied, setCopied] = useState(false);
  const { compactFields, lat, lon, matchScore } = item;

  const textToCopyAndShare = useMemo(() => {
    return formatPeaShareText(compactFields, lat, lon);
  }, [compactFields, lat, lon]);

  const handleCopy = useCallback(() => {
    const markDone = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopyAndShare).then(markDone).catch(() => {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopyAndShare;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        markDone();
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopyAndShare;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      markDone();
    }
  }, [textToCopyAndShare]);

  const handleShareLineDirect = useCallback(() => {
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(textToCopyAndShare)}`;
    window.open(lineUrl, '_blank', 'noopener,noreferrer');
  }, [textToCopyAndShare]);

  return (
    <div className="w-full min-w-0 max-w-full bg-slate-900/95 hover:bg-slate-850 border border-slate-700/80 rounded-xl p-2 text-slate-100 shadow-xs space-y-1.5 transition-all text-xs overflow-hidden box-border">
      {/* 1. Header: Customer Name & Match/GPS Badges */}
      <div className="flex items-center justify-between gap-1 min-w-0 w-full">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
          <h4 className="font-bold text-sky-200 text-xs sm:text-[13px] font-display truncate leading-tight">
            {compactFields.fullName}
          </h4>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {matchScore !== undefined && (
            <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded border font-mono shrink-0 ${
              matchScore === 100
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                : matchScore >= 85
                ? 'bg-sky-950 text-sky-300 border-sky-700/60'
                : 'bg-amber-950 text-amber-300 border-amber-700/60'
            }`}>
              {matchScore === 100 ? '🎯 100%' : `${matchScore}%`}
            </span>
          )}
          {lat && lon ? (
            <span className="text-[8.5px] bg-emerald-950 text-emerald-300 border border-emerald-800/70 font-bold px-1.5 py-0.2 rounded shrink-0">
              📍 มีพิกัด
            </span>
          ) : (
            <span className="text-[8.5px] bg-amber-950 text-amber-300 border border-amber-800/70 font-bold px-1 py-0.2 rounded shrink-0">
              ⚠️ ไม่มีพิกัด
            </span>
          )}
        </div>
      </div>

      {/* 2. Compact Address */}
      {compactFields.address && (
        <div className="flex items-center gap-1 text-[11px] text-slate-300 leading-tight min-w-0 w-full">
          <Home className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="truncate flex-1 min-w-0">{compactFields.address}</span>
        </div>
      )}

      {/* 3. Specs Bar (High Density 2-Column Grid - never overflows) */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800/80 text-[10.5px] font-mono w-full min-w-0">
        {compactFields.ca && (
          <div className="flex items-center gap-1 min-w-0 truncate">
            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">CA:</span>
            <span className="text-pink-300 font-bold truncate">{compactFields.ca}</span>
          </div>
        )}
        {compactFields.meter && (
          <div className="flex items-center gap-1 min-w-0 truncate">
            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">PEA:</span>
            <span className="text-yellow-300 font-bold truncate">{compactFields.meter}</span>
          </div>
        )}
        {compactFields.route && (
          <div className="flex items-center gap-1 min-w-0 truncate">
            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">สาย:</span>
            <span className="text-sky-300 font-bold truncate">{compactFields.route}</span>
          </div>
        )}
        {compactFields.phone && (
          <div className="flex items-center gap-1 min-w-0 truncate">
            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">โทร:</span>
            <a
              href={`tel:${compactFields.phone}`}
              className="text-emerald-300 font-bold truncate hover:underline"
              title="กดเพื่อโทรออก"
            >
              {compactFields.phone}
            </a>
          </div>
        )}
      </div>

      {/* 4. Full-Width Responsive Action Buttons Row */}
      {lat && lon && (
        <div className="grid grid-cols-12 gap-1 pt-0.5 w-full min-w-0">
          <button
            type="button"
            onClick={() => onOpenMap(lat, lon)}
            className="col-span-4 h-7 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-lg text-[10.5px] flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-xs min-w-0"
            title="นำทางผ่าน Google Maps"
          >
            <Map className="w-3 h-3 shrink-0" />
            <span className="truncate">นำทาง</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="col-span-3 h-7 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700/80 font-bold rounded-lg text-[10.5px] flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all min-w-0"
            title="คัดลอกรายละเอียดและพิกัด"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
            <span className="truncate">{copied ? 'ก๊อปแล้ว' : 'คัดลอก'}</span>
          </button>
          <button
            type="button"
            onClick={handleShareLineDirect}
            className="col-span-3 h-7 bg-[#06C755] hover:bg-[#05b34c] text-white font-bold rounded-lg text-[10.5px] flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all shadow-xs min-w-0"
            title="แชร์รายละเอียดเข้า LINE ทันที"
          >
            <MessageCircle className="w-3 h-3 fill-white shrink-0" />
            <span className="truncate">LINE</span>
          </button>
          <button
            type="button"
            onClick={() => onShare(compactFields, lat, lon)}
            className="col-span-2 h-7 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 font-bold rounded-lg text-[10.5px] cursor-pointer active:scale-95 transition-all flex items-center justify-center min-w-0"
            title="ตัวเลือกการแชร์เพิ่มเติม"
          >
            <Share2 className="w-3 h-3 shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
});

// 5. Chat Message Bubble (Capped rendering for 0ms lag)
interface ChatMessageBubbleProps {
  msg: ChatMessage;
  onOpenMap: (lat: string, lon: string) => void;
  onShare: (fields: CompactFields, lat: string | null, lon: string | null) => void;
}

const ChatMessageBubble = React.memo(({ msg, onOpenMap, onShare }: ChatMessageBubbleProps) => {
  const [displayCount, setDisplayCount] = useState(25);

  const results = msg.results || [];
  const visibleResults = useMemo(() => results.slice(0, displayCount), [results, displayCount]);
  const hasMore = results.length > displayCount;
  const isBotWithResults = msg.sender === 'ai' && results.length > 0;

  return (
    <div className={`w-full min-w-0 max-w-full flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} animate-fadeIn overflow-hidden`}>
      <div className={`flex items-start gap-1.5 w-full min-w-0 max-w-full ${msg.sender === 'user' ? 'justify-end max-w-[88%] ml-auto flex-row-reverse' : ''}`}>
        {msg.sender === 'user' ? (
          <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border bg-indigo-600 border-indigo-400 text-white mt-0.5">
            <User className="w-3 h-3" />
          </div>
        ) : (
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg overflow-hidden shrink-0 border border-sky-400/80 shadow-xs bg-slate-950 mt-0.5">
            <img src={peaBotMascotImg} alt="3D Mascot" className="w-full h-full object-cover" />
          </div>
        )}

        <div className={`flex-1 min-w-0 max-w-full overflow-hidden px-2.5 py-2 rounded-2xl text-xs font-medium leading-relaxed ${
          msg.sender === 'user'
            ? 'bg-indigo-600 text-white border border-indigo-500 rounded-tr-none shadow-xs'
            : 'bg-slate-800/90 text-slate-100 border border-slate-700/80 rounded-tl-none shadow-xs'
        }`}>
          <div className="whitespace-pre-line break-words text-xs">
            {msg.text}
          </div>

          {msg.extractedSummary && (
            <div className="mt-1 pt-1 border-t border-slate-700/60 flex items-center gap-1 text-[10px] font-black text-sky-300 truncate">
              <Sparkles className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
              <span className="truncate">{msg.extractedSummary}</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-slate-700 space-y-1.5 w-full min-w-0 max-w-full overflow-hidden">
              <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider flex items-center justify-between">
                <span>📍 พิกัดผู้ใช้ไฟ ({results.length} รายการ)</span>
                {results.length > displayCount && (
                  <span className="text-[9px] text-slate-400 font-normal font-sans">
                    แสดง {visibleResults.length}/{results.length}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 max-h-[440px] sm:max-h-[500px] overflow-y-auto overflow-x-hidden pr-0.5 w-full min-w-0 max-w-full">
                {visibleResults.map((item, idx) => (
                  <ResultCard
                    key={`${msg.id}-${idx}`}
                    item={item}
                    onOpenMap={onOpenMap}
                    onShare={onShare}
                  />
                ))}

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setDisplayCount((prev) => prev + 25)}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-sky-300 border border-sky-500/40 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs"
                  >
                    <span>แสดงผลลัพธ์เพิ่มเติม (+{Math.min(25, results.length - displayCount)} รายการ)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// 6. Search History Chips Bar
interface SearchHistoryProps {
  history: string[];
  onSelectQuery: (query: string) => void;
  onClearHistory: () => void;
  onRemoveItem: (item: string, e: React.MouseEvent) => void;
}

const SearchHistorySection = React.memo(({ history, onSelectQuery, onClearHistory, onRemoveItem }: SearchHistoryProps) => {
  if (history.length === 0) return null;

  return (
    <div className="bg-slate-900/95 border-t border-slate-800 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 text-slate-300 font-bold text-xs">
          <History className="w-3.5 h-3.5 text-sky-400" />
          <span>ประวัติการค้นหาล่าสุด</span>
        </div>
        <button
          type="button"
          onClick={onClearHistory}
          className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors px-1.5 py-0.5 cursor-pointer active:scale-95"
        >
          <Trash2 className="w-3 h-3" />
          <span>ล้างประวัติ</span>
        </button>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {history.map((queryItem, idx) => (
          <div
            key={idx}
            onClick={() => onSelectQuery(queryItem)}
            className="shrink-0 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-sky-400/60 rounded-full px-3 py-1 flex items-center gap-1.5 cursor-pointer text-xs font-medium transition-all group active:scale-95 shadow-sm"
          >
            <Search className="w-3 h-3 text-sky-400/70 group-hover:text-sky-300 shrink-0" />
            <span className="max-w-[120px] sm:max-w-[150px] truncate leading-normal">{queryItem}</span>
            <button
              type="button"
              onClick={(e) => onRemoveItem(queryItem, e)}
              className="text-slate-400 hover:text-rose-400 p-0.5 rounded-full hover:bg-slate-700 transition-colors shrink-0"
              title="ลบรายการนี้"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});

// 7. Search Input Bar with Push UI Filter & Thai Voice Recognition
interface SearchInputBarProps {
  onSend: (text: string, isHouseOnly?: boolean) => void;
  isAiThinking: boolean;
  isHouseFilterActive: boolean;
  onToggleHouseFilter: () => void;
  chatInputText: string;
  setChatInputText: React.Dispatch<React.SetStateAction<string>>;
  inputRef: React.RefObject<HTMLInputElement>;
}

const SearchInputBar = React.memo(({
  onSend,
  isAiThinking,
  isHouseFilterActive,
  onToggleHouseFilter,
  chatInputText,
  setChatInputText,
  inputRef
}: SearchInputBarProps) => {
  const [isListening, setIsListening] = useState(false);
  const [speechFeedback, setSpeechFeedback] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const handleToggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('เบราว์เซอร์นี้ยังไม่รองรับระบบสั่งการด้วยเสียงโดยตรง แนะนำให้เปิดผ่าน Google Chrome หรือแตะที่ไอคอนไมค์บนแป้นพิมพ์ของโทรศัพท์มือถือครับ');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      setSpeechFeedback(null);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = 'th-TH';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechFeedback(
          isHouseFilterActive
            ? 'กำลังฟังเสียง... พูดบ้านเลขที่หรือหมู่ได้เลย เช่น "12/3 หมู่ 1" 🎙️'
            : 'กำลังฟังเสียงพูดภาษาไทย... พูดชื่อ, บ้านเลขที่ หรือเลข CA/Meter ได้เลยครับ 🎙️'
        );
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const spoken = (finalTranscript || interimTranscript).trim();
        if (spoken) {
          if (isHouseFilterActive && !spoken.startsWith('บ้านเลขที่')) {
            setChatInputText(`บ้านเลขที่ ${spoken}`);
          } else {
            setChatInputText(spoken);
          }
          setSpeechFeedback(`ได้ยิน: "${spoken}"`);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechFeedback('กรุณากดอนุญาตการใช้งานไมโครโฟนในเบราว์เซอร์');
          alert('กรุณากดอนุญาต (Allow) การใช้งานไมโครโฟนในเบราว์เซอร์เพื่อใช้เสียงพูดครับ');
        } else if (event.error === 'no-speech') {
          setSpeechFeedback('ไม่พบเสียงพูด ลองกดใหม่อีกครั้งครับ');
        } else {
          setSpeechFeedback(`เกิดข้อผิดพลาด (${event.error})`);
        }
        setIsListening(false);
        setTimeout(() => setSpeechFeedback(null), 3000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setTimeout(() => setSpeechFeedback(null), 2500);
      };

      recognition.start();
    } catch (err: any) {
      console.error('Error starting speech recognition:', err);
      setIsListening(false);
      setSpeechFeedback('ไม่สามารถเปิดใช้งานไมโครโฟนได้');
    }
  }, [isHouseFilterActive, isListening, setChatInputText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    }
    const trimmed = chatInputText.trim();
    if (!trimmed || isAiThinking) return;
    setChatInputText(isHouseFilterActive ? 'บ้านเลขที่ ' : '');
    setSpeechFeedback(null);
    onSend(trimmed, isHouseFilterActive);
  };

  const handleQuickMoo = (mooText: string) => {
    let current = chatInputText.trim();
    if (!current.startsWith('บ้านเลขที่')) {
      current = `บ้านเลขที่ ${current}`.trim();
    }
    const updated = `${current} ${mooText}`.trim();
    setChatInputText(updated);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="bg-slate-900 border-t border-slate-800 flex flex-col">
      {/* PUSH UI FILTER BAR */}
      <div className="px-2.5 pt-1.5 pb-1.5 bg-slate-950/90 border-b border-slate-800/80 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1.5">
          {/* Main Push Button: ค้นหาจากบ้านเลขที่ / หมู่ */}
          <button
            type="button"
            id="btn-filter-house-moo"
            onClick={onToggleHouseFilter}
            className={`flex-1 min-h-[34px] py-1 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 shadow-xs active:scale-95 border ${
              isHouseFilterActive
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 border-amber-300 font-black ring-1 ring-amber-400/40 shadow-amber-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700/80'
            }`}
            title={isHouseFilterActive ? 'กำลังกรอง: ค้นหาเฉพาะบ้านเลขที่/หมู่ (แตะเพื่อปิด)' : 'แตะเพื่อเปิดโหมดค้นหาเฉพาะบ้านเลขที่/หมู่'}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              isHouseFilterActive ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-amber-400'
            }`}>
              <Home className="w-3 h-3" />
            </div>
            
            <span className="truncate leading-tight">ค้นหาจากบ้านเลขที่ / หมู่</span>

            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
              isHouseFilterActive
                ? 'bg-slate-950/80 text-amber-300 border border-amber-400/50'
                : 'bg-slate-800 text-slate-400'
            }`}>
              {isHouseFilterActive ? '✓ เปิดใช้งาน' : 'แตะเปิด'}
            </span>
          </button>

          {isHouseFilterActive && (
            <button
              type="button"
              onClick={onToggleHouseFilter}
              className="min-h-[34px] py-1 px-2 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
              title="ปิดโหมดกรองบ้านเลขที่"
            >
              <X className="w-3 h-3" />
              <span>ปิด</span>
            </button>
          )}
        </div>

        {/* Quick Moo Chips when House Filter is Active */}
        {isHouseFilterActive && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none animate-fadeIn">
            <span className="text-[11px] font-bold text-amber-400 shrink-0 flex items-center gap-1 mr-0.5">
              <Filter className="w-2.5 h-2.5" /> หมู่:
            </span>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((mooNum) => (
              <button
                key={mooNum}
                type="button"
                onClick={() => handleQuickMoo(`ม.${mooNum}`)}
                className="shrink-0 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 hover:border-amber-400 px-2 py-0.5 rounded-lg text-[11px] font-bold font-mono transition-all cursor-pointer active:scale-90"
              >
                ม.{mooNum}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Listening Status Banner */}
      {isListening && (
        <div className="bg-gradient-to-r from-rose-950 via-red-900 to-amber-950 px-2.5 py-1.5 border-b border-rose-600/40 flex items-center justify-between text-xs text-rose-200 animate-pulse">
          <div className="flex items-center gap-1.5 font-medium overflow-hidden">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="truncate text-xs leading-relaxed">{speechFeedback || 'กำลังฟังเสียงพูด... พูดเลข CA หรือบ้านเลขที่ได้เลย'}</span>
          </div>
          <button
            type="button"
            onClick={handleToggleVoice}
            className="text-[11px] bg-rose-800 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded-md cursor-pointer shrink-0 ml-1.5 active:scale-95 transition-all"
          >
            หยุด
          </button>
        </div>
      )}

      {/* SEARCH FORM */}
      <form 
        onSubmit={handleSubmit}
        className="p-2 flex items-center gap-1.5"
      >
        <div className="relative flex-1">
          {/* Active Mode Tag inside input */}
          {isHouseFilterActive && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none z-10 bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
              <Home className="w-2.5 h-2.5 text-amber-400" />
              <span>บ้านเลขที่/หมู่</span>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={chatInputText}
            onChange={(e) => setChatInputText(e.target.value)}
            placeholder={
              isHouseFilterActive
                ? "ระบุบ้านเลขที่ เช่น 12/3 ม.1..."
                : "พิมพ์หรือกดไมค์พูด CA, Meter, ชื่อ..."
            }
            className={`w-full bg-slate-950 text-white placeholder-slate-500 text-xs font-medium py-2 rounded-xl border focus:outline-none transition-all shadow-inner ${
              isHouseFilterActive
                ? 'pl-28 pr-7 border-amber-400/60 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 text-amber-200'
                : 'pl-3 pr-7 border-slate-700 focus:border-sky-400'
            }`}
          />
          {chatInputText && (
            <button
              type="button"
              onClick={() => setChatInputText(isHouseFilterActive ? 'บ้านเลขที่ ' : '')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 cursor-pointer"
              title="ล้างข้อความ"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Microphone Button */}
        <button
          type="button"
          onClick={handleToggleVoice}
          className={`h-9 w-9 min-h-[36px] min-w-[36px] p-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 border ${
            isListening 
              ? 'bg-rose-600 border-rose-400 text-white animate-pulse shadow-md shadow-rose-600/50' 
              : 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border-slate-700'
          }`}
          title={isListening ? 'แตะเพื่อหยุดบันทึกเสียง' : 'แตะเพื่อพูดแทนการพิมพ์'}
        >
          {isListening ? <MicOff className="w-3.5 h-3.5 text-white" /> : <Mic className="w-3.5 h-3.5 text-amber-300" />}
        </button>

        {/* Send Button */}
        <button
          type="submit"
          disabled={!chatInputText.trim() || isAiThinking}
          className={`h-9 w-9 min-h-[36px] min-w-[36px] p-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 ${
            isHouseFilterActive
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-xs shadow-amber-500/20'
              : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white'
          }`}
          title="ส่งค้นหา"
        >
          {isAiThinking ? (
            <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </form>
    </div>
  );
});

// ----------------------------------------------------------------------
// MAIN APPLICATION COMPONENT
// ----------------------------------------------------------------------
export default function App() {
  // Focus exclusively on Search Consumer tab per user request (other tabs temporarily closed)
  const [activeTab, setActiveTab] = useState<ActiveTab>('search');

  const handleTabChange = useCallback((newTab: ActiveTab) => {
    setActiveTab('search');
  }, []);

  // Background keep-alive heartbeat & screen wake lock for field operations
  useEffect(() => {
    startBackgroundHeartbeat();
    return () => {
      stopBackgroundHeartbeat();
    };
  }, []);

  const [isAiThinking, setIsAiThinking] = useState(false);
  const WELCOME_MSG_TEXT = 'ระบบค้นหาพิกัดผู้ใช้ไฟ การไฟฟ้า.โกสุมพิสัย ⚡\nพิมพ์เลข CA, เลขมิเตอร์, ชื่อ-สกุล หรือบ้านเลขที่ เพื่อค้นหาพิกัดและเส้นทางนำทาง';


  // Recloser logs state with LocalStorage persistence (Real user records, no fake demo records)
  const [recloserLogs, setRecloserLogs] = useState<RecloserLog[]>(() => {
    try {
      const saved = localStorage.getItem('pea_recloser_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Could not load recloser logs from localStorage', e);
    }
    return [];
  });

  const [isRecloserSyncing, setIsRecloserSyncing] = useState<boolean>(false);
  const [recloserLastSync, setRecloserLastSync] = useState<Date | null>(null);
  const [recloserCloudConnected, setRecloserCloudConnected] = useState<boolean>(true);

  // Real-time synchronization for Recloser logs from Firestore Cloud (active when recloser tab is opened)
  useEffect(() => {
    if (activeTab !== 'recloser') return;

    setIsRecloserSyncing(true);
    const unsubscribe = subscribeToRecloserLogs(
      (cloudLogs) => {
        setIsRecloserSyncing(false);
        setRecloserCloudConnected(true);
        setRecloserLastSync(new Date());
        setRecloserLogs(cloudLogs);
        try {
          localStorage.setItem('pea_recloser_logs', JSON.stringify(cloudLogs));
        } catch (e) {
          console.warn('Could not save recloser logs to localStorage', e);
        }
      },
      (err) => {
        console.warn('[Recloser] Real-time sync operating offline/cache:', err);
        setIsRecloserSyncing(false);
        setRecloserCloudConnected(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeTab]);

  // Manual refresh Recloser logs
  const handleManualRecloserRefresh = useCallback(async () => {
    setIsRecloserSyncing(true);
    try {
      const freshLogs = await fetchRecloserLogsFromFirestore();
      setRecloserLogs(freshLogs);
      try {
        localStorage.setItem('pea_recloser_logs', JSON.stringify(freshLogs));
      } catch (e) {
        console.warn(e);
      }
      setRecloserLastSync(new Date());
      setRecloserCloudConnected(true);
    } catch (err) {
      console.warn('[Recloser] Manual refresh error:', err);
      setRecloserCloudConnected(false);
    } finally {
      setIsRecloserSyncing(false);
    }
  }, []);

  // Save Recloser: updates local state + Cloud Firestore immediately
  const handleSaveRecloserLog = useCallback(async (newLog: RecloserLog) => {
    // 1. Optimistic update
    setRecloserLogs((prev) => {
      const filtered = prev.filter((item) => item.id !== newLog.id);
      const updated = [newLog, ...filtered];
      try {
        localStorage.setItem('pea_recloser_logs', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });

    // 2. Save to Cloud Firestore
    setIsRecloserSyncing(true);
    try {
      await saveRecloserLogToFirestore(newLog);
      setRecloserLastSync(new Date());
      setRecloserCloudConnected(true);
    } catch (err) {
      console.error('[Recloser] Error saving to Cloud Firestore:', err);
      setRecloserCloudConnected(false);
      throw err;
    } finally {
      setIsRecloserSyncing(false);
    }
  }, []);

  // Delete Recloser: updates local state + Cloud Firestore
  const handleDeleteRecloserLog = useCallback(async (id: string) => {
    setRecloserLogs((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('pea_recloser_logs', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });

    setIsRecloserSyncing(true);
    try {
      await deleteRecloserLogFromFirestore(id);
      setRecloserLastSync(new Date());
      setRecloserCloudConnected(true);
    } catch (err) {
      console.error('[Recloser] Error deleting from Cloud Firestore:', err);
      setRecloserCloudConnected(false);
      throw err;
    } finally {
      setIsRecloserSyncing(false);
    }
  }, []);

  // Batch Delete Recloser: deletes multiple logs (e.g. all logs for a date)
  const handleDeleteBatchRecloserLogs = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setRecloserLogs((prev) => {
      const updated = prev.filter((item) => !idSet.has(item.id));
      try {
        localStorage.setItem('pea_recloser_logs', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });

    setIsRecloserSyncing(true);
    try {
      await deleteBatchRecloserLogsFromFirestore(ids);
      setRecloserLastSync(new Date());
      setRecloserCloudConnected(true);
    } catch (err) {
      console.error('[Recloser] Error batch deleting from Cloud Firestore:', err);
      setRecloserCloudConnected(false);
      throw err;
    } finally {
      setIsRecloserSyncing(false);
    }
  }, []);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('pea_search_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'welcome-msg',
        sender: 'ai',
        text: WELCOME_MSG_TEXT,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  // Automatically preserve search chat messages so switching apps doesn't wipe them
  useEffect(() => {
    try {
      if (chatMessages && chatMessages.length > 0) {
        sessionStorage.setItem('pea_search_chat_messages', JSON.stringify(chatMessages));
      }
    } catch {}
  }, [chatMessages]);

  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [allRecords, setAllRecords] = useState<PeaRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'live' | 'cached' | 'error'>('cached');
  const [lastSyncFullDate, setLastSyncFullDate] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pea_records_cache_fulldate');
    } catch {
      return null;
    }
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // Show splash only on cold launch, not when switching between apps
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return !sessionStorage.getItem('pea_splash_completed');
    } catch {
      return false;
    }
  });

  // House/Moo Push UI filter state
  const [isHouseFilterActive, setIsHouseFilterActive] = useState<boolean>(false);
  const [chatInputText, setChatInputText] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleToggleHouseFilter = useCallback(() => {
    setIsHouseFilterActive((prev) => {
      const nextState = !prev;
      if (nextState) {
        setChatInputText((curr) => {
          const trimmed = curr.trim();
          if (!trimmed) return 'บ้านเลขที่ ';
          if (!trimmed.startsWith('บ้านเลขที่')) return `บ้านเลขที่ ${trimmed}`;
          return curr;
        });
        setTimeout(() => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            const len = searchInputRef.current.value.length;
            searchInputRef.current.setSelectionRange(len, len);
          }
        }, 50);
      } else {
        setChatInputText((curr) => {
          if (curr.trim() === 'บ้านเลขที่') return '';
          return curr;
        });
      }
      return nextState;
    });
  }, []);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pea_theme') === 'dark';
    } catch {
      return true;
    }
  });

  // Search History state
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pea_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addToSearchHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearchHistory((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('pea_search_history', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('pea_search_history');
    } catch (err) {
      console.error(err);
    }
  }, []);

  const removeSearchHistoryItem = useCallback((itemToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchHistory((prev) => {
      const updated = prev.filter((item) => item !== itemToRemove);
      try {
        localStorage.setItem('pea_search_history', JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
  }, []);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      try {
        localStorage.setItem('pea_theme', 'dark');
      } catch (e) {
        console.warn('Could not save theme:', e);
      }
    } else {
      document.documentElement.classList.remove('dark');
      try {
        localStorage.setItem('pea_theme', 'light');
      } catch (e) {
        console.warn('Could not save theme:', e);
      }
    }
  }, [isDarkMode]);

  const toggleTheme = useCallback(() => setIsDarkMode((prev) => !prev), []);

  // Pre-index records with skeletons for ultra-fast search
  const indexedRecords = useMemo<IndexedRecord[]>(() => {
    return allRecords.map((row) => {
      let rowMeterStr = '';
      let rowCaStr = '';
      let rowNameAddrStr = '';

      for (const [key, val] of Object.entries(row)) {
        if (!val) continue;
        const v = String(val).trim();
        if (!v) continue;
        const kNorm = key.toLowerCase().trim();

        if (
          kNorm === 'lat' || kNorm === 'latitude' || kNorm.includes('ละติจูด') ||
          kNorm === 'lon' || kNorm === 'lng' || kNorm === 'longitude' || kNorm.includes('ลองจิจูด') ||
          kNorm === 'x' || kNorm === 'y'
        ) {
          continue;
        }

        if (
          kNorm.includes('meter') || kNorm.includes('เครื่องวัด') || kNorm.includes('มิเตอร์') ||
          kNorm.includes('amp') || kNorm.includes('แอมป์') || kNorm.includes('serial') || kNorm.includes('มต') ||
          kNorm === 'pea meter' || kNorm.includes('pea')
        ) {
          rowMeterStr += ` ${v}`;
        } else if (
          kNorm.includes('ca') || kNorm.includes('บัญชี') || kNorm.includes('contract') ||
          kNorm.includes('เลขผู้ใช้ไฟ') || kNorm.includes('รหัสคู่ค้า') || kNorm.includes('เลขคู่ค้า') ||
          kNorm === 'bp' || kNorm === 'account'
        ) {
          rowCaStr += ` ${v}`;
        } else {
          rowNameAddrStr += ` ${v}`;
        }
      }

      const coords = resolveCoordinates(row);
      const compactFields = extractCompactFields(row);

      if (compactFields.meter) rowMeterStr += ` ${compactFields.meter}`;
      if (compactFields.ca) rowCaStr += ` ${compactFields.ca}`;

      const rawSearchStr = Object.values(row)
        .map((v) => (v ? String(v).trim().toLowerCase() : ''))
        .filter(Boolean)
        .join(' ');

      const rowNameAddrNorm = normalizeThaiAddress(rowNameAddrStr).toLowerCase();
      const rowAddressNorm = normalizeThaiAddress(compactFields.address || rowNameAddrStr).toLowerCase();
      const cleanFullName = stripThaiNamePrefix(compactFields.fullName || '').toLowerCase().trim();
      const nameTokens = cleanFullName.split(/\s+/).filter(Boolean);
      const addrTokens = rowAddressNorm.split(/\s+/).filter(Boolean);

      return {
        record: row,
        rowMeterLower: rowMeterStr.toLowerCase(),
        rowCaLower: rowCaStr.toLowerCase(),
        rowNameAddrNorm,
        rowAddressNorm,
        rowAddressSkel: getThaiPhoneticSkeleton(rowAddressNorm),
        rawSearchStr,
        pureMeterDigits: rowMeterStr.replace(/[^0-9a-zA-Z]/g, '').toLowerCase(),
        pureCaDigits: rowCaStr.replace(/[^0-9a-zA-Z]/g, '').toLowerCase(),
        fullNameSkel: getThaiPhoneticSkeleton(compactFields.fullName.toLowerCase().trim()),
        rowNameAddrSkel: getThaiPhoneticSkeleton(rowNameAddrNorm),
        cleanFullName,
        nameTokens,
        addrTokens,
        lat: coords.lat,
        lon: coords.lon,
        compactFields
      };
    });
  }, [allRecords]);

  // Scroll to bottom when new chat messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages.length, isAiThinking]);

  // Listen for network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch Google Sheets Database (Kosum Phisai ~41,000 records)
  const KSP_CACHE_KEY = 'pea_records_cache_ksp_v1';

  const fetchDatabase = async (forceRefresh = false): Promise<PeaRecord[]> => {
    const localCacheStr = localStorage.getItem(KSP_CACHE_KEY);
    const localCacheTime = localStorage.getItem(`${KSP_CACHE_KEY}_time`);
    const localCacheFullDate = localStorage.getItem(`${KSP_CACHE_KEY}_fulldate`);

    try {
      let csvText = '';
      const targetUrl = forceRefresh ? `${CSV_URL}&_t=${Date.now()}` : CSV_URL;
      
      try {
        const response = await fetch(targetUrl, { cache: forceRefresh ? 'no-cache' : 'default' });
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        csvText = await response.text();
      } catch (directErr) {
        // Fallback 1: via server proxy route
        try {
          const proxyRes = await fetch('/api/data/records');
          if (proxyRes.ok) {
            csvText = await proxyRes.text();
          } else {
            throw new Error(`Proxy error ${proxyRes.status}`);
          }
        } catch (proxyErr) {
          // Fallback 2: Papa.parse direct download
          csvText = await new Promise<string>((resolve, reject) => {
            Papa.parse(targetUrl, {
              download: true,
              complete: (results) => {
                if (results.data && Array.isArray(results.data) && results.data.length > 0) {
                  resolve(Papa.unparse(results.data));
                } else {
                  reject(new Error('ไม่สามารถดึงข้อมูลได้'));
                }
              },
              error: (err) => reject(err)
            });
          });
        }
      }

      return new Promise<PeaRecord[]>((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = (results.data as PeaRecord[]).filter(
              (r) => r && Object.values(r).some((v) => v && String(v).trim() !== '')
            );

            if (data && data.length > 0) {
              setAllRecords(data);
              const nowShort = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
              const nowFull = new Date().toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              setLastUpdated(nowShort);
              setLastSyncFullDate(nowFull);
              setSyncStatus('live');

              try {
                localStorage.setItem(KSP_CACHE_KEY, JSON.stringify(data));
                localStorage.setItem(`${KSP_CACHE_KEY}_time`, nowShort);
                localStorage.setItem(`${KSP_CACHE_KEY}_fulldate`, nowFull);
              } catch (e) {
                console.warn('LocalStorage Cache warning:', e);
              }
              resolve(data);
            } else {
              reject(new Error('ข้อมูล CSV ว่างเปล่า'));
            }
          },
          error: () => reject(new Error('อ่านไฟล์ CSV ล้มเหลว'))
        });
      });
    } catch (err: any) {
      if (localCacheStr) {
        try {
          const cachedData = JSON.parse(localCacheStr) as PeaRecord[];
          if (cachedData && cachedData.length > 0) {
            setAllRecords(cachedData);
            if (localCacheTime) setLastUpdated(localCacheTime);
            if (localCacheFullDate) setLastSyncFullDate(localCacheFullDate);
            setSyncStatus('cached');
            return cachedData;
          }
        } catch (e) {
          console.error('Parsed cache error:', e);
        }
      }

      setSyncStatus('error');
      throw err;
    }
  };

  const handleForceSync = useCallback(async () => {
    setIsSyncing(true);
    setLoading(true);
    try {
      await fetchDatabase(true);
      setError(null);
    } catch (err: any) {
      setError(`ซิงก์ข้อมูลขัดข้อง: ${err?.message || 'โปรดตรวจสอบการเชื่อมต่อ'}`);
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  }, []);

  // Launch initial load
  useEffect(() => {
    const localCacheStr = localStorage.getItem('pea_records_cache_ksp_v1');
    if (localCacheStr) {
      try {
        const cached = JSON.parse(localCacheStr) as PeaRecord[];
        if (cached && cached.length > 0) setAllRecords(cached);
      } catch (e) {}
    }

    setLoading(true);
    fetchDatabase(true)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Smart Filtering Engine with Pre-indexed Skeletons
  const smartFilterRecords = useCallback((queryText: string, isHouseOnlyFilter = false): { matched: IndexedRecord[]; summaryLabel: string; detectedType: string } => {
    const raw = queryText.trim().toLowerCase();
    if (!raw) {
      return { matched: [], summaryLabel: '', detectedType: 'text' };
    }

    const pureDigits = raw.replace(/[^0-9a-zA-Z]/g, '');
    const normQ = normalizeThaiAddress(raw).toLowerCase();
    const strippedQuery = stripThaiNamePrefix(raw);
    const qTerms = strippedQuery.split(/\s+/).filter(Boolean);
    const rawTerms = raw.split(/\s+/).filter(Boolean);
    const activeTerms = qTerms.length > 0 ? qTerms : rawTerms;

    const isHouseOnlyMode =
      isHouseOnlyFilter ||
      raw.startsWith('บ้านเลขที่') ||
      raw.startsWith('บ้าน') ||
      raw.startsWith('ที่อยู่') ||
      raw.startsWith('หมู่ที่') ||
      raw.startsWith('หมู่') ||
      raw.startsWith('ม.');

    let detectedType = 'text';

    if (isHouseOnlyMode) {
      detectedType = 'house_only';
    } else if (pureDigits.startsWith('200') || pureDigits.length >= 10) {
      detectedType = 'ca';
    } else if (pureDigits.length >= 4 && /^\d+$/.test(pureDigits) && !/[a-zA-Zก-ฮ]/.test(raw) && !raw.includes('/')) {
      detectedType = 'meter';
    } else if (raw.includes('/') || /\d+/.test(raw)) {
      detectedType = 'address';
    } else {
      detectedType = 'name';
    }

    const matched: IndexedRecord[] = [];

    // Filter strictly for house number and moo if house-only mode
    if (isHouseOnlyMode) {
      const parsedHouse = parseHouseAddressQuery(raw);

      for (let i = 0; i < indexedRecords.length; i++) {
        const item = indexedRecords[i];
        if (isExactHouseMatch(item, parsedHouse)) {
          matched.push({ ...item, matchScore: 100 });
        }
      }
    } else {
      // Standard multi-field smart search
      const parsedHouseIfAddr = (detectedType === 'address' || raw.includes('/')) ? parseHouseAddressQuery(raw) : null;

      for (let i = 0; i < indexedRecords.length; i++) {
        const item = indexedRecords[i];
        let score = 0;

        // A. Check PEA Meter Match
        if (
          pureDigits.length >= 4 &&
          /^\d+$/.test(pureDigits) &&
          !/[a-zA-Zก-ฮ]/.test(raw) &&
          !raw.includes('/') &&
          (item.rowMeterLower.includes(raw) ||
            (pureDigits && item.pureMeterDigits.includes(pureDigits)) ||
            (item.compactFields.meter && item.compactFields.meter.toLowerCase().includes(raw)))
        ) {
          score = 100;
        }

        // B. Check CA Match
        if (
          score < 100 &&
          pureDigits.length >= 4 &&
          (pureDigits.startsWith('200') || pureDigits.length >= 10 || (!/[a-zA-Zก-ฮ]/.test(raw) && !raw.includes('/'))) &&
          (item.rowCaLower.includes(raw) ||
            (pureDigits && item.pureCaDigits.includes(pureDigits)) ||
            (item.compactFields.ca && item.compactFields.ca.toLowerCase().includes(raw)))
        ) {
          score = 100;
        }

        // C. Check Exact House Match if address-like query
        if (score < 100 && parsedHouseIfAddr && parsedHouseIfAddr.hasAnyCriteria) {
          if (isExactHouseMatch(item, parsedHouseIfAddr)) {
            score = 100;
          }
        }

        // D. Precision Name / Multi-Token Match
        if (score < 100) {
          const nameTokens = item.nameTokens || [];
          const cleanFullName = item.cleanFullName || '';
          const fullNameLower = item.compactFields.fullName.toLowerCase().trim();
          const addrTokens = item.addrTokens || [];
          const addrClean = item.rowAddressNorm;

          // D1. Exact Full Query in Name
          if (
            fullNameLower.includes(raw) ||
            (strippedQuery && cleanFullName.includes(strippedQuery))
          ) {
            score = 110;
          } else if (activeTerms.length > 1) {
            // Multi-term query (e.g. "จันหอม นน" or "จันหอม กุดจิก")
            // ALL active terms MUST match!
            let allTermsMatched = true;
            let totalTermScore = 0;
            let nameMatchesCount = 0;

            for (const t of activeTerms) {
              const tNorm = t.toLowerCase().trim();
              const tLen = tNorm.length;
              const tSkel = getThaiPhoneticSkeleton(tNorm);

              let termMatched = false;
              let termScore = 0;
              let inName = false;

              // 1. Match in Name
              if (nameTokens.some((nt) => nt === tNorm)) {
                termMatched = true;
                termScore = 100;
                inName = true;
              } else if (tLen >= 2 && nameTokens.some((nt) => nt.startsWith(tNorm))) {
                termMatched = true;
                termScore = 98;
                inName = true;
              } else if (tLen >= 3 && cleanFullName.includes(tNorm)) {
                termMatched = true;
                termScore = 96;
                inName = true;
              } else if (tLen >= 3 && tSkel.length >= 3) {
                for (const nt of nameTokens) {
                  const ntSkel = getThaiPhoneticSkeleton(nt);
                  if (ntSkel === tSkel || (ntSkel.length >= 4 && ntSkel.startsWith(tSkel))) {
                    termMatched = true;
                    termScore = 95;
                    inName = true;
                    break;
                  }
                }
              }

              // 2. Match in Address / Location (if not matched in name)
              if (!termMatched) {
                if (tLen <= 2) {
                  // Short 1-2 char tokens must NOT match inside words like "ถนน" or "แผนก"
                  const validAddr = addrTokens.some((at) => {
                    if (at === 'ถนน' || at === 'ถ.' || at.startsWith('ถนน') || at.startsWith('ถ.')) {
                      return false;
                    }
                    return at === tNorm || at.startsWith(tNorm);
                  });
                  if (validAddr) {
                    termMatched = true;
                    termScore = 90;
                  }
                } else {
                  // For token len >= 3
                  if (addrTokens.some((at) => at === tNorm || at.includes(tNorm))) {
                    termMatched = true;
                    termScore = 92;
                  } else if (addrClean.includes(tNorm)) {
                    termMatched = true;
                    termScore = 90;
                  }
                }
              }

              if (!termMatched) {
                allTermsMatched = false;
                break;
              }

              totalTermScore += termScore;
              if (inName) nameMatchesCount++;
            }

            if (allTermsMatched) {
              const avg = totalTermScore / activeTerms.length;
              if (nameMatchesCount === activeTerms.length) {
                score = Math.round(avg + 10); // All terms matched in name (e.g. First name + Last name)
              } else if (nameMatchesCount > 0) {
                score = Math.round(avg); // Name + Location match
              } else {
                score = Math.round(avg - 5);
              }
            }
          } else if (activeTerms.length === 1) {
            // Single-term query (e.g. "จันหอม")
            const singleTerm = activeTerms[0].toLowerCase().trim();
            const tLen = singleTerm.length;
            const tSkel = getThaiPhoneticSkeleton(singleTerm);

            if (nameTokens.some((nt) => nt === singleTerm)) {
              score = 100;
            } else if (tLen >= 2 && nameTokens.some((nt) => nt.startsWith(singleTerm))) {
              score = 98;
            } else if (tLen >= 3 && cleanFullName.includes(singleTerm)) {
              score = 97;
            } else if (tLen >= 3 && tSkel.length >= 3) {
              for (const nt of nameTokens) {
                const ntSkel = getThaiPhoneticSkeleton(nt);
                if (ntSkel === tSkel || (ntSkel.length >= 4 && ntSkel.startsWith(tSkel))) {
                  score = 95;
                  break;
                }
              }
            } else if (tLen >= 3 && (addrTokens.some((at) => at === singleTerm || at.includes(singleTerm)) || addrClean.includes(singleTerm))) {
              score = 92;
            }
          }
        }

        // E. Fallback: Thai phonetic similarity on name ONLY for single-word queries of length >= 3
        if (score < 95 && activeTerms.length === 1 && activeTerms[0].length >= 3) {
          const thaiScore = calculateThaiSimilarity(
            raw,
            item.compactFields.fullName,
            item.rowNameAddrNorm,
            item.fullNameSkel,
            item.rowNameAddrSkel
          );
          if (thaiScore >= 95) {
            score = thaiScore;
          }
        }

        if (score >= 95) {
          matched.push({ ...item, matchScore: score });
        }
      }
    }

    matched.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    let summaryLabel = '';
    if (detectedType === 'house_only') {
      summaryLabel = `บ้านเลขที่: ${raw}`;
    } else if (detectedType === 'ca') {
      summaryLabel = `เลข CA: ${pureDigits}`;
    } else if (detectedType === 'meter') {
      summaryLabel = `มิเตอร์: ${pureDigits}`;
    } else if (detectedType === 'address') {
      summaryLabel = `ที่อยู่: ${raw}`;
    } else {
      summaryLabel = `ค้นหา: ${raw}`;
    }

    return { matched, summaryLabel, detectedType };
  }, [indexedRecords]);

  // Instant Chat submit handler
  const handleSendChatMessage = useCallback((textToSend: string, isHouseOnlyFilter = isHouseFilterActive) => {
    const query = textToSend.trim();
    if (!query || isAiThinking) return;

    addToSearchHistory(query);

    const userMsgId = Date.now().toString();
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };

    setIsAiThinking(true);
    setChatMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      const { matched: matchedResults, summaryLabel, detectedType } = smartFilterRecords(query, isHouseOnlyFilter);

      const topMatch = matchedResults[0];

      let replyText = '';
      if (matchedResults.length > 0) {
        if (detectedType === 'house_only') {
          replyText = `พบข้อมูลบ้านเลขที่ ${matchedResults.length} รายการ`;
        } else {
          replyText = `พบข้อมูลผู้ใช้ไฟ ${matchedResults.length} รายการ`;
        }
        if (topMatch && topMatch.matchScore && topMatch.matchScore < 100 && topMatch.matchScore >= 95) {
          replyText += ` (ความแม่นยำ ~${topMatch.matchScore}%)`;
        }
      } else {
        if (detectedType === 'house_only') {
          replyText = `ไม่พบข้อมูลบ้านเลขที่ "${query}"`;
        } else if (detectedType === 'ca') {
          replyText = `ไม่พบข้อมูลเลข CA "${query}"`;
        } else if (detectedType === 'meter') {
          replyText = `ไม่พบข้อมูลเลขมิเตอร์ "${query}"`;
        } else {
          replyText = `ไม่พบข้อมูลที่ตรงกับ "${query}"`;
        }
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: replyText,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        results: matchedResults,
        extractedSummary: summaryLabel
      };

      setChatMessages((prev) => [...prev, aiMsg]);
      setIsAiThinking(false);
    }, 16);
  }, [addToSearchHistory, isAiThinking, isHouseFilterActive, smartFilterRecords]);

  const clearChatHistory = useCallback(() => {
    try {
      sessionStorage.removeItem('pea_search_chat_messages');
    } catch {}
    setChatMessages([
      {
        id: 'welcome-msg',
        sender: 'ai',
        text: WELCOME_MSG_TEXT,
        timestamp: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  }, [WELCOME_MSG_TEXT]);

  const [shareModalItem, setShareModalItem] = useState<{ fields: CompactFields; lat: string | null; lon: string | null } | null>(null);

  const handleOpenMap = useCallback((lat: string, lon: string) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleShare = useCallback((fields: CompactFields, lat: string | null, lon: string | null) => {
    setShareModalItem({ fields, lat, lon });
  }, []);

  const handleShowSplash = useCallback(() => setShowSplash(true), []);

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <ShareModal item={shareModalItem} onClose={() => setShareModalItem(null)} />
      <div className="w-full bg-[#0B0F19] dark:bg-[#070A12] text-slate-100 font-sans flex flex-col items-center select-none transition-colors duration-300 h-[100dvh] max-h-[100dvh] overflow-hidden p-2 pb-2">
      
      {/* MOBILE-FIRST HEADER */}
      <HeaderSection
        totalRecordsCount={allRecords.length}
        loading={loading}
        isSyncing={isSyncing}
        isDarkMode={isDarkMode}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onForceSync={handleForceSync}
        onClearChat={clearChatHistory}
        onShowSplash={handleShowSplash}
        onToggleTheme={toggleTheme}
      />

      {/* SYNC & NETWORK STATUS BAR */}
      <SyncStatusBar
        lastSyncFullDate={lastSyncFullDate}
        lastUpdated={lastUpdated}
        syncStatus={syncStatus}
        isOffline={isOffline}
      />

      {/* EXCLUSIVE ACTIVE TAB: SEARCH CONSUMER GPS & METERS (การไฟฟ้า.โกสุมพิสัย) */}
      <main className="w-full max-w-md mx-auto flex-1 min-h-0 bg-slate-900/90 dark:bg-slate-950/90 border border-slate-800 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-xl flex flex-col overflow-hidden relative">
        
        {/* MESSAGES SCROLL AREA */}
        <div 
          ref={chatContainerRef}
          className="flex-1 min-h-0 p-1.5 sm:p-2.5 overflow-y-auto overflow-x-hidden space-y-2 scroll-smooth w-full max-w-full"
        >
          {/* Top 3D Animated Mascot Widget */}
          <PeaBot3DMascot isThinking={isAiThinking} />

          {chatMessages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              onOpenMap={handleOpenMap}
              onShare={handleShare}
            />
          ))}

          {/* AI Thinking Indicator */}
          {isAiThinking && (
            <div className="flex items-center gap-2.5 text-xs font-bold text-amber-300 animate-pulse p-2 bg-slate-900/90 rounded-2xl border border-amber-500/40 w-fit shadow-md">
              <div className="w-6 h-6 rounded-lg overflow-hidden shrink-0 border border-amber-400 animate-bounce">
                <img src={peaBotMascotImg} alt="PEA Bot 3D" className="w-full h-full object-cover" />
              </div>
              <span className="flex items-center gap-1">
                <span>กำลังค้นหาพิกัด...</span>
                <span className="text-yellow-400 animate-spin">⚡</span>
              </span>
            </div>
          )}
        </div>

        {/* SEARCH HISTORY BAR */}
        <SearchHistorySection
          history={searchHistory}
          onSelectQuery={handleSendChatMessage}
          onClearHistory={clearSearchHistory}
          onRemoveItem={removeSearchHistoryItem}
        />

        {/* STICKY BOTTOM INPUT BAR WITH PUSH UI FILTER */}
        <SearchInputBar
          onSend={handleSendChatMessage}
          isAiThinking={isAiThinking}
          isHouseFilterActive={isHouseFilterActive}
          onToggleHouseFilter={handleToggleHouseFilter}
          chatInputText={chatInputText}
          setChatInputText={setChatInputText}
          inputRef={searchInputRef}
        />

      </main>

      {/* FOOTER */}
      <footer className="text-[10px] font-bold text-slate-500 text-center py-1 shrink-0">
        การไฟฟ้าส่วนภูมิภาค สาขาอำเภอโกสุมพิสัย (PEA Kosum Phisai)
      </footer>

    </div>
    </>
  );
}
