/**
 * AdvisorSystem - the game's built-in "AI" helper. It reads GameState and the other
 * systems' public methods (no network, no keys) and produces ranked suggestions:
 * what to build next (payback ranking), housing/food warnings, idle research,
 * unemployed citizens, prestige readiness.
 *
 * Optional Autopilot (settings.autopilot, off by default) performs the top
 * buy/research suggestion by emitting the normal bus events, so purchases go
 * through the same rules as a click. It never runs during offline catch-up.
 * Optional LLM chat: see integrations/AdvisorLLM.js (disabled unless configured).
 *
 * Listens: "settings:changed"
 * Emits:   "advisor:updated" (tips[]), "building:buy", "research:start", "notify"
 * Public:  tips, analyze(), answer(question), runTip(tip), summary()
 */
const PAYBACK_WEIGHT = { food: 1.4, wood: 1, stone: 1.1, metal: 1.3, coins: 1.2, energy: 1.2, science: 1.5 };

export class AdvisorSystem {
  constructor(state, bus, api, llm = null) {
    this.state = state;
    this.bus = bus;
    this.api = api;       // { buildings, production, economy, research, population, prestige, ads }
    this.llm = llm;
    this.tips = [];
    this._t = 0;
    this._auto = 0;
  }

  get autopilot() { return !!this.state.player.settings.autopilot; }

  /** Seconds until `cost` can be paid at current production (0 = now, Infinity = never). */
  _eta(cost) {
    const { resources } = this.api.economy;
    let worst = 0;
    for (const [res, need] of Object.entries(cost)) {
      const gap = need - resources.amount(res);
      if (gap <= 0) continue;
      const cap = resources.get(res)?.cap ?? Infinity;
      if (need > cap) return Infinity;
      const rate = this.api.production.totals[res] ?? 0;
      if (rate <= 0) return Infinity;
      worst = Math.max(worst, gap / rate);
    }
    return worst;
  }

  _netFood() {
    return (this.api.production.totals.food ?? 0) - this.api.economy.foodDemand();
  }

  _housingFree() {
    const p = this.state.player.population;
    return (p.housing ?? 0) - p.total;
  }

  /** Value per second of one more copy of a building (production plus housing). */
  _value(def) {
    const prod = this.api.production;
    let v = 0;
    for (const [res, amt] of Object.entries(def.output ?? {})) {
      v += (amt / (def.interval || 1)) * prod.multiplierFor(res) * (PAYBACK_WEIGHT[res] ?? 1);
    }
    const housingPressure = this._housingFree() <= 2;
    if (def.housing) v += def.housing * (housingPressure ? 0.5 : 0.08);
    if (def.output?.food && this._netFood() < 0) v *= 2;
    return v;
  }

  analyze() {
    const s = this.state, b = this.api.buildings, out = [];
    const eco = this.api.economy;

    // ---- warnings ----
    if (this.state.runtime.starving || this._netFood() < -0.05) {
      const farm = s.data.buildings.buildings.filter((d) => d.output?.food && b.isUnlocked(d) && !b.isMaxed(d))
        .sort((a, c) => this._value(c) / this._costSum(c) - this._value(a) / this._costSum(a))[0];
      out.push({ id: "food", kind: "warn", icon: "🍖", priority: 100, title: "Food is running low",
        text: "Your citizens eat more than you produce." + (farm ? ` Build a ${farm.name}.` : ""),
        action: farm && eco.canAfford(eco.costFor(farm)) ? { type: "buy", id: farm.id, label: `Build ${farm.name}` } : null });
    }
    if (this._housingFree() <= 0 && s.player.population.total > 0) {
      const home = s.data.buildings.buildings.filter((d) => d.housing && b.isUnlocked(d) && !b.isMaxed(d))
        .sort((a, c) => (c.housing / this._costSum(c)) - (a.housing / this._costSum(a)))[0];
      if (home) out.push({ id: "housing", kind: "warn", icon: "🏠", priority: 90, title: "No room for new citizens",
        text: `Population is capped by housing. A ${home.name} adds ${home.housing} homes.`,
        action: eco.canAfford(eco.costFor(home)) ? { type: "buy", id: home.id, label: `Build ${home.name}` } : null });
    }
    const idle = this.api.population.unemployed();
    if (idle >= 2 && this.api.population.totalSlots() > this.api.population.employed()) {
      out.push({ id: "jobs", kind: "info", icon: "👥", priority: 40, title: `${idle} citizens have no job`,
        text: "Open the Population tab and press Auto-assign to put them to work.", action: { type: "panel", id: "population", label: "Open Population" } });
    }

    // ---- research ----
    const r = this.api.research;
    if (!r.active()) {
      const options = r.nodes().filter((n) => r.status(n) === "available")
        .map((n) => ({ n, eta: this._eta(n.cost) })).filter((o) => o.eta < Infinity).sort((a, c) => a.eta - c.eta);
      if (options.length) {
        const o = options[0];
        out.push({ id: "research", kind: "tip", icon: "🔬", priority: o.eta === 0 ? 70 : 35, title: `Research ${o.n.name}`,
          text: o.eta === 0 ? "You can afford it now, and nothing is being researched." : `Affordable in about ${Math.ceil(o.eta)}s.`,
          action: o.eta === 0 ? { type: "research", id: o.n.id, label: "Start research" } : { type: "panel", id: "research", label: "Open Research" } });
      }
    }

    // ---- best building by payback ----
    const cands = s.data.buildings.buildings
      .filter((d) => b.isUnlocked(d) && !b.isMaxed(d))
      .map((d) => { const cost = eco.costFor(d); return { d, cost, eta: this._eta(cost), score: this._value(d) / this._costSum(d, cost) }; })
      .filter((c) => c.score > 0 && c.eta < Infinity)
      .sort((a, c) => (a.eta > 45) - (c.eta > 45) || c.score - a.score);
    if (cands.length) {
      const c = cands[0];
      out.push({ id: "build", kind: "tip", icon: "🏗️", priority: c.eta === 0 ? 60 : 30, title: `Best next build: ${c.d.name}`,
        text: c.eta === 0 ? "Best return for what you can afford right now." : `Best return - affordable in about ${Math.ceil(c.eta)}s.`,
        action: c.eta === 0 ? { type: "buy", id: c.d.id, label: `Build ${c.d.name}` } : { type: "panel", id: "buildings", label: "Open Buildings" } });
    }

    // ---- prestige ----
    const pr = this.api.prestige;
    if (pr?.canAscend?.()) {
      out.push({ id: "prestige", kind: "tip", icon: "👑", priority: 20, title: "Civilization Legacy is available",
        text: `Restarting now would earn ${pr.pendingPoints()} Civilization Points. Wait for more if you are still growing fast.`,
        action: { type: "panel", id: "prestige", label: "Open Legacy" } });
    }

    if (!out.length) out.push({ id: "idle", kind: "info", icon: "😌", priority: 0, title: "All good", text: "Nothing urgent. Keep saving up, your civilization is growing.", action: null });
    return out.sort((a, c) => c.priority - a.priority);
  }

