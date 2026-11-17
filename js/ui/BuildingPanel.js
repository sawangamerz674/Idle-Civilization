import { BasePanel } from "./BasePanel.js";
import { formatNumber, formatRate } from "../utils/NumberFormatter.js";

const CATEGORY_LABELS = {
  food: "Food", resource: "Resources", housing: "Housing", industrial: "Industry",
  science: "Science", economy: "Economy", energy: "Energy"
};

/**
 * BuildingPanel - building list with category filter, cost, owned count, output,
 * statistics (level, current production, staffing) and Build / Upgrade buttons.
 * Rows are built once per set of visible buildings; refresh() only updates text and
 * enabled/disabled state, so buttons stay clickable while numbers tick.
 * Actions are requested via the bus ("building:buy", "building:upgrade").
 */
export class BuildingPanel extends BasePanel {
  constructor(state, bus, api) {
    super("buildings", "Buildings", state, bus);
    this.api = api;
    this.rows = new Map();
    this._key = "";
    this.filter = "all";
  }

  build() {
    this.el.innerHTML = `<h2>${this.title}</h2><div class="chips" data-f="chips"></div><div data-f="list"></div><h2 class="sub">Locked</h2><div class="card" data-f="locked"></div>`;
    this.lockedEl = this.el.querySelector('[data-f="locked"]');
    this.chips = this.el.querySelector('[data-f="chips"]');
    this.list = this.el.querySelector('[data-f="list"]');

    this.list.addEventListener("click", (ev) => {
      const buy = ev.target.closest("button[data-buy]");
      if (buy && !buy.disabled) return this.bus.emit("building:buy", { id: buy.dataset.buy });
      const up = ev.target.closest("button[data-up]");
      if (up && !up.disabled) this.bus.emit("building:upgrade", { id: up.dataset.up });
    });
    this.chips.addEventListener("click", (ev) => {
      const chip = ev.target.closest("button[data-filter]");
      if (!chip) return;
      this.filter = chip.dataset.filter;
      this._applyFilter();
    });
  }

  _visibleDefs() {
    return this.state.data.buildings.buildings.filter((d) => this.api.buildings.isUnlocked(d));
  }

  _rebuild(defs) {
    // Category chips for the categories that currently have buildings.
    const cats = [...new Set(defs.map((d) => d.category))];
    if (this.filter !== "all" && !cats.includes(this.filter)) this.filter = "all";
    this.chips.innerHTML = ["all", ...cats]
      .map((c) => `<button class="chip" data-filter="${c}">${c === "all" ? "All" : CATEGORY_LABELS[c] ?? c}</button>`)
      .join("");

    this.rows.clear();
    this.list.innerHTML = "";
    for (const def of defs) {
      const row = document.createElement("div");
      row.className = "card building-row";
      row.dataset.cat = def.category;
      row.innerHTML =
        `<div class="b-head"><b>${def.name}</b> <span class="b-cat">${CATEGORY_LABELS[def.category] ?? def.category}</span>` +
        `<span class="b-era">${this.state.data.eras.eras.find((e) => e.id === def.era)?.name ?? ""}</span>` +
        `<span class="b-owned"></span></div>` +
        `<p>${def.description}</p>` +
        `<p class="b-effect"></p>` +
        `<p class="b-stats"></p>` +
        `<div class="b-buy"><span class="b-cost"></span><button class="btn" data-buy="${def.id}">Build</button></div>` +
        (def.upgrade
          ? `<div class="b-buy b-up"><span class="b-upcost"></span><button class="btn btn-secondary" data-up="${def.id}">Upgrade</button></div>`
          : "");
      this.list.appendChild(row);
      this.rows.set(def.id, {
        el: row,
        owned: row.querySelector(".b-owned"),
        effect: row.querySelector(".b-effect"),
        stats: row.querySelector(".b-stats"),
        cost: row.querySelector(".b-cost"),
        btn: row.querySelector("button[data-buy]"),
        upRow: row.querySelector(".b-up"),
        upCost: row.querySelector(".b-upcost"),
        upBtn: row.querySelector("button[data-up]")
      });
    }
    this._applyFilter();
  }

  _applyFilter() {
    for (const row of this.rows.values()) {
      row.el.style.display = this.filter === "all" || row.el.dataset.cat === this.filter ? "" : "none";
    }
    for (const chip of this.chips.querySelectorAll(".chip")) {
      chip.classList.toggle("active", chip.dataset.filter === this.filter);
    }
  }

