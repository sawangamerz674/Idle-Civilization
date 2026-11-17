import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";
import { formatDuration } from "../utils/TimeUtils.js";

/**
 * PrestigePanel - Civilization Legacy: shows this run's progress, the Civilization Points
 * an ascension would grant, a confirmation dialog, the bonus shop and offline info.
 * Actions go through the bus ("prestige:ascend", "prestige:buy"); rules live in PrestigeSystem.
 */
export class PrestigePanel extends BasePanel {
  constructor(state, bus, api) {
    super("prestige", "Civilization Legacy", state, bus);
    this.api = api;
    this.rows = new Map();
  }

  build() {
    const cur = this.state.data.prestige.currency;
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card" data-f="ascend"></div>` +
      `<p class="small">${this.state.data.prestige.start.description}</p>` +
      `<h2 class="sub">${cur.icon} ${cur.name} shop</h2><div data-f="list"></div>` +
      `<h2 class="sub">While you are away</h2><div class="card" data-f="offline"></div>`;
    this.ascendEl = this.el.querySelector('[data-f="ascend"]');
    this.list = this.el.querySelector('[data-f="list"]');
    this.offlineEl = this.el.querySelector('[data-f="offline"]');

    for (const def of this.api.prestige.all()) {
      const row = document.createElement("div");
      row.className = "card building-row";
      row.innerHTML =
        `<div class="b-head"><b>${def.icon} ${def.name}</b><span class="b-owned"></span></div>` +
        `<p>${def.description}</p><p class="b-effect"></p>` +
        `<div class="b-buy"><span class="b-cost"></span><button class="btn" data-b="${def.id}">Buy</button></div>`;
      this.list.appendChild(row);
      this.rows.set(def.id, { def, owned: row.querySelector(".b-owned"), effect: row.querySelector(".b-effect"), cost: row.querySelector(".b-cost"), btn: row.querySelector("button") });
    }
    this.list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-b]");
      if (btn && !btn.disabled) this.bus.emit("prestige:buy", { id: btn.dataset.b });
    });
    this.ascendEl.addEventListener("click", (ev) => {
      if (!ev.target.closest("button[data-ascend]")) return;
      const gain = this.api.prestige.pendingPoints();
      if (gain < 1) return;
      this.bus.emit("modal:open", {
        title: "Ascend?",
        body: `Your civilization will start over and you will gain ${gain} Civilization Point${gain === 1 ? "" : "s"}.\nAchievements, statistics and Legacy bonuses are kept.`,
        buttons: [
          { label: "Not yet", kind: "btn-secondary" },
          { label: "Ascend", kind: "btn-danger", onClick: () => this.bus.emit("prestige:ascend") }
        ]
      });
    });
  }

  _describe(def, lvl) {
    if (def.effects) return def.effects.map((e) => this.api.effects.describe(e, lvl)).join(" · ");
    if (def.startingResources) {
      return Object.entries(def.startingResources).map(([k, v]) => `${this.state.getResourceDef(k)?.icon ?? ""} +${formatNumber(v * lvl)}`).join(" ");
    }
    if (def.startEra) return `Start in the ${this.state.data.eras.eras.find((e) => e.id === def.startEra)?.name}`;
    return "";
  }

  refresh() {
    if (!this._built) return;
    const pr = this.api.prestige;
    const p = this.state.player.prestige;
    const cur = this.state.data.prestige.currency;
    const gain = pr.pendingPoints();
    const f = this.state.data.prestige.formula;
    const nextScore = pr.scoreForPoints(Math.max(1, gain + 1));
    const pct = Math.min(100, (pr.score() / nextScore) * 100);
    this.ascendEl.innerHTML =
      `<b>${cur.icon} ${formatNumber(p.points)} ${cur.name}</b>` +
      `<p class="small">Ascensions: ${p.count} · earned in total: ${formatNumber(p.totalPoints)}</p>` +
      `<p>This run: <b>${formatNumber(pr.score())}</b> legacy score. Ascending now grants <b>${gain}</b> point${gain === 1 ? "" : "s"}.</p>` +
      `<div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
      `<p class="small">${formatNumber(nextScore)} score for ${Math.max(1, gain + 1)} point${gain ? "s" : ""}.</p>` +
      `<div class="b-buy"><span></span><button class="btn" data-ascend ${gain < 1 ? "disabled" : ""}>Ascend</button></div>`;

    for (const row of this.rows.values()) {
      const def = row.def;
      const lvl = pr.level(def.id);
      const max = def.maxLevel ?? 1;
      row.owned.textContent = `Level ${lvl} / ${max}`;
      const now = lvl > 0 ? this._describe(def, lvl) : "none yet";
      row.effect.textContent = pr.isMaxed(def) ? `Now: ${now}` : `Now: ${now}  ·  Next: ${this._describe(def, lvl + 1)}`;
      if (pr.isMaxed(def)) {
        row.cost.textContent = "Max level";
        row.btn.disabled = true;
        row.btn.textContent = "Maxed";
      } else {
        const c = pr.cost(def);
        row.cost.innerHTML = `<span style="${p.points < c ? "color:#c0392b;" : ""}">${cur.icon} ${c}</span>`;
        row.btn.disabled = !pr.canAfford(def);
        row.btn.textContent = "Buy";
      }
    }

    const off = this.api.offline;
    this.offlineEl.innerHTML =
      `<p>Your civilization keeps working at <b>${Math.round(off.efficiency() * 100)}%</b> efficiency for up to <b>${formatDuration(off.maxSeconds())}</b> while you are away.</p>` +
      `<p class="small">Upgrades and Legacy bonuses raise both values. Citizens never starve while you are away.</p>`;
  }
}
