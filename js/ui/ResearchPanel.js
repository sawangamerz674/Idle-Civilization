import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";
import { formatDuration } from "../utils/TimeUtils.js";

const STATUS_ORDER = { active: 0, available: 1, locked: 2, completed: 3 };
const STATUS_LABEL = { active: "In progress", available: "Available", locked: "Locked", completed: "Completed" };

/**
 * ResearchPanel - used twice:
 *   mode "research":     the research tree (branch filter, status, cost, time, progress,
 *                        prerequisites, rewards) and the active project card.
 *   mode "technologies": technologies gained from research and the total active bonuses.
 * Starting research is requested through the bus ("research:start").
 * Rows are rebuilt only when the era, the completed set or the active project changes;
 * refresh() otherwise only updates text, so buttons stay clickable.
 */
export class ResearchPanel extends BasePanel {
  constructor(state, bus, api, mode = "research") {
    super(mode, mode === "research" ? "Research" : "Technologies", state, bus);
    this.api = api;
    this.mode = mode;
    this.rows = new Map();
    this._key = "";
    this.filter = "all";
  }

  build() {
    if (this.mode === "research") this._buildResearch();
    else this._buildTech();
  }

  refresh() {
    if (!this._built) return;
    if (this.mode === "research") this._refreshResearch();
    else this._refreshTech();
  }

