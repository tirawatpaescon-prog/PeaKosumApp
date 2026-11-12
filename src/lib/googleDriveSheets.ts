/**
 * Google Drive & Google Sheets API Integration Service
 * Client-Side Token Authentication via Bearer Header
 */

import { RecloserLog, MeterAssayItem, StreetlightSurveyStatusType } from '../types';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheets: SheetTabInfo[];
}

// --------------------------------------------------------------------------
// GOOGLE DRIVE APIS
// --------------------------------------------------------------------------

/**
 * List files from Google Drive
 */
export async function listDriveFiles(
  accessToken: string,
  options?: {
    pageSize?: number;
    mimeTypeFilter?: 'all' | 'spreadsheet' | 'folder' | 'document';
    folderId?: string;
    searchTerm?: string;
  }
): Promise<DriveFileItem[]> {
  const pageSize = options?.pageSize || 30;
  const queries: string[] = ['trashed = false'];

  if (options?.folderId) {
    queries.push(`'${options.folderId}' in parents`);
  }

  if (options?.mimeTypeFilter === 'spreadsheet') {
    queries.push(`mimeType = 'application/vnd.google-apps.spreadsheet'`);
  } else if (options?.mimeTypeFilter === 'folder') {
    queries.push(`mimeType = 'application/vnd.google-apps.folder'`);
  }

  if (options?.searchTerm && options.searchTerm.trim()) {
    const sanitized = options.searchTerm.replace(/'/g, "\\'");
    queries.push(`name contains '${sanitized}'`);
  }

  const q = encodeURIComponent(queries.join(' and '));
  const fields = encodeURIComponent('files(id, name, mimeType, webViewLink, iconLink, modifiedTime, size, owners)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=${pageSize}&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Failed to list files from Google Drive (${response.status})`);
  }

  const data = await response.json();
  return (data.files || []) as DriveFileItem[];
}

/**
 * Find or create dedicated "PEA TKT Field Operations" folder in Google Drive
 */
export async function findOrCreateAppFolder(
  accessToken: string,
  folderName: string = 'PEA TKT Field Operations'
): Promise<DriveFileItem> {
  // 1. Check if folder already exists
  const existingFolders = await listDriveFiles(accessToken, {
    mimeTypeFilter: 'folder',
    searchTerm: folderName
  });

  const matched = existingFolders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
  if (matched) return matched;

  // 2. Create if not found
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const response = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create folder in Google Drive');
  }

  return await response.json();
}

/**
 * Upload text/file content to Google Drive (Multipart upload)
 */
export async function uploadFileToDrive(
  accessToken: string,
  params: {
    fileName: string;
    mimeType: string;
    content: string | Blob;
    folderId?: string;
    description?: string;
  }
): Promise<DriveFileItem> {
  const metadata: Record<string, any> = {
    name: params.fileName,
    mimeType: params.mimeType,
    description: params.description || 'Uploaded from GPS.Pea.TKT'
  };

  if (params.folderId) {
    metadata.parents = [params.folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  let bodyContent = '';
  if (typeof params.content === 'string') {
    bodyContent = params.content;
  } else {
    bodyContent = await params.content.text();
  }

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${params.mimeType}\r\n\r\n` +
    bodyContent +
    closeDelimiter;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to upload file to Google Drive (${response.status})`);
  }

  return await response.json();
}

/**
 * Delete a file in Google Drive.
 * WARNING: Calling code MUST have already received explicit user confirmation!
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to delete file from Google Drive (${response.status})`);
  }
}

// --------------------------------------------------------------------------
// GOOGLE SHEETS APIS
// --------------------------------------------------------------------------

/**
 * Create a new Google Spreadsheet
 */
export async function createSpreadsheet(
  accessToken: string,
  title: string,
  initialSheetTitle: string = 'ข้อมูลหลัก',
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title
      },
      sheets: [
        {
          properties: {
            title: initialSheetTitle
          }
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create Google Spreadsheet');
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl;

  // If a parent folder was requested, move the newly created spreadsheet into the folder
  if (folderId && spreadsheetId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      console.warn('Could not move sheet into folder:', e);
    }
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Get spreadsheet metadata (avoiding hardcoded sheet/tab names per skill guidelines)
 */
export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,spreadsheetUrl,sheets.properties(sheetId,title,gridProperties)`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to fetch spreadsheet details');
  }

  const data = await response.json();
  const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
    sheetId: s.properties?.sheetId,
    title: s.properties?.title || 'Sheet1',
    rowCount: s.properties?.gridProperties?.rowCount,
    columnCount: s.properties?.gridProperties?.columnCount
  }));

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    sheets
  };
}

/**
 * Read values from a Google Spreadsheet range
 */
export async function getSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to read range "${range}" from Google Sheets`);
  }

  const data = await response.json();
  return (data.values || []) as any[][];
}

