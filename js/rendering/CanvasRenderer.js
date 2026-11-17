/**
 * CanvasRenderer - owns the <canvas>, handles resolution/resizing, and
 * delegates drawing to the scene renderer (CivilizationRenderer).
 * Logical resolution is fixed (cfg.canvas); CSS scales it to fit.
 */
export class CanvasRenderer {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.scene = null;
    this.quality = "auto";
    this._autoScale = 1;   // lowered by the auto quality governor
    this._slow = 0;
    this.canvas.width = width;
    this.canvas.height = height;
    // Narrow (portrait) screens show the scene larger and pan across it: drag to pan,
    // otherwise it drifts slowly left and right.
    this.pan = 0.5;       // 0..1 across the hidden part of the scene
    this._panDir = 1;
    this._idle = 5;       // seconds since the player last dragged
    this._drag = null;
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointerdown", (e) => {
      this._drag = { x: e.clientX, pan: this.pan };
      this._idle = 0;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this._drag || !this._range) return;
      this.pan = Math.min(1, Math.max(0, this._drag.pan - ((e.clientX - this._drag.x) * (window.devicePixelRatio || 1)) / this._range));
      this._idle = 0;
    });
    const end = () => (this._drag = null);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
  }

  setScene(scene) {
    this.scene = scene;
  }

  /** Match backing store to displayed size for crisp rendering on HiDPI screens. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Quality: low = 1x, high = up to 2x, ultra = up to 3x, auto = native (max 3x) with
    // an automatic step down when the frame rate is poor.
    // Auto stays at 2x on low-memory devices and small screens (phones), as CrazyGames advises.
    const lowMem = (navigator.deviceMemory && navigator.deviceMemory <= 4) || Math.min(screen.width, screen.height) <= 820;
    const cap = { low: 1, high: 2, ultra: 3, auto: lowMem ? 2 : 3 }[this.quality] ?? 3;
    const dpr = Math.min(window.devicePixelRatio || 1, cap) * this._autoScale;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setQuality(q) {
    this.quality = q;
    this._autoScale = 1;
    this._slow = 0;
  }

  /** Auto quality: if frames stay slow for ~3 s, render at a lower resolution (never below 1x). */
  _governor(dt) {
    if (this.quality !== "auto") return;
    this._slow = dt > 0.026 ? this._slow + dt : Math.max(0, this._slow - dt * 2);
    if (this._slow > 3 && this._autoScale > 0.6) {
      this._autoScale = Math.max(0.6, this._autoScale - 0.2);
      this._slow = 0;
    }
  }

  render(dt) {
    this._governor(dt);
    this.resize();
    const ctx = this.ctx;
    const sx = this.canvas.width / this.width;
    const sy = this.canvas.height / this.height;
    // Wide screens: letterbox. Narrow screens: zoom in (up to 1.7x) and pan across the scene.
    const fit = Math.min(sx, sy);
    const portrait = this.canvas.width / this.canvas.height < 1.6; // tall or squarish area: zoom in and pan
    const s = portrait ? Math.min(Math.max(sx, sy), fit * 1.7) : fit;
    const range = Math.max(0, this.width * s - this.canvas.width); // hidden width in device pixels
    this._range = range;
    if (range > 0 && !this._drag) {
      this._idle += dt;
      if (this._idle > 4) {
        this.pan += this._panDir * dt * (60 / range); // about 60 device px per second
        if (this.pan >= 1) { this.pan = 1; this._panDir = -1; }
        if (this.pan <= 0) { this.pan = 0; this._panDir = 1; }
      }
    }
    const ox = range > 0 ? -range * this.pan : (this.canvas.width - this.width * s) / 2;
    const oy = (this.canvas.height - this.height * s) / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Fill the whole canvas with the era's sky and ground so there are no black bars.
    if (this.scene?.fillBackdrop) this.scene.fillBackdrop(ctx, this.canvas.width, this.canvas.height, oy, oy + this.height * 0.62 * s);
    else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.width, this.height);
    ctx.clip();
    if (this.scene) this.scene.render(ctx, dt, this.width, this.height);
    ctx.restore();
  }
}
