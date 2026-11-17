/**
 * AnimationManager - short-lived canvas effects: floating text and spark bursts.
 * Other code calls spawn*(); CivilizationRenderer calls update/draw each frame.
 */
export class AnimationManager {
  constructor() {
    this.effects = [];
  }

  spawnFloatingText(x, y, text, color = "#fff") {
    this.effects.push({ type: "text", x, y, text, color, life: 1.2, max: 1.2 });
  }

  /** Radial burst of sparks (unlock / construction effect). */
  spawnBurst(x, y, color = "#ffe27a", count = 16) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 140;
      this.effects.push({
        type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        color, size: 2.5 + Math.random() * 3, life: 0.9, max: 0.9
      });
    }
  }

  update(dt) {
    for (const e of this.effects) {
      e.life -= dt;
      if (e.type === "spark") {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 260 * dt;
      } else {
        e.y -= 28 * dt;
      }
    }
    this.effects = this.effects.filter((e) => e.life > 0);
  }

  draw(ctx) {
    for (const e of this.effects) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, e.life / e.max);
      if (e.type === "spark") {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(30,20,11,.8)";
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, e.x, e.y);
      }
      ctx.restore();
    }
  }
}
