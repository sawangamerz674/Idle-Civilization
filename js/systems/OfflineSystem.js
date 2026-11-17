import { formatDuration } from "../utils/TimeUtils.js";
import { formatNumber } from "../utils/NumberFormatter.js";

/**
 * OfflineSystem - progress while the player is away (tab hidden, or - from Phase 7 -
 * a saved game loaded later).
 *
 * Rules:
 *   - Away time is capped at offlineMaxHours (balance config + legacy "offlineHours" mod).
 *   - The civilization is fast-forwarded for  away * efficiency  seconds, where
 *     efficiency = offlineEfficiency (balance config + upgrades/legacy "offlineEfficiency" mod), max 1.
 *   - The fast-forward runs the normal systems in coarse steps (state.runtime.offline = true),
 *     so storage caps, input shortages, population growth and research all behave as usual.
 *     Citizens never starve away and nothing is bought automatically.
 *   - A summary dialog lists what was gained.
 *
 * Listens:  "offline:process" ({seconds})
 * Emits:    "offline:done" (report), "modal:open"
 */
export class OfflineSystem {
  constructor(state, bus, getSystems, canOfferAd = () => false) {
    this.state = state;
    this.bus = bus;
    this.getSystems = getSystems; // () => ordered list of tick systems
    this.canOfferAd = canOfferAd; // () => true when a rewarded ad can be shown
    this._t = 0;
    this.minSeconds = 60;         // shorter absences are ignored
    this.stepSeconds = 5;
    bus.on("offline:process", ({ seconds }) => this.process(seconds));
  }

  efficiency() {
    return Math.min(1, Math.max(0, (this.state.bal.offlineEfficiency ?? 0.5) + this.state.mods.get("offlineEfficiency")));
  }

  maxSeconds() {
    return Math.max(0, (this.state.bal.offlineMaxHours ?? 8) + this.state.mods.get("offlineHours")) * 3600;
  }

  /** Fast-forward `simSeconds` of normal play. Returns a report. */
  simulate(simSeconds) {
    const p = this.state.player;
    const before = Object.fromEntries(Object.entries(p.resources).map(([k, r]) => [k, r.amount]));
    const pop0 = Math.floor(p.population.total);
    const research0 = p.research.completed.length;
    const ach0 = p.achievements.length;
    const systems = this.getSystems();
    const playtime0 = p.stats.playtime;
    this.state.runtime.offline = true;
    try {
      let left = simSeconds;
      while (left > 1e-9) {
        const dt = Math.min(this.stepSeconds, left);
        for (const s of systems) s.update(dt);
        left -= dt;
      }
    } finally {
      this.state.runtime.offline = false;
    }
    p.stats.playtime = playtime0 + simSeconds; // keep playtime meaning "time simulated"
    const gains = {};
    for (const [k, r] of Object.entries(p.resources)) {
      const g = r.amount - before[k];
      if (g > 0.5) gains[k] = g;
    }
    return {
      gains,
      population: Math.floor(p.population.total) - pop0,
      research: p.research.completed.length - research0,
      achievements: p.achievements.length - ach0
    };
  }

  /** Handle an absence of `awaySeconds` real seconds. */
  process(awaySeconds) {
    if (!(awaySeconds >= this.minSeconds)) return null;
    const counted = Math.min(awaySeconds, this.maxSeconds());
    const eff = this.efficiency();
    const report = this.simulate(counted * eff);
    Object.assign(report, { away: awaySeconds, counted, efficiency: eff, capped: awaySeconds > counted });
    this.bus.emit("offline:done", report);
    const buttons = [{ label: "Collect", kind: this.canOfferAd() ? "btn-secondary" : "" }];
    if (this.canOfferAd() && this.state.bal.ads?.offlineDoubleEnabled && Object.keys(report.gains).length) {
      buttons.push({ label: "Double it (watch an ad)", onClick: () => this.bus.emit("ads:watch", { reward: "offlineDouble", report }) });
    }
    this.bus.emit("modal:open", { title: "Welcome back!", body: this.describe(report), buttons });
    return report;
  }

  describe(r) {
    const lines = [`You were away for ${formatDuration(r.away)}.`];
    if (r.capped) lines.push(`Only the first ${formatDuration(r.counted)} count (offline limit).`);
    lines.push(`Your civilization worked at ${Math.round(r.efficiency * 100)}% efficiency:`);
    const gained = Object.entries(r.gains).map(([k, v]) => `${this.state.getResourceDef(k)?.icon ?? ""} ${this.state.getResourceDef(k)?.name ?? k} +${formatNumber(v)}`);
    lines.push(gained.length ? gained.join("\n") : "Storage was already full or nothing was produced.");
    if (r.population > 0) lines.push(`👥 +${r.population} citizens`);
    if (r.research > 0) lines.push(`🔬 ${r.research} research project${r.research === 1 ? "" : "s"} completed`);
    if (r.achievements > 0) lines.push(`🏆 ${r.achievements} achievement${r.achievements === 1 ? "" : "s"} unlocked`);
    return lines.join("\n");
  }

  /** Remember when the player was last here (Phase 7 saves this). */
  update(dt) {
    this._t += dt;
    if (this._t < 1) return;
    this._t = 0;
    if (!this.state.runtime.offline) this.state.player.lastSession = Date.now();
  }

  /** Call once after loading a save (Phase 7): processes the time since lastSession. */
  processSinceLastSession() {
    const away = (Date.now() - (this.state.player.lastSession ?? Date.now())) / 1000;
    return this.process(away);
  }
}
