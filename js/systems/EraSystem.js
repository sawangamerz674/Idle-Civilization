/**
 * EraSystem - historical era progression.
 *
 * Each era in data/eras.json (except the first) has `requirements`:
 *   resources  - spent when advancing (e.g. {wood: 500, metal: 150})
 *   population - citizens required (not spent)
 *   buildings  - building counts required (not spent)
 *   research   - research ids that must be completed (Phase 5; ignored when absent)
 * and a `storageMultiplier` applied to every storage cap while in that era.
 * New resources appear automatically: resources.json `unlockEra` drives the HUD.
 * New buildings appear automatically: buildings.json `era` drives BuildingSystem.
 *
 * Listens:  "era:advance"
 * Emits:    "era:changed" ({id, index}), "era:readiness" (bool), "notify", "modal:open"
 */
export class EraSystem {
  constructor(state, bus, resources, buildings) {
    this.state = state;
    this.bus = bus;
    this.resources = resources;
    this.buildings = buildings;
    this.ready = false;
    this._t = 0;
    bus.on("era:advance", () => this.advance());
    this.applyEra();
  }

  eras() {
    return this.state.data.eras.eras;
  }

  current() {
    return this.state.getEra();
  }

  nextEra() {
    const idx = this.state.eraIndex(this.state.player.era);
    return this.eras().find((e) => e.index === idx + 1) ?? null;
  }

  /** Requirement checklist for an era: [{kind, id, label, have, need, met}] */
  requirements(era = this.nextEra()) {
    if (!era) return [];
    const req = era.requirements ?? {};
    const out = [];
    for (const [id, need] of Object.entries(req.resources ?? {})) {
      const def = this.state.getResourceDef(id);
      const have = this.resources.amount(id);
      out.push({ kind: "resource", id, label: `${def?.icon ?? ""} ${def?.name ?? id}`.trim(), have, need, met: have + 1e-9 >= need });
    }
    if (req.population) {
      const have = Math.floor(this.state.player.population.total);
      out.push({ kind: "population", id: "population", label: "Population", have, need: req.population, met: have >= req.population });
    }
    for (const [id, need] of Object.entries(req.buildings ?? {})) {
      const have = this.state.buildingCount(id);
      out.push({ kind: "building", id, label: this.state.getBuildingDef(id)?.name ?? id, have, need, met: have >= need });
    }
    for (const id of req.research ?? []) {
      const have = this.state.player.research.completed.includes(id) ? 1 : 0;
      out.push({ kind: "research", id, label: `Research: ${this.state.data.research.research.find((r) => r.id === id)?.name ?? id}`, have, need: 1, met: have >= 1 });
    }
    return out;
  }

  canAdvance() {
    const next = this.nextEra();
    return !!next && this.requirements(next).every((r) => r.met);
  }

  advance() {
    const next = this.nextEra();
    if (!next) return false;
    if (!this.canAdvance()) {
      this.bus.emit("notify", { text: "Era requirements not met yet.", type: "warn" });
      return false;
    }
    if (!this.resources.spend(next.requirements?.resources ?? {})) return false;

    const p = this.state.player;
    p.era = next.id;
    if (!p.unlockedEras.includes(next.id)) p.unlockedEras.push(next.id);
    p.stats.highestEra = Math.max(p.stats.highestEra, next.index);
    this.applyEra();
    this.ready = false;

    this.bus.emit("era:changed", { id: next.id, index: next.index });
    this.bus.emit("era:readiness", false);

    const newBuildings = this.state.data.buildings.buildings.filter((b) => b.era === next.id).map((b) => b.name);
    const newResources = this.state.data.resources.resources.filter((r) => r.unlockEra === next.id).map((r) => `${r.icon} ${r.name}`);
    const lines = [next.description, ""];
    if (newResources.length) lines.push(`New resources: ${newResources.join(", ")}`);
    if (newBuildings.length) lines.push(`New buildings: ${newBuildings.join(", ")}`);
    lines.push(`Storage capacity is now x${next.storageMultiplier ?? 1}.`);
    this.bus.emit("modal:open", { title: `Welcome to the ${next.name}!`, body: lines.join("\n"), buttons: [{ label: "Let's build!" }] });
    return true;
  }

  /** Apply the current era's storage multiplier. Safe to call after loads and prestige resets. */
  applyEra() {
    this.resources.setCapMultiplier("era", this.current().storageMultiplier ?? 1);
    this.resources.recalcCaps();
  }

  /** Once a second: announce when the next era becomes reachable. */
  update(dt) {
    this._t += dt;
    if (this._t < 1) return;
    this._t = 0;
    const ready = this.canAdvance();
    if (ready !== this.ready) {
      this.ready = ready;
      this.bus.emit("era:readiness", ready);
      if (ready) {
        this.bus.emit("notify", { text: `You can advance to the ${this.nextEra().name}!`, type: "success", duration: 4500 });
      }
    }
  }
}
