/**
 * AchievementSystem - milestones from data/achievements.json.
 *
 * Each achievement has a `stat` (what to measure), a `goal` and a permanent
 * `reward` effect (see EffectSystem), e.g. +1% to all production. Stat types:
 *   produced {resource}  lifetime production of one resource
 *   buildings            lifetime buildings constructed
 *   population           highest population reached
 *   era                  highest era index reached
 *   research             research projects completed
 *   prestige             prestige count
 * Checked twice a second. Unlocked ids are stored in player.achievements.
 *
 * Emits: "achievement:unlocked" ({id}), "notify"
 */
export class AchievementSystem {
  constructor(state, bus, effects) {
    this.state = state;
    this.bus = bus;
    this.effects = effects;
    this._t = 0;
    this.applyAll();
  }

  all() {
    return this.state.data.achievements.achievements;
  }

  isUnlocked(id) {
    return this.state.player.achievements.includes(id);
  }

  /** Current value of the stat an achievement tracks. */
  value(a) {
    const p = this.state.player;
    switch (a.stat.type) {
      case "produced": return p.stats.totalProduced[a.stat.resource] ?? 0;
      case "buildings": return p.stats.buildingsBuilt;
      case "population": return p.stats.maxPopulation;
      case "era": return p.stats.highestEra;
      case "research": return p.research.completed.length;
      case "prestige": return p.prestige.count;
      default: return 0;
    }
  }

  progress(a) {
    return Math.min(1, this.value(a) / a.goal);
  }

  unlockedCount() {
    return this.state.player.achievements.length;
  }

  unlock(a) {
    if (this.isUnlocked(a.id)) return false;
    this.state.player.achievements.push(a.id);
    this.effects.apply(`achievement:${a.id}`, [a.reward], 1);
    this.bus.emit("achievement:unlocked", { id: a.id });
    this.bus.emit("notify", { text: `Achievement unlocked: ${a.name}`, type: "success", duration: 4500 });
    return true;
  }

  /** Re-apply rewards of every unlocked achievement (new game, load, prestige reset). */
  applyAll() {
    for (const a of this.all()) this.effects.clear(`achievement:${a.id}`);
    for (const a of this.all()) {
      if (this.isUnlocked(a.id)) this.effects.apply(`achievement:${a.id}`, [a.reward], 1);
    }
  }

  update(dt) {
    this._t += dt;
    if (this._t < 0.5) return;
    this._t = 0;
    for (const a of this.all()) {
      if (!this.isUnlocked(a.id) && this.value(a) >= a.goal) this.unlock(a);
    }
  }
}
