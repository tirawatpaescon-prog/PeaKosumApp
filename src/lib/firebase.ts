import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  writeBatch,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { RecloserLog, StreetlightSurveyStatusType, RecloserWorkStatusType, MeterAssayItem } from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Initialize Firestore directly with the provisioned database ID per integration specification
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-remixgpspeatkt-9ea88e06-46db-44b7-bbce-88e0649857ca');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface SurveyStatusRecord {
  peano: string;
  status: StreetlightSurveyStatusType;
  updatedAt: number;
  village?: string;
}

const COLLECTION_NAME = 'streetlight_surveys';
const RECLOSER_COLLECTION = 'recloser_logs';

/**
 * Real-time listener for all streetlight surveys.
 * Automatically receives updates whenever ANY mobile device makes a change.
 */
export function subscribeToStreetlightSurveys(
  onUpdate: (data: Record<string, { status: StreetlightSurveyStatusType; updatedAt: number }>) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, COLLECTION_NAME);

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const results: Record<string, { status: StreetlightSurveyStatusType; updatedAt: number }> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.peano && data.status) {
          const validStatus: StreetlightSurveyStatusType =
            data.status === 'สำรวจแล้ว' || data.status === 'กำลังดำเนินการ'
              ? data.status
              : 'ยังไม่สำรวจ';
          results[data.peano] = {
            status: validStatus,
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
          };
        }
      });
      onUpdate(results);
    },
    (err) => {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, COLLECTION_NAME);
      }
      console.warn('[Firebase] Firestore onSnapshot operating in cached/offline state:', err?.message || err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Updates status for a single transformer in Firestore Cloud Database.
 * This instantly broadcasts to all other devices.
 */
export async function setTransformerSurveyStatus(
  peano: string,
  status: StreetlightSurveyStatusType,
  village?: string
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, peano);
    const updatedAt = Date.now();
    await setDoc(
      docRef,
      {
        peano,
        status,
        updatedAt,
        ...(village ? { village } : {})
      },
      { merge: true }
    );
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, `${COLLECTION_NAME}/${peano}`);
    }
    console.warn('[Firebase] Warning setting survey status, falling back to local storage:', err?.message || err);
    throw err;
  }
}

/**
 * Batch updates or initializes multiple survey records in Firestore.
 */
export async function bulkSetTransformerSurveyStatuses(
  statuses: Record<string, { status: StreetlightSurveyStatusType; updatedAt: number; village?: string }>
): Promise<void> {
  const entries = Object.entries(statuses);
  if (entries.length === 0) return;

  try {
    // Firestore batch limit is 500 operations per batch
    const BATCH_SIZE = 400;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const [peano, item] of chunk) {
        const docRef = doc(db, COLLECTION_NAME, peano);
        batch.set(
          docRef,
          {
            peano,
            status: item.status,
            updatedAt: item.updatedAt || Date.now(),
            ...(item.village ? { village: item.village } : {})
          },
          { merge: true }
        );
      }

      await batch.commit();
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, COLLECTION_NAME);
    }
    console.warn('[Firebase] Warning bulk updating statuses:', err?.message || err);
    throw err;
  }
}

// ==========================================
// RECLOSER WORK COLLECTION & SYNC METHODS
// ==========================================
export const RECLOSER_WORK_COLLECTION = 'recloser_work';

/**
 * Real-time listener for Recloser Work status.
 * Automatically synchronizes across all mobile field devices.
 */
export function subscribeToRecloserWorkSurveys(
  onUpdate: (data: Record<string, { status: RecloserWorkStatusType; updatedAt: number }>) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, RECLOSER_WORK_COLLECTION);

  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const results: Record<string, { status: RecloserWorkStatusType; updatedAt: number }> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.peano && data.status) {
          const validStatus: RecloserWorkStatusType =
            data.status === 'กำลังดำเนินการ' || data.status === 'รอนำเข้าระบบ' || data.status === 'ดำเนินการเสร็จสิ้น'
              ? data.status
              : 'ยังไม่ดำเนินการ';
          results[data.peano] = {
            status: validStatus,
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
          };
        }
      });
      onUpdate(results);
    },
    (err) => {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, RECLOSER_WORK_COLLECTION);
      }
      console.warn('[Firebase] Recloser Work onSnapshot operating in cached/offline state:', err?.message || err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Updates status for a single transformer in Recloser Work.
 */
export async function setRecloserWorkStatus(
  peano: string,
  status: RecloserWorkStatusType,
  village?: string
): Promise<void> {
  try {
    const docRef = doc(db, RECLOSER_WORK_COLLECTION, peano);
    const updatedAt = Date.now();
    await setDoc(
      docRef,
      {
        peano,
        status,
        updatedAt,
        ...(village ? { village } : {})
      },
      { merge: true }
    );
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, `${RECLOSER_WORK_COLLECTION}/${peano}`);
    }
    console.warn('[Firebase] Warning setting recloser work status:', err?.message || err);
    throw err;
  }
}

/**
 * Batch updates or initializes multiple Recloser Work records.
 */
