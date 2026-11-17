/**
 * EconomySystem - applies production and consumption every logic tick and
 * answers cost questions.
 *
 * Tick order (so a resource produced this tick can be consumed this tick):
 *   0. citizens eat from stock first (keeps full storage full)
 *   1. foraging + buildings without inputs produce
 *   2. buildings with inputs run at an efficiency limited by their scarcest input
 *   3. any food shortfall is settled from fresh production; starvation is flagged if still short
 *   4. displayed production/consumption rates are published to GameState
 */
export class EconomySystem {
  constructor(state, bus, resources, production) {
    this.state = state;
    this.bus = bus;
    this.resources = resources;
    this.production = production;
    this.starving = false;
  }

  /** Cost of the next copy of a building, e.g. {wood: 12}. Costs are rounded to the nearest whole number so small discounts are always visible. */
  costFor(def, owned = this.state.buildingCount(def.id)) {
    const growth = def.costGrowth ?? this.state.bal.buildingCostGrowth;
    const discount = Math.max(0.5, 1 - this.state.mods.get("buildingCost"));
    const out = {};
    for (const [res, base] of Object.entries(def.cost ?? {})) {
      out[res] = Math.max(1, Math.round(base * Math.pow(growth, owned) * discount));
    }
    return out;
  }

  canAfford(cost) {
    return this.resources.canAfford(cost);
  }

  purchase(cost) {
    return this.resources.spend(cost);
  }

  /** Food eaten per second by the current population. */
  foodDemand() {
    const use = Math.max(0.3, 1 - this.state.mods.get("foodUse"));
    return this.state.player.population.total * this.state.bal.foodPerCitizenPerSecond * use;
  }

  update(dt) {
    const prod = this.production;
    const res = this.resources;
    const mult = (id) => prod.multiplierFor(id);

    // 0. Citizens eat first, so a full granary stays full. Any shortfall is settled
    //    against this tick's production below before starvation is declared.
    const foodNeed = this.foodDemand() * dt;
    let foodDeficit = foodNeed - res.remove("food", foodNeed);

    // 1. Foraging and input-free buildings
    for (const [id, rate] of Object.entries(prod.baseRates ?? {})) {
      res.add(id, rate * mult(id) * dt);
    }
    const withInputs = [];
    for (const e of prod.entries) {
      if (Object.keys(e.inputs).length) {
        withInputs.push(e);
        continue;
      }
      for (const [id, rate] of Object.entries(e.outputs)) res.add(id, rate * mult(id) * dt);
    }

    // 2. Buildings that consume inputs
    for (const e of withInputs) {
      let eff = 1;
      for (const [id, rate] of Object.entries(e.inputs)) {
        const need = rate * dt;
        if (need > 0) eff = Math.min(eff, res.amount(id) / need);
      }
      eff = Math.max(0, Math.min(1, eff));
      if (eff <= 0) continue;
      for (const [id, rate] of Object.entries(e.inputs)) res.remove(id, rate * dt * eff);
      for (const [id, rate] of Object.entries(e.outputs)) res.add(id, rate * mult(id) * dt * eff);
    }

    // 3. Settle any food shortfall from fresh production; whatever is still missing is starvation
    if (foodDeficit > 0) foodDeficit -= res.remove("food", foodDeficit);
    const starvingNow = foodDeficit > 1e-9;
    if (starvingNow !== this.starving) {
      this.starving = starvingNow;
      this.state.runtime.starving = starvingNow;
      this.bus.emit("economy:starving", starvingNow);
    }

    // 4. Publish rates for the HUD / panels
    for (const [id, r] of Object.entries(this.state.player.resources)) {
      r.production = prod.totals[id] ?? 0;
      r.consumption = (prod.inputTotals[id] ?? 0) + (id === "food" ? this.foodDemand() : 0);
    }
  }
}
