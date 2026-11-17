import { isObject, isFiniteNumber } from "../utils/ValidationUtils.js";
import { hashString, toBase64, fromBase64 } from "../utils/StorageUtils.js";

const EXPORT_PREFIX = "IDLECIV1:";

/**
 * SaveSystem - persistence of state.player.
 *
 * Storage: LocalStorage is the main copy (synchronous, so it works during page unload) with a
 * previous-save backup ("<key>.bak"); IndexedDB keeps a second copy; on CrazyGames the SDK data
 * module mirrors the save so it follows the player across devices. Loading takes the newest
 * valid copy of all sources.
 *
 * Envelope: {v: saveVersion, savedAt: ms, hash, data: "<player JSON>"}. The hash detects
 * corruption; a bad copy is skipped and the next source is used.
 * Migration: `migrations[n]` upgrades a player object from version n to n+1.
 * Sanitising: the loaded player is merged over a fresh default player, numbers are checked,
 * unknown ids are dropped (the JSON data may change between releases), amounts are clamped.
 * A save from a NEWER game version is never loaded or overwritten.
 *
 * Saves: autosave every `autosaveIntervalSeconds`, shortly after important events, when the tab
 * is hidden/closed, and on demand. Export/import use a base64 text string.
 *
 * Listens:  "save:now", "save:request", "save:reset", "save:import" ({text})
 * Emits:    "save:status" ("saving" | "saved" | "error"), "notify"
 */
export class SaveSystem {
  /** migrations[n] converts version n -> n + 1. */
  static migrations = {};

  constructor(state, bus, { local, idb = null, integration = null } = {}) {
    this.state = state;
    this.bus = bus;
    this.local = local;
    this.idb = idb;
    this.integration = integration;
    this.key = state.cfg.saveKey ?? "idleCivilization.save";
    this.interval = state.cfg.autosaveIntervalSeconds ?? 30;
    this.locked = false;      // true when a newer-version save exists: never overwrite it
    this.lastSavedAt = 0;
    this._t = 0;
    this._pending = 0;        // seconds until a requested save is written
    this._defaults = null;

    bus.on("save:now", () => this.save("manual"));
    bus.on("save:request", () => this.requestSave());
    bus.on("save:reset", () => this.hardReset());
    bus.on("save:import", ({ text }) => this.importText(text));
    for (const ev of ["era:changed", "research:completed", "upgrade:bought", "prestige:done", "prestige:bought", "achievement:unlocked", "building:changed"]) {
      bus.on(ev, () => this.requestSave());
    }
  }

  // ---------------- serialisation ----------------
  serialize() {
    const p = this.state.player;
    p.lastSession = Date.now();
    const data = JSON.stringify(p);
    return JSON.stringify({ v: this.state.cfg.saveVersion ?? 1, savedAt: Date.now(), hash: hashString(data), data });
  }

  /** Parse and validate envelope text. Returns {ok, player, savedAt, version} or {ok:false, error}. */
  parse(text) {
    if (typeof text !== "string" || !text) return { ok: false, error: "empty" };
    let env;
    try { env = JSON.parse(text); } catch { return { ok: false, error: "not JSON" }; }
    if (!isObject(env) || typeof env.data !== "string") return { ok: false, error: "bad format" };
    if (env.hash !== hashString(env.data)) return { ok: false, error: "corrupt (checksum)" };
    const current = this.state.cfg.saveVersion ?? 1;
    const version = isFiniteNumber(env.v) ? env.v : 1;
    if (version > current) return { ok: false, error: "newer", version };
    let player;
    try { player = JSON.parse(env.data); } catch { return { ok: false, error: "corrupt (data)" }; }
    if (!isObject(player)) return { ok: false, error: "bad player" };
    for (let v = version; v < current; v++) {
      const fn = SaveSystem.migrations[v];
      if (fn) player = fn(player) ?? player;
    }
    return { ok: true, player, savedAt: isFiniteNumber(env.savedAt) ? env.savedAt : 0, version };
  }

  // ---------------- sanitising ----------------
  _defaultPlayer() {
    // GameState.reset() has just produced a fresh player; keep a deep copy as the template.
    if (!this._defaults) this._defaults = structuredClone(this.state.player);
    return structuredClone(this._defaults);
  }

  /** Merge `src` over `def`: keep shapes and types of the defaults, fix bad numbers. */
  _merge(def, src) {
    if (def === null) return typeof src === "string" ? src : null;
    if (Array.isArray(def)) return Array.isArray(src) ? src : def;
    if (isObject(def)) {
      if (!isObject(src)) return def;
      const out = {};
      const dynamic = Object.keys(def).length === 0; // id -> value dictionaries (buildings, upgrades...)
      for (const k of dynamic ? Object.keys(src) : Object.keys(def)) {
        if (k === "__proto__" || k === "constructor") continue;
        out[k] = dynamic ? this._clean(src[k]) : this._merge(def[k], src[k]);
      }
      return out;
    }
    if (typeof def === "number") return isFiniteNumber(src) ? src : def;
    if (typeof def === typeof src) return src;
    return def;
  }

