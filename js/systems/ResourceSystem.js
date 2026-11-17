/**
 * ResourceSystem - the only place resource amounts change.
 * Owns amounts, storage caps, spending and lifetime "produced" statistics.
 * Emits "resource:changed" ({id}) when an amount changes by a player action
 * (spend / reward); per-tick production changes are read by the HUD directly.
 */
export class ResourceSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.capMultipliers = new Map(); // source -> multiplier applied to all caps
    this.capsDirty = true;
    bus.on("building:changed", () => (this.capsDirty = true));
  }

  get(id) {
    return this.state.player.resources[id];
  }

  amount(id) {
    return this.get(id)?.amount ?? 0;
  }

  /** Add an amount, respecting the storage cap. Returns the amount actually added. */
  add(id, amount, { track = true } = {}) {
    const r = this.get(id);
    if (!r || !(amount > 0)) return 0;
    const room = Math.max(0, r.cap - r.amount);
    const added = Math.min(amount, room);
    r.amount += added;
    if (track && added > 0) {
      const t = this.state.player.stats.totalProduced;
      t[id] = (t[id] ?? 0) + added;
      const run = (this.state.player.prestige.runProduced ??= {});
      run[id] = (run[id] ?? 0) + added;
    }
    return added;
  }

  /** Remove up to `amount`; returns how much was removed (never goes below 0). */
  remove(id, amount) {
    const r = this.get(id);
    if (!r || !(amount > 0)) return 0;
    const removed = Math.min(amount, r.amount);
    r.amount -= removed;
    return removed;
  }

  canAfford(cost) {
    for (const [id, need] of Object.entries(cost)) {
      if (this.amount(id) + 1e-9 < need) return false;
    }
    return true;
  }

  /** Atomically spend a cost object ({food: 10, wood: 5}). Returns true on success. */
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [id, need] of Object.entries(cost)) this.remove(id, need);
    this.bus.emit("resource:changed", { cost });
    return true;
  }

  /** Multiplier on all storage caps from a named source (upgrades, prestige). */
  setCapMultiplier(source, mult) {
    this.capMultipliers.set(source, mult);
    this.capsDirty = true;
  }

  removeCapMultiplier(source) {
    if (this.capMultipliers.delete(source)) this.capsDirty = true;
  }

  /** Recalculate caps: (base + building storage) * multipliers. Clamps amounts down to new caps. */
  recalcCaps() {
    const mult = [...this.capMultipliers.values()].reduce((a, b) => a * b, 1);
    for (const def of this.state.data.resources.resources) {
      let cap = def.baseCap;
      for (const [bid, b] of Object.entries(this.state.player.buildings)) {
        const bdef = this.state.getBuildingDef(bid);
        const extra = bdef?.storage?.[def.id];
        if (extra) cap += extra * b.count;
      }
      const r = this.get(def.id);
      r.cap = Math.floor(cap * mult);
      if (r.amount > r.cap) r.amount = r.cap;
    }
    this.capsDirty = false;
  }

  update() {
    if (this.capsDirty) this.recalcCaps();
  }
}
