import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";

/**
 * AchievementPanel - milestones by category with progress bars and their permanent
 * production rewards. The list is built once; refresh() updates progress and state.
 */
export class AchievementPanel extends BasePanel {
  constructor(state, bus, api) {
    super("achievements", "Achievements", state, bus);
    this.api = api;
    this.rows = new Map();
  }

  build() {
    this.el.innerHTML = `<h2>${this.title}</h2><div class="card" data-f="summary"></div><div data-f="list"></div>`;
    this.summary = this.el.querySelector('[data-f="summary"]');
    const list = this.el.querySelector('[data-f="list"]');
    const ac = this.api.achievements;
    for (const cat of this.state.data.achievements.categories) {
      const items = ac.all().filter((a) => a.category === cat.id);
      if (!items.length) continue;
      const h = document.createElement("h2");
      h.className = "sub";
      h.textContent = cat.name;
      list.appendChild(h);
      for (const a of items) {
        const row = document.createElement("div");
        row.innerHTML =
          `<div class="b-head"><b>${a.name}</b><span class="b-owned"></span></div>` +
          `<p>${a.description}</p>` +
          `<div class="bar"><div class="bar-fill"></div></div>` +
          `<p class="b-effect">Reward: ${this.api.effects.describe(a.reward)}</p>`;
        list.appendChild(row);
        this.rows.set(a.id, { el: row, a, owned: row.querySelector(".b-owned"), fill: row.querySelector(".bar-fill") });
      }
    }
  }

  refresh() {
    if (!this._built) return;
    const ac = this.api.achievements;
    let bonus = 1;
    for (const a of ac.all()) if (ac.isUnlocked(a.id)) bonus *= 1 + a.reward.value;
    this.summary.innerHTML = `<b>${ac.unlockedCount()} / ${ac.all().length}</b> unlocked · total bonus <b>x${bonus.toFixed(2)}</b> production`;
    for (const row of this.rows.values()) {
      const done = ac.isUnlocked(row.a.id);
      row.el.className = `card building-row ach-row ${done ? "ach-done" : ""}`;
      row.owned.textContent = done ? "✔ Unlocked" : `${formatNumber(Math.min(ac.value(row.a), row.a.goal))} / ${formatNumber(row.a.goal)}`;
      row.fill.style.width = `${(done ? 1 : ac.progress(row.a)) * 100}%`;
    }
  }
}