  _clean(v) {
    if (isFiniteNumber(v) || typeof v === "string" || typeof v === "boolean") return v;
    if (isObject(v)) {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (k !== "__proto__") o[k] = this._clean(x);
      return o;
    }
    return Array.isArray(v) ? v.map((x) => this._clean(x)) : 0;
  }

  /** Turn raw loaded data into a valid player object for the current game data. */
  sanitize(raw) {
    const st = this.state, d = st.data, bal = st.bal;
    const p = this._merge(this._defaultPlayer(), raw);
    const num = (v, min, max) => Math.min(max, Math.max(min, isFiniteNumber(v) ? v : min));

    // era
    const eras = d.eras.eras;
    if (!eras.some((e) => e.id === p.era)) p.era = st.cfg.startingEra;
    p.unlockedEras = [...new Set([...(p.unlockedEras ?? []).filter((id) => eras.some((e) => e.id === id)), p.era])];
    p.stats.highestEra = num(p.stats.highestEra, 1, eras.length);

    // buildings
    for (const id of Object.keys(p.buildings)) {
      const def = st.getBuildingDef(id), b = p.buildings[id];
      if (!def || !isObject(b)) { delete p.buildings[id]; continue; }
      b.count = Math.floor(num(b.count, 0, def.maxCount ?? 1e7));
      b.level = Math.floor(num(b.level, 1, def.maxLevel ?? 99));
      if (b.count <= 0) delete p.buildings[id];
    }

    // research, upgrades, achievements
    const researchIds = new Set(d.research.research.map((r) => r.id));
    p.research.completed = [...new Set(p.research.completed.filter((id) => researchIds.has(id)))];
    if (p.research.active && (!researchIds.has(p.research.active) || p.research.completed.includes(p.research.active))) {
      p.research.active = null;
      p.research.progress = 0;
    }
    p.research.progress = num(p.research.progress, 0, 1e9);
    for (const id of Object.keys(p.upgrades)) {
      const def = d.upgrades.upgrades.find((u) => u.id === id);
      if (!def) delete p.upgrades[id];
      else p.upgrades[id] = Math.floor(num(p.upgrades[id], 0, def.maxLevel ?? 10));
    }
    const achIds = new Set(d.achievements.achievements.map((a) => a.id));
    p.achievements = [...new Set(p.achievements.filter((id) => achIds.has(id)))];

    // prestige
    const pr = p.prestige;
    pr.points = Math.floor(num(pr.points, 0, 1e15));
    pr.count = Math.floor(num(pr.count, 0, 1e9));
    pr.totalPoints = Math.floor(num(pr.totalPoints, 0, 1e15));
    for (const id of Object.keys(pr.bonuses)) {
      const def = d.prestige.bonuses.find((b) => b.id === id);
      if (!def) delete pr.bonuses[id];
      else pr.bonuses[id] = Math.floor(num(pr.bonuses[id], 0, def.maxLevel ?? 1));
    }

    // population
    const pop = p.population;
    pop.total = num(pop.total, bal.minPopulation ?? 1, 1e9);
    pop.housing = num(pop.housing, 0, 1e9);
    pop.growthProgress = num(pop.growthProgress, 0, 1);
    pop.starveTimer = num(pop.starveTimer, 0, 1e6);
    for (const id of Object.keys(pop.workers)) {
      if (!st.getBuildingDef(id) || !isFiniteNumber(pop.workers[id]) || pop.workers[id] < 0) delete pop.workers[id];
    }

    // resources: amounts only (caps are recalculated by ResourceSystem)
    for (const [id, r] of Object.entries(p.resources)) {
      r.amount = num(r.amount, 0, 1e300);
      if (!d.resources.resources.some((x) => x.id === id)) delete p.resources[id];
    }
    for (const def of d.resources.resources) if (!p.resources[def.id]) p.resources[def.id] = this._defaultPlayer().resources[def.id];

    // boosts and misc
    for (const k of Object.keys(p.boosts ?? {})) p.boosts[k] = num(p.boosts[k], 0, 86400);
    p.stats.playtime = num(p.stats.playtime, 0, 1e12);
    p.lastSession = num(p.lastSession, 0, Date.now() + 60000);
    return p;
  }

  /** Replace state.player with a sanitised player. Call BEFORE systems derive their state. */
  applyPlayer(raw) {
    this.state.player = this.sanitize(raw);
  }

