/**
 * UpgradeSystem - leveled upgrades from data/upgrades.json.
 *
 * Categories: building production, resource multipliers, population, storage,
 * research efficiency, offline production, economy. Each upgrade has a cost that
 * grows with its level, a maxLevel, an `effect` (see EffectSystem; its value is
 * per level) and an unlock condition: {era, building, count, research}.
 * Levels are stored in player.upgrades ({id: level}).
 *
 * Listens:  "upgrade:buy" ({id})
 * Emits:    "upgrade:bought" ({id, level}), "notify"
 */
export class UpgradeSystem {
  constructor(state, bus, effects, resources) {
    this.state = state;
    this.bus = bus;
    this.effects = effects;
    this.resources = resources;
    bus.on("upgrade:buy", ({ id }) => this.buy(id));
    this.applyAll();
  }

  all() {
    return this.state.data.upgrades.upgrades;
  }

  def(id) {
    return this.all().find((u) => u.id === id) ?? null;
  }

  level(id) {
    return this.state.player.upgrades[id] ?? 0;
  }

  isMaxed(def) {
    return this.level(def.id) >= (def.maxLevel ?? 10);
  }

  isUnlocked(def) {
    const u = def.unlock;
    if (!u) return true;
    if (u.era && this.state.eraIndex(u.era) > this.state.eraIndex(this.state.player.era)) return false;
    if (u.building && this.state.buildingCount(u.building) < (u.count ?? 1)) return false;
    if (u.research && !this.state.player.research.completed.includes(u.research)) return false;
    return true;
  }

  cost(def) {
    const lvl = this.level(def.id);
    const growth = def.costGrowth ?? this.state.bal.upgradeCostGrowth;
    const out = {};
    for (const [res, base] of Object.entries(def.cost)) out[res] = Math.ceil(base * Math.pow(growth, lvl));
    return out;
  }

  canAfford(def) {
    return !this.isMaxed(def) && this.resources.canAfford(this.cost(def));
  }

  buy(id) {
    const def = this.def(id);
    if (!def || !this.isUnlocked(def) || this.isMaxed(def)) return false;
    const cost = this.cost(def);
    if (!this.resources.spend(cost)) {
      this.bus.emit("notify", { text: "Not enough resources.", type: "warn", duration: 1800 });
      return false;
    }
    const level = this.level(id) + 1;
    this.state.player.upgrades[id] = level;
    this.state.player.stats.upgradesBought += 1;
    this.effects.replace(`upgrade:${id}`, [def.effect], level);
    this.bus.emit("upgrade:bought", { id, level });
    this.bus.emit("notify", { text: `${def.name} level ${level}`, type: "success", duration: 1500 });
    return true;
  }

  /** Re-apply every owned upgrade level (new game, load, prestige reset). */
  applyAll() {
    for (const def of this.all()) {
      this.effects.clear(`upgrade:${def.id}`);
      const lvl = this.level(def.id);
      if (lvl > 0) this.effects.apply(`upgrade:${def.id}`, [def.effect], lvl);
    }
  }
}
