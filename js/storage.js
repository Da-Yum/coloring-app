// 저장. 셋으로 나뉜다.
//   1) 옵션·토큰 상태 → localStorage (작고 동기로 읽어야 한다)
//   2) 칠하던 그림, 완성작 → IndexedDB (PNG Blob이라 크다)
//   3) 갤러리 내려받기 → <a download>
//
// localStorage는 시크릿 모드나 용량 초과에서 던진다. 전부 try/catch로 감싼다.

import { OPTIONS, DEEDS_DEFAULT } from './config.js';

/* ---------- localStorage ---------- */

const OPT_KEY = 'coloring.options';
const TOKEN_KEY = 'coloring.tokens';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch {
    return false;   // 이번 실행에만 남는다
  }
}

let optCache = null;

export function getOptions() {
  if (!optCache) {
    const saved = readJSON(OPT_KEY, {});
    optCache = {};
    for (const o of OPTIONS) {
      optCache[o.key] = typeof saved[o.key] === 'boolean' ? saved[o.key] : o.def;
    }
  }
  return optCache;
}

export function getOption(key) {
  return getOptions()[key];
}

export function setOption(key, value) {
  getOptions()[key] = value;
  writeJSON(OPT_KEY, optCache);
}

/* ---------- 토큰 상태 (15장) ---------- */

function blankTokenState() {
  return {
    parent: null,                       // { pinHash, salt }
    tokens: 0,
    unlocked: [],                       // 열어둔 도안·도구 id
    deeds: DEEDS_DEFAULT.map((d) => ({ ...d })),
    history: [],                        // { at, deedId, label, amount }
    setupDone: false,
  };
}

let tokenCache = null;

export function getTokenState() {
  if (!tokenCache) {
    const saved = readJSON(TOKEN_KEY, null);
    tokenCache = saved ? { ...blankTokenState(), ...saved } : blankTokenState();
  }
  return tokenCache;
}

export function saveTokenState(patch) {
  tokenCache = { ...getTokenState(), ...patch };
  writeJSON(TOKEN_KEY, tokenCache);
  return tokenCache;
}

export function isUnlocked(id) {
  return getTokenState().unlocked.includes(id);
}

export function unlock(id) {
  const st = getTokenState();
  if (st.unlocked.includes(id)) return st;
  return saveTokenState({ unlocked: [...st.unlocked, id] });
}

/* ---------- 암호 ---------- */
// 보안이 목적이 아니라 아이가 스스로 토큰을 못 주게 막는 정도다.
// 그래도 평문으로 두지는 않는다.

export function randomSalt() {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(salt + ':' + pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin) {
  const { parent } = getTokenState();
  if (!parent) return false;
  return (await hashPin(pin, parent.salt)) === parent.pinHash;
}

export async function setPin(pin) {
  const salt = randomSalt();
  const pinHash = await hashPin(pin, salt);
  return saveTokenState({ parent: { pinHash, salt } });
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'coloring';
const DB_VERSION = 1;
const STORE_PROGRESS = 'progress';   // 칠하다 만 그림, 키 = 도안 id
const STORE_GALLERY = 'gallery';     // 완성작, 키 = 자동 증가

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS);
      }
      if (!db.objectStoreNames.contains(STORE_GALLERY)) {
        db.createObjectStore(STORE_GALLERY, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;   // 다음에 다시 시도할 수 있게
    throw err;
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 저장이 안 되는 환경이라도 앱은 돌아가야 한다. 전부 조용히 실패시킨다.
async function quiet(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn('저장소를 쓰지 못했습니다', err);
    return fallback;
  }
}

export function saveProgress(drawingId, blob) {
  return quiet(async () => {
    const db = await openDB();
    await wrap(tx(db, STORE_PROGRESS, 'readwrite').put({ blob, at: Date.now() }, drawingId));
    return true;
  }, false);
}

export function loadProgress(drawingId) {
  return quiet(async () => {
    const db = await openDB();
    return await wrap(tx(db, STORE_PROGRESS, 'readonly').get(drawingId));
  }, null);
}

export function clearProgress(drawingId) {
  return quiet(async () => {
    const db = await openDB();
    await wrap(tx(db, STORE_PROGRESS, 'readwrite').delete(drawingId));
    return true;
  }, false);
}

// 어느 도안에 이어 칠할 것이 있는지. 도안 선택 화면의 "이어서" 뱃지에 쓴다.
export function progressKeys() {
  return quiet(async () => {
    const db = await openDB();
    const keys = await wrap(tx(db, STORE_PROGRESS, 'readonly').getAllKeys());
    return new Set(keys);
  }, new Set());
}

export function addToGallery(drawingId, title, blob) {
  return quiet(async () => {
    const db = await openDB();
    await wrap(tx(db, STORE_GALLERY, 'readwrite').add({ drawingId, title, blob, at: Date.now() }));
    return true;
  }, false);
}

export function listGallery() {
  return quiet(async () => {
    const db = await openDB();
    const all = await wrap(tx(db, STORE_GALLERY, 'readonly').getAll());
    return all.sort((a, b) => b.at - a.at);
  }, []);
}

export function removeFromGallery(id) {
  return quiet(async () => {
    const db = await openDB();
    await wrap(tx(db, STORE_GALLERY, 'readwrite').delete(id));
    return true;
  }, false);
}

/* ---------- 내려받기 ---------- */

// 갤럭시 기기에서는 갤러리 Download 앨범에 뜬다.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function stampName(drawingId) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `coloring_${drawingId}_${date}_${time}.png`;
}
