import { formatNumber, formatRate } from "../utils/NumberFormatter.js";

/**
 * HUD - top bar: era badge, resource counters, population, save indicator.
 * Pure view: reads GameState, updates the DOM. Re-renders the resource chips
 * when the set of visible resources changes, otherwise only updates text.
 */
export class HUD {
  constructor(state, bus, api = null) {
    this.state = state;
    this.bus = bus;
    this.api = api; // read-only queries (ad availability)
    this.eraEl = document.getElementById("hud-era-name");
    this.resEl = document.getElementById("hud-resources");
    this.popEl = document.getElementById("hud-pop-value");
    this.saveEl = document.getElementById("save-indicator");
    this.boostBtn = document.getElementById("hud-boost");
    this.boostEl = document.getElementById("hud-boosts");
    this.chips = new Map();
    this._visibleKey = "";

    bus.on("save:status", (s) => this.setSaveStatus(s));
    this.boostBtn?.addEventListener("click", () => this.openBoosts());
    this.muteBtn = document.getElementById("hud-mute");
    this.muteBtn?.addEventListener("click", () => {
      const st = this.state.player.settings;
      const on = !(st.music || st.sfx);          // anything audible -> mute all; all muted -> unmute all
      st.music = on;
      st.sfx = on;
      this.bus.emit("settings:changed", { key: "music", value: on });
      this._syncMute();
    });
    bus.on("settings:changed", () => this._syncMute());
    this._syncMute();
    bus.on("era:changed", () => this.update());
    bus.on("era:readiness", (ready) => this.eraEl.classList.toggle("pulse", !!ready));
  }

  /** Resources whose unlock era has been reached. */
  _visibleResources() {
    const eras = this.state.data.eras.eras;
    const currentIdx = eras.find((e) => e.id === this.state.player.era).index;
    const idxOf = (id) => eras.find((e) => e.id === id)?.index ?? 99;
    return this.state.data.resources.resources.filter((r) => idxOf(r.unlockEra) <= currentIdx);
  }

  _buildChips(list) {
    this.resEl.innerHTML = "";
    this.chips.clear();
    for (const def of list) {
      const chip = document.createElement("div");
      chip.className = "res-chip";
      chip.dataset.res = def.id;
      chip.title = def.name;
      chip.innerHTML =
        `<span class="res-icon">${def.icon}</span>` +
        `<span><span class="res-amount">0</span><span class="res-rate">0/s</span></span>`;
      this.resEl.appendChild(chip);
      this.chips.set(def.id, {
        amount: chip.querySelector(".res-amount"),
        rate: chip.querySelector(".res-rate")
      });
    }
  }

  update() {
    const era = this.state.getEra();
    this.eraEl.textContent = era.name;

    const visible = this._visibleResources();
    const key = visible.map((r) => r.id).join(",");
    if (key !== this._visibleKey) {
      this._visibleKey = key;
      this._buildChips(visible);
    }

    for (const def of visible) {
      const r = this.state.player.resources[def.id];
      const el = this.chips.get(def.id);
      el.amount.textContent = formatNumber(r.amount);
      const net = r.production - r.consumption;
      el.rate.textContent = formatRate(net);
      el.rate.className = "res-rate " + (net > 0.005 ? "pos" : net < -0.005 ? "neg" : "");
    }

    const p = this.state.player.population;
    this.popEl.textContent = `${Math.floor(p.total)} / ${p.housing}`;
    this._updateBoosts();
  }

  _syncMute() {
    const st = this.state.player.settings;
    if (this.muteBtn) this.muteBtn.textContent = st.music || st.sfx ? "\ud83d\udd0a" : "\ud83d\udd07";
  }

  _clock(sec) {
    const s = Math.ceil(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /** Active boost timers and the "free boost" button (only shown when an ad can be offered). */
  _updateBoosts() {
    if (!this.boostEl) return;
    const b = this.state.player.boosts ?? {};
    const parts = [];
    if (b.production > 0) parts.push(`\u26a1 x${this.state.bal.ads?.productionMultiplier ?? 2} ${this._clock(b.production)}`);
    if (b.research > 0) parts.push(`\ud83d\udd2c x${this.state.bal.ads?.researchMultiplier ?? 2} ${this._clock(b.research)}`);
    const text = parts.join("  ");
    if (text !== this._boostText) {
      this._boostText = text;
      this.boostEl.textContent = text;
      this.boostEl.classList.toggle("hidden", !text);
    }
    const show = !!this.api?.ads?.available() || !!text;
    this.boostBtn?.classList.toggle("hidden", !show);
  }

  openBoosts() {
    const ads = this.api?.ads;
    if (!ads) return;
    const cfg = this.state.bal.ads ?? {};
    const min = Math.round((cfg.boostSeconds ?? 300) / 60);
    const line = (kind) => (ads.remaining(kind) > 0 ? ` (${this._clock(ads.remaining(kind))} left)` : "");
    this.bus.emit("modal:open", {
      title: "Free boosts",
      body: `Watch a short video to boost your civilization for ${min} minutes. Watching again adds time (up to ${Math.round((cfg.maxBoostSeconds ?? 1200) / 60)} minutes). Entirely optional.`,
      buttons: [
        { label: "Close", kind: "btn-secondary" },
        { label: `Research x${cfg.researchMultiplier ?? 2}${line("research")}`, onClick: () => this.bus.emit("ads:watch", { reward: "research" }) },
        { label: `Production x${cfg.productionMultiplier ?? 2}${line("production")}`, onClick: () => this.bus.emit("ads:watch", { reward: "production" }) }
      ]
    });
  }

  setSaveStatus(status) {
    const map = { saved: "Saved", saving: "Saving...", error: "Save failed" };
    this.saveEl.textContent = map[status] || status;
    this.saveEl.className = "save-indicator " + (status === "saving" ? "saving" : status === "error" ? "error" : "");
  }
}
