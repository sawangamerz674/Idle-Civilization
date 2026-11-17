import { BasePanel } from "./BasePanel.js";
import { formatNumber } from "../utils/NumberFormatter.js";

/**
 * EraPanel - shows the next era's requirements (live progress), an Advance button,
 * and the list of all eras. Opened by clicking the era badge in the HUD.
 * Advancing is requested through the bus ("era:advance") after a confirm dialog;
 * EraSystem validates and applies it. Requirement rows are built once per target era
 * and only their text is updated, so the Advance button stays clickable.
 */
export class EraPanel extends BasePanel {
  constructor(state, bus, api) {
    super("eras", "Eras", state, bus);
    this.api = api;
    this._nextId = null;
    this._listKey = "";
    this.rows = [];
  }

  build() {
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card era-next" data-f="next"></div>` +
      `<h2 class="sub">All eras</h2><div data-f="list"></div>`;
    this.next = this.el.querySelector('[data-f="next"]');
    this.list = this.el.querySelector('[data-f="list"]');
    this.next.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-advance]");
      if (!btn || btn.disabled) return;
      const era = this.api.era.nextEra();
      if (!era) return;
      const cost = Object.entries(era.requirements?.resources ?? {})
        .map(([id, n]) => `${this.state.getResourceDef(id)?.icon ?? ""} ${formatNumber(n)}`)
        .join("  ");
      this.bus.emit("modal:open", {
        title: `Advance to the ${era.name}?`,
        body: `This will spend: ${cost}\nYour buildings and citizens stay.`,
        buttons: [
          { label: "Cancel", kind: "btn-secondary" },
          { label: "Advance!", onClick: () => this.bus.emit("era:advance") }
        ]
      });
    });
  }

  _buildNext(era) {
    this.rows = [];
    if (!era) {
      this.next.innerHTML = `<b>Final era reached</b><p>Your civilization stands at the pinnacle. Civilization Legacy awaits in a later update.</p>`;
      return;
    }
    const reqs = this.api.era.requirements(era);
    this.next.innerHTML =
      `<b>Next: ${era.name}</b><p>${era.description}</p>` +
      `<div class="req-list">` +
      reqs.map((r, i) => `<div class="req-row" data-i="${i}"><span class="req-label">${r.label}</span><span class="req-val"></span></div>`).join("") +
      `</div>` +
      `<p class="small">Resources are spent when you advance. Population and buildings are only required.</p>` +
      `<div class="b-buy"><span class="req-summary"></span><button class="btn" data-advance="1">Advance</button></div>`;
    this.rows = [...this.next.querySelectorAll(".req-row")].map((el) => ({ el, val: el.querySelector(".req-val") }));
    this.btn = this.next.querySelector("button[data-advance]");
    this.summary = this.next.querySelector(".req-summary");
  }

  refresh() {
    if (!this._built) return;
    const era = this.api.era.nextEra();
    const id = era?.id ?? "none";
    if (id !== this._nextId) {
      this._nextId = id;
      this._buildNext(era);
    }
    if (era) {
      const reqs = this.api.era.requirements(era);
      let metCount = 0;
      reqs.forEach((r, i) => {
        const row = this.rows[i];
        if (!row) return;
        if (r.met) metCount++;
        row.el.classList.toggle("met", r.met);
        const have = r.kind === "resource" ? formatNumber(r.have) : r.have;
        const need = r.kind === "resource" ? formatNumber(r.need) : r.need;
        row.val.textContent = `${r.met ? "✔ " : ""}${have} / ${need}`;
      });
      this.summary.textContent = `${metCount} / ${reqs.length} requirements met`;
      this.btn.disabled = metCount < reqs.length;
    }

    const p = this.state.player;
    const key = `${p.era}|${p.unlockedEras.join(",")}`;
    if (key !== this._listKey) {
      this._listKey = key;
      this.list.innerHTML = this.state.data.eras.eras
        .map((e) => {
          const unlocked = p.unlockedEras.includes(e.id);
          const current = p.era === e.id;
          const names = this.state.data.buildings.buildings.filter((b) => b.era === e.id).map((b) => b.name);
          return (
            `<div class="card ${current ? "era-current" : ""}"><b>${e.index}. ${e.name}</b>` +
            `${current ? " (current)" : unlocked ? "" : " (locked)"}<p>${e.description}</p>` +
            (names.length ? `<p class="small">Buildings: ${names.join(", ")}</p>` : "") +
            `</div>`
          );
        })
        .join("");
    }
  }
}
