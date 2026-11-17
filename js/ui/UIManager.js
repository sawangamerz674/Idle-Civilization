import { HUD } from "./HUD.js";
import { CivilizationPanel } from "./CivilizationPanel.js";
import { BuildingPanel } from "./BuildingPanel.js";
import { PopulationPanel } from "./PopulationPanel.js";
import { ResearchPanel } from "./ResearchPanel.js";
import { EraPanel } from "./EraPanel.js";
import { PrestigePanel } from "./PrestigePanel.js";
import { AchievementPanel } from "./AchievementPanel.js";
import { UpgradePanel } from "./UpgradePanel.js";
import { StatisticsPanel } from "./StatisticsPanel.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { AdvisorPanel } from "./AdvisorPanel.js";
import { IconReplacer } from "./Icons.js";
import { Onboarding } from "./Onboarding.js";
import { ModalManager } from "./ModalManager.js";
import { NotificationManager } from "./NotificationManager.js";

/**
 * UIManager - builds the navigation, owns all panels, switches between them,
 * and refreshes the visible panel and HUD on a throttle.
 * Listens to the bus; never modifies gameplay state itself.
 */
export class UIManager {
  constructor(state, bus, api) {
    this.state = state;
    this.bus = bus;
    this.api = api; // read-only queries (costs, unlock checks); actions go through the bus
    this.hud = new HUD(state, bus, api);
    this.modals = new ModalManager(document.getElementById("modal-root"));
    this.notifications = new NotificationManager(document.getElementById("notifications"), bus);

    this.panels = new Map();
    const add = (key, panel) => this.panels.set(key, panel);
    add("civilization", new CivilizationPanel());
    add("buildings", new BuildingPanel(state, bus, api));
    add("population", new PopulationPanel(state, bus, api));
    add("research", new ResearchPanel(state, bus, api, "research"));
    add("technologies", new ResearchPanel(state, bus, api, "technologies"));
    add("upgrades", new UpgradePanel(state, bus, api));
    add("achievements", new AchievementPanel(state, bus, api));
    add("prestige", new PrestigePanel(state, bus, api));
    add("statistics", new StatisticsPanel(state, bus, api));
    add("advisor", new AdvisorPanel(state, bus, api));
    add("settings", new SettingsPanel(state, bus, api));
    bus.on("ui:showPanel", ({ id }) => this.showPanel(id));
    // EraPanel has no nav slot of its own in Phase 1; it is opened from the HUD era badge.
    add("eras", new EraPanel(state, bus, api));

    this.navButtons = new Map();
    this._accum = 0;
  }

  init() {
    const container = document.getElementById("panel-container");
    for (const panel of this.panels.values()) panel.mount(container);
    this._buildNav();

    // Clicking the era badge opens the Eras panel (it pulses when the next era is reachable).
    const badge = document.getElementById("hud-era-name");
    badge.style.cursor = "pointer";
    badge.title = "Eras";
    badge.addEventListener("click", () => this.showPanel("eras"));

    this.bus.on("modal:open", (opts) => this.modals.open(opts));
    this.bus.on("economy:starving", (on) =>
      this.bus.emit("notify", {
        text: on ? "Your citizens are starving! Build more farms." : "Food supply restored.",
        type: on ? "error" : "success"
      })
    );
    // Rebuild the navigation when the phone is rotated; tapping elsewhere closes the "More" sheet.
    for (const q of ["(max-width: 720px) and (orientation: portrait)"]) {
      window.matchMedia(q).addEventListener("change", () => this._buildNav());
    }
    document.addEventListener("click", (ev) => {
      if (this.moreSheet && !ev.target.closest(".more-sheet")) this.moreSheet.classList.add("hidden");
    });
    this.showPanel("civilization");
    this.hud.update();
    this.icons = new IconReplacer(document.body); // swaps data-file emoji for the custom SVG icon set
    this.icons.start();
    this.onboarding = new Onboarding(this.state, this.bus);
  }

  /** Phones in portrait get a compact bottom bar (4 main tabs + "More"). */
  _isCompact() {
    return window.matchMedia("(max-width: 720px) and (orientation: portrait)").matches;
  }

  _buildNav() {
    const nav = document.getElementById("nav");
    const compact = this._isCompact();
    this._compact = compact;
    nav.innerHTML = "";
    this.navButtons.clear();
    if (this.moreSheet) this.moreSheet.remove();
    this.moreSheet = null;
    const items = this.state.cfg.navigation;
    if (compact) {
      for (const item of items.filter((i) => i.primary)) this._addNavButton(nav, item);
      const more = document.createElement("button");
      more.className = "nav-btn nav-more";
      more.innerHTML = `<span class="nav-icon">\u2630</span><span>More</span>`;
      this.moreSheet = document.createElement("div");
      this.moreSheet.className = "more-sheet hidden";
      for (const item of items.filter((i) => !i.primary)) this._addNavButton(this.moreSheet, item);
      document.getElementById("app").appendChild(this.moreSheet);
      more.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.moreSheet.classList.toggle("hidden");
      });
      nav.appendChild(more);
      this.moreBtn = more;
      this._syncActive();
      return;
    }
    for (const item of items) this._addNavButton(nav, item);
    this._syncActive();
  }

  _addNavButton(parent, item) {
    {
      const btn = document.createElement("button");
      btn.className = "nav-btn";
      btn.dataset.nav = item.id;
      btn.innerHTML = `<span class="nav-icon">${item.icon}</span><span>${item.label}</span>`;
      btn.addEventListener("click", () => this.showPanel(item.id));
      parent.appendChild(btn);
      this.navButtons.set(item.id, btn);
    }
  }

  _syncActive() {
    const id = this.state.runtime.activePanel;
    for (const [key, btn] of this.navButtons) btn.classList.toggle("active", key === id);
    if (this.moreBtn) this.moreBtn.classList.toggle("active", !!this.moreSheet && [...this.moreSheet.children].some((b) => b.dataset.nav === id));
  }

  showPanel(id) {
    if (!this.panels.has(id)) return;
    for (const [key, panel] of this.panels) {
      if (key === id) panel.show();
      else panel.hide();
    }
    this.state.runtime.activePanel = id;
    this.moreSheet?.classList.add("hidden");
    this._syncActive();
    document.getElementById("app").classList.toggle("is-civ", id === "civilization");
    this.bus.emit("panel:changed", id);
  }

  /** Called every render frame; refreshes the DOM about 5 times a second. */
  update(dt) {
    this._accum += dt;
    if (this._accum < 0.2) return;
    this._accum = 0;
    this.hud.update();
    this.panels.get(this.state.runtime.activePanel)?.refresh();
  }
}
