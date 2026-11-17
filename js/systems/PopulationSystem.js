/**
 * PopulationSystem - citizens: growth, starvation decline, employment.
 *
 * Growth: one new citizen every `populationGrowthIntervalSeconds` (faster in later
 * eras) while there is free housing and a food reserve; progress pauses otherwise.
 * Starvation: while EconomySystem reports starving, a citizen leaves every
 * `starvationDeclineIntervalSeconds` (never below minPopulation).
 * Employment: citizens fill job slots (def.jobs * copies). Employed workers boost
 * their building (see ProductionSystem). Auto-assign fills empty slots with
 * unemployed citizens, favouring the least-staffed building.
 *
 * Listens:  "workers:assign" ({id, delta}), "workers:auto" ({on}), "workers:autoassign",
 *           "building:changed"
 * Emits:    "population:changed", "workers:changed", "notify"
 */
export class PopulationSystem {
  constructor(state, bus, economy, production, buildings) {
    this.state = state;
    this.bus = bus;
    this.economy = economy;
    this.production = production;
    this.buildings = buildings;

    bus.on("workers:assign", ({ id, delta }) => this.assign(id, delta));
    bus.on("workers:auto", ({ on }) => {
      this.state.player.population.autoAssign = !!on;
      if (on) this.autoAssign();
    });
    bus.on("workers:autoassign", () => this.autoAssign());
    bus.on("building:changed", () => {
      this.trimWorkers();
      if (this.state.player.population.autoAssign) this.autoAssign();
      this._applyBonus();
    });
    this._applyBonus();
  }

  // ---- queries ----
  get pop() {
    return this.state.player.population;
  }

  slotsFor(id) {
    const def = this.state.getBuildingDef(id);
    return (def?.jobs ?? 0) * this.state.buildingCount(id);
  }

  workersAt(id) {
    return this.pop.workers[id] ?? 0;
  }

  employed() {
    return Object.values(this.pop.workers).reduce((a, b) => a + b, 0);
  }

  unemployed() {
    return Math.max(0, Math.floor(this.pop.total) - this.employed());
  }

  totalSlots() {
    return this.state.data.buildings.buildings.reduce((sum, d) => sum + this.slotsFor(d.id), 0);
  }

  // ---- worker assignment ----
  /** Move `delta` citizens into (+) or out of (-) a building. Returns true if anything changed. */
  assign(id, delta) {
    const slots = this.slotsFor(id);
    const current = this.workersAt(id);
    let next = current + delta;
    next = Math.max(0, Math.min(next, slots));
    if (delta > 0) next = Math.min(next, current + this.unemployed());
    if (next === current) return false;
    if (next === 0) delete this.pop.workers[id];
    else this.pop.workers[id] = next;
    this._changed();
    return true;
  }

  /** Fill empty slots with unemployed citizens, least-staffed building first. */
  autoAssign() {
    let free = this.unemployed();
    if (free <= 0) return;
    const defs = this.state.data.buildings.buildings.filter((d) => this.slotsFor(d.id) > 0);
    let changed = false;
    while (free > 0) {
      let best = null;
      let bestRatio = Infinity;
      for (const d of defs) {
        const slots = this.slotsFor(d.id);
        const w = this.workersAt(d.id);
        if (w >= slots) continue;
        const ratio = w / slots;
        if (ratio < bestRatio) {
          best = d;
          bestRatio = ratio;
        }
      }
      if (!best) break;
      this.pop.workers[best.id] = this.workersAt(best.id) + 1;
      free--;
      changed = true;
    }
    if (changed) this._changed();
  }

  /** Drop workers that no longer have a slot or a citizen (building lost, population fell). */
  trimWorkers() {
    let changed = false;
    for (const id of Object.keys(this.pop.workers)) {
      const slots = this.slotsFor(id);
      if (this.pop.workers[id] > slots) {
        if (slots <= 0) delete this.pop.workers[id];
        else this.pop.workers[id] = slots;
        changed = true;
      }
    }
    let over = this.employed() - Math.floor(this.pop.total);
    for (const id of Object.keys(this.pop.workers)) {
      if (over <= 0) break;
      const take = Math.min(over, this.pop.workers[id]);
      this.pop.workers[id] -= take;
      if (this.pop.workers[id] <= 0) delete this.pop.workers[id];
      over -= take;
      changed = true;
    }
    if (changed) this._changed();
  }

  // ---- growth ----
  growthInterval() {
    const idx = this.state.eraIndex(this.state.player.era);
    const speed = 1 + (this.state.bal.eraGrowthSpeedup ?? 0) * (idx - 1);
    return this.state.bal.populationGrowthIntervalSeconds / (speed * (1 + this.state.mods.get("growthSpeed")));
  }

  foodReserveNeeded() {
    const b = this.state.bal;
    return (b.growthFoodReserveBase ?? 10) + this.pop.total * (b.growthFoodReservePerCitizen ?? 3);
  }

  update(dt) {
    const pop = this.pop;
    const bal = this.state.bal;
    const food = this.economy.resources.amount("food");

    if (this.economy.starving) {
      this.state.runtime.growthStatus = "starving";
      pop.growthProgress = 0;
      pop.starveTimer += dt;
      if (pop.starveTimer >= bal.starvationDeclineIntervalSeconds) {
        pop.starveTimer = 0;
        // Offline simulation never kills citizens (the player was not there to react).
        if (!this.state.runtime.offline && pop.total > (bal.minPopulation ?? 1)) {
          pop.total -= 1;
          this.trimWorkers();
          this._changed();
          this.bus.emit("notify", { text: "A citizen left the settlement due to hunger.", type: "error" });
        }
      }
      return;
    }
    pop.starveTimer = Math.max(0, pop.starveTimer - dt);

    if (pop.total >= pop.housing) {
      this.state.runtime.growthStatus = "housing";
      return;
    }
    if (food < this.foodReserveNeeded()) {
      this.state.runtime.growthStatus = "food";
      return;
    }

    this.state.runtime.growthStatus = "growing";
    pop.growthProgress += dt / this.growthInterval();
    if (pop.growthProgress >= 1) {
      pop.growthProgress = 0;
      pop.total += 1;
      if (pop.autoAssign) this.autoAssign();
      this._changed();
      this.bus.emit("population:grew", { total: pop.total });
    }
  }

  // ---- internals ----
  /** Small global production bonus per citizen. */
  _applyBonus() {
    const per = this.state.bal.populationBonusPerCitizen ?? 0;
    this.production.setModifier("population", "all", 1 + Math.floor(this.pop.total) * per);
  }

  _changed() {
    this.state.runtime.popVersion++;
    this._applyBonus();
    this.bus.emit("workers:changed");
    this.bus.emit("population:changed");
  }
}
