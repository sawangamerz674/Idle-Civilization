/**
 * EraBackground - era-specific sky, distant scenery and ground texture.
 * (Extra file beyond the original structure list: it keeps era art out of
 * CivilizationRenderer so each era can be restyled or replaced by images later.)
 * Pure drawing; reads the era definition from data/eras.json.
 */
const TAU = Math.PI * 2;
const INK = "#3b2a1a";

export class EraBackground {
  constructor() {
    this.stars = Array.from({ length: 70 }, (_, i) => ({
      x: (i * 97.3) % 960, y: (i * 53.7) % 230, r: 0.8 + (i % 3) * 0.5, p: i
    }));
  }

  draw(ctx, era, t, w, h, groundY) {
    this._sky(ctx, era, t, w, groundY);
    this._far(ctx, era, t, w, groundY);
    this._hills(ctx, era, w, groundY);
    this._ground(ctx, era, t, w, h, groundY);
  }

  // ---- sky and celestial body ----
  _sky(ctx, era, t, w, groundY) {
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, era.sky[0]);
    g.addColorStop(1, era.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, groundY + 2);

    if (era.id === "futuristic") {
      ctx.fillStyle = "#fff";
      for (const s of this.stars) {
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 2 + s.p);
        ctx.beginPath();
        ctx.arc(s.x % w, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // moon
      ctx.fillStyle = "#f4f1ff";
      ctx.beginPath();
      ctx.arc(w * 0.82, 90, 34, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(160,150,200,.5)";
      ctx.beginPath(); ctx.arc(w * 0.82 - 10, 82, 7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.82 + 12, 100, 5, 0, TAU); ctx.fill();
      return;
    }
    const sunColor = era.id === "industrial" ? "rgba(255,220,170,.65)" : era.id === "ancient" ? "rgba(255,226,140,.95)" : "rgba(255,244,163,.9)";
    const sx = w * 0.82, sy = 90 + Math.sin(t * 0.3) * 4, sr = era.id === "ancient" ? 46 : 38;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4.2);
    glow.addColorStop(0, "rgba(255,240,190,.55)");
    glow.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 4.2, sy - sr * 4.2, sr * 8.4, sr * 8.4);
    // slow rotating light rays
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.03);
    ctx.fillStyle = "rgba(255,248,210,.09)";
    for (let i = 0; i < 9; i++) { ctx.rotate(TAU / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sr * 7, -sr * 0.5); ctx.lineTo(sr * 7, sr * 0.5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath(); ctx.arc(sx - sr * 0.25, sy - sr * 0.25, sr * 0.6, 0, TAU); ctx.fill();
    this._clouds(ctx, era, t, w);
    this._birds(ctx, era, t, w);
  }

  _clouds(ctx, era, t, w) {
    const dark = era.id === "industrial";
    for (let i = 0; i < 6; i++) {
      const x = ((i * 190 + t * (5 + i * 1.7)) % (w + 260)) - 130;
      const y = 42 + (i % 3) * 34 + i * 7;
      const k = 0.8 + (i % 3) * 0.25;
      ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
      // soft underside, then body puffs with a lit top
      ctx.fillStyle = dark ? "rgba(70,66,62,.35)" : "rgba(150,170,200,.28)";
      ctx.beginPath(); ctx.ellipse(0, 9, 52, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = dark ? "rgba(140,134,126,.7)" : "rgba(255,255,255,.92)";
      for (const [px, py, r] of [[-30, 2, 15], [-12, -6, 20], [10, -9, 22], [32, -1, 16], [0, 3, 22]]) {
        ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = dark ? "rgba(190,184,176,.35)" : "rgba(255,255,255,.6)";
      ctx.beginPath(); ctx.arc(8, -14, 12, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  _birds(ctx, era, t, w) {
    if (era.id === "industrial") return;
    ctx.strokeStyle = "rgba(40,40,60,.55)"; ctx.lineWidth = 1.8; ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const x = ((t * (26 + i * 5) + i * 230) % (w + 80)) - 40;
      const y = 70 + i * 17 + Math.sin(t * 0.8 + i) * 10;
      const f = Math.sin(t * 7 + i * 2) * 4;
      ctx.beginPath(); ctx.moveTo(x - 8, y - f); ctx.quadraticCurveTo(x - 3, y - 4, x, y); ctx.quadraticCurveTo(x + 3, y - 4, x + 8, y - f); ctx.stroke();
    }
  }

  // ---- distant scenery per era ----
  _far(ctx, era, t, w, gy) {
    switch (era.id) {
      case "stone_age": return this._farStone(ctx, w, gy);
      case "ancient": return this._farAncient(ctx, t, w, gy);
      case "medieval": return this._farMedieval(ctx, t, w, gy);
      case "industrial": return this._farIndustrial(ctx, t, w, gy);
      case "futuristic": return this._farFuture(ctx, t, w, gy);
    }
  }

  _tri(ctx, pts, fill, stroke = false) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke(); }
  }

  _pine(ctx, x, y, s) {
    ctx.fillStyle = "#6b4a2d";
    ctx.fillRect(x - 3 * s, y - 10 * s, 6 * s, 12 * s);
    for (let i = 0; i < 3; i++) this._tri(ctx, [[x - (22 - i * 4) * s, y - (6 + i * 18) * s], [x, y - (34 + i * 18) * s], [x + (22 - i * 4) * s, y - (6 + i * 18) * s]], "#2f7d46");
  }

  _farStone(ctx, w, gy) {
    this._tri(ctx, [[60, gy - 10], [210, gy - 150], [360, gy - 10]], "#9a8f86");
    this._tri(ctx, [[180, gy - 10], [210, gy - 150], [250, gy - 10]], "#b7aea6");
    this._tri(ctx, [[560, gy - 10], [720, gy - 170], [900, gy - 10]], "#8d837b");
    this._tri(ctx, [[670, gy - 10], [720, gy - 170], [770, gy - 10]], "#aaa29a");
    this._tri(ctx, [[690, gy - 120], [720, gy - 170], [752, gy - 120]], "#f4f6f8");
    for (const [x, s] of [[110, 0.8], [430, 0.7], [520, 0.9], [905, 0.8]]) this._pine(ctx, x, gy - 4, s);
  }

  _farAncient(ctx, t, w, gy) {
    this._tri(ctx, [[120, gy - 8], [260, gy - 120], [400, gy - 8]], "#d9b266", true);
    this._tri(ctx, [[260, gy - 120], [400, gy - 8], [300, gy - 8]], "#bf9548");
    this._tri(ctx, [[580, gy - 8], [680, gy - 84], [780, gy - 8]], "#d9b266", true);
    this._tri(ctx, [[680, gy - 84], [780, gy - 8], [710, gy - 8]], "#bf9548");
    // palms
    for (const [x, s] of [[70, 1], [470, 0.85], [880, 1]]) {
      ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 5; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.quadraticCurveTo(x + 10 * s, gy - 30 * s, x + 4 * s, gy - 62 * s); ctx.stroke();
      ctx.strokeStyle = "#3f9b4a"; ctx.lineWidth = 5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(x + 4 * s, gy - 62 * s);
        ctx.quadraticCurveTo(x + 4 * s + i * 14 * s, gy - 82 * s + Math.abs(i) * 4, x + 4 * s + i * 24 * s, gy - 60 * s + Math.abs(i) * 8 + Math.sin(t * 2 + i) * 2);
        ctx.stroke();
      }
    }
  }

  _farMedieval(ctx, t, w, gy) {
    // blue-grey distant castle
    const x = 700;
    ctx.fillStyle = "#8c97ad";
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.fillRect(x - 70, gy - 70, 140, 66);
    for (let i = 0; i < 7; i++) ctx.fillRect(x - 70 + i * 21, gy - 80, 12, 10);
    for (const dx of [-90, 70]) {
      ctx.fillRect(x + dx, gy - 104, 24, 100);
      this._tri(ctx, [[x + dx - 4, gy - 104], [x + dx + 12, gy - 136], [x + dx + 28, gy - 104]], "#b5483c");
    }
    ctx.fillRect(x - 12, gy - 126, 24, 122);
    this._tri(ctx, [[x - 16, gy - 126], [x, gy - 162], [x + 16, gy - 126]], "#b5483c");
    // flag
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, gy - 162); ctx.lineTo(x, gy - 182); ctx.stroke();
    this._tri(ctx, [[x, gy - 182], [x + 16 + Math.sin(t * 4) * 3, gy - 176], [x, gy - 170]], "#ffd166");
    // forest balls
    for (const [fx, s] of [[90, 1], [200, 0.8], [440, 0.9], [560, 1.1], [900, 0.9]]) {
      ctx.fillStyle = "#3a7d44";
      ctx.beginPath(); ctx.arc(fx, gy - 24 * s, 26 * s, 0, TAU); ctx.arc(fx + 22 * s, gy - 14 * s, 20 * s, 0, TAU); ctx.fill();
    }
  }

  _farIndustrial(ctx, t, w, gy) {
    ctx.fillStyle = "#6d6962";
    const blocks = [[40, 70, 60], [110, 100, 50], [250, 60, 80], [420, 90, 60], [560, 80, 70], [820, 110, 56]];
    for (const [x, h, bw] of blocks) {
      ctx.fillRect(x, gy - h, bw, h);
      ctx.fillStyle = "#58544e";
      ctx.fillRect(x + bw - 14, gy - h - 40, 12, 40);
      ctx.fillStyle = "#6d6962";
    }
    // smoke columns
    ctx.fillStyle = "rgba(90,88,84,.5)";
    for (const [x, h, bw] of blocks) {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.2 + i / 3 + x * 0.01) % 1;
        ctx.globalAlpha = 0.6 * (1 - p);
        ctx.beginPath();
        ctx.arc(x + bw - 8 + p * 30, gy - h - 44 - p * 70, 8 + p * 14, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _farFuture(ctx, t, w, gy) {
    const towers = [[30, 130, 34], [100, 200, 28], [180, 110, 40], [330, 170, 30], [470, 120, 36], [600, 210, 30], [720, 140, 40], [840, 180, 32]];
    for (const [x, h, bw] of towers) {
      const g = ctx.createLinearGradient(0, gy - h, 0, gy);
      g.addColorStop(0, "#5a6bb0"); g.addColorStop(1, "#2c3566");
      ctx.fillStyle = g;
      ctx.fillRect(x, gy - h, bw, h);
      this._tri(ctx, [[x + bw / 2 - 3, gy - h], [x + bw / 2, gy - h - 22], [x + bw / 2 + 3, gy - h]], "#8ee9ff");
      for (let r = 0; r < h / 18 - 1; r++) {
        for (let c = 0; c < 2; c++) {
          if ((r * 3 + c * 5 + x) % 4 === 0) continue;
          ctx.fillStyle = (r + c) % 3 ? "#7ef0ff" : "#ffe9a8";
          ctx.fillRect(x + 6 + c * (bw / 2 - 2), gy - h + 10 + r * 18, 5, 8);
        }
      }
    }
    // flying ships
    for (let i = 0; i < 2; i++) {
      const x = ((t * (24 + i * 14) + i * 480) % (w + 160)) - 80;
      const y = 120 + i * 50;
      ctx.fillStyle = "#e8f0ff";
      ctx.beginPath(); ctx.ellipse(x, y, 20, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7ef0ff";
      ctx.beginPath(); ctx.ellipse(x + 6, y - 4, 7, 4, 0, 0, TAU); ctx.fill();
    }
  }

  // ---- hills and ground ----
  _hills(ctx, era, w, gy) {
    const fut = era.id === "futuristic";
    for (let layer = 0; layer < 3; layer++) {
      const amp = 16 + layer * 7, lift = 14 + (2 - layer) * 14, f = 0.008 + layer * 0.004;
      const g = ctx.createLinearGradient(0, gy - lift - amp, 0, gy);
      g.addColorStop(0, era.ground);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = era.ground;
      ctx.globalAlpha = (fut ? 0.2 : 0.32) + layer * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, gy - lift - Math.sin(x * f + layer * 2) * amp * 0.6 - Math.sin(x * f * 2.3 + layer) * amp * 0.25);
      ctx.lineTo(w, gy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // atmospheric haze at the horizon
    const h = ctx.createLinearGradient(0, gy - 70, 0, gy);
    h.addColorStop(0, "rgba(255,255,255,0)");
    h.addColorStop(1, fut ? "rgba(120,100,200,.22)" : "rgba(255,255,255,.28)");
    ctx.fillStyle = h;
    ctx.fillRect(0, gy - 70, w, 70);
  }

  _ground(ctx, era, t, w, h, gy) {
    ctx.fillStyle = era.ground;
    ctx.fillRect(0, gy, w, h - gy);
    const gg = ctx.createLinearGradient(0, gy, 0, h);
    gg.addColorStop(0, "rgba(255,255,255,.14)");
    gg.addColorStop(0.35, "rgba(255,255,255,0)");
    gg.addColorStop(1, "rgba(0,0,0,.28)");
    ctx.fillStyle = gg;
    ctx.fillRect(0, gy, w, h - gy);
    ctx.fillStyle = "rgba(0,0,0,.14)";
    ctx.fillRect(0, gy, w, 5);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(0, gy + 5, w, 2);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, gy + 6, w, h - gy - 6); ctx.clip();
    if (era.id === "stone_age" || era.id === "medieval") {
      ctx.strokeStyle = "rgba(30,90,40,.55)"; ctx.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const x = (i * 83) % w, y = gy + 18 + ((i * 47) % (h - gy - 24));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 7); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 7); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.stroke();
      }
      const petals = ["#ffd54a", "#ff8fb1", "#ffffff", "#b79cff"];
      for (let i = 0; i < 26; i++) {
        const x = (i * 131 + 40) % w, y = gy + 20 + ((i * 59) % Math.max(1, h - gy - 30));
        ctx.fillStyle = petals[i % 4];
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
        ctx.fillStyle = "#f6c23e"; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill();
      }
    } else if (era.id === "ancient") {
      ctx.fillStyle = "rgba(150,110,50,.35)";
      for (let i = 0; i < 50; i++) { ctx.beginPath(); ctx.arc((i * 71) % w, gy + 14 + ((i * 37) % (h - gy - 20)), 2 + (i % 3), 0, TAU); ctx.fill(); }
    } else if (era.id === "industrial") {
      ctx.strokeStyle = "rgba(40,38,34,.35)"; ctx.lineWidth = 2;
      for (let y = gy + 22; y < h; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let x = 0; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, gy + 6); ctx.lineTo(x - 30, h); ctx.stroke(); }
    } else if (era.id === "futuristic") {
      ctx.strokeStyle = "rgba(94,230,255,.35)"; ctx.lineWidth = 2;
      for (let y = gy + 20; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let x = -w; x < w * 2; x += 70) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(w / 2 + (x - w / 2) * 0.25, gy + 6); ctx.stroke(); }
      const pulse = (t * 80) % w;
      ctx.fillStyle = "rgba(94,230,255,.25)";
      ctx.fillRect(pulse, gy + 6, 40, 4);
    }
    ctx.restore();
  }
}
