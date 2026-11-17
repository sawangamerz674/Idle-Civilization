import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";
import { formatDuration } from "../utils/TimeUtils.js";

/** StatisticsPanel - lifetime totals, progress counts and per-resource production. */
export class StatisticsPanel extends BasePanel {
  constructor(state, bus, api) {
    super("statistics", "Statistics", state, bus);
    this.api = api;
  }

  build() {
    this.el.innerHTML =
      `<h2>${this.title}</h2><div class="card" data-f="general"></div>` +
      `<h2 class="sub">Total resources produced</h2><div class="card" data-f="resources"></div>`;
    this.general = this.el.querySelector('[data-f="general"]');
    this.resources = this.el.querySelector('[data-f="resources"]');
  }

  refresh() {
    if (!this._built) return;
    const p = this.state.player;
    const s = p.stats;
    const era = this.state.data.eras.eras.find((e) => e.index === s.highestEra)?.name ?? "Stone Age";
    const types = Object.values(p.buildings).reduce((a, b) => a + b.count, 0);
    const ac = this.api.achievements;
    this.general.innerHTML =
      `<p>Playtime: <b>${formatDuration(s.playtime)}</b></p>` +
      `<p>Population: <b>${Math.floor(p.population.total)}</b> (highest ${s.maxPopulation})</p>` +
      `<p>Buildings constructed: <b>${s.buildingsBuilt}</b> (standing: ${types})</p>` +
      `<p>Highest era: <b>${era}</b></p>` +
      `<p>Research completed: <b>${p.research.completed.length} / ${this.state.data.research.research.length}</b></p>` +
      `<p>Upgrade levels bought: <b>${this.api.statistics.totalUpgradeLevels()}</b> (${s.upgradesBought} purchases)</p>` +
      `<p>Achievements: <b>${ac.unlockedCount()} / ${ac.all().length}</b></p>` +
      `<p>Prestiges: <b>${p.prestige.count}</b> · Civilization Points earned: <b>${p.prestige.totalPoints}</b></p>`;
    this.resources.innerHTML = this.state.data.resources.resources
      .map((r) => `<p>${r.icon} ${r.name}: <b>${formatNumber(s.totalProduced[r.id] ?? 0)}</b></p>`)
      .join("");
  }
}
