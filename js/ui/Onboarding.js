/**
 * Onboarding - a tiny, skippable "first steps" banner for new players (CrazyGames
 * quality guideline: simple onboarding inside gameplay, clear goals, skippable).
 * It never blocks play. Steps are checked against GameState; progress is derived
 * from what the player owns, so nothing extra is saved except settings.onboardingDone.
 * Listens: "building:changed", "research:started", "research:completed", "era:changed"
 * Emits:   "ui:showPanel" ({id}) when the "Show me" button is pressed
 */
const STEPS = [
  { text: "Welcome! Build a Farm to feed your people.", done: (s) => s.buildingCount("farm") >= 1, panel: "buildings" },
  { text: "Great! Now build a Woodcutter for wood.", done: (s) => s.buildingCount("woodcutter") >= 1, panel: "buildings" },
  { text: "Build a Hut so more citizens can move in.", done: (s) => s.buildingCount("hut") >= 1, panel: "buildings" },
  { text: "Open Research and start Basic Tools to reach the next era.", done: (s) => s.player.research.completed.includes("basic_tools") || s.player.research.active === "basic_tools", panel: "research" },
  { text: "You are on your way! Keep growing, and try the Advisor tab for ideas.", done: () => true, panel: "advisor", last: true }
];

export class Onboarding {
  constructor(state, bus, host = document.body) {
    this.state = state;
    this.bus = bus;
    this.step = 0;
    this.el = document.createElement("div");
    this.el.className = "onboarding hidden";
    this.el.setAttribute("role", "status");
    this.msg = document.createElement("span");
    this.msg.className = "onb-text";
    this.go = document.createElement("button");
    this.go.className = "btn onb-go";
    this.go.textContent = "Show me";
    this.skip = document.createElement("button");
    this.skip.className = "btn btn-secondary onb-skip";
    this.skip.textContent = "Skip";
    this.el.append(this.msg, this.go, this.skip);
    host.appendChild(this.el);
    this.go.addEventListener("click", () => this.bus.emit("ui:showPanel", { id: STEPS[this.step]?.panel ?? "buildings" }));
    this.skip.addEventListener("click", () => this.finish());
    for (const ev of ["building:changed", "research:started", "research:completed", "era:changed"]) bus.on(ev, () => this.update());
    this._timer = setInterval(() => this.update(), 1500);
    this.update();
  }

  finish() {
    this.state.player.settings.onboardingDone = true;
    this.el.classList.add("hidden");
    clearInterval(this._timer);
  }

  update() {
    const st = this.state;
    if (st.player.settings.onboardingDone) { this.el.classList.add("hidden"); return; }
    // Veteran saves (already advanced) never see the tutorial.
    if (st.eraIndex(st.player.era) > 1 || st.player.stats.buildingsBuilt > 12 || st.player.prestige.count > 0) { this.finish(); return; }
    while (this.step < STEPS.length - 1 && STEPS[this.step].done(st)) this.step++;
    const cur = STEPS[this.step];
    this.msg.textContent = cur.text;
    this.go.classList.toggle("hidden", !!cur.last);
    this.skip.textContent = cur.last ? "Got it" : "Skip";
    this.el.classList.remove("hidden");
    if (cur.last && !this._lastAt) this._lastAt = Date.now();
    if (cur.last && Date.now() - this._lastAt > 12000) this.finish();
  }
}
