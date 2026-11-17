/**
 * StatMods - additive stat bonuses from named sources (upgrades, technologies,
 * achievements, prestige). Used for non-production stats such as housing,
 * growthSpeed, foodUse, researchSpeed, staffing, buildingCost, offlineEfficiency,
 * offlineHours. get(stat) returns the sum over all sources.
 */
export class StatMods {
  constructor() {
    this.sources = new Map();
  }
  set(source, stat, value) {
    let m = this.sources.get(source);
    if (!m) this.sources.set(source, (m = new Map()));
    m.set(stat, value);
  }
  clear(source) {
    this.sources.delete(source);
  }
  get(stat) {
    let total = 0;
    for (const m of this.sources.values()) total += m.get(stat) ?? 0;
    return total;
  }
}

/**
 * GameState - the single, centralized store of all mutable game data.
 * Systems read/write it; nothing else keeps gameplay state.
 * Everything here must be JSON-serializable so SaveSystem can persist it.
 */
export class GameState {
  /**
   * @param {object} cfg   game.config.json
   * @param {object} bal   balance.config.json
   * @param {object} data  loaded data files ({resources, eras, ...})
   */
  constructor(cfg, bal, data) {
    this.cfg = cfg;
    this.bal = bal;
    this.data = data;
    this.mods = new StatMods(); // derived each session from upgrades/techs/achievements; never saved
    this.reset();
  }

  /** Create a fresh new-game state. */
  reset() {
    const resources = {};
    for (const def of this.data.resources.resources) {
      resources[def.id] = {
        amount: this.bal.startingResources?.[def.id] ?? 0,
        cap: def.baseCap,
        production: 0,   // per second (computed by EconomySystem in Phase 2)
        consumption: 0   // per second
      };
    }

    this.player = {
      resources,
      buildings: {},            // id -> { count, level }   (Phase 3)
      population: {
        total: this.cfg.startingPopulation,
        housing: this.bal.baseHousing ?? 5,
        workers: {},          // buildingId -> number of citizens employed there
        growthProgress: 0,    // 0..1 toward the next citizen
        starveTimer: 0,       // seconds spent starving toward losing a citizen
        autoAssign: true
      },
      era: this.cfg.startingEra,
      unlockedEras: [this.cfg.startingEra],
      research: { completed: [], active: null, progress: 0 },   // (Phase 5)
      upgrades: {},                                              // (Phase 5)
      achievements: [],                                          // (Phase 5)
      prestige: { points: 0, count: 0, totalPoints: 0, bonuses: {}, runProduced: {}, runStarted: Date.now() }, // Civilization Legacy (Phase 6)
      boosts: { production: 0, research: 0 },                 // seconds left of rewarded-ad boosts (Phase 7)
      adsWatched: 0,
      stats: { totalProduced: {}, buildingsBuilt: 0, playtime: 0, highestEra: 1, maxPopulation: this.cfg.startingPopulation, upgradesBought: 0 },
      settings: { music: true, sfx: true, musicVolume: 0.5, sfxVolume: 0.7, notation: "short", quality: "auto", autopilot: false, onboardingDone: false },
      lastSession: Date.now()
    };

    this.runtime = {
      activePanel: "civilization",
      tick: 0,
      dirtySave: false,
      popVersion: 0,          // bumped whenever population or worker assignment changes (renderer re-syncs)
      growthStatus: "growing", // "growing" | "housing" | "food" | "starving"
      offline: false          // true while OfflineSystem fast-forwards the simulation
    };
  }

  getEra() {
    return this.data.eras.eras.find((e) => e.id === this.player.era);
  }

  /** Era order number (1-5) for an era id; unknown ids sort last. */
  eraIndex(eraId) {
    return this.data.eras.eras.find((e) => e.id === eraId)?.index ?? 99;
  }

  getBuildingDef(id) {
    if (!this._bMap) this._bMap = new Map(this.data.buildings.buildings.map((b) => [b.id, b]));
    return this._bMap.get(id) || null;
  }

  getResourceDef(id) {
    return this.data.resources.resources.find((r) => r.id === id) || null;
  }

  /** How many of a building the player owns. */
  buildingCount(id) {
    return this.player.buildings[id]?.count ?? 0;
  }

  /** Serializable snapshot (only `player`; runtime is never saved). */
  toJSON() {
    return this.player;
  }
}
