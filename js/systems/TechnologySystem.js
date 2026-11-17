/**
 * TechnologySystem - the lasting results of research.
 *
 * data/technologies.json lists technologies, each tied to one research node and
 * carrying `effects` (see EffectSystem). Owned technologies are derived from
 * player.research.completed, so there is nothing extra to save. Buildings and
 * upgrades gated on a research id (`unlock.research`) unlock through that same list.
 *
 * Listens:  "research:completed"
 */
export class TechnologySystem {
  constructor(state, bus, effects) {
    this.state = state;
    this.bus = bus;
    this.effects = effects;
    bus.on("research:completed", ({ id }) => this.applyFor(id));
    this.applyAll();
  }

  all() {
    return this.state.data.technologies.technologies;
  }

  forResearch(researchId) {
    return this.all().find((t) => t.research === researchId) ?? null;
  }

  owned() {
    return this.state.player.research.completed.map((id) => this.forResearch(id)).filter(Boolean);
  }

  applyFor(researchId) {
    const tech = this.forResearch(researchId);
    if (tech) this.effects.replace(`tech:${tech.id}`, tech.effects, 1);
  }

  /** Re-apply every owned technology (new game, load, prestige reset). */
  applyAll() {
    for (const tech of this.all()) this.effects.clear(`tech:${tech.id}`);
    for (const tech of this.owned()) this.effects.apply(`tech:${tech.id}`, tech.effects, 1);
  }

  /** Names of buildings and upgrades a research project unlocks. */
  unlocksFor(researchId) {
    const out = [];
    for (const b of this.state.data.buildings.buildings) if (b.unlock?.research === researchId) out.push(b.name);
    for (const u of this.state.data.upgrades.upgrades) if (u.unlock?.research === researchId) out.push(u.name);
    for (const e of this.state.data.eras.eras) if (e.requirements?.research?.includes(researchId)) out.push(`Path to the ${e.name}`);
    return out;
  }
}
