import { BasePanel } from "./BasePanel.js";

/**
 * SettingsPanel - audio toggles, saving (save now, export / import text, delete save)
 * and a short status of the CrazyGames connection. Settings live in state.player.settings.
 * Emits "settings:changed"; save actions go through the bus ("save:now", "save:import", "save:reset").
 */
export class SettingsPanel extends BasePanel {
  constructor(state, bus, api) {
    super("settings", "Settings", state, bus);
    this.api = api;
  }

  build() {
    this.el.innerHTML =
      `<h2>${this.title}</h2>` +
      `<div class="card"><label><input type="checkbox" data-s="music"> Music</label>` +
      `<input type="range" class="vol" data-v="musicVolume" min="0" max="1" step="0.05" aria-label="Music volume"></div>` +
      `<div class="card"><label><input type="checkbox" data-s="sfx"> Sound effects</label>` +
      `<input type="range" class="vol" data-v="sfxVolume" min="0" max="1" step="0.05" aria-label="Effects volume"></div>` +
      `<h2 class="sub">Graphics</h2>` +
      `<div class="card"><label>Quality <select data-q="quality" aria-label="Graphics quality"><option value="auto">Auto (best for your device)</option><option value="ultra">Ultra HD</option><option value="high">High</option><option value="low">Low (fastest)</option></select></label></div>` +
      `<h2 class="sub">Saving</h2>` +
      `<div class="card"><p data-f="saveInfo"></p>` +
      `<div class="job-ctl"><button class="btn" data-a="save">Save now</button><button class="btn btn-secondary" data-a="export">Export save</button></div>` +
      `<textarea data-f="text" rows="4" class="save-text" placeholder="Export creates a text here. To import, paste a save text here and press Import." spellcheck="false"></textarea>` +
      `<div class="job-ctl"><button class="btn btn-secondary" data-a="copy">Copy</button><button class="btn btn-secondary" data-a="import">Import</button><button class="btn btn-danger" data-a="reset">Delete save</button></div></div>` +
      `<h2 class="sub">Online</h2><div class="card"><p data-f="online"></p></div>` +
      `<p class="small">Idle Civilization v${this.state.cfg.version ?? ""}. All art and sound are generated in the game.</p>`;
    for (const input of this.el.querySelectorAll("input[data-s]")) {
      input.addEventListener("change", () => {
        this.state.player.settings[input.dataset.s] = input.checked;
        this.bus.emit("settings:changed", { key: input.dataset.s, value: input.checked });
      });
    }
    for (const r of this.el.querySelectorAll("input[data-v]")) {
      r.addEventListener("input", () => {
        this.state.player.settings[r.dataset.v] = Number(r.value);
        this.bus.emit("settings:changed", { key: r.dataset.v, value: Number(r.value) });
      });
    }
    const q = this.el.querySelector("select[data-q]");
    q.addEventListener("change", () => {
      this.state.player.settings.quality = q.value;
      this.bus.emit("settings:changed", { key: "quality", value: q.value });
    });
    this.text = this.el.querySelector('[data-f="text"]');
    this.el.addEventListener("click", (ev) => {
      const a = ev.target.closest("button[data-a]")?.dataset.a;
      if (!a) return;
      const saves = this.api.saves;
      if (a === "save") this.bus.emit("save:now");
      else if (a === "export") this.text.value = saves.exportText();
      else if (a === "copy") this._copy();
      else if (a === "import") this._import();
      else if (a === "reset") this._reset();
    });
  }

  async _copy() {
    if (!this.text.value) this.text.value = this.api.saves.exportText();
    try {
      await navigator.clipboard.writeText(this.text.value);
      this.bus.emit("notify", { text: "Save text copied.", type: "success", duration: 1500 });
    } catch {
      this.text.select();
      this.bus.emit("notify", { text: "Press Ctrl+C to copy the selected text.", type: "warn" });
    }
  }

  _import() {
    const check = this.api.saves.inspectExport(this.text.value);
    if (!check.ok) return this.bus.emit("notify", { text: check.error, type: "error" });
    this.bus.emit("modal:open", {
      title: "Import this save?",
      body: "Your current progress will be replaced by the imported save. This cannot be undone.",
      buttons: [
        { label: "Cancel", kind: "btn-secondary" },
        { label: "Import", kind: "btn-danger", onClick: () => this.bus.emit("save:import", { text: this.text.value }) }
      ]
    });
  }

  _reset() {
    this.bus.emit("modal:open", {
      title: "Delete your save?",
      body: "All progress, Civilization Points and achievements will be erased and the game restarts. This cannot be undone.",
      buttons: [
        { label: "Keep playing", kind: "btn-secondary" },
        { label: "Delete everything", kind: "btn-danger", onClick: () => this.bus.emit("save:reset") }
      ]
    });
  }

  refresh() {
    for (const input of this.el.querySelectorAll("input[data-s]")) {
      input.checked = !!this.state.player.settings[input.dataset.s];
    }
    const qs = this.el.querySelector("select[data-q]");
    if (qs && document.activeElement !== qs) qs.value = this.state.player.settings.quality ?? "auto";
    for (const r of this.el.querySelectorAll("input[data-v]")) {
      if (document.activeElement !== r) r.value = this.state.player.settings[r.dataset.v] ?? 0.5;
    }
    const saves = this.api.saves;
    const ago = saves.lastSavedAt ? Math.max(0, Math.round((Date.now() - saves.lastSavedAt) / 1000)) : null;
    this.el.querySelector('[data-f="saveInfo"]').textContent =
      (ago === null ? "Not saved yet." : `Last saved ${ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}m`} ago.`) +
      ` Your game saves automatically every ${saves.interval} seconds and when you leave.` +
      (saves.locked ? " Saving is paused." : "");
    const cg = this.api.integration;
    this.el.querySelector('[data-f="online"]').textContent = cg.available
      ? `CrazyGames connected (${cg.environment}). Progress ${cg.dataAvailable ? "is also stored in your CrazyGames account" : "is stored in this browser"}.${cg.adblock ? " An ad blocker was detected: the game works fully, only the optional boosts need ads." : ""}`
      : "Playing offline: progress is stored in this browser. Optional ad boosts are unavailable.";
  }
}