  // ---------------- reading ----------------
  async _readAll() {
    const reads = [
      ["localStorage", this.local?.getSync?.(this.key) ?? null],
      ["localStorage.bak", this.local?.getSync?.(this.key + ".bak") ?? null]
    ];
    if (this.idb) reads.push(["indexedDB", await this.idb.get(this.key)]);
    if (this.integration?.dataAvailable) reads.push(["crazygames", await this.integration.dataGet(this.key)]);
    return reads;
  }

  /**
   * Load the newest valid save into state.player. Returns {loaded, source, savedAt, issues}.
   * Must run before the gameplay systems are constructed.
   */
  async load() {
    const issues = [];
    let best = null;
    for (const [source, text] of await this._readAll()) {
      if (text == null) continue;
      const r = this.parse(text);
      if (!r.ok) {
        issues.push(`${source}: ${r.error}`);
        if (r.error === "newer") this.locked = true;
        continue;
      }
      if (!best || r.savedAt > best.savedAt) best = { ...r, source };
    }
    if (this.locked) {
      return { loaded: false, source: null, issues, locked: true };
    }
    if (!best) return { loaded: false, source: null, issues };
    this.applyPlayer(best.player);
    this.lastSavedAt = best.savedAt;
    return { loaded: true, source: best.source, savedAt: best.savedAt, issues };
  }

  // ---------------- writing ----------------
  /** Write the save now. LocalStorage is synchronous; IndexedDB and cloud copies are fire-and-forget. */
  save(reason = "autosave") {
    if (this.locked) return false;
    const text = this.serialize();
    this._pending = 0;
    this._t = 0;
    this.bus.emit("save:status", "saving");
    const previous = this.local?.getSync?.(this.key);
    const okLocal = this.local?.setSync?.(this.key, text) ?? false;
    if (okLocal && previous) this.local.setSync(this.key + ".bak", previous);
    if (this.idb) this.idb.set(this.key, text);
    if (this.integration?.dataAvailable) this.integration.dataSet(this.key, text);
    this.lastSavedAt = Date.now();
    const ok = okLocal || !!this.idb || !!this.integration?.dataAvailable;
    this.bus.emit("save:status", ok ? "saved" : "error");
    if (!ok) this.bus.emit("notify", { text: "Could not save: browser storage is unavailable.", type: "error" });
    else if (reason === "manual") this.bus.emit("notify", { text: "Game saved.", type: "success", duration: 1500 });
    return ok;
  }

  /** Save soon (debounced), used after important events. */
  requestSave() {
    if (this._pending <= 0) this._pending = 2;
  }

  update(dt) {
    if (this.state.runtime.offline) return;
    this._t += dt;
    if (this._pending > 0) {
      this._pending -= dt;
      if (this._pending <= 0) return void this.save("event");
    }
    if (this._t >= this.interval) this.save("autosave");
  }

  /** Save when the tab is hidden or being closed (works because the local write is synchronous). */
  attachLifecycle(win = window, doc = document) {
    doc.addEventListener("visibilitychange", () => { if (doc.hidden) this.save("hidden"); });
    win.addEventListener("pagehide", () => this.save("unload"));
    win.addEventListener("beforeunload", () => this.save("unload"));
  }

  // ---------------- export / import / reset ----------------
  exportText() {
    return EXPORT_PREFIX + toBase64(this.serialize());
  }

  /** Validate an export string. Returns the parse result without applying it. */
  inspectExport(text) {
    const t = (text ?? "").trim();
    if (!t.startsWith(EXPORT_PREFIX)) return { ok: false, error: "This is not an Idle Civilization save." };
    let env;
    try { env = fromBase64(t.slice(EXPORT_PREFIX.length)); } catch { return { ok: false, error: "The save text is damaged." }; }
    const r = this.parse(env);
    if (!r.ok) return { ok: false, error: r.error === "newer" ? "This save is from a newer version of the game." : `The save is invalid (${r.error}).` };
    return { ...r, envelope: env };
  }

  /** Replace the stored save with an exported one and reload the page. */
  async importText(text) {
    const r = this.inspectExport(text);
    if (!r.ok) {
      this.bus.emit("notify", { text: r.error, type: "error" });
      return false;
    }
    this.locked = false;
    this.local?.setSync?.(this.key, r.envelope);
    if (this.idb) await this.idb.set(this.key, r.envelope);
    if (this.integration?.dataAvailable) await this.integration.dataSet(this.key, r.envelope);
    this.locked = true; // the running session must not overwrite the imported save before the reload
    this.bus.emit("save:imported");
    return true;
  }

  async hardReset() {
    this.locked = true; // stop autosaves from re-creating the save while we wipe it
    this.local?.removeSync?.(this.key);
    this.local?.removeSync?.(this.key + ".bak");
    if (this.idb) await this.idb.remove(this.key);
    if (this.integration?.dataAvailable) await this.integration.dataRemove(this.key);
    this.bus.emit("save:wiped");
    return true;
  }
}