/**
 * Append rows to a Google Spreadsheet
 */
export async function appendSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<{ updatedRows: number }> {
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to append rows to Google Sheets`);
  }

  const data = await response.json();
  return { updatedRows: data.updates?.updatedRows || values.length };
}

/**
 * Update (overwrite) rows in a Google Spreadsheet
 * WARNING: Destructive / mutating. Caller MUST present a user confirmation dialog first.
 */
export async function updateSpreadsheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range,
      majorDimension: 'ROWS',
      values
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to update values in Google Sheets`);
  }
}

// --------------------------------------------------------------------------
// HIGH-LEVEL WORKFLOW HELPERS
// --------------------------------------------------------------------------

/**
 * Export Recloser logs directly into a formatted Google Sheet
 */
export async function exportRecloserLogsToGoogleSheet(
  accessToken: string,
  logs: RecloserLog[],
  customTitle?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; rowCount: number }> {
  const dateStr = new Date().toISOString().split('T')[0];
  const title = customTitle || `PEA Recloser - รายงานบันทึกค่าอุปกรณ์ตัดตอน (${dateStr})`;

  // 1. Create a dedicated folder in Drive or use root
  let folderId: string | undefined;
  try {
    const folder = await findOrCreateAppFolder(accessToken);
    folderId = folder.id;
  } catch (e) {
    console.warn('Folder lookup warning:', e);
  }

  // 2. Create the spreadsheet
  const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(
    accessToken,
    title,
    'บันทึกค่า Recloser',
    folderId
  );

  // 3. Prepare headers and rows
  const headers = [
    'ลำดับ',
    'วันที่บันทึก',
    'เวลา (น.)',
    'รหัส Recloser',
    'สถานที่ติดตั้ง / จุดสำคัญ',
    'Counter B/R (ครั้ง)',
    'Counter A',
    'Counter B',
    'Counter C',
    'Counter G',
    'Current Ia (A)',
    'Current Ib (A)',
    'Current Ic (A)',
    'Current Ig (A)',
    'ผู้บันทึก',
    'หมายเหตุ'
  ];

  const rows = logs.map((log, idx) => [
    idx + 1,
    log.recordDate || '',
    log.recordTime || '',
    log.recloserId || '',
    log.recloserName || '',
    log.counterBR ?? '',
    log.counterA ?? '',
    log.counterB ?? '',
    log.counterC ?? '',
    log.counterG ?? '',
    log.currentA !== undefined ? log.currentA : '',
    log.currentB !== undefined ? log.currentB : '',
    log.currentC !== undefined ? log.currentC : '',
    log.currentG !== undefined ? log.currentG : '',
    log.recorderName || '',
    log.notes || ''
  ]);

  const allValues = [
    [`รายงานบันทึกค่า Recloser - การไฟฟ้าส่วนภูมิภาค สาขาอำเภอ ท่าคันโท`],
    [`วันที่ส่งออกข้อมูล: ${new Date().toLocaleDateString('th-TH')} เวลา ${new Date().toLocaleTimeString('th-TH')} น.`],
    [],
    headers,
    ...rows
  ];

  await appendSpreadsheetValues(accessToken, spreadsheetId, `'บันทึกค่า Recloser'!A1`, allValues);

  return { spreadsheetId, spreadsheetUrl, rowCount: rows.length };
}

/**
 * Export Meter Assay records to Google Sheets
 */
