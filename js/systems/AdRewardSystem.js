/**
 * AdRewardSystem - optional rewarded ads (CrazyGames). Ads are never required; every reward
 * can also be played without. An ad is only requested after the player clicks a button.
 *
 * Rewards (config/balance.config.json -> "ads"):
 *   production   x2 all production for 5 minutes (watching again adds time, max 20 minutes)
 *   research     x2 research speed for 5 minutes (same stacking rule)
 *   offlineDouble  doubles the gains shown in the "Welcome back" dialog (once per absence)
 * Boost time is counted in game time, saved in player.boosts, and re-applied after a load.
 *
 * Listens:  "ads:watch" ({reward, report?})
 * Emits:    "ads:rewarded" ({reward}), "notify"
 */
export class AdRewardSystem {
  constructor(state, bus, integration, production, research, resources) {
    this.state = state;
    this.bus = bus;
    this.integration = integration;
    this.production = production;
    this.research = research;
    this.resources = resources;
    this.busy = false;
    bus.on("ads:watch", (opts) => this.watch(opts));
    this.apply();
  }

  get cfg() { return this.state.bal.ads ?? {}; }
  get boosts() { return this.state.player.boosts; }

  /** Can the player be offered an ad right now? */
  available() { return !!this.integration?.adsAvailable && !this.busy; }

  remaining(kind) { return this.boosts[kind] ?? 0; }

  /** Show an ad for `reward`. Returns true when the reward was granted. */
  async watch({ reward, report } = {}) {
    if (this.busy) return false;
    if (!["production", "research", "offlineDouble"].includes(reward)) return false;
    if (reward === "offlineDouble" && (!report || report.doubled)) return false;
    this.busy = true;
    let result;
    try {
      result = await this.integration.requestRewarded();
    } finally {
      this.busy = false;
    }
    if (!result.ok) {
      const text = result.reason === "unfilled" ? "No ad is available right now. Try again in a moment." : "The ad could not be shown.";
      this.bus.emit("notify", { text, type: "warn" });
      return false;
    }
    this.grant(reward, report);
    return true;
  }

  grant(reward, report) {
    const p = this.state.player;
    p.adsWatched = (p.adsWatched ?? 0) + 1;
    if (reward === "offlineDouble") {
      this._doubleOffline(report);
    } else {
      const add = this.cfg.boostSeconds ?? 300;
      const max = this.cfg.maxBoostSeconds ?? 1200;
      this.boosts[reward] = Math.min(max, (this.boosts[reward] ?? 0) + add);
      this.apply();
    }
    this.bus.emit("ads:rewarded", { reward });
    this.bus.emit("notify", { text: "Reward received. Thank you!", type: "success", duration: 2500 });
    this.bus.emit("save:request");
  }

  _doubleOffline(report) {
    report.doubled = true;
    for (const [id, amt] of Object.entries(report.gains ?? {})) this.resources.add(id, amt, { track: false });
  }

  /** (Re)apply boost modifiers from the remaining seconds. */
  apply() {
    const b = this.boosts;
    if (b.production > 0) this.production.setModifier("boost:ad", "all", this.cfg.productionMultiplier ?? 2);
    else this.production.removeModifier("boost:ad");
    if (b.research > 0) this.research.setSpeedModifier("boost:ad", this.cfg.researchMultiplier ?? 2);
    else this.research.removeSpeedModifier("boost:ad");
  }

  update(dt) {
    const b = this.boosts;
    let changed = false;
    for (const k of ["production", "research"]) {
      if (b[k] > 0) {
        b[k] = Math.max(0, b[k] - dt);
        if (b[k] === 0) changed = true;
      }
    }
    if (changed) {
      this.apply();
      this.bus.emit("notify", { text: "A boost has ended.", type: "warn", duration: 2500 });
    }
  }
}
