/**
 * CitizenRenderer - draws and animates citizens.
 * Employed citizens walk to a slot of the building they work at and play a work
 * animation; unemployed citizens wander in front of the settlement.
 * Count follows state.player.population.total (capped at MAX for performance);
 * assignments follow state.player.population.workers. Re-syncs when
 * state.runtime.popVersion changes or the building layout changes.
 *
 * Reads GameState only.
 */
import { vGrad, sphereGrad, softShadow, lighten, darken, rrect } from "./ArtKit.js";

const MAX = 40;
const INK = "#3b2a1a";
const SKIN = ["#ffd9b3", "#f1c08f", "#d9a066", "#b9794a", "#8d5a37"];
const HAIR = ["#2b1b12", "#5a3820", "#8a5a2b", "#c9a227", "#d65a31", "#4a4a52"];
// Outfit colours per era (clothes change as the civilization advances).
const OUTFITS = {
  stone_age: ["#9c6b3f", "#8a5a33", "#a8794a", "#7f5532"],
  ancient: ["#f4efe0", "#efe3c4", "#e8d9b0", "#f7f1e6"],
  medieval: ["#c0503a", "#3f7cac", "#4f8f4f", "#8d5fa6", "#d49a2a"],
  industrial: ["#5d6d7e", "#7a6a58", "#566573", "#8a7f72"],
  futuristic: ["#e6eefc", "#cfe3ff", "#d8f2ff", "#eadcff"]
};
// Tool carried while working, chosen from the building (id first, then category).
const TOOL_BY_ID = { farm: "hoe", advanced_farm: "hoe", woodcutter: "axe", stone_collector: "pickaxe", quarry: "pickaxe", mine: "pickaxe" };
const TOOL_BY_CATEGORY = { food: "hoe", resource: "pickaxe", industrial: "hammer", science: "book", economy: "coins", energy: "wrench", housing: "hammer" };

export class CitizenRenderer {
  constructor(state) {
    this.state = state;
    this.citizens = [];
    this.t = 0;
    this._ver = -1;
    this._layoutSig = "";
  }

  _spawn(width, groundY) {
    return {
      x: 80 + Math.random() * (width - 160),
      y: groundY + 118,
      lane: Math.floor(Math.random() * 3),
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: 12 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      color: Math.random(),                       // picks the outfit colour for the current era
      skin: SKIN[Math.floor(Math.random() * SKIN.length)],
      hair: HAIR[Math.floor(Math.random() * HAIR.length)],
      style: Math.floor(Math.random() * 3),       // hair style
      size: 0.94 + Math.random() * 0.14,
      emote: 6 + Math.random() * 20,              // seconds until the next speech bubble
      emoting: 0,
      job: null,   // building id or null
      jobIndex: 0, // k-th worker of that building (picks the slot and offset)
      working: false
    };
  }

  /** Match citizen count and job assignments to GameState. */
  _sync(width, groundY, slotsById) {
    const target = Math.min(Math.floor(this.state.player.population.total), MAX);
    while (this.citizens.length < target) this.citizens.push(this._spawn(width, groundY));
    if (this.citizens.length > target) this.citizens.length = target;

    // Jobs a building can show: workers capped by the visible slots (3 spots per slot).
    const need = {};
    for (const [id, n] of Object.entries(this.state.player.population.workers)) {
      const slots = slotsById.get(id)?.length ?? 0;
      if (slots > 0 && n > 0) need[id] = Math.min(n, slots * 3);
    }
    // Keep existing jobs where still needed, free the rest.
    const taken = {};
    for (const c of this.citizens) {
      if (c.job && (taken[c.job] ?? 0) < (need[c.job] ?? 0)) taken[c.job] = (taken[c.job] ?? 0) + 1;
      else c.job = null;
    }
    // Hand remaining jobs to idle citizens.
    for (const [id, n] of Object.entries(need)) {
      for (const c of this.citizens) {
        if ((taken[id] ?? 0) >= n) break;
        if (!c.job) {
          c.job = id;
          taken[id] = (taken[id] ?? 0) + 1;
        }
      }
    }
    const k = {};
    for (const c of this.citizens) {
      if (c.job) c.jobIndex = k[c.job] = (k[c.job] ?? -1) + 1;
    }
  }

