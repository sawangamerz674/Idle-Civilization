/**
 * StorageUtils - tiny storage backends and text helpers used by SaveSystem.
 * Every backend exposes the same async interface: get(key) / set(key, text) / remove(key).
 * Backends never throw; a failing backend simply behaves as empty / not writable.
 */

/** Synchronous-feeling wrapper around window.localStorage (also offers getSync/setSync for page-unload saves). */
export class LocalStorageBackend {
  constructor(storage = typeof localStorage !== "undefined" ? localStorage : null) {
    this.storage = storage;
    this.name = "localStorage";
  }
  getSync(key) {
    try { return this.storage?.getItem(key) ?? null; } catch { return null; }
  }
  setSync(key, text) {
    try { this.storage.setItem(key, text); return true; } catch { return false; }
  }
  removeSync(key) {
    try { this.storage?.removeItem(key); } catch { /* ignore */ }
  }
  async get(key) { return this.getSync(key); }
  async set(key, text) { return this.setSync(key, text); }
  async remove(key) { this.removeSync(key); }
}

/** IndexedDB key/value store used as a second copy of the save. */
export class IndexedDBBackend {
  constructor(dbName = "idleCivilization", store = "saves", idb = typeof indexedDB !== "undefined" ? indexedDB : null) {
    this.dbName = dbName;
    this.store = store;
    this.idb = idb;
    this.name = "indexedDB";
    this._db = null;
  }
  _open() {
    if (!this.idb) return Promise.resolve(null);
    if (this._db) return this._db;
    this._db = new Promise((resolve) => {
      try {
        const req = this.idb.open(this.dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(this.store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return this._db;
  }
  async _run(mode, fn) {
    const db = await this._open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(this.store, mode);
        const req = fn(tx.objectStore(this.store));
        tx.oncomplete = () => resolve(req && "result" in req ? req.result ?? null : true);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  get(key) { return this._run("readonly", (s) => s.get(key)); }
  async set(key, text) { return (await this._run("readwrite", (s) => s.put(text, key))) !== null; }
  async remove(key) { await this._run("readwrite", (s) => s.delete(key)); }
}

/** In-memory backend (tests, or when nothing else works). */
export class MemoryBackend {
  constructor() { this.map = new Map(); this.name = "memory"; }
  getSync(key) { return this.map.get(key) ?? null; }
  setSync(key, text) { this.map.set(key, text); return true; }
  removeSync(key) { this.map.delete(key); }
  async get(key) { return this.getSync(key); }
  async set(key, text) { return this.setSync(key, text); }
  async remove(key) { this.removeSync(key); }
}

/** Small, fast, non-cryptographic hash (detects accidental corruption and hand-edits). */
export function hashString(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/** UTF-8 safe base64 for the export string. */
export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
