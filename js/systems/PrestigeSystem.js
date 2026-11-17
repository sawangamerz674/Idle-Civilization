/**
 * PrestigeSystem - Civilization Legacy.
 *
 * The player may "ascend": the current civilization is reset in exchange for
 * Civilization Points (CP), which are spent on permanent bonuses (data/prestige.json).
 *
 * Points are earned from everything produced during the current run:
 *   score  = sum(produced[resource] * weight[resource])
 *   points = floor((score / divisor) ^ exponent)        (needs >= minPoints)
 *
 * A reset keeps: prestige data, achievements, statistics, settings.
 * A reset clears: resources, buildings, population, era, research, upgrades.
 * Legacy bonuses re-apply through EffectSystem under the source "legacy:<id>".
 *
 * Listens:  "prestige:ascend", "prestige:buy" ({id})
 * Emits:    "prestige:done" ({points, count}), "prestige:bought" ({id, level}), "notify", "modal:open"
 */
export class PrestigeSystem {
  constructor(state, bus, deps) {
    this.state = state;
    this.bus = bus;
    // Systems whose derived state must be rebuilt after a reset.
    this.d = deps; // {resources, production, buildings, era, research, technology, upgrades, achievements, effects}
    bus.on("prestige:ascend", () => this.ascend());
    bus.on("prestige:buy", ({ id }) => this.buy(id));
    this.applyAll();
  }

  get data() { return this.state.data.prestige; }
  get p() { return this.state.player.prestige; }
  all() { return this.data.bonuses; }
  def(id) { return this.all().find((b) => b.id === id) ?? null; }
  level(id) { return this.p.bonuses[id] ?? 0; }
  isMaxed(def) { return this.level(def.id) >= (def.maxLevel ?? 1); }

  /** Cost in CP of the next level. */
  cost(def) {
    return Math.max(1, Math.round(def.cost * Math.pow(def.costGrowth ?? 1, this.level(def.id))));
  }
  canAfford(def) { return !this.isMaxed(def) && this.p.points >= this.cost(def); }

  // ---- earning ----
  /** Weighted score of everything produced this run. */
  score() {
    const w = this.data.formula.weights;
    const produced = this.p.runProduced ?? {};
    let s = 0;
    for (const [id, amt] of Object.entries(produced)) s += amt * (w[id] ?? 0);
    return s;
  }

  /** CP that ascending right now would grant (0 when below the minimum). */
  pendingPoints() {
    const f = this.data.formula;
    const pts = Math.floor(Math.pow(this.score() / f.divisor, f.exponent ?? 0.5));
    return pts >= f.minPoints ? pts : 0;
  }

  canAscend() { return this.pendingPoints() >= 1; }

  /** Score still missing for the first point (or the next one). */
  scoreForPoints(n) {
    const f = this.data.formula;
    return Math.pow(n, 1 / (f.exponent ?? 0.5)) * f.divisor;
  }

  // ---- spending ----
  buy(id) {
    const def = this.def(id);
    if (!def || !this.canAfford(def)) return false;
    this.p.points -= this.cost(def);
    this.p.bonuses[id] = this.level(id) + 1;
    this.applyBonus(def);
    this.bus.emit("prestige:bought", { id, level: this.level(id) });
    this.bus.emit("notify", { text: `${def.name} level ${this.level(id)}`, type: "success", duration: 1800 });
    return true;
  }

  applyBonus(def) {
    const lvl = this.level(def.id);
    this.d.effects.clear(`legacy:${def.id}`);
    if (lvl > 0 && def.effects) this.d.effects.apply(`legacy:${def.id}`, def.effects, lvl);
  }

  /** Re-apply every owned bonus (new game, load, reset). */
  applyAll() {
    for (const def of this.all()) this.applyBonus(def);
  }

  /** Extra starting resources granted by Head Start style bonuses. */
  startingBonus() {
    const out = {};
    for (const def of this.all()) {
      const lvl = this.level(def.id);
      if (!lvl || !def.startingResources) continue;
      for (const [k, v] of Object.entries(def.startingResources)) out[k] = (out[k] ?? 0) + v * lvl;
    }
    return out;
  }

  startEra() {
    let best = this.state.cfg.startingEra;
    for (const def of this.all()) {
      if (def.startEra && this.level(def.id) > 0 && this.state.eraIndex(def.startEra) > this.state.eraIndex(best)) best = def.startEra;
    }
    return best;
  }

  // ---- ascending ----
  ascend() {
    const gain = this.pendingPoints();
    if (gain < 1) {
      this.bus.emit("notify", { text: "Your civilization has not produced enough yet.", type: "warn" });
      return false;
    }
    const st = this.state;
    const old = st.player;
    const keep = {
      prestige: old.prestige,
      achievements: old.achievements,
      stats: old.stats,
      settings: old.settings
    };
    const runtime = st.runtime;
    st.reset();
    st.runtime = runtime; // keep the open panel, tick counter, etc.
    const p = st.player;
    p.prestige = {
      ...keep.prestige,
      points: keep.prestige.points + gain,
      totalPoints: keep.prestige.totalPoints + gain,
      count: keep.prestige.count + 1,
      runProduced: {},
      runStarted: Date.now()
    };
    p.achievements = keep.achievements;
    p.stats = keep.stats;
    p.settings = keep.settings;

    // Starting era and resources from legacy bonuses.
    const era = this.startEra();
    p.era = era;
    p.unlockedEras = st.data.eras.eras.filter((e) => e.index <= st.eraIndex(era)).map((e) => e.id);
    for (const [k, v] of Object.entries(this.startingBonus())) if (p.resources[k]) p.resources[k].amount += v;

    // Rebuild everything derived from the player data.
    const d = this.d;
    d.upgrades.applyAll();
    d.technology.applyAll();
    d.achievements.applyAll();
    this.applyAll();
    d.era.ready = false;
    d.era.applyEra();
    d.resources.recalcCaps();
    d.buildings.resync();
    d.production.recompute();
    st.runtime.popVersion++;
    st.runtime.growthStatus = "growing";

    this.bus.emit("era:changed", { id: era, index: st.eraIndex(era) });
    this.bus.emit("era:readiness", false);
    this.bus.emit("prestige:done", { points: gain, count: p.prestige.count });
    this.bus.emit("modal:open", {
      title: "A new civilization rises!",
      body: `Your legacy grants you ${gain} Civilization Point${gain === 1 ? "" : "s"}.\nSpend them in the Legacy panel on permanent bonuses.`,
      buttons: [{ label: "Begin again" }]
    });
    return true;
  }

  update() {}
}