export async function bulkSetRecloserWorkStatuses(
  statuses: Record<string, { status: RecloserWorkStatusType; updatedAt: number; village?: string }>
): Promise<void> {
  const entries = Object.entries(statuses);
  if (entries.length === 0) return;

  try {
    const BATCH_SIZE = 400;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const [peano, item] of chunk) {
        const docRef = doc(db, RECLOSER_WORK_COLLECTION, peano);
        batch.set(
          docRef,
          {
            peano,
            status: item.status,
            updatedAt: item.updatedAt || Date.now(),
            ...(item.village ? { village: item.village } : {})
          },
          { merge: true }
        );
      }

      await batch.commit();
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, RECLOSER_WORK_COLLECTION);
    }
    console.warn('[Firebase] Warning bulk updating recloser work statuses:', err?.message || err);
    throw err;
  }
}


/**
 * Test connectivity to Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const colRef = collection(db, COLLECTION_NAME);
    const q = query(colRef, limit(1));
    await getDocs(q);
    return true;
  } catch (err: any) {
    // If not found or permission check, connection reached server
    if (
      err?.code === 'unavailable' ||
      err?.message?.includes('offline') ||
      err?.message?.includes('could not be completed')
    ) {
      return false;
    }
    return true;
  }
}

/**
 * Sanitize RecloserLog into pure Firestore-supported key-value object
 * Strips all undefined, null, NaN or invalid values so Firestore setDoc never throws.
 */
export function sanitizeRecloserLog(log: RecloserLog): Record<string, any> {
  const clean: Record<string, any> = {
    id: String(log.id),
    recloserId: String(log.recloserId),
    recloserName: String(log.recloserName || ''),
    recordDate: String(log.recordDate),
    recordTime: String(log.recordTime),
    createdAt: typeof log.createdAt === 'number' && !isNaN(log.createdAt) ? log.createdAt : Date.now()
  };

  if (typeof log.counterBR === 'number' && !isNaN(log.counterBR)) clean.counterBR = log.counterBR;
  if (typeof log.counterA === 'number' && !isNaN(log.counterA)) clean.counterA = log.counterA;
  if (typeof log.counterB === 'number' && !isNaN(log.counterB)) clean.counterB = log.counterB;
  if (typeof log.counterC === 'number' && !isNaN(log.counterC)) clean.counterC = log.counterC;
  if (typeof log.counterG === 'number' && !isNaN(log.counterG)) clean.counterG = log.counterG;

  if (typeof log.currentA === 'number' && !isNaN(log.currentA)) clean.currentA = log.currentA;
  if (typeof log.currentB === 'number' && !isNaN(log.currentB)) clean.currentB = log.currentB;
  if (typeof log.currentC === 'number' && !isNaN(log.currentC)) clean.currentC = log.currentC;
  if (typeof log.currentG === 'number' && !isNaN(log.currentG)) clean.currentG = log.currentG;

  if (log.notes && typeof log.notes === 'string' && log.notes.trim()) {
    clean.notes = log.notes.trim();
  }
  if (log.recorderName && typeof log.recorderName === 'string' && log.recorderName.trim()) {
    clean.recorderName = log.recorderName.trim();
  }

  return clean;
}

/**
 * Real-time listener for Recloser logs.
 * Automatically synchronizes changes (creates, updates, deletes) in real-time across all field devices.
 */
export function subscribeToRecloserLogs(
  onUpdate: (logs: RecloserLog[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, RECLOSER_COLLECTION);
  const q = query(colRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const logs: RecloserLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RecloserLog;
        if (data && data.id && data.recloserId) {
          logs.push(data);
        }
      });
      onUpdate(logs);
    },
    (err) => {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.GET, RECLOSER_COLLECTION);
      }
      console.warn('[Firebase] Recloser logs onSnapshot operating in cached/offline state:', err?.message || err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Fetch all Recloser logs from Firestore Cloud Database.
 */
export async function fetchRecloserLogsFromFirestore(): Promise<RecloserLog[]> {
  try {
    const colRef = collection(db, RECLOSER_COLLECTION);
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const logs: RecloserLog[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as RecloserLog;
      if (data && data.id && data.recloserId) {
        logs.push(data);
      }
    });
    return logs;
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.GET, RECLOSER_COLLECTION);
    }
    console.warn('[Firebase] Note: Firestore fetch not available, using offline cache:', err?.message || err);
    throw err;
  }
}

/**
 * Save a new or updated Recloser log to Firestore Cloud Database.
 * Sanitizes input to prevent any undefined field errors.
 */
export async function saveRecloserLogToFirestore(log: RecloserLog): Promise<void> {
  try {
    const cleanData = sanitizeRecloserLog(log);
    const docRef = doc(db, RECLOSER_COLLECTION, cleanData.id);
    await setDoc(docRef, cleanData);
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, `${RECLOSER_COLLECTION}/${log.id}`);
    }
    console.error('[Firebase] Error saving recloser log to Firestore:', err?.message || err);
    throw err;
  }
}

/**
 * Delete a Recloser log from Firestore Cloud Database.
 */
