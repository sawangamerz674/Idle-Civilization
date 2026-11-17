import { BasePanel } from "./BasePanel.js";

const STATUS_TEXT = {
  growing: "Growing",
  housing: "Needs more housing - build huts",
  food: "Needs a bigger food reserve",
  starving: "Starving! Build farms"
};

/**
 * PopulationPanel - citizens, housing, growth status and worker assignment.
 * Assignment changes are requested through the bus ("workers:assign",
 * "workers:auto"); PopulationSystem applies them. Rows are rebuilt only when the
 * set of staffed building types changes.
 */
export class PopulationPanel extends BasePanel {
  constructor(state, bus, api) {
    super("population", "Population", state, bus);
    this.api = api;
    this.rows = new Map();
    this._key = "";
  }

  build() {
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card">` +
      `<p>Citizens: <b data-f="total">0</b> / <b data-f="housing">0</b> housing</p>` +
      `<p>Employed: <b data-f="employed">0</b> &nbsp; Unemployed: <b data-f="unemployed">0</b></p>` +
      `<p>Status: <b data-f="status"></b></p>` +
      `<div class="bar"><div class="bar-fill" data-f="growth"></div></div>` +
      `<p class="small">Each citizen adds <span data-f="bonus"></span> to all production. Staffed buildings produce up to double.</p>` +
      `</div>` +
      `<div class="card"><label><input type="checkbox" data-f="auto"> Auto-assign new citizens to open jobs</label></div>` +
      `<h2 class="sub">Jobs</h2><div data-f="jobs"></div>`;

    const q = (n) => this.el.querySelector(`[data-f="${n}"]`);
    this.f = {
      total: q("total"), housing: q("housing"), employed: q("employed"), unemployed: q("unemployed"),
      status: q("status"), growth: q("growth"), bonus: q("bonus"), auto: q("auto"), jobs: q("jobs")
    };

    this.f.auto.addEventListener("change", () => this.bus.emit("workers:auto", { on: this.f.auto.checked }));
    this.f.jobs.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-w]");
      if (btn && !btn.disabled) this.bus.emit("workers:assign", { id: btn.dataset.w, delta: Number(btn.dataset.d) });
    });
  }

  _rebuildRows(defs) {
    this.rows.clear();
    if (!defs.length) {
      this.f.jobs.innerHTML = `<div class="card"><p class="placeholder-note">Build farms, woodcutters or stone collectors to create jobs.</p></div>`;
      return;
    }
    this.f.jobs.innerHTML = "";
    for (const def of defs) {
      const row = document.createElement("div");
      row.className = "card job-row";
      row.innerHTML =
        `<div class="job-main"><b>${def.name}</b><span class="job-count"></span></div>` +
        `<div class="job-ctl"><button class="btn btn-secondary" data-w="${def.id}" data-d="-1">-</button>` +
        `<button class="btn" data-w="${def.id}" data-d="1">+</button></div>`;
      this.f.jobs.appendChild(row);
      this.rows.set(def.id, {
        count: row.querySelector(".job-count"),
        minus: row.querySelector('[data-d="-1"]'),
        plus: row.querySelector('[data-d="1"]')
      });
    }
  }

  refresh() {
    if (!this._built) return;
    const pop = this.state.player.population;
    const ps = this.api.population;
    const total = Math.floor(pop.total);
    const unemployed = ps.unemployed();

    this.f.total.textContent = total;
    this.f.housing.textContent = pop.housing;
    this.f.employed.textContent = ps.employed();
    this.f.unemployed.textContent = unemployed;
    this.f.status.textContent = STATUS_TEXT[this.state.runtime.growthStatus] ?? "";
    this.f.growth.style.width = `${Math.round(pop.growthProgress * 100)}%`;
    this.f.bonus.textContent = `+${((this.state.bal.populationBonusPerCitizen ?? 0) * 100).toFixed(0)}%`;
    this.f.auto.checked = !!pop.autoAssign;

    const defs = this.state.data.buildings.buildings.filter((d) => ps.slotsFor(d.id) > 0);
    const key = defs.map((d) => d.id).join(",");
    if (key !== this._key) {
      this._key = key;
      this._rebuildRows(defs);
    }
    for (const def of defs) {
      const row = this.rows.get(def.id);
      const w = ps.workersAt(def.id);
      const slots = ps.slotsFor(def.id);
      row.count.textContent = `  ${w} / ${slots} workers`;
      row.minus.disabled = w <= 0;
      row.plus.disabled = w >= slots || unemployed <= 0;
    }
  }
}
