import { BuildingRenderer } from "./BuildingRenderer.js";
import { CitizenRenderer } from "./CitizenRenderer.js";
import { AnimationManager } from "./AnimationManager.js";
import { EraBackground } from "./EraBackground.js";

/**
 * CivilizationRenderer - draws the whole settlement scene:
 * era background, then buildings and citizens depth-sorted together, then effects.
 * Reads GameState only; never mutates gameplay data.
 */
export class CivilizationRenderer {
  constructor(state, bus) {
    this.state = state;
    this.background = new EraBackground();
    this.buildings = new BuildingRenderer(state);
    this.citizens = new CitizenRenderer(state);
    this.animations = new AnimationManager();
    this.t = 0;
    this._popTimer = 0;
    this.flash = 0;

    // Construction / upgrade feedback.
    bus?.on("building:built", ({ id }) => {
      const def = state.getBuildingDef(id);
      const x = this._slotX(id);
      this.animations.spawnFloatingText(x, 250, `+ ${def?.name ?? "Building"}`, "#ffe27a");
      this.animations.spawnBurst(x, 300, "#ffe27a", 10);
    });
    bus?.on("building:upgraded", ({ id, level }) => {
      const def = state.getBuildingDef(id);
      const x = this._slotX(id);
      this.animations.spawnFloatingText(x, 230, `${def?.name ?? ""} Lv ${level}!`, "#9be37a");
      this.animations.spawnBurst(x, 290, "#9be37a", 12);
    });
    bus?.on("population:grew", () => {
      this.animations.spawnFloatingText(120 + Math.random() * 720, 400, "+1 citizen", "#ffb3c1");
    });
    // Era unlock effect: white flash, fireworks and a banner.
    bus?.on("era:changed", ({ id }) => {
      const era = state.data.eras.eras.find((e) => e.id === id);
      this.flash = 1;
      const colors = ["#ffe27a", "#9be37a", "#7ad7ff", "#ff9bd2", "#ffffff"];
      for (let i = 0; i < 9; i++) {
        this.animations.spawnBurst(90 + i * 100, 140 + Math.random() * 160, colors[i % colors.length], 22);
      }
      this.animations.spawnFloatingText(480, 200, era?.name ?? "New era!", "#ffffff");
    });
  }

  _slotX(id) {
    const slots = this.buildings.slotsById.get(id);
    return slots?.length ? slots[slots.length - 1].x : 200 + Math.random() * 560;
  }

  /** Occasional "+icon" pops while a resource is being produced. */
  _productionPops(dt) {
    this._popTimer += dt;
    if (this._popTimer < 1.5) return;
    this._popTimer = 0;
    const resources = this.state.player.resources;
    for (const def of this.state.data.resources.resources) {
      const r = resources[def.id];
      if (r.production - r.consumption > 0.05 && r.amount < r.cap) {
        this.animations.spawnFloatingText(120 + Math.random() * 720, 330 + Math.random() * 60, `+${def.icon}`, "#ffffff");
        break;
      }
    }
  }

  /** Paint the area around the scene (device pixels): the era sky above the horizon, ground below.
   *  The sky gradient spans the same range as the scene's own sky so there is no visible seam. */
  fillBackdrop(ctx, cw, ch, sceneTop, horizonY) {
    const era = this.state.getEra();
    const sky = era.sky ?? ["#9ec5ff", "#cfe3ff"];
    const span = Math.max(1, horizonY - sceneTop);
    const g = ctx.createLinearGradient(0, sceneTop, 0, sceneTop + span);
    g.addColorStop(0, sky[0]);
    g.addColorStop(1, sky[sky.length - 1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, Math.max(0, horizonY));
    ctx.fillStyle = era.ground ?? "#7bb661";
    ctx.fillRect(0, Math.max(0, horizonY), cw, ch - Math.max(0, horizonY));
    // depth shading + soft stripes so the extra ground below the scene is not flat
    const hy = Math.max(0, horizonY);
    const sh = ctx.createLinearGradient(0, hy, 0, ch);
    sh.addColorStop(0, "rgba(255,255,255,.10)");
    sh.addColorStop(1, "rgba(0,0,0,.30)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, hy, cw, ch - hy);
    ctx.fillStyle = "rgba(0,0,0,.05)";
    for (let y = hy + 40, i = 0; y < ch; y += 40 + i * 14, i++) ctx.fillRect(0, y, cw, 14 + i * 4);
  }

  render(ctx, dt, w, h) {
    this.t += dt;
    const era = this.state.getEra();
    const groundY = h * 0.62;

    this.background.draw(ctx, era, this.t, w, h, groundY);

    this.buildings.layout(w, groundY);
    this.citizens.update(dt, w, groundY, this.buildings.slotsById);

    const drawables = [...this.buildings.drawables(dt), ...this.citizens.drawables()];
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw(ctx);

    this._productionPops(dt);
    this.animations.update(dt);
    this.animations.draw(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash) * 0.85})`;
      ctx.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 1.2);
    }
  }
}
