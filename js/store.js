// Speicher: Alles bleibt lokal im Browser (IndexedDB), auch nach dem Schließen.
const DB_NAME = 'lernpilot';
const STORE = 'kv';
let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const DEFAULTS = {
  settings: {
    provider: 'gemini',
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash',
    claudeKey: '',
    claudeModel: 'claude-opus-5-5',
    voiceURI: '',
    rate: 1,
    pauseMin: 20,
    pauseMax: 40,
    theme: 'auto',
  },
  profile: { done: false, answers: {} },
  memory: [],
  chats: [],
  lessons: [],
  quizzes: [],
  decks: [],
  plan: null,
  topics: {},
  stats: { days: [] },
};

export const state = structuredClone(DEFAULTS);
const KEYS = Object.keys(DEFAULTS);

export async function loadState() {
  for (const k of KEYS) {
    try {
      const v = await idbGet(k);
      if (v !== undefined) {
        state[k] = (k === 'settings') ? { ...DEFAULTS.settings, ...v } : v;
      }
    } catch (e) {
      console.warn('Laden fehlgeschlagen', k, e);
    }
  }
  markActiveDay();
}

const timers = {};
// Speichert verzögert, damit schnelles Tippen die App nicht bremst.
export function save(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    idbSet(key, state[key]).catch(e => console.warn('Speichern fehlgeschlagen', key, e));
  }, 150);
}

export function saveNow(key) {
  clearTimeout(timers[key]);
  return idbSet(key, state[key]);
}

export function exportAll() {
  const data = {};
  for (const k of KEYS) data[k] = state[k];
  // Schlüssel werden nicht mit exportiert.
  data.settings = { ...data.settings, geminiKey: '', claudeKey: '' };
  return JSON.stringify({ app: 'LernPilot', version: 1, date: new Date().toISOString(), data }, null, 2);
}

export async function importAll(json) {
  const parsed = JSON.parse(json);
  if (parsed.app !== 'LernPilot' || !parsed.data) throw new Error('Das ist keine LernPilot-Sicherung.');
  for (const k of KEYS) {
    if (parsed.data[k] === undefined) continue;
    if (k === 'settings') {
      const keep = { geminiKey: state.settings.geminiKey, claudeKey: state.settings.claudeKey };
      state.settings = { ...DEFAULTS.settings, ...parsed.data.settings, ...keep };
    } else {
      state[k] = parsed.data[k];
    }
    await saveNow(k);
  }
}

export async function resetAll() {
  for (const k of KEYS) {
    state[k] = structuredClone(DEFAULTS[k]);
    await saveNow(k);
  }
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function markActiveDay() {
  const t = today();
  if (!state.stats.days.includes(t)) {
    state.stats.days.push(t);
    state.stats.days = state.stats.days.slice(-400);
    save('stats');
  }
}

// Wie viele Tage hintereinander wurde gelernt?
export function streak() {
  const set = new Set(state.stats.days);
  let n = 0;
  const d = new Date();
  while (true) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!set.has(key)) break;
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