export async function deleteRecloserLogFromFirestore(logId: string): Promise<void> {
  try {
    const docRef = doc(db, RECLOSER_COLLECTION, logId);
    await deleteDoc(docRef);
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.DELETE, `${RECLOSER_COLLECTION}/${logId}`);
    }
    console.error('[Firebase] Error deleting recloser log from Firestore:', err?.message || err);
    throw err;
  }
}

/**
 * Delete multiple Recloser logs from Firestore Cloud Database in a single batch.
 */
export async function deleteBatchRecloserLogsFromFirestore(logIds: string[]): Promise<void> {
  if (!logIds || logIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const id of logIds) {
      const docRef = doc(db, RECLOSER_COLLECTION, id);
      batch.delete(docRef);
    }
    await batch.commit();
  } catch (err: any) {
    if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.WRITE, RECLOSER_COLLECTION);
    }
    console.error('[Firebase] Error batch deleting recloser logs from Firestore:', err?.message || err);
    throw err;
  }
}

// ----------------------------------------------------------------------
// METER ASSAY (GPS) INTEGRATION
// ----------------------------------------------------------------------

export const METER_ASSAY_COLLECTION = 'meter_assay_records';

/**
 * Sanitize MeterAssayItem to avoid Firestore undefined field errors
 */
export function sanitizeMeterAssayItem(item: MeterAssayItem): Record<string, any> {
  const result: Record<string, any> = {
    id: String(item.id || ''),
    measureId: String(item.measureId || 'm1'),
    meter: String(item.meter || ''),
    ca: String(item.ca || ''),
    fullName: String(item.fullName || ''),
    address: String(item.address || ''),
    status: item.status || 'รอดำเนินการ',
    addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
  };

  if (item.lat !== null && item.lat !== undefined && !isNaN(item.lat)) {
    result.lat = Number(item.lat);
  } else {
    result.lat = null;
  }

  if (item.lon !== null && item.lon !== undefined && !isNaN(item.lon)) {
    result.lon = Number(item.lon);
  } else {
    result.lon = null;
  }

  if (item.phone) result.phone = String(item.phone);
  if (item.route) result.route = String(item.route);
  if (item.notes) result.notes = String(item.notes);

  return result;
}

/**
 * Real-time subscription to Meter Assay records from Firestore
 */
export function subscribeToMeterAssayRecords(
  onUpdate: (items: MeterAssayItem[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, METER_ASSAY_COLLECTION);
  const q = query(colRef, orderBy('updatedAt', 'desc'), limit(500));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const items: MeterAssayItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        if (data && data.id && data.measureId) {
          items.push({
            id: data.id,
            measureId: data.measureId,
            meter: data.meter || '',
            ca: data.ca || '',
            fullName: data.fullName || '',
            address: data.address || '',
            phone: data.phone || '',
            route: data.route || '',
            lat: typeof data.lat === 'number' ? data.lat : null,
            lon: typeof data.lon === 'number' ? data.lon : null,
            status: data.status || 'รอดำเนินการ',
            addedAt: data.addedAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            notes: data.notes || ''
          });
        }
      });
      onUpdate(items);
    },
    (err) => {
      console.warn('[Firebase] MeterAssay onSnapshot offline/cache:', err?.message || err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Save a single MeterAssay item to Firestore
 */
export async function saveMeterAssayItemToFirestore(item: MeterAssayItem): Promise<void> {
  try {
    const cleanData = sanitizeMeterAssayItem(item);
    const docRef = doc(db, METER_ASSAY_COLLECTION, cleanData.id);
    await setDoc(docRef, cleanData);
  } catch (err: any) {
    console.error('[Firebase] Error saving MeterAssay item to Firestore:', err);
    throw err;
  }
}

/**
 * Bulk save multiple MeterAssay items in a single batch
 */
export async function bulkSaveMeterAssayItemsToFirestore(items: MeterAssayItem[]): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    // Firestore batch limit is 500
    const chunks: MeterAssayItem[][] = [];
    for (let i = 0; i < items.length; i += 400) {
      chunks.push(items.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const item of chunk) {
        const cleanData = sanitizeMeterAssayItem(item);
        const docRef = doc(db, METER_ASSAY_COLLECTION, cleanData.id);
        batch.set(docRef, cleanData);
      }
      await batch.commit();
    }
  } catch (err: any) {
    console.error('[Firebase] Error bulk saving MeterAssay items:', err);
    throw err;
  }
}

/**
 * Delete a single MeterAssay item from Firestore
 */
export async function deleteMeterAssayItemFromFirestore(id: string): Promise<void> {
  try {
    const docRef = doc(db, METER_ASSAY_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err: any) {
    console.error('[Firebase] Error deleting MeterAssay item:', err);
    throw err;
  }
}

/**
 * Delete all items belonging to a measure or batch IDs
 */
export async function deleteBatchMeterAssayItemsFromFirestore(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 400) {
      chunks.push(ids.slice(i, i + 400));
    }
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const id of chunk) {
        const docRef = doc(db, METER_ASSAY_COLLECTION, id);
        batch.delete(docRef);
      }
      await batch.commit();
    }
  } catch (err: any) {
    console.error('[Firebase] Error deleting batch MeterAssay items:', err);
    throw err;
  }
}


