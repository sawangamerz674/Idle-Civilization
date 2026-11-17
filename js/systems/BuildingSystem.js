/**
 * BuildingSystem - buying and upgrading buildings, housing capacity.
 *
 * A building "type" has a count (copies owned) and one shared level. Upgrading
 * raises the level for every copy (production multiplier in ProductionSystem).
 * Costs scale geometrically with copies owned (build) or level (upgrade).
 *
 * Listens:  "building:buy" ({id}), "building:upgrade" ({id})
 * Emits:    "building:built" ({id, count}), "building:upgraded" ({id, level}),
 *           "building:changed", "notify"
 */
export class BuildingSystem {
  constructor(state, bus, economy) {
    this.state = state;
    this.bus = bus;
    this.economy = economy;
    bus.on("building:buy", ({ id }) => this.buy(id));
    bus.on("building:upgrade", ({ id }) => this.upgrade(id));
    // Announce buildings that become available through unlock conditions (era unlocks have their own popup).
    this._known = this._unlockedIds();
    bus.on("era:changed", () => (this._known = this._unlockedIds()));
    bus.on("building:changed", () => this._announceUnlocks());
    bus.on("research:completed", () => this._announceUnlocks());
    bus.on("mods:changed", () => this.recalcHousing());
    this.recalcHousing();
  }

  /** Forget which unlocks were announced (after a prestige reset or load). */
  resync() {
    this._known = this._unlockedIds();
    this.recalcHousing();
  }

  _unlockedIds() {
    return new Set(this.state.data.buildings.buildings.filter((d) => this.isUnlocked(d)).map((d) => d.id));
  }

  _announceUnlocks() {
    for (const def of this.state.data.buildings.buildings) {
      if (!this._known.has(def.id) && this.isUnlocked(def)) {
        this._known.add(def.id);
        this.bus.emit("notify", { text: `New building available: ${def.name}`, type: "success", duration: 3500 });
      }
    }
  }

  /** Is this building visible/purchasable right now (era + unlock condition)? */
  isUnlocked(def) {
    if (this.state.eraIndex(def.era) > this.state.eraIndex(this.state.player.era)) return false;
    const u = def.unlock;
    if (!u) return true;
    if (u.building && this.state.buildingCount(u.building) < (u.count ?? 1)) return false;
    if (u.research && !this.state.player.research.completed.includes(u.research)) return false;
    return true;
  }

  /** Human-readable reasons a building is still locked (empty when unlocked). */
  lockReasons(def) {
    const out = [];
    const eraName = this.state.data.eras.eras.find((e) => e.id === def.era)?.name;
    if (this.state.eraIndex(def.era) > this.state.eraIndex(this.state.player.era)) out.push(`Reach the ${eraName}`);
    const u = def.unlock;
    if (u?.research && !this.state.player.research.completed.includes(u.research)) {
      out.push(`Research ${this.state.data.research.research.find((r) => r.id === u.research)?.name ?? u.research}`);
    }
    if (u?.building && this.state.buildingCount(u.building) < (u.count ?? 1)) {
      out.push(`Build ${u.count ?? 1} ${this.state.getBuildingDef(u.building)?.name ?? u.building}`);
    }
    return out;
  }

  /** Optional per-building copy limit via "maxCount" in buildings.json. */
  isMaxed(def) {
    return def.maxCount ? this.state.buildingCount(def.id) >= def.maxCount : false;
  }

  level(id) {
    return this.state.player.buildings[id]?.level ?? 1;
  }

  maxLevel(def) {
    return def.maxLevel && def.maxLevel > 0 ? def.maxLevel : 1;
  }

  /** Can this type be upgraded at all (owned, has an upgrade track, below max)? */
  canUpgrade(def) {
    return !!def.upgrade && this.state.buildingCount(def.id) > 0 && this.level(def.id) < this.maxLevel(def);
  }

  upgradeCost(def) {
    const growth = def.upgrade?.growth ?? this.state.bal.upgradeCostGrowth;
    const lvl = this.level(def.id);
    const out = {};
    for (const [res, base] of Object.entries(def.upgrade?.cost ?? {})) {
      out[res] = Math.ceil(base * Math.pow(growth, lvl - 1));
    }
    return out;
  }

  _notEnough(cost) {
    const missing = Object.keys(cost).find((r) => this.economy.resources.amount(r) < cost[r]);
    const name = this.state.getResourceDef(missing)?.name ?? missing;
    this.bus.emit("notify", { text: `Not enough ${name}.`, type: "warn", duration: 1800 });
  }

  buy(id) {
    const def = this.state.getBuildingDef(id);
    if (!def) return false;
    if (!this.isUnlocked(def)) {
      this.bus.emit("notify", { text: "That building is not unlocked yet.", type: "warn" });
      return false;
    }
    if (this.isMaxed(def)) {
      this.bus.emit("notify", { text: `You can only build ${def.maxCount} ${def.name}.`, type: "warn", duration: 1800 });
      return false;
    }

    const cost = this.economy.costFor(def);
    if (!this.economy.canAfford(cost)) {
      this._notEnough(cost);
      return false;
    }
    this.economy.purchase(cost);

    const owned = (this.state.player.buildings[id] ??= { count: 0, level: 1 });
    owned.count += 1;
    this.state.player.stats.buildingsBuilt += 1;

    this.recalcHousing();
    this.bus.emit("building:changed", { id });
    this.bus.emit("building:built", { id, count: owned.count });
    this.bus.emit("notify", { text: `Built ${def.name}`, type: "success", duration: 1500 });
    return true;
  }

  upgrade(id) {
    const def = this.state.getBuildingDef(id);
    if (!def || !this.canUpgrade(def)) return false;
    const cost = this.upgradeCost(def);
    if (!this.economy.canAfford(cost)) {
      this._notEnough(cost);
      return false;
    }
    this.economy.purchase(cost);
    const owned = this.state.player.buildings[id];
    owned.level = (owned.level ?? 1) + 1;
    this.bus.emit("building:changed", { id });
    this.bus.emit("building:upgraded", { id, level: owned.level });
    this.bus.emit("notify", { text: `${def.name} upgraded to level ${owned.level}`, type: "success", duration: 1800 });
    return true;
  }

  recalcHousing() {
    let housing = this.state.bal.baseHousing ?? 5;
    for (const [id, b] of Object.entries(this.state.player.buildings)) {
      const def = this.state.getBuildingDef(id);
      if (def?.housing) housing += def.housing * b.count;
    }
    housing += Math.floor(this.state.mods.get("housing"));
    this.state.player.population.housing = housing;
  }

  update() {}
}