export async function exportMeterAssayToGoogleSheet(
  accessToken: string,
  items: MeterAssayItem[],
  customTitle?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; rowCount: number }> {
  const dateStr = new Date().toISOString().split('T')[0];
  const title = customTitle || `PEA Meter Assay - บันทึกงานสำรวจมิเตอร์ (${dateStr})`;

  let folderId: string | undefined;
  try {
    const folder = await findOrCreateAppFolder(accessToken);
    folderId = folder.id;
  } catch (e) {
    console.warn('Folder lookup warning:', e);
  }

  const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(
    accessToken,
    title,
    'Meter Assay Records',
    folderId
  );

  const headers = [
    'ลำดับ',
    'มาตรการ',
    'เลขมิเตอร์ (Meter)',
    'หมายเลขผู้ใช้ไฟ (CA)',
    'ชื่อ - นามสกุล',
    'ที่อยู่ / หมู่บ้าน',
    'สายตรวจ (Route)',
    'เบอร์โทรศัพท์',
    'พิกัด Lat',
    'พิกัด Lon',
    'สถานะงาน',
    'ลิงก์นำทาง Google Maps',
    'หมายเหตุ'
  ];

  const rows = items.map((item, idx) => [
    idx + 1,
    item.measureId.toUpperCase(),
    item.meter,
    item.ca,
    item.fullName,
    item.address,
    item.route || '',
    item.phone || '',
    item.lat !== null ? item.lat : '',
    item.lon !== null ? item.lon : '',
    item.status,
    item.lat && item.lon ? `https://maps.google.com/?q=${item.lat},${item.lon}` : '',
    item.notes || ''
  ]);

  const allValues = [
    [`บันทึกรายการ Meter Assay - ระบบช่วยงานภาคสนาม PEA.TKT`],
    [`วันที่ส่งออก: ${new Date().toLocaleDateString('th-TH')} เวลา ${new Date().toLocaleTimeString('th-TH')} น. (รวม ${items.length} รายการ)`],
    [],
    headers,
    ...rows
  ];

  await appendSpreadsheetValues(accessToken, spreadsheetId, `'Meter Assay Records'!A1`, allValues);

  return { spreadsheetId, spreadsheetUrl, rowCount: rows.length };
}

/**
 * Export Streetlight Survey statuses to Google Sheets
 */
export async function exportStreetlightSurveyToGoogleSheet(
  accessToken: string,
  statuses: Record<string, { status: StreetlightSurveyStatusType; updatedAt: number; village?: string }>,
  customTitle?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; rowCount: number }> {
  const dateStr = new Date().toISOString().split('T')[0];
  const title = customTitle || `PEA Streetlight - รายงานผลสำรวจโคมไฟถนน (${dateStr})`;

  let folderId: string | undefined;
  try {
    const folder = await findOrCreateAppFolder(accessToken);
    folderId = folder.id;
  } catch (e) {
    console.warn('Folder lookup warning:', e);
  }

  const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(
    accessToken,
    title,
    'ผลสำรวจโคมไฟ',
    folderId
  );

  const headers = [
    'ลำดับ',
    'PEA หม้อแปลง',
    'หมู่บ้าน / พื้นที่',
    'สถานะการสำรวจ',
    'วันที่-เวลาปรับปรุงล่าสุด'
  ];

  const entries = Object.entries(statuses);
  const rows = entries.map(([peano, data], idx) => [
    idx + 1,
    peano,
    data.village || '-',
    data.status,
    new Date(data.updatedAt).toLocaleString('th-TH')
  ]);

  const allValues = [
    [`รายงานผลสำรวจโคมไฟส่องสว่างสาธารณะ - PEA.TKT`],
    [`ส่งออกเมื่อ: ${new Date().toLocaleDateString('th-TH')} ${new Date().toLocaleTimeString('th-TH')} น. (รวม ${entries.length} หม้อแปลง)`],
    [],
    headers,
    ...rows
  ];

  await appendSpreadsheetValues(accessToken, spreadsheetId, `'ผลสำรวจโคมไฟ'!A1`, allValues);

  return { spreadsheetId, spreadsheetUrl, rowCount: entries.length };
}

/**
 * Backup all app state to Google Drive as formatted JSON / CSV file
 */
export async function backupAppDataToGoogleDrive(
  accessToken: string,
  backupData: {
    recloserLogs?: RecloserLog[];
    meterAssayItems?: MeterAssayItem[];
    streetlightStatuses?: Record<string, any>;
    customLabel?: string;
  }
): Promise<DriveFileItem> {
  const folder = await findOrCreateAppFolder(accessToken);
  const now = new Date();
  const dateTag = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `PEA_TKT_Backup_${dateTag}.json`;

  const payload = {
    app: 'GPS.Pea.TKT',
    backupTime: now.toISOString(),
    thaiDate: now.toLocaleString('th-TH'),
    ...backupData
  };

  const fileItem = await uploadFileToDrive(accessToken, {
    fileName,
    mimeType: 'application/json',
    content: JSON.stringify(payload, null, 2),
    folderId: folder.id,
    description: `Full backup of PEA field operations data (${backupData.customLabel || 'Manual backup'})`
  });

  return fileItem;
}
