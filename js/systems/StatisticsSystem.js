/**
 * StatisticsSystem - tracks lifetime statistics in player.stats.
 *
 * Total resources produced are counted by ResourceSystem.add; buildings built by
 * BuildingSystem; highest era by EraSystem. This system owns playtime and the
 * highest population reached, and offers small helpers for the Statistics panel
 * and AchievementSystem.
 */
export class StatisticsSystem {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
  }

  update(dt) {
    const s = this.state.player.stats;
    s.playtime += dt;
    const pop = Math.floor(this.state.player.population.total);
    if (pop > s.maxPopulation) s.maxPopulation = pop;
  }

  /** Total of everything ever produced, summed over resources. */
  totalProducedAll() {
    return Object.values(this.state.player.stats.totalProduced).reduce((a, b) => a + b, 0);
  }

  totalUpgradeLevels() {
    return Object.values(this.state.player.upgrades).reduce((a, b) => a + b, 0);
  }
}
