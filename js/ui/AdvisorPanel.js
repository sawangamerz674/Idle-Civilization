import { BasePanel } from "./BasePanel.js";

/**
 * AdvisorPanel - shows the Advisor's ranked suggestions, the Autopilot switch and a
 * small "ask the advisor" box. Reads advisor.tips; actions go through advisor.runTip
 * (which emits normal bus events). All text is inserted with textContent.
 */
export class AdvisorPanel extends BasePanel {
  constructor(state, bus, api) {
    super("advisor", "Advisor", state, bus);
    this.api = api;
  }

  build() {
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card"><label><input type="checkbox" data-s="autopilot"> Autopilot</label>` +
      `<p class="small">When on, the advisor builds and researches the best option for you every few seconds. Off by default.</p></div>` +
      `<h2 class="sub">Suggestions</h2><div data-f="tips"></div>` +
      `<h2 class="sub">Ask the advisor</h2><div class="card"><div class="job-ctl">` +
      `<input type="text" data-f="q" class="save-text" maxlength="300" placeholder="What should I build next?" aria-label="Question">` +
      `<button class="btn" data-a="ask">Ask</button></div><p data-f="a" class="small"></p></div>`;
    this.tipsEl = this.el.querySelector('[data-f="tips"]');
    this.ans = this.el.querySelector('[data-f="a"]');
    this.input = this.el.querySelector('[data-f="q"]');
    const auto = this.el.querySelector("input[data-s]");
    auto.addEventListener("change", () => {
      this.state.player.settings.autopilot = auto.checked;
      this.bus.emit("settings:changed", { key: "autopilot", value: auto.checked });
    });
    const ask = async () => {
      this.ans.textContent = "Thinking...";
      this.ans.textContent = await this.api.advisor.answer(this.input.value);
    };
    this.el.querySelector('[data-a="ask"]').addEventListener("click", ask);
    this.input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); });
    this.bus.on("advisor:updated", () => { if (this.el.classList.contains("active")) this.refresh(); });
  }

  refresh() {
    if (!this._built) return;
    const auto = this.el.querySelector("input[data-s]");
    auto.checked = !!this.state.player.settings.autopilot;
    this.tipsEl.textContent = "";
    for (const tip of this.api.advisor.tips) {
      const card = document.createElement("div");
      card.className = "card building-row";
      const h = document.createElement("p");
      const b = document.createElement("b");
      b.textContent = `${tip.icon} ${tip.title}`;
      h.appendChild(b);
      const t = document.createElement("p");
      t.className = "small";
      t.textContent = tip.text;
      card.append(h, t);
      if (tip.action) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = tip.action.label;
        btn.addEventListener("click", () => this.api.advisor.runTip(tip));
        card.appendChild(btn);
      }
      this.tipsEl.appendChild(card);
    }
  }
}