  update(dt, width, groundY, slotsById) {
    this.t += dt;
    this._dt = dt;
    const sig = this.state.runtime.popVersion + "|" + [...slotsById.entries()].map(([id, s]) => id + s.length).join(",");
    if (sig !== this._layoutSig || this.citizens.length !== Math.min(Math.floor(this.state.player.population.total), MAX)) {
      this._layoutSig = sig;
      this._sync(width, groundY, slotsById);
    }

    for (const c of this.citizens) {
      let tx;
      let ty;
      const slots = c.job ? slotsById.get(c.job) : null;
      if (slots && slots.length) {
        const slot = slots[c.jobIndex % slots.length];
        const spot = Math.floor(c.jobIndex / slots.length) % 3;
        tx = slot.x + (spot - 1) * 22;
        ty = slot.y + 14;
      } else {
        c.job = null;
        tx = null;
        ty = groundY + 118 + c.lane * 18;
      }

      if (tx !== null) {
        const dx = tx - c.x;
        const dy = ty - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const step = Math.min(dist, 70 * dt);
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
          c.dir = dx >= 0 ? 1 : -1;
          c.working = false;
        } else {
          c.working = true;
        }
      } else {
        c.working = false;
        c.y += Math.sign(ty - c.y) * Math.min(Math.abs(ty - c.y), 40 * dt);
        c.x += c.dir * c.speed * dt;
        if (c.x < 60) { c.x = 60; c.dir = 1; }
        if (c.x > width - 60) { c.x = width - 60; c.dir = -1; }
      }
    }
  }

  drawables() {
    return this.citizens.map((c) => ({ y: c.y, draw: (ctx) => this._draw(ctx, c) }));
  }

  _tool(c) {
    if (!c.job) return null;
    const def = this.state.getBuildingDef(c.job);
    return TOOL_BY_ID[c.job] ?? TOOL_BY_CATEGORY[def?.category] ?? "hammer";
  }

  /** A small tool drawn in the hand (origin = hand, pointing up). */
  _drawTool(ctx, tool) {
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    const stick = (len, col = "#8a5a2b") => {
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -len); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(0, -len); ctx.stroke();
    };
    const metal = (draw) => { ctx.fillStyle = "#c9d1d8"; ctx.strokeStyle = INK; ctx.lineWidth = 2; draw(); ctx.fill(); ctx.stroke(); };
    switch (tool) {
      case "axe": stick(20); metal(() => { ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(10, -24, 9, -12); ctx.lineTo(0, -12); ctx.closePath(); }); break;
      case "pickaxe": stick(20); metal(() => { ctx.beginPath(); ctx.moveTo(-10, -16); ctx.quadraticCurveTo(0, -26, 10, -16); ctx.lineTo(8, -15); ctx.quadraticCurveTo(0, -21, -8, -15); ctx.closePath(); }); break;
      case "hoe": stick(22); metal(() => { ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(8, -20); ctx.lineTo(8, -16); ctx.lineTo(0, -17); ctx.closePath(); }); break;
      case "wrench": stick(16, "#5d6d7e"); metal(() => { ctx.beginPath(); ctx.arc(0, -19, 5, 0, Math.PI * 2); }); ctx.fillStyle = INK; ctx.fillRect(-1.5, -24, 3, 5); break;
      case "book": ctx.fillStyle = "#3f7cac"; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillRect(-7, -14, 14, 11); ctx.strokeRect(-7, -14, 14, 11); ctx.fillStyle = "#f7f1e6"; ctx.fillRect(-5, -12, 10, 7); break;
      case "coins": ctx.fillStyle = "#ffcc33"; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -9, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#b8860b"; ctx.fillRect(-1, -12, 2, 6); break;
      default: stick(16); metal(() => { ctx.beginPath(); ctx.rect(-6, -22, 12, 7); });
    }
  }

  _draw(ctx, c) {
    const era = this.state.player.era;
    const palette = OUTFITS[era] ?? OUTFITS.stone_age;
    const outfit = palette[Math.floor(c.color * palette.length) % palette.length];
    const walking = !c.working;
    const ph = this.t * (walking ? 8 : 6) + c.phase;
    const step = walking ? Math.sin(ph) : 0;
    const bob = walking ? Math.abs(Math.sin(ph)) * 2.2 : 0;
    const tool = c.working ? this._tool(c) : null;

    softShadow(ctx, c.x, c.y + 1, 11 * c.size, 3.6 * c.size, 0.4);
    ctx.save();
    ctx.translate(c.x, c.y - bob);
    ctx.scale(1.18 * c.size * c.dir, 1.18 * c.size); // draws facing right; dir flips it
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // ---- legs ----
    const legCol = era === "futuristic" ? "#9fb4d9" : era === "industrial" ? "#454d57" : era === "stone_age" ? "#8a5a33" : "#5a4636";
    for (const sgn of [-1, 1]) {
      const a = step * 0.7 * sgn;
      const kx = Math.sin(a) * 5, fx = Math.sin(a) * 6.5, fy = -Math.max(0, -Math.cos(a)) * 0;
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(sgn * 2.2, -14); ctx.lineTo(kx + sgn * 2.2, -7); ctx.lineTo(fx + sgn * 2.2, -1 + fy); ctx.stroke();
      ctx.strokeStyle = legCol; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(sgn * 2.2, -14); ctx.lineTo(kx + sgn * 2.2, -7); ctx.lineTo(fx + sgn * 2.2, -1 + fy); ctx.stroke();
      // shoe
      ctx.fillStyle = era === "stone_age" ? "#6b4423" : "#3b2a1a";
      ctx.beginPath(); ctx.ellipse(fx + sgn * 2.2 + 1.5, 0 + fy, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }

    // ---- back arm ----
    const armBack = walking ? -step * 0.8 : 0.25 + Math.sin(ph * 0.5) * 0.1;
    const arm = (ang, hand) => {
      ctx.save();
      ctx.translate(0, -27);
      ctx.rotate(ang);
      ctx.strokeStyle = INK; ctx.lineWidth = 5.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.stroke();
      ctx.strokeStyle = outfit; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); ctx.stroke();
      ctx.fillStyle = c.skin; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 10.5, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (hand) { ctx.translate(0, 10.5); hand(); }
      ctx.restore();
    };
    arm(armBack);

    // ---- torso (outfit changes with the era) ----
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6;
    ctx.fillStyle = vGrad(ctx, outfit, -32, 20);
    rrect(ctx, -7.5, -32, 15, 19, 6);
    ctx.fill(); ctx.stroke();
    ctx.save(); rrect(ctx, -7.5, -32, 15, 19, 6); ctx.clip();
    if (era === "stone_age") {                       // ragged fur tunic with spots
      ctx.fillStyle = darken(outfit, 0.3);
      for (const [x, y] of [[-3, -26], [3, -22], [-1, -18], [4, -28]]) { ctx.beginPath(); ctx.ellipse(x, y, 1.8, 1.3, 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = outfit; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-7.5, -17); for (let i = 0; i < 5; i++) { ctx.lineTo(-7.5 + i * 3.75 + 1.9, -12); ctx.lineTo(-7.5 + (i + 1) * 3.75, -17); } ctx.stroke();
    } else if (era === "ancient") {                   // toga sash
      ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-8, -31); ctx.lineTo(8, -15); ctx.stroke();
    } else if (era === "medieval") {                  // belt and collar
      ctx.fillStyle = "#4a3320"; ctx.fillRect(-8, -20, 16, 3); ctx.fillStyle = "#d4a017"; ctx.fillRect(-1.5, -20.5, 3, 4);
    } else if (era === "industrial") {                // vest with buttons
      ctx.fillStyle = darken(outfit, 0.25); ctx.fillRect(-8, -31, 5, 19); ctx.fillRect(3, -31, 5, 19);
      ctx.fillStyle = "#d9c27a"; for (const y of [-27, -22, -17]) { ctx.beginPath(); ctx.arc(0, y, 0.9, 0, Math.PI * 2); ctx.fill(); }
    } else {                                          // futuristic suit with glow lines
      ctx.strokeStyle = "#35d6ff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3, -31); ctx.lineTo(-3, -14); ctx.moveTo(3, -31); ctx.lineTo(3, -14); ctx.stroke();
      ctx.fillStyle = "#35d6ff"; ctx.fillRect(-4, -20, 8, 2);
    }
    ctx.restore();

    // ---- head ----
    ctx.save();
    ctx.translate(0, -40);
    ctx.fillStyle = INK;                              // hair (back layer)
    ctx.fillStyle = c.hair;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(-0.6, -0.5, 8.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = vGrad(ctx, c.skin, -8, 16, 0.2, 0.14);
    ctx.beginPath(); ctx.ellipse(1.2, 0.6, 7.3, 7.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.6; ctx.stroke();
    // face: eyes, blush, smile
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    for (const ex of [2.4, 6]) { ctx.beginPath(); ctx.ellipse(ex, 0, 1.7, 2.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = INK;
    for (const ex of [2.9, 6.4]) { ctx.beginPath(); ctx.arc(ex, 0.2, 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "rgba(235,100,100,.35)"; ctx.beginPath(); ctx.ellipse(5.2, 3.6, 1.7, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(4.4, 3.2, 2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // hair front + head gear by era
    ctx.fillStyle = c.hair; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
    if (era === "stone_age") {                        // wild tufts
      for (const [x, y, r] of [[-4, -7, 3.2], [0, -9, 3.6], [4, -7.5, 3.2]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else if (era === "ancient") {                   // headband
      ctx.beginPath(); ctx.arc(0.4, -3, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#d4a017"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-6.6, -3.4); ctx.lineTo(8, -3.4); ctx.stroke();
    } else if (era === "medieval") {                  // pointed cap with feather
      ctx.fillStyle = outfit === "#c0503a" ? "#3f7cac" : "#c0503a";
      ctx.beginPath(); ctx.moveTo(-8, -3); ctx.quadraticCurveTo(0, -17, 10, -9); ctx.quadraticCurveTo(6, -4, 8, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#f4efe0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -9); ctx.quadraticCurveTo(10, -14, 14, -10); ctx.stroke();
    } else if (era === "industrial") {                // flat cap
      ctx.fillStyle = "#565f68";
      ctx.beginPath(); ctx.ellipse(0.5, -5.5, 8.8, 4.4, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(8, -3.4, 4.6, 1.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else {                                          // visor
      ctx.fillStyle = "rgba(53,214,255,.55)"; ctx.strokeStyle = "#1b9bc4"; ctx.lineWidth = 1.4;
      rrect(ctx, -3, -3.4, 12.5, 6.6, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.hair; ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, -3, 8, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // ---- front arm (works with a tool) ----
    if (tool) {
      const swing = Math.sin(this.t * 7 + c.phase);
      arm(-1.9 + swing * 0.7, () => { ctx.rotate(0.5 + swing * 0.3); this._drawTool(ctx, tool); });
    } else {
      arm(walking ? step * 0.8 : -0.2);
    }
    ctx.restore();

    // ---- speech bubble for idle citizens ----
    if (!c.working) {
      c.emote -= this._dt;
      if (c.emote <= 0) { c.emoting = 2.2; c.emote = 14 + Math.random() * 22; }
      if (c.emoting > 0) {
        c.emoting -= this._dt;
        const a = Math.min(1, c.emoting * 2);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(c.x + 14, c.y - 66 - (2.2 - c.emoting) * 3);
        ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 2;
        rrect(ctx, -10, -9, 20, 17, 6); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-9, 13); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#e0555d"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(["\u2665", "\u266a", "!", "\u2605"][Math.floor(c.phase * 3) % 4], 0, 4);
        ctx.restore();
      }
    }
  }
}
