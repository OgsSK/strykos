import { api } from "@/lib/api";
import { getCurrentVersion } from "@/lib/cacheVersion";

const PREFIX = "strykos_cache:";
const VERSION = "v1";
const MAX_ENTRIES = 60;

// ⭐ GARDE : détecte les URLs invalides
function _isInvalidPath(path) {
  if (!path) return true;
  if (typeof path !== "string") return true;
  return path.includes("/undefined") ||
         path.includes("/null") ||
         path.endsWith("/undefined") ||
         path.endsWith("/null");
}

// ⭐ NOUVEAU : ajoute ?_v=<version> pour bypasser le cache HTTP navigateur
function _withVersion(path) {
  if (!path || typeof path !== "string") return path;
  // Évite les doublons
  if (path.includes("_v=")) return path;
  const v = getCurrentVersion();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}_v=${v}`;
}

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.v !== VERSION) return null;
    return entry;
  } catch { return null; }
}

function write(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: VERSION, t: Date.now(), data }));
    prune();
  } catch { }
}

function prune() {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
  if (keys.length <= MAX_ENTRIES) return;
  keys.map((k) => ({ k, t: read(k.slice(PREFIX.length))?.t || 0 })).sort((a, b) => a.t - b.t)
    .slice(0, keys.length - MAX_ENTRIES).forEach(({ k }) => localStorage.removeItem(k));
}

export function invalidateCache(prefix = "") {
  Object.keys(localStorage).filter((k) => k.startsWith(PREFIX + prefix)).forEach((k) => localStorage.removeItem(k));
}

const inflight = new Map();

export function clearAllCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
  inflight.clear();
  console.log("🗑️ Cache SWR vidé (localStorage + inflight)");
}

/* Stale-while-revalidate GET */
export function swrGet(path, onData, { ttl = 5 * 60 * 1000, force = false } = {}) {
  // ⭐ GARDE : bloque les URLs invalides
  if (_isInvalidPath(path)) {
    console.warn("⚠️ swrGet ignoré (URL invalide) :", path);
    try { onData && onData(null, true); } catch { }
    return Promise.resolve(null);
  }

  // ⭐ Cache-busting : URL versionnée pour le fetch
  const url = _withVersion(path);
  const key = url;   // clé cache = URL versionnée

  const cached = read(key);
  const fresh = cached && Date.now() - cached.t < ttl;
  if (cached) onData(cached.data, true);
  if (fresh && !force) return Promise.resolve(cached.data);
  return api.get(url).then((r) => {
    const data = r.data;
    const same = cached && JSON.stringify(cached.data) === JSON.stringify(data);
    write(key, data);
    if (!same) onData(data, false);
    return data;
  }).catch((e) => { if (!cached) throw e; return cached.data; });
}

/* De-duplicated fetch */
export function swrGetShared(path, onData, opts) {
  // ⭐ GARDE
  if (_isInvalidPath(path)) {
    console.warn("⚠️ swrGetShared ignoré (URL invalide) :", path);
    try { onData && onData(null, true); } catch { }
    return Promise.resolve(null);
  }

  // ⭐ Cache-busting
  const url = _withVersion(path);

  if (!inflight.has(url)) {
    inflight.set(url, swrGet(path, onData, opts).finally(() => inflight.delete(url)));
  } else {
    const cached = read(url);
    if (cached) onData(cached.data, true);
  }
  return inflight.get(url);
}