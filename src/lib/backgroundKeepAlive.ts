/**
 * Background Keep-Alive & Mobile Session Retention
 * 
 * Features:
 * 1. Screen WakeLock API: keeps the screen on while operating in the field.
 * 2. Background Web Worker Heartbeat: prevents aggressive browser tab freezing when switching apps.
 * 3. Page Lifecycle API: safely preserves and restores state on visibilitychange / pageshow / resume.
 */

let wakeLockSentinel: any = null;
let heartbeatWorker: Worker | null = null;
let heartbeatInterval: any = null;

/**
 * Request Screen WakeLock (keeps phone screen awake during field operations)
 */
export async function requestWakeLock(): Promise<boolean> {
  if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  try {
    if (wakeLockSentinel && !wakeLockSentinel.released) {
      return true;
    }
    wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    return true;
  } catch (err) {
    // Wake lock might be rejected if battery is low or not focused
    return false;
  }
}

/**
 * Release Screen WakeLock
 */
export async function releaseWakeLock() {
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

/**
 * Start background keep-alive heartbeat via lightweight Web Worker & Audio context fallback
 * to extend background retention when switching between LINE, Camera, Maps and GPS.Pea.TKT
 */
export function startBackgroundHeartbeat() {
  if (typeof window === 'undefined') return;

  // 1. Web Worker Heartbeat (runs independently of main thread throttling)
  if (!heartbeatWorker && typeof Worker !== 'undefined') {
    try {
      const workerBlob = new Blob(
        [
          `let timer = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (timer) clearInterval(timer);
              timer = setInterval(() => {
                self.postMessage('ping');
              }, 15000); // 15 seconds heartbeat
            } else if (e.data === 'stop') {
              if (timer) clearInterval(timer);
              timer = null;
            }
          };`
        ],
        { type: 'application/javascript' }
      );
      const blobUrl = URL.createObjectURL(workerBlob);
      heartbeatWorker = new Worker(blobUrl);

      heartbeatWorker.onmessage = () => {
        // Keep timestamp updated in sessionStorage to verify session continuity
        try {
          sessionStorage.setItem('pea_last_heartbeat', Date.now().toString());
        } catch {}
      };

      heartbeatWorker.postMessage('start');
    } catch (e) {
      console.warn('[KeepAlive] Worker heartbeat fallback to interval', e);
    }
  }

  // 2. Main thread fallback interval
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      try {
        sessionStorage.setItem('pea_last_active', Date.now().toString());
      } catch {}
    }, 20000);
  }

  // 3. Keep WakeLock active when page is visible
  requestWakeLock();

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      requestWakeLock();
      try {
        sessionStorage.setItem('pea_last_resumed', Date.now().toString());
      } catch {}
    }
  };

  const handlePageShow = (e: PageTransitionEvent) => {
    if (e.persisted) {
      requestWakeLock();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handlePageShow);
}

/**
 * Stop background heartbeat when cleaning up
 */
export function stopBackgroundHeartbeat() {
  if (heartbeatWorker) {
    try {
      heartbeatWorker.postMessage('stop');
      heartbeatWorker.terminate();
    } catch {}
    heartbeatWorker = null;
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  releaseWakeLock();
}