  _costHtml(cost) {
    return Object.entries(cost)
      .map(([res, amt]) => {
        const rdef = this.state.getResourceDef(res);
        const r = this.state.player.resources[res];
        const short = r.amount < amt;
        const over = amt > r.cap; // can never be afforded until storage grows
        return `<span style="${short ? "color:#c0392b;" : ""}" ${over ? 'title="Needs more storage capacity"' : ""}>${rdef?.icon ?? ""} ${formatNumber(amt)}${over ? " \u26a0" : ""}</span>`;
      })
      .join(" &nbsp; ");
  }

  _effectText(def) {
    const parts = [];
    const interval = def.interval || 1;
    for (const [res, amt] of Object.entries(def.output ?? {})) {
      const name = this.state.getResourceDef(res)?.name ?? res;
      parts.push(`${formatRate(amt / interval)} ${name} each`);
    }
    for (const [res, amt] of Object.entries(def.input ?? {})) {
      const name = this.state.getResourceDef(res)?.name ?? res;
      parts.push(`uses ${formatRate(amt / interval).replace("+", "")} ${name}`);
    }
    if (def.housing) parts.push(`+${def.housing} housing`);
    for (const [res, amt] of Object.entries(def.storage ?? {})) {
      const name = this.state.getResourceDef(res)?.name ?? res;
      parts.push(`+${amt} ${name} storage`);
    }
    if (def.bonus) parts.push(`+${Math.round(def.bonus.perCopy * 100)}% all production`);
    if (def.jobs) parts.push(`${def.jobs} jobs`);
    return parts.join("  ·  ");
  }

  _statsText(def) {
    const count = this.state.buildingCount(def.id);
    if (count <= 0) return "";
    const lvl = this.api.buildings.level(def.id);
    const max = this.api.buildings.maxLevel(def);
    const parts = [];
    if (max > 1) parts.push(`Level ${lvl}/${max}`);
    const rate = this.api.production.rateFor(def.id);
    for (const [res, r] of Object.entries(rate)) {
      parts.push(`producing ${formatRate(r)} ${this.state.getResourceDef(res)?.name ?? res}`);
    }
    if (def.jobs) {
      parts.push(`staffed ${this.api.population.workersAt(def.id)}/${this.api.population.slotsFor(def.id)}`);
    }
    return parts.join("  ·  ");
  }

  refresh() {
    if (!this._built) return;
    const defs = this._visibleDefs();
    const key = defs.map((d) => d.id).join(",");
    if (key !== this._key) {
      this._key = key;
      this._rebuild(defs);
    }
    // Locked buildings of eras reached so far, with what unlocks them.
    const lockedDefs = this.state.data.buildings.buildings.filter(
      (d) => !defs.includes(d) && this.state.eraIndex(d.era) <= this.state.eraIndex(this.state.player.era)
    );
    this.lockedEl.innerHTML = lockedDefs.length
      ? lockedDefs.map((d) => `<p><b>${d.name}</b> \u2013 ${this.api.buildings.lockReasons(d).join(", ")}</p>`).join("")
      : `<p class="small">Nothing locked right now.</p>`;
    const eco = this.api.economy;
    for (const def of defs) {
      const row = this.rows.get(def.id);
      const cost = eco.costFor(def);
      row.owned.textContent = ` x${this.state.buildingCount(def.id)}`;
      row.effect.textContent = this._effectText(def);
      row.stats.textContent = this._statsText(def);
      row.cost.innerHTML = this._costHtml(cost);
      const maxed = this.api.buildings.isMaxed(def);
      row.btn.disabled = maxed || !eco.canAfford(cost);
      row.btn.textContent = maxed ? "Max built" : "Build";

      if (row.upRow) {
        const bs = this.api.buildings;
        if (bs.canUpgrade(def)) {
          const upCost = bs.upgradeCost(def);
          row.upRow.style.display = "";
          row.upCost.innerHTML = `Level ${bs.level(def.id)} → ${bs.level(def.id) + 1} &nbsp; ${this._costHtml(upCost)}`;
          row.upBtn.disabled = !eco.canAfford(upCost);
        } else {
          const maxed = this.state.buildingCount(def.id) > 0 && bs.level(def.id) >= bs.maxLevel(def);
          row.upRow.style.display = maxed ? "" : "none";
          if (maxed) {
            row.upCost.textContent = "Max level";
            row.upBtn.disabled = true;
          }
        }
      }
    }
  }
}