  // ======================= research tree =======================
  _buildResearch() {
    const branches = this.state.data.research.branches;
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card" data-f="active"></div>` +
      `<div class="chips" data-f="chips">` +
      [`<button class="chip" data-filter="all">All</button>`, ...branches.map((b) => `<button class="chip" data-filter="${b.id}">${b.icon} ${b.name}</button>`)].join("") +
      `</div><div data-f="list"></div>`;
    this.activeCard = this.el.querySelector('[data-f="active"]');
    this.list = this.el.querySelector('[data-f="list"]');
    this.chips = this.el.querySelector('[data-f="chips"]');
    this.chips.addEventListener("click", (ev) => {
      const chip = ev.target.closest("button[data-filter]");
      if (!chip) return;
      this.filter = chip.dataset.filter;
      this._applyFilter();
    });
    this.list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-r]");
      if (btn && !btn.disabled) this.bus.emit("research:start", { id: btn.dataset.r });
    });
    this._applyFilter();
  }

  _applyFilter() {
    for (const row of this.rows.values()) {
      row.el.style.display = this.filter === "all" || row.el.dataset.branch === this.filter ? "" : "none";
    }
    for (const chip of this.chips.querySelectorAll(".chip")) chip.classList.toggle("active", chip.dataset.filter === this.filter);
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

  _rebuildRows() {
    const rs = this.api.research;
    const branches = this.state.data.research.branches;
    const nodes = [...rs.nodes()].sort(
      (a, b) =>
        STATUS_ORDER[rs.status(a)] - STATUS_ORDER[rs.status(b)] ||
        this.state.eraIndex(a.era) - this.state.eraIndex(b.era) ||
        branches.findIndex((x) => x.id === a.branch) - branches.findIndex((x) => x.id === b.branch)
    );
    this.rows.clear();
    this.list.innerHTML = "";
    for (const node of nodes) {
      const branch = branches.find((b) => b.id === node.branch);
      const eraName = this.state.data.eras.eras.find((e) => e.id === node.era)?.name ?? "";
      const tech = this.api.technology.forResearch(node.id);
      const effects = (tech?.effects ?? []).map((e) => this.api.effects.describe(e)).join("  ·  ");
      const unlocks = this.api.technology.unlocksFor(node.id);
      const row = document.createElement("div");
      row.dataset.branch = node.branch;
      row.innerHTML =
        `<div class="b-head"><b>${node.name}</b> <span class="b-cat">${branch?.icon ?? ""} ${branch?.name ?? node.branch}</span>` +
        `<span class="b-era">${eraName}</span><span class="b-owned r-status"></span></div>` +
        `<p>${node.description}</p>` +
        `<p class="b-effect">${tech ? `${tech.name}: ` : ""}${effects}</p>` +
        (unlocks.length ? `<p class="b-stats">Unlocks: ${unlocks.join(", ")}</p>` : "") +
        `<p class="b-stats r-pre"></p>` +
        `<div class="bar r-bar"><div class="bar-fill"></div></div>` +
        `<div class="b-buy r-buy"><span class="r-cost"></span><button class="btn" data-r="${node.id}">Research</button></div>`;
      this.list.appendChild(row);
      this.rows.set(node.id, {
        el: row,
        node,
        status: row.querySelector(".r-status"),
        pre: row.querySelector(".r-pre"),
        bar: row.querySelector(".r-bar"),
        fill: row.querySelector(".bar-fill"),
        buy: row.querySelector(".r-buy"),
        cost: row.querySelector(".r-cost"),
        btn: row.querySelector("button")
      });
    }
    this._applyFilter();
  }

  _refreshResearch() {
    const rs = this.api.research;
    const p = this.state.player;
    const key = `${p.era}|${p.research.completed.join(",")}|${p.research.active}`;
    if (key !== this._key) {
      this._key = key;
      this._rebuildRows();
    }

    // Active project card
    const active = rs.active();
    if (active) {
      const pct = Math.min(100, (p.research.progress / active.time) * 100);
      this.activeCard.innerHTML =
        `<b>Researching: ${active.name}</b>` +
        `<div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>` +
        `<p class="small">${pct.toFixed(0)}% · ${formatDuration(rs.remaining())} left · research speed x${rs.speed().toFixed(2)}</p>`;
    } else {
      this.activeCard.innerHTML =
        `<b>No active research</b><p class="small">Pick a project below. The cost is paid when you start; speed x${rs.speed().toFixed(2)}.</p>`;
    }

    // Per-row dynamic state
    for (const row of this.rows.values()) {
      const node = row.node;
      const status = rs.status(node);
      row.el.className = `card building-row research-row status-${status}`;
      row.status.textContent = STATUS_LABEL[status];
      const pre = (node.prerequisites ?? []).map((id) => {
        const done = rs.isCompleted(id);
        return `<span class="${done ? "ok" : "no"}">${done ? "✔" : "✖"} ${rs.node(id)?.name ?? id}</span>`;
      });
      const eraNeeded = this.state.eraIndex(node.era) > this.state.eraIndex(p.era);
      row.pre.innerHTML =
        status === "completed" ? "" : `Requires: ${[...(eraNeeded ? [`<span class="no">✖ ${this.state.data.eras.eras.find((e) => e.id === node.era)?.name}</span>`] : []), ...pre].join(" · ") || "nothing"}`;
      row.bar.style.display = status === "active" ? "" : "none";
      if (status === "active") row.fill.style.width = `${Math.min(100, (p.research.progress / node.time) * 100)}%`;
      const showBuy = status === "available" || status === "locked";
      row.buy.style.display = showBuy ? "" : "none";
      if (showBuy) {
        row.cost.innerHTML = `${this._costHtml(node.cost)} &nbsp; ⏱ ${formatDuration(node.time / rs.speed())}`;
        row.btn.disabled = status !== "available" || !!p.research.active || !rs.canAfford(node);
      }
    }
  }

  // ======================= technologies =======================
  _buildTech() {
    this.el.innerHTML = `<h2>${this.title}</h2><div class="card" data-f="bonuses"></div><h2 class="sub">Discovered</h2><div data-f="list"></div>`;
    this.bonuses = this.el.querySelector('[data-f="bonuses"]');
    this.list = this.el.querySelector('[data-f="list"]');
  }

  _bonusLines() {
    const lines = [];
    const prod = this.api.production;
    const vis = this.state.data.resources.resources.filter((r) => this.state.eraIndex(r.unlockEra) <= this.state.eraIndex(this.state.player.era));
    for (const r of vis) {
      const m = prod.multiplierFor(r.id);
      if (Math.abs(m - 1) > 1e-6) lines.push(`${r.icon} ${r.name} <b>x${m.toFixed(2)}</b>`);
    }
    const mods = this.state.mods;
    const add = (label, value, fmt) => { if (Math.abs(value) > 1e-9) lines.push(`${label} <b>${fmt(value)}</b>`); };
    add("🏠 Housing", mods.get("housing"), (v) => `+${v}`);
    add("👶 Growth speed", mods.get("growthSpeed"), (v) => `+${Math.round(v * 100)}%`);
    add("🔬 Research speed", mods.get("researchSpeed"), (v) => `+${Math.round(v * 100)}%`);
    add("👷 Worker bonus", mods.get("staffing"), (v) => `+${Math.round(v * 100)}%`);
    add("🏗️ Building cost", -mods.get("buildingCost"), (v) => `${Math.round(v * 100)}%`);
    add("🍖 Food eaten", -mods.get("foodUse"), (v) => `${Math.round(v * 100)}%`);
    return lines;
  }

  _refreshTech() {
    const lines = this._bonusLines();
    this.bonuses.innerHTML =
      `<b>Active bonuses</b>` +
      (lines.length ? `<div class="bonus-grid">${lines.map((l) => `<span>${l}</span>`).join("")}</div>` : `<p class="small">Complete research, buy upgrades and earn achievements to gain bonuses.</p>`) +
      `<p class="small">Includes technologies, upgrades and achievements.</p>`;

    const done = this.state.player.research.completed;
    const key = done.join(",");
    if (key === this._key) return;
    this._key = key;
    const branches = this.state.data.research.branches;
    const owned = this.api.technology.owned().sort((a, b) => {
      const na = this.api.research.node(a.research), nb = this.api.research.node(b.research);
      return branches.findIndex((x) => x.id === na.branch) - branches.findIndex((x) => x.id === nb.branch) || this.state.eraIndex(na.era) - this.state.eraIndex(nb.era);
    });
    this.list.innerHTML = owned.length
      ? owned
          .map((t) => {
            const node = this.api.research.node(t.research);
            const branch = branches.find((b) => b.id === node.branch);
            const unlocks = this.api.technology.unlocksFor(t.research);
            return (
              `<div class="card"><div class="b-head"><b>${t.name}</b> <span class="b-cat">${branch?.icon ?? ""} ${branch?.name ?? ""}</span></div>` +
              `<p>${t.description}</p><p class="b-effect">${t.effects.map((e) => this.api.effects.describe(e)).join("  ·  ")}</p>` +
              (unlocks.length ? `<p class="b-stats">Unlocked: ${unlocks.join(", ")}</p>` : "") +
              `</div>`
            );
          })
          .join("")
      : `<div class="card"><p class="placeholder-note">No technologies yet. Complete a research project to discover one.</p></div>`;
  }
}
