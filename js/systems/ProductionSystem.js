/**
 * ProductionSystem - calculates (does not apply) production rates.
 *
 * For every owned building:
 *   rate = output / interval * count * levelMultiplier * staffingMultiplier
 *   staffingMultiplier = 1 + (workers / jobs) * workerStaffingBonus
 * so a building always works automatically, and employed citizens boost it.
 * Rates are then multiplied by named modifiers (upgrades, prestige, boosts, the
 * population bonus) registered via setModifier(). Results are cached and only
 * recomputed when buildings, workers or modifiers change.
 *
 * EconomySystem reads `entries` / `totals` each tick and applies them.
 */
export class ProductionSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.modifiers = new Map(); // source -> { target: multiplier }, target = resource id or "all"
    this.buildingModifiers = new Map(); // source -> { buildingId: multiplier }
    this.dirty = true;
    this.entries = []; // [{ id, outputs: {res: rate}, inputs: {res: rate} }] (before modifiers)
    this.totals = {};  // res -> modified production per second (theoretical, full efficiency)
    this.inputTotals = {}; // res -> building input demand per second
    this.baseRates = {};
    bus.on("building:changed", () => (this.dirty = true));
    bus.on("workers:changed", () => (this.dirty = true));
    bus.on("mods:changed", () => (this.dirty = true));
  }

  /** Register or replace a modifier: setModifier("upgrade:tools", "wood", 1.25). */
  setModifier(source, target, mult) {
    const m = this.modifiers.get(source) || {};
    m[target] = mult;
    this.modifiers.set(source, m);
    this.dirty = true;
  }

  removeModifier(source) {
    if (this.modifiers.delete(source)) this.dirty = true;
  }

  /** Output multiplier for one building type: setBuildingModifier("tech:x", "farm", 1.3). */
  setBuildingModifier(source, buildingId, mult) {
    const m = this.buildingModifiers.get(source) || {};
    m[buildingId] = mult;
    this.buildingModifiers.set(source, m);
    this.dirty = true;
  }

  removeBuildingModifier(source) {
    if (this.buildingModifiers.delete(source)) this.dirty = true;
  }

  buildingMultiplier(id) {
    let mult = 1;
    for (const m of this.buildingModifiers.values()) if (m[id]) mult *= m[id];
    return mult;
  }

  multiplierFor(resId) {
    let mult = 1;
    for (const m of this.modifiers.values()) {
      if (m[resId]) mult *= m[resId];
      if (m.all) mult *= m.all;
    }
    const b = this.buildingMods;
    if (b) {
      if (b[resId]) mult *= b[resId];
      if (b.all) mult *= b.all;
    }
    return mult;
  }

  /** Bonuses granted by owned buildings (def.bonus = {target, perCopy}), e.g. roads and castles. */
  _computeBuildingMods() {
    const mods = {};
    for (const [id, b] of Object.entries(this.state.player.buildings)) {
      const def = this.state.getBuildingDef(id);
      if (!def?.bonus || b.count <= 0) continue;
      const target = def.bonus.target ?? "all";
      mods[target] = (mods[target] ?? 1) * (1 + def.bonus.perCopy * b.count);
    }
    this.buildingMods = mods;
  }

  levelMultiplier(level) {
    return 1 + Math.max(0, level - 1) * (this.state.bal.levelProductionBonus ?? 0.5);
  }

  /** 0..1 share of a building type's job slots that are filled. */
  staffing(id) {
    const def = this.state.getBuildingDef(id);
    const jobs = (def?.jobs ?? 0) * this.state.buildingCount(id);
    if (jobs <= 0) return 0;
    const workers = this.state.player.population.workers?.[id] ?? 0;
    return Math.min(1, workers / jobs);
  }

  /** Current modified output per second of one building type, e.g. {food: 2.4}. */
  rateFor(id) {
    const entry = this.entries.find((e) => e.id === id);
    const out = {};
    if (!entry) return out;
    for (const [res, rate] of Object.entries(entry.outputs)) out[res] = rate * this.multiplierFor(res);
    return out;
  }

  recompute() {
    const { player, bal } = this.state;
    this._computeBuildingMods();
    this.entries = [];
    const base = {};
    const inputs = {};

    // Settlers foraging by hand: a small free income so a new game can never deadlock.
    for (const [res, rate] of Object.entries(bal.baseProduction ?? {})) base[res] = rate;

    for (const [id, b] of Object.entries(player.buildings)) {
      const def = this.state.getBuildingDef(id);
      if (!def || b.count <= 0) continue;
      const staffBonus = (bal.workerStaffingBonus ?? 1) + this.state.mods.get("staffing");
      const staffMult = 1 + this.staffing(id) * staffBonus;
      const scale = (b.count * this.levelMultiplier(b.level ?? 1) * staffMult * this.buildingMultiplier(id)) / (def.interval || 1);
      const outputs = {};
      for (const [res, amt] of Object.entries(def.output ?? {})) outputs[res] = amt * scale;
      const ins = {};
      for (const [res, amt] of Object.entries(def.input ?? {})) {
        ins[res] = amt * scale;
        inputs[res] = (inputs[res] ?? 0) + ins[res];
      }
      if (Object.keys(outputs).length) this.entries.push({ id, outputs, inputs: ins });
    }

    const totals = {};
    for (const [res, rate] of Object.entries(base)) totals[res] = rate;
    for (const e of this.entries) {
      for (const [res, rate] of Object.entries(e.outputs)) totals[res] = (totals[res] ?? 0) + rate;
    }
    for (const res of Object.keys(totals)) totals[res] *= this.multiplierFor(res);

    this.baseRates = base;
    this.totals = totals;
    this.inputTotals = inputs;
    this.dirty = false;
  }

  update() {
    if (this.dirty) this.recompute();
  }
}
