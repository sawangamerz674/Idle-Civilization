import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";

/**
 * UpgradePanel - leveled upgrades grouped by category (building production, resource
 * multipliers, population, storage, research efficiency, offline production, economy).
 * (Extra file beyond the original structure list; upgrade rules live in UpgradeSystem.)
 * Purchases are requested via the bus ("upgrade:buy"). Rows are rebuilt only when the
 * set of unlocked upgrades changes; refresh() updates levels, costs and button state.
 */
export class UpgradePanel extends BasePanel {
  constructor(state, bus, api) {
    super("upgrades", "Upgrades", state, bus);
    this.api = api;
    this.rows = new Map();
    this._key = "";
  }

  build() {
    this.el.innerHTML = `<h2>${this.title}</h2><p class="small" data-f="summary"></p><div data-f="list"></div>`;
    this.summary = this.el.querySelector('[data-f="summary"]');
    this.list = this.el.querySelector('[data-f="list"]');
    this.list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-u]");
      if (btn && !btn.disabled) this.bus.emit("upgrade:buy", { id: btn.dataset.u });
    });
  }

  _costHtml(cost) {
    return Object.entries(cost)
      .map(([res, amt]) => {
        const def = this.state.getResourceDef(res);
        const r = this.state.player.resources[res];
        const short = r.amount < amt;
        const over = amt > r.cap; // can never be afforded until storage grows
        return `<span style="${short ? "color:#c0392b;" : ""}" ${over ? 'title="Needs more storage capacity"' : ""}>${def?.icon ?? ""} ${formatNumber(amt)}${over ? " \u26a0" : ""}</span>`;
      })
      .join(" &nbsp; ");
  }

  _rebuild(defs) {
    this.rows.clear();
    this.list.innerHTML = "";
    for (const cat of this.state.data.upgrades.categories) {
      const inCat = defs.filter((d) => d.category === cat.id);
      if (!inCat.length) continue;
      const h = document.createElement("h2");
      h.className = "sub";
      h.textContent = cat.name;
      this.list.appendChild(h);
      for (const def of inCat) {
        const row = document.createElement("div");
        row.className = "card building-row";
        row.innerHTML =
          `<div class="b-head"><b>${def.name}</b><span class="b-owned"></span></div>` +
          `<p>${def.description}</p><p class="b-effect"></p>` +
          `<div class="b-buy"><span class="b-cost"></span><button class="btn" data-u="${def.id}">Upgrade</button></div>`;
        this.list.appendChild(row);
        this.rows.set(def.id, {
          def,
          owned: row.querySelector(".b-owned"),
          effect: row.querySelector(".b-effect"),
          cost: row.querySelector(".b-cost"),
          btn: row.querySelector("button")
        });
      }
    }
  }

  refresh() {
    if (!this._built) return;
    const us = this.api.upgrades;
    const all = us.all();
    const defs = all.filter((d) => us.isUnlocked(d));
    const key = defs.map((d) => d.id).join(",");
    if (key !== this._key) {
      this._key = key;
      this._rebuild(defs);
    }
    const locked = all.length - defs.length;
    this.summary.textContent = `${defs.length} of ${all.length} upgrades available${locked ? ` · ${locked} more unlock through eras, buildings and research` : ""}. \u26a0 = cost is above your storage capacity.`;

    for (const row of this.rows.values()) {
      const def = row.def;
      const lvl = us.level(def.id);
      const max = def.maxLevel ?? 10;
      const maxed = us.isMaxed(def);
      row.owned.textContent = `Level ${lvl} / ${max}`;
      const now = lvl > 0 ? this.api.effects.describe(def.effect, lvl) : "none yet";
      row.effect.textContent = maxed ? `Now: ${now}` : `Now: ${now}  ·  Next: ${this.api.effects.describe(def.effect, lvl + 1)}`;
      if (maxed) {
        row.cost.textContent = "Max level";
        row.btn.disabled = true;
        row.btn.textContent = "Maxed";
      } else {
        const cost = us.cost(def);
        row.cost.innerHTML = this._costHtml(cost);
        row.btn.disabled = !us.canAfford(def);
        row.btn.textContent = "Upgrade";
      }
    }
  }
}
