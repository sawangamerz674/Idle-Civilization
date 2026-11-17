/**
 * EffectSystem - the single place where data-defined effects change the economy.
 * (Extra file beyond the original structure list: technologies, upgrades,
 * achievements and later prestige all share it, so effects are never duplicated.)
 *
 * An effect is a plain JSON object:
 *   {type:"production", target:"food"|"all"|<resource>, value:0.2}   -> x(1 + value*amount) on that resource
 *   {type:"building",   target:<buildingId>,            value:0.3}   -> x(1 + value*amount) on that building's output
 *   {type:"storage",                                    value:0.25}  -> x(1 + value*amount) on every storage cap
 *   {type:"stat",       target:<statName>,              value:2}     -> +value*amount on a StatMods stat
 * Stats in use: housing (flat), growthSpeed, foodUse, researchSpeed, staffing,
 * buildingCost (fractions), offlineEfficiency, offlineHours (Phase 6).
 *
 * Every effect belongs to a named `source` ("tech:x", "upgrade:y", "achievement:z"),
 * so a source can be replaced or removed cleanly (levels, prestige resets, loads).
 *
 * Emits: "mods:changed"
 */
export class EffectSystem {
  constructor(state, bus, production, resources) {
    this.state = state;
    this.bus = bus;
    this.production = production;
    this.resources = resources;
  }

  clear(source) {
    this.production.removeModifier(source);
    this.production.removeBuildingModifier(source);
    this.resources.removeCapMultiplier(source);
    this.state.mods.clear(source);
  }

  /** Apply effects under `source`, scaled by `amount` (e.g. an upgrade level). */
  apply(source, effects, amount = 1) {
    for (const e of effects ?? []) {
      const v = e.value * amount;
      switch (e.type) {
        case "production":
          this.production.setModifier(source, e.target, 1 + v);
          break;
        case "building":
          this.production.setBuildingModifier(source, e.target, 1 + v);
          break;
        case "storage":
          this.resources.setCapMultiplier(source, 1 + v);
          break;
        case "stat":
          this.state.mods.set(source, e.target, v);
          break;
        default:
          console.warn("[EffectSystem] unknown effect type", e);
      }
    }
    this.bus.emit("mods:changed");
  }

  /** Replace everything `source` did before. amount <= 0 just removes it. */
  replace(source, effects, amount = 1) {
    this.clear(source);
    if (amount > 0) this.apply(source, Array.isArray(effects) ? effects : [effects], amount);
    else this.bus.emit("mods:changed");
  }

  /** Readable text, e.g. "+25% Food production". */
  describe(e, amount = 1) {
    const v = e.value * amount;
    const pct = `+${Math.round(v * 1000) / 10}%`;
    const resName = (id) => (id === "all" ? "all" : this.state.getResourceDef(id)?.name ?? id);
    switch (e.type) {
      case "production":
        return `${pct} ${resName(e.target)} production`;
      case "building":
        return `${pct} ${this.state.getBuildingDef(e.target)?.name ?? e.target} output`;
      case "storage":
        return `${pct} storage capacity`;
      case "stat":
        switch (e.target) {
          case "housing": return `+${v} housing`;
          case "growthSpeed": return `${pct} population growth`;
          case "foodUse": return `-${Math.round(v * 1000) / 10}% food eaten`;
          case "researchSpeed": return `${pct} research speed`;
          case "staffing": return `${pct} worker bonus`;
          case "buildingCost": return `-${Math.round(v * 1000) / 10}% building cost`;
          case "offlineEfficiency": return `${pct} offline efficiency`;
          case "offlineHours": return `+${v}h offline limit`;
          default: return `${v} ${e.target}`;
        }
      default:
        return "";
    }
  }
}
