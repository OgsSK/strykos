import { api } from "@/lib/api";

const PREFIX = "strykos_cache:";
const VERSION = "v1";
const MAX_ENTRIES = 60;

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
  } catch { /* quota exceeded: silently skip */ }
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

/* Stale-while-revalidate GET: returns cached data instantly (if any) via onData,
   then fetches the network and calls onData again only when the payload changed. */
export function swrGet(path, onData, { ttl = 5 * 60 * 1000, force = false } = {}) {
  const key = path;
  const cached = read(key);
  const fresh = cached && Date.now() - cached.t < ttl;
  if (cached) onData(cached.data, true);
  if (fresh && !force) return Promise.resolve(cached.data);
  return api.get(path).then((r) => {
    const data = r.data;
    const same = cached && JSON.stringify(cached.data) === JSON.stringify(data);
    write(key, data);
    if (!same) onData(data, false);
    return data;
  }).catch((e) => { if (!cached) throw e; return cached.data; });
}

const inflight = new Map();
/* De-duplicated fetch for components mounting simultaneously */
export function swrGetShared(path, onData, opts) {
  if (!inflight.has(path)) {
    inflight.set(path, swrGet(path, onData, opts).finally(() => inflight.delete(path)));
  } else {
    const cached = read(path);
    if (cached) onData(cached.data, true);
  }
  return inflight.get(path);
}