  _costSum(def, cost = this.api.economy.costFor(def)) {
    return Math.max(1, Object.values(cost).reduce((a, v) => a + v, 0));
  }

  /** Perform a tip's action through the normal bus events. */
  runTip(tip) {
    const a = tip?.action;
    if (!a) return false;
    if (a.type === "buy") this.bus.emit("building:buy", { id: a.id });
    else if (a.type === "research") this.bus.emit("research:start", { id: a.id });
    else if (a.type === "panel") this.bus.emit("ui:showPanel", { id: a.id });
    return true;
  }

  /** Compact, key-free snapshot of the game (also what the optional LLM receives). */
  summary() {
    const p = this.state.player;
    return {
      era: p.era, population: Math.floor(p.population.total), housing: p.population.housing,
      resources: Object.fromEntries(Object.entries(p.resources).map(([k, v]) => [k, Math.floor(v.amount)])),
      rates: Object.fromEntries(Object.entries(this.api.production.totals).map(([k, v]) => [k, +v.toFixed(2)])),
      buildings: Object.fromEntries(Object.entries(p.buildings).map(([k, v]) => [k, v.count])),
      researchDone: p.research.completed.length, prestigeCount: p.prestige.count,
      suggestions: this.tips.slice(0, 3).map((t) => t.title)
    };
  }

  /** Answer a question: the optional LLM if configured, otherwise local rules. Always resolves to a string. */
  async answer(question) {
    const q = String(question ?? "").trim().slice(0, 300);
    if (!q) return "Ask me something, for example: what should I build next?";
    if (this.llm?.enabled) {
      const r = await this.llm.ask(q, this.summary());
      if (r) return r;
    }
    return this._localAnswer(q.toLowerCase());
  }

  _localAnswer(q) {
    const find = (id) => this.tips.find((t) => t.id === id);
    const say = (t, fb) => (t ? `${t.title}. ${t.text}` : fb);
    if (/food|hungry|starv|eat/.test(q)) return say(find("food"), "Food looks fine right now. Farms and Advanced Farms raise it.");
    if (/house|home|room|popul|citizen/.test(q)) return say(find("housing") ?? find("jobs"), "Housing and jobs look fine.");
    if (/research|tech|science/.test(q)) return say(find("research"), "Research is running or nothing is affordable yet.");
    if (/prestige|legacy|restart|point/.test(q)) return say(find("prestige"), "Legacy is not worth it yet. It unlocks after you have produced enough in total.");
    if (/era|age|advance/.test(q)) return "Open the era badge in the top bar to see what the next era needs.";
    return say(this.tips[0], "Keep building and researching.");
  }

  update(dt) {
    if (this.state.runtime.offline) return;
    this._t += dt;
    if (this._t >= 1) {
      this._t = 0;
      this.tips = this.analyze();
      this.bus.emit("advisor:updated", this.tips);
    }
    if (this.autopilot) {
      this._auto += dt;
      if (this._auto >= 2.5) {
        this._auto = 0;
        const tip = this.tips.find((t) => t.action && (t.action.type === "buy" || t.action.type === "research"));
        if (tip) this.runTip(tip);
      }
    }
  }
}
