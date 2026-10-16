/**
 * ⭐ Système de versioning global du cache.
 * - Polling toutes les 30 secondes sur /api/version
 * - Si la version change → clear tous les caches SWR + recharge les données
 */

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

let _lastVersion = null;
let _listeners = [];
let _pollingInterval = null;
let _isChecking = false;

export function onCacheVersionChange(callback) {
  _listeners.push(callback);
  return () => {
    _listeners = _listeners.filter((cb) => cb !== callback);
  };
}

async function fetchVersion() {
  try {
    const res = await fetch(`${API_BASE}/api/version`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.v || null;
  } catch {
    return null;
  }
}

export async function checkCacheVersion() {
  if (_isChecking) return;
  _isChecking = true;

  const newVersion = await fetchVersion();

  if (newVersion && _lastVersion && newVersion !== _lastVersion) {
    console.log(`🔄 Cache invalidé : ${_lastVersion} → ${newVersion}`);
    _lastVersion = newVersion;
    _listeners.forEach((cb) => {
      try { cb(newVersion); } catch (e) { console.error(e); }
    });
  } else if (newVersion) {
    _lastVersion = newVersion;
  }

  _isChecking = false;
}

export function startCacheVersionPolling(intervalMs = 30000) {
  if (_pollingInterval) return;

  checkCacheVersion();
  _pollingInterval = setInterval(checkCacheVersion, intervalMs);

  if (typeof window !== "undefined") {
    window.addEventListener("focus", checkCacheVersion);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkCacheVersion();
    });
  }

  return () => {
    if (_pollingInterval) {
      clearInterval(_pollingInterval);
      _pollingInterval = null;
    }
  };
}

export async function forceCheckVersion() {
  return checkCacheVersion();
}

// ⭐ NOUVEAU : expose la version actuelle pour le cache-busting
export function getCurrentVersion() {
  return _lastVersion || "0";
}