/**
 * ResearchSystem - the research tree.
 *
 * Nodes live in data/research.json (branch, era, cost, time, prerequisites).
 * One project runs at a time. The cost is paid when the project starts; progress
 * then advances with time, scaled by research speed:
 *   speed = (1 + mods.researchSpeed) * product of temporary multipliers (e.g. ad boost)
 * Completing a project stores its id in player.research.completed; the matching
 * technology (TechnologySystem) is applied and buildings/upgrades/eras gated on it unlock.
 *
 * Listens:  "research:start" ({id}), "research:cancel"
 * Emits:    "research:started", "research:completed" ({id}), "notify"
 */
export class ResearchSystem {
  constructor(state, bus, resources) {
    this.state = state;
    this.bus = bus;
    this.resources = resources;
    this.speedModifiers = new Map(); // source -> multiplier (rewarded boosts, prestige)
    bus.on("research:start", ({ id }) => this.start(id));
  }

  get data() {
    return this.state.player.research;
  }

  nodes() {
    return this.state.data.research.research;
  }

  node(id) {
    return this.nodes().find((n) => n.id === id) ?? null;
  }

  isCompleted(id) {
    return this.data.completed.includes(id);
  }

  active() {
    return this.data.active ? this.node(this.data.active) : null;
  }

  speed() {
    let mult = 1 + this.state.mods.get("researchSpeed");
    for (const m of this.speedModifiers.values()) mult *= m;
    return mult;
  }

  setSpeedModifier(source, mult) {
    this.speedModifiers.set(source, mult);
  }

  removeSpeedModifier(source) {
    this.speedModifiers.delete(source);
  }

  /** Why a node cannot be started right now (empty = startable, ignoring cost). */
  lockReasons(node) {
    const out = [];
    if (this.state.eraIndex(node.era) > this.state.eraIndex(this.state.player.era)) {
      out.push(`Reach the ${this.state.data.eras.eras.find((e) => e.id === node.era)?.name}`);
    }
    for (const pre of node.prerequisites ?? []) {
      if (!this.isCompleted(pre)) out.push(`Research ${this.node(pre)?.name ?? pre}`);
    }
    return out;
  }

  /** "completed" | "active" | "available" | "locked" */
  status(node) {
    if (this.isCompleted(node.id)) return "completed";
    if (this.data.active === node.id) return "active";
    return this.lockReasons(node).length ? "locked" : "available";
  }

  canAfford(node) {
    return this.resources.canAfford(node.cost);
  }

  /** Seconds remaining at the current speed. */
  remaining(node = this.active()) {
    if (!node) return 0;
    return Math.max(0, (node.time - this.data.progress) / this.speed());
  }

  start(id) {
    const node = this.node(id);
    if (!node || this.isCompleted(id)) return false;
    if (this.data.active) {
      this.bus.emit("notify", { text: "Finish your current research first.", type: "warn" });
      return false;
    }
    if (this.lockReasons(node).length) {
      this.bus.emit("notify", { text: "That research is still locked.", type: "warn" });
      return false;
    }
    if (!this.resources.spend(node.cost)) {
      this.bus.emit("notify", { text: "Not enough resources for this research.", type: "warn", duration: 1800 });
      return false;
    }
    this.data.active = id;
    this.data.progress = 0;
    this.bus.emit("research:started", { id });
    this.bus.emit("notify", { text: `Researching ${node.name}...`, type: "info", duration: 1800 });
    return true;
  }

  update(dt) {
    const node = this.active();
    if (!node) return;
    this.data.progress += dt * this.speed();
    if (this.data.progress >= node.time) this.complete(node.id);
  }

  /** Finish a project (also used by tests and by prestige/debug tools). */
  complete(id) {
    const node = this.node(id);
    if (!node || this.isCompleted(id)) return false;
    this.data.completed.push(id);
    if (this.data.active === id) {
      this.data.active = null;
      this.data.progress = 0;
    }
    this.bus.emit("research:completed", { id });
    this.bus.emit("notify", { text: `Research complete: ${node.name}!`, type: "success", duration: 4000 });
    return true;
  }
}
