/**
 * BuildingRenderer - lays out and draws the settlement's buildings.
 *
 * Layout: owned building types are shown on two rows (back row smaller). Every owned
 * type gets one copy first (newest era first); spare space is filled with extra copies
 * (up to MAX_PER_TYPE each). The layout is cached and rebuilt only when owned counts
 * change. `slotsById` is shared with CitizenRenderer so workers walk to their building.
 * Sprites are drawn procedurally (original art, no image files needed); Phase 8 can
 * swap in PNGs from def.asset. Flat sprites (roads, rails) are drawn under everything.
 *
 * Reads GameState only.
 */
import { parseHex, vGrad, hGrad, sphereGrad, softShadow, rrect, lighten, darken } from "./ArtKit.js";

const MAX_PER_TYPE = 3;
const MAX_VISIBLE = 18;
const INK = "#3b2a1a";
const TAU = Math.PI * 2;
const FLAT = new Set(["road", "railway"]);

// ---------- drawing helpers (shaded, with highlights and fine detail) ----------
function style(ctx, fill, width = 4) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}
const isGrey = (c) => { const p = parseHex(c); return !!p && Math.max(...p) - Math.min(...p) < 26; };

/** Rounded, gradient-shaded block with a lit top edge, a shaded base and plank / brick detail. */
function box(ctx, x, y, w, h, fill) {
  style(ctx, vGrad(ctx, fill, y, h));
  rrect(ctx, x, y, w, h, Math.min(4, h / 4, w / 4));
  ctx.fill();
  if (parseHex(fill) && w >= 28 && h >= 22) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(30,20,10,.13)";
    ctx.lineWidth = 1.3;
    if (isGrey(fill)) {                    // stone bricks
      const bh = 9;
      for (let r = 1; y + r * bh < y + h - 2; r++) {
        ctx.beginPath(); ctx.moveTo(x, y + r * bh); ctx.lineTo(x + w, y + r * bh); ctx.stroke();
        for (let c = (r % 2) * 7; c < w; c += 14) { ctx.beginPath(); ctx.moveTo(x + c, y + r * bh - bh); ctx.lineTo(x + c, y + r * bh); ctx.stroke(); }
      }
    } else {                               // wooden planks
      for (let c = 9; c < w - 2; c += 9) { ctx.beginPath(); ctx.moveTo(x + c, y + 2); ctx.lineTo(x + c, y + h - 2); ctx.stroke(); }
    }
    ctx.fillStyle = "rgba(0,0,0,.10)";
    ctx.fillRect(x, y + h - 5, w, 5);      // ground shade
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.fillRect(x, y, w, 3);              // top light
    ctx.restore();
  }
  style(ctx, "none");
  rrect(ctx, x, y, w, h, Math.min(4, h / 4, w / 4));
  ctx.stroke();
}
function ell(ctx, x, y, rx, ry, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  ctx.fillStyle = sphereGrad(ctx, fill);
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
  style(ctx, "none");
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.stroke();
}
function tri(ctx, pts, fill) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  style(ctx, hGrad(ctx, fill, minX, maxX - minX));
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  if (pts.length === 3 && maxX - minX > 36 && maxY - minY > 14 && parseHex(fill)) {
    // roof texture: shingle rows clipped to the roof, plus a lit ridge
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(40,24,8,.2)";
    ctx.lineWidth = 1.4;
    for (let yy = minY + 8; yy < maxY; yy += 8) {
      ctx.beginPath(); ctx.moveTo(minX, yy); ctx.lineTo(maxX, yy); ctx.stroke();
      for (let xx = minX + ((yy / 8) % 2) * 7; xx < maxX; xx += 14) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 8); ctx.stroke(); }
    }
    ctx.restore();
  }
  style(ctx, "none");
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.stroke();
}
function line(ctx, x1, y1, x2, y2, width = 3, color = INK) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function smoke(ctx, t, x, y, color = "#ffffff", n = 3) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const p = (t * 0.35 + i / n) % 1;
    ctx.globalAlpha = 0.7 * (1 - p);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + Math.sin(p * 6 + i) * 5 + p * 10, y - p * 40, 5 + p * 8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
function glow(ctx, x, y, r, color, alpha = 0.6) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function gear(ctx, x, y, r, rot, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  style(ctx, fill, 3);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const rr = i % 2 ? r * 0.78 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function windows(ctx, x, y, cols, rows, w, h, gx, gy, lit = "#ffe9a8", dark = "#7fa3c2") {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + c * (w + gx), wy = y + r * (h + gy);
      const on = (r * 3 + c * 5) % 4 !== 0;
      ctx.fillStyle = on ? lit : dark;
      ctx.fillRect(wx, wy, w, h);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      ctx.fillRect(wx, wy, w, Math.max(1, h * 0.28));
      ctx.strokeStyle = "rgba(59,42,26,.7)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(wx, wy, w, h);
    }
  }
}

// ---------- sprites (base centered at 0,0; about 100 wide, up to ~95 tall) ----------
const SPRITES = {
  // ===== Stone Age =====
  hut(ctx) {
    box(ctx, -34, -44, 68, 44, "#b98a5a");
    tri(ctx, [[-46, -44], [0, -90], [46, -44]], "#e2b45c");
    box(ctx, -9, -26, 18, 26, "#5a3f27");
  },

  farm(ctx, t, s) {
    box(ctx, -48, -30, 96, 30, "#8b5a2b");
    ctx.strokeStyle = "rgba(59,42,26,.45)";
    ctx.lineWidth = 2;
    for (let r = 1; r < 3; r++) {
      ctx.beginPath();
      ctx.moveTo(-46, -30 + r * 10);
      ctx.lineTo(46, -30 + r * 10);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      for (let r = 0; r < 3; r++) {
        const sway = Math.sin(t * 2 + i + r) * (s.working ? 3 : 1.2);
        line(ctx, -38 + i * 15, -6 - r * 10, -38 + i * 15 + sway, -18 - r * 10, 3, "#2e7d32");
        ell(ctx, -38 + i * 15 + sway, -20 - r * 10, 4, 4, "#8bc34a");
      }
    }
  },

  woodcutter(ctx, t, s) {
    box(ctx, -40, -38, 54, 38, "#a9744a");
    tri(ctx, [[-46, -38], [-13, -66], [20, -38]], "#7a4b2a");
    box(ctx, -12, -22, 14, 22, "#4a3220");
    for (let i = 0; i < 3; i++) ell(ctx, 28 + (i % 2) * 14, -8 - Math.floor(i / 2) * 14, 8, 8, "#c58b5c");
    box(ctx, 34, -18, 16, 18, "#8a5a36");
    ctx.save();
    ctx.translate(42, -34);
    ctx.rotate(s.working ? Math.sin(t * 6) * 0.7 - 0.3 : -0.4);
    line(ctx, 0, 0, 0, -26, 4);
    box(ctx, -2, -30, 12, 9, "#b0b7bd");
    ctx.restore();
  },

  stone_collector(ctx, t, s) {
    ell(ctx, -22, -14, 22, 14, "#9aa3ab");
    ell(ctx, 8, -24, 20, 18, "#b4bcc3");
    ell(ctx, 30, -10, 16, 10, "#8b949c");
    box(ctx, -46, -8, 28, 10, "#8a5a36");
    ell(ctx, -40, 4, 6, 6, "#4a3220");
    ell(ctx, -24, 4, 6, 6, "#4a3220");
    ctx.save();
    ctx.translate(38, -32);
    ctx.rotate(s.working ? Math.sin(t * 5) * 0.6 : 0.3);
    line(ctx, 0, 12, 0, -22, 4);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, -20);
    ctx.quadraticCurveTo(0, -30, 12, -20);
    ctx.stroke();
    ctx.restore();
  },

  storage_pit(ctx) {
    ell(ctx, 0, -8, 46, 16, "#6b4a2d");
    ell(ctx, 0, -12, 36, 11, "#3b2a1a");
    style(ctx, "#e2b45c");
    ctx.beginPath();
    ctx.moveTo(-44, -14);
    ctx.quadraticCurveTo(0, -78, 44, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(59,42,26,.5)";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, -18);
      ctx.lineTo(i * 6, -50);
      ctx.stroke();
    }
  },

  // ===== Ancient =====
  stone_house(ctx) {
    box(ctx, -36, -46, 72, 46, "#bdb5a6");
    ctx.strokeStyle = "rgba(59,42,26,.35)";
    ctx.lineWidth = 2;
    for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(-34, -46 + r * 11.5); ctx.lineTo(34, -46 + r * 11.5); ctx.stroke(); }
    tri(ctx, [[-46, -46], [0, -88], [46, -46]], "#c2553a");
    box(ctx, -9, -26, 18, 26, "#5a3f27");
    box(ctx, 14, -38, 14, 12, "#bfe3ff");
  },

  market(ctx, t, s) {
    box(ctx, -40, -22, 80, 22, "#c58b5c");
    line(ctx, -40, -22, -40, -60, 4);
    line(ctx, 40, -22, 40, -60, 4);
    for (let i = 0; i < 6; i++) box(ctx, -42 + i * 14, -62, 14, 22, i % 2 ? "#ffffff" : "#e63946");
    box(ctx, -32, -36, 16, 14, "#a9744a");
    ell(ctx, 4, -30, 7, 7, "#e63946");
    ell(ctx, 18, -30, 7, 7, "#ffb703");
    if (s.working) {
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(8, -78 - Math.abs(Math.sin(t * 4)) * 8, 6, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  },

  workshop(ctx, t, s) {
    box(ctx, -40, -44, 80, 44, "#9c7a54");
    tri(ctx, [[-46, -44], [-30, -64], [46, -64], [46, -44]], "#6b4a2d");
    box(ctx, -30, -26, 18, 26, "#4a3220");
    box(ctx, 8, -34, 22, 14, "#bfe3ff");
    gear(ctx, 24, -78, 14, s.working ? t * 2 : 0, "#b0b7bd");
    gear(ctx, 42, -66, 9, s.working ? -t * 3.2 : 0, "#9aa3ab");
    box(ctx, -12, -10, 22, 10, "#555");
  },

  library(ctx, t, s) {
    box(ctx, -50, -6, 100, 6, "#d9cfae");
    for (let i = 0; i < 4; i++) box(ctx, -38 + i * 25, -50, 12, 44, "#f1ead7");
    tri(ctx, [[-48, -50], [0, -84], [48, -50]], "#d9cfae");
    box(ctx, -42, -56, 84, 7, "#e6dcbc");
    ell(ctx, 0, -62, 6, 6, "#8ecae6");
    if (s.working) {
      ctx.fillStyle = "#8ecae6";
      ctx.beginPath();
      ctx.arc(0, -98 - Math.abs(Math.sin(t * 3)) * 6, 5, 0, TAU);
      ctx.fill();
    }
  },

  road(ctx) {
    ell(ctx, 0, -6, 54, 12, "#a7a091");
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? "#c4bdad" : "#8f897b";
      ctx.beginPath();
      ctx.ellipse(-40 + i * 10, -6 + ((i * 7) % 8) - 4, 5, 3, 0, 0, TAU);
      ctx.fill();
    }
  },

  // ===== Medieval =====
  castle(ctx, t) {
    box(ctx, -26, -72, 52, 72, "#a8aab0");
    for (let i = 0; i < 4; i++) box(ctx, -26 + i * 14, -82, 10, 10, "#a8aab0");
    for (const dx of [-52, 30]) {
      box(ctx, dx, -54, 22, 54, "#9a9ca3");
      tri(ctx, [[dx - 4, -54], [dx + 11, -82], [dx + 26, -54]], "#c1443a");
    }
    style(ctx, "#2b2118");
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(-10, -22); ctx.arc(0, -22, 10, Math.PI, 0); ctx.lineTo(10, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    line(ctx, 0, -82, 0, -104, 3);
    tri(ctx, [[0, -104], [18 + Math.sin(t * 4) * 3, -98], [0, -92]], "#ffd166");
    box(ctx, -4, -52, 8, 12, "#bfe3ff");
  },

  blacksmith(ctx, t, s) {
    box(ctx, -38, -42, 60, 42, "#8a6a4a");
    tri(ctx, [[-44, -42], [-8, -66], [28, -42]], "#5b4636");
    box(ctx, 6, -78, 12, 30, "#777");
    smoke(ctx, t, 12, -80, "#9a9a9a", 3);
    box(ctx, -26, -24, 16, 24, "#2b2118");
    if (s.working) glow(ctx, -18, -14, 14, "#ff9d2e", 0.8);
    box(ctx, 28, -14, 22, 8, "#444");
    box(ctx, 34, -6, 10, 6, "#333");
    if (s.working) {
      ctx.fillStyle = "#ffd23f";
      for (let i = 0; i < 4; i++) {
        const p = (t * 2 + i / 4) % 1;
        ctx.globalAlpha = 1 - p;
        ctx.beginPath();
        ctx.arc(39 + Math.cos(i * 2.3) * p * 14, -18 - p * 16, 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },

  windmill(ctx, t, s) {
    tri(ctx, [[-22, 0], [22, 0], [14, -64], [-14, -64]], "#e8dcc2");
    tri(ctx, [[-18, -64], [0, -84], [18, -64]], "#b5523b");
    box(ctx, -7, -20, 14, 20, "#5a3f27");
    ctx.save();
    ctx.translate(0, -68);
    ctx.rotate(t * (s.working ? 1.6 : 0.5));
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      line(ctx, 0, 0, 0, -38, 3);
      box(ctx, -6, -38, 12, 24, "#f4efe0");
      ctx.restore();
    }
    ell(ctx, 0, 0, 5, 5, "#8a5a36");
    ctx.restore();
  },

  trading_center(ctx, t, s) {
    box(ctx, -50, -46, 100, 46, "#d8b878");
    box(ctx, -54, -62, 108, 16, "#a0522d");
    for (let i = 0; i < 3; i++) {
      style(ctx, "#5a3f27");
      ctx.beginPath();
      ctx.moveTo(-34 + i * 30, 0); ctx.lineTo(-34 + i * 30, -20); ctx.arc(-26 + i * 30, -20, 8, Math.PI, 0); ctx.lineTo(-18 + i * 30, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ell(ctx, 0, -80, 13, 13, s.working && Math.sin(t * 4) > 0 ? "#fff176" : "#ffd23f");
    ctx.fillStyle = INK;
    ctx.font = "bold 15px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("$", 0, -75);
    for (const dx of [-44, 44]) {
      line(ctx, dx, -62, dx, -84, 3);
      tri(ctx, [[dx, -84], [dx + (dx < 0 ? 14 : -14) + Math.sin(t * 4) * 2, -78], [dx, -72]], "#e63946");
    }
  },

  advanced_farm(ctx, t, s) {
    box(ctx, -50, -22, 62, 22, "#7a4a22");
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(t * 2 + i) * (s.working ? 3 : 1);
      line(ctx, -42 + i * 12, -4, -42 + i * 12 + sway, -16, 3, "#2e7d32");
      ell(ctx, -42 + i * 12 + sway, -19, 4, 5, "#f2c94c");
    }
    box(ctx, 16, -46, 34, 46, "#c0392b");
    tri(ctx, [[12, -46], [33, -72], [54, -46]], "#8e2a21");
    box(ctx, 26, -26, 14, 26, "#f4efe0");
    box(ctx, -52, -50, 14, 50, "#c9ccd1");
    ell(ctx, -45, -52, 7, 6, "#9aa3ab");
    ctx.strokeStyle = "#4aa3df";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.moveTo(-50, 6); ctx.lineTo(50, 6);
    ctx.stroke();
    ctx.setLineDash([]);
  },

  // ===== Industrial =====
  power_plant(ctx, t, s) {
    tri(ctx, [[-44, 0], [44, 0], [28, -38], [32, -80], [-32, -80], [-28, -38]], "#c9ccd1");
    ctx.strokeStyle = "rgba(59,42,26,.35)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-40 + i * 2, -i * 20); ctx.lineTo(40 - i * 2, -i * 20); ctx.stroke(); }
    smoke(ctx, t, 0, -82, "#ffffff", 4);
    box(ctx, 50, -86, 10, 86, "#e8e8e8");
    box(ctx, 50, -86, 10, 14, "#e63946");
    box(ctx, 50, -58, 10, 14, "#e63946");
    smoke(ctx, t + 0.5, 55, -88, "#7a7a7a", 3);
    tri(ctx, [[-4, -64], [10, -64], [2, -48], [8, -48], [-8, -26], [-2, -44], [-8, -44]], s.working ? "#ffe14d" : "#d9c54a");
  },

  factory(ctx, t, s) {
    box(ctx, -44, -50, 88, 50, "#a0523d");
    ctx.strokeStyle = "rgba(59,42,26,.3)";
    ctx.lineWidth = 2;
    for (let r = 1; r < 5; r++) { ctx.beginPath(); ctx.moveTo(-42, -50 + r * 10); ctx.lineTo(42, -50 + r * 10); ctx.stroke(); }
    for (let i = 0; i < 3; i++) tri(ctx, [[-44 + i * 30, -50], [-44 + i * 30, -66], [-14 + i * 30, -50]], "#7a3b2c");
    box(ctx, -34, -92, 12, 42, "#7a3b2c");
    box(ctx, -8, -86, 12, 36, "#7a3b2c");
    smoke(ctx, t, -28, -94, "#6e6e6e", 3);
    smoke(ctx, t + 0.4, -2, -88, "#6e6e6e", 3);
    windows(ctx, -34, -36, 4, 1, 12, 12, 8);
    box(ctx, 22, -22, 16, 22, "#3b2a1a");
  },

  mine(ctx, t, s) {
    style(ctx, "#8a7c6c");
    ctx.beginPath();
    ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-40, -76, 0, -80); ctx.quadraticCurveTo(40, -76, 50, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    box(ctx, -16, -34, 32, 34, "#2b2118");
    line(ctx, -16, -34, -16, 0, 5, "#8a5a36");
    line(ctx, 16, -34, 16, 0, 5, "#8a5a36");
    line(ctx, -16, -36, 16, -36, 5, "#8a5a36");
    // rails + cart
    line(ctx, -50, 3, 50, 3, 3);
    const cx = s.working ? Math.sin(t * 1.4) * 22 : 0;
    box(ctx, 22 + cx - 14, -14, 28, 12, "#6b5a4a");
    ell(ctx, 22 + cx - 7, 1, 5, 5, "#333");
    ell(ctx, 22 + cx + 11, 1, 5, 5, "#333");
    ell(ctx, 28 + cx, -17, 8, 4, "#3a3a3a");
    ell(ctx, -36, -8, 10, 8, "#9aa3ab");
  },

  railway(ctx, t, s) {
    ell(ctx, 0, -6, 56, 12, "#8f897b");
    for (let i = 0; i < 10; i++) line(ctx, -48 + i * 10, -12, -48 + i * 10 - 3, 0, 4, "#6b4a2d");
    line(ctx, -52, -9, 52, -9, 3, "#9aa3ab");
    line(ctx, -52, -2, 52, -2, 3, "#9aa3ab");
    const x = s.working ? Math.sin(t * 0.8) * 18 : 0;
    box(ctx, -18 + x, -28, 36, 16, "#3a5a8c");
    box(ctx, 10 + x, -36, 16, 24, "#2f486f");
    box(ctx, -14 + x, -38, 10, 12, "#555");
    smoke(ctx, t, -9 + x, -40, "#ffffff", 3);
    ell(ctx, -10 + x, -10, 5, 5, "#333");
    ell(ctx, 14 + x, -10, 5, 5, "#333");
  },

  industrial_housing(ctx, t) {
    box(ctx, -34, -92, 68, 92, "#8c4a3b");
    box(ctx, -38, -96, 76, 8, "#5f2f26");
    windows(ctx, -26, -82, 3, 5, 12, 10, 8, 8);
    box(ctx, -8, -16, 16, 16, "#3b2a1a");
    ctx.strokeStyle = "rgba(59,42,26,.3)";
    ctx.lineWidth = 2;
    for (let r = 1; r < 9; r++) { ctx.beginPath(); ctx.moveTo(-33, -92 + r * 10); ctx.lineTo(33, -92 + r * 10); ctx.stroke(); }
  },

  // ===== Futuristic =====
  energy_station(ctx, t, s) {
    const pulse = 0.5 + 0.3 * Math.sin(t * 3);
    glow(ctx, 0, -44, 56, "#5ee6ff", 0.35 + pulse * 0.3);
    ell(ctx, 0, -4, 40, 9, "#44506f");
    tri(ctx, [[-18, -4], [0, -92], [18, -4]], "#5ee6ff");
    tri(ctx, [[-36, -4], [-24, -52], [-12, -4]], "#7ff0ff");
    tri(ctx, [[12, -4], [24, -56], [36, -4]], "#7ff0ff");
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath(); ctx.moveTo(-3, -80); ctx.lineTo(-9, -20); ctx.lineTo(-4, -20); ctx.closePath(); ctx.fill();
    // orbiting spark
    const a = t * 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(Math.cos(a) * 30, -46 + Math.sin(a) * 10, 3, 0, TAU); ctx.fill();
  },

  research_lab(ctx, t, s) {
    box(ctx, -48, -24, 96, 24, "#e9eef5");
    style(ctx, "#bfe9ff");
    ctx.beginPath(); ctx.arc(0, -24, 44, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-12, -34, 26, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    line(ctx, 0, -68, 0, -92, 3);
    const p = 0.5 + 0.5 * Math.sin(t * 4);
    glow(ctx, 0, -94, 14, "#5ee6ff", 0.5 + p * 0.4);
    ell(ctx, 0, -94, 4, 4, "#5ee6ff");
    box(ctx, -8, -20, 16, 20, "#44506f");
    windows(ctx, -40, -18, 2, 1, 10, 8, 4, 0, "#7ef0ff", "#7ef0ff");
    windows(ctx, 24, -18, 2, 1, 10, 8, 4, 0, "#7ef0ff", "#7ef0ff");
  },

  automated_factory(ctx, t, s) {
    box(ctx, -46, -46, 92, 46, "#cfd6df");
    box(ctx, -46, -34, 92, 6, "#5ee6ff");
    box(ctx, -40, -10, 44, 6, "#44506f");
    for (let i = 0; i < 3; i++) box(ctx, -40 + ((i * 16 + t * 20) % 40), -17, 10, 8, "#ffb703");
    // robotic arm
    ctx.save();
    ctx.translate(26, -46);
    const a = s.working ? Math.sin(t * 2.2) * 0.6 : 0.2;
    ctx.rotate(-0.9 + a);
    line(ctx, 0, 0, 0, -30, 6, "#e63946");
    ctx.translate(0, -30);
    ctx.rotate(1.2 - a * 1.4);
    line(ctx, 0, 0, 0, -24, 5, "#f77f00");
    ell(ctx, 0, -26, 5, 5, "#5ee6ff");
    ctx.restore();
    ell(ctx, 26, -46, 7, 7, "#44506f");
  },

  futuristic_residence(ctx, t) {
    ell(ctx, 0, -36, 44, 36, "#e6f1ff");
    box(ctx, -30, -6, 60, 6, "#44506f");
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.beginPath(); ctx.ellipse(-16, -52, 14, 6, -0.5, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? "#7ef0ff" : "#ffe9a8";
      ctx.beginPath(); ctx.ellipse(-24 + i * 16, -34, 5, 7, 0, 0, TAU); ctx.fill();
    }
    line(ctx, 0, -72, 0, -90, 3);
    glow(ctx, 0, -92, 10, "#ff9bd2", 0.6 + 0.3 * Math.sin(t * 3));
    ell(ctx, 0, -92, 3, 3, "#ff9bd2");
  },

  hightech_facility(ctx, t, s) {
    for (const dx of [-34, 34]) box(ctx, dx - 7, -60, 14, 60, "#cfd6df");
    box(ctx, -40, -10, 80, 10, "#44506f");
    glow(ctx, 0, -46, 36, "#c77dff", 0.45 + 0.2 * Math.sin(t * 3));
    ctx.save();
    ctx.translate(0, -46);
    ctx.strokeStyle = "#5ee6ff";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, 28, 10 + Math.abs(Math.sin(t * (s.working ? 1.5 : 0.5))) * 16, t * 0.8, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 28, -t * 0.6, 0, TAU); ctx.stroke();
    ctx.restore();
    ell(ctx, 0, -46, 8, 8, "#ffffff");
    box(ctx, -5, -80, 10, 20, "#44506f");
    ell(ctx, 0, -84, 5, 5, "#ff9bd2");
  }
};

function genericSprite(ctx, t, s, def) {
  box(ctx, -36, -52, 72, 52, "#b8a98f");
  ctx.fillStyle = INK;
  ctx.font = "bold 28px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((def?.name ?? "?").charAt(0), 0, -18);
}

export class BuildingRenderer {
  constructor(state) {
    this.state = state;
    this.slots = [];
    this.slotsById = new Map();
    this._sig = "";
    this.t = 0;
  }

  /** Rebuild slot positions when owned counts change. */
  layout(w, groundY) {
    const defs = this.state.data.buildings.buildings;
    const sig = defs.map((d) => `${d.id}:${this.state.buildingCount(d.id)}`).join("|") + `@${w}`;
    if (sig === this._sig) return;
    this._sig = sig;

    const owned = defs.filter((d) => this.state.buildingCount(d.id) > 0);
    // Priority: newest era first (later in the data file = newer).
    const priority = [...owned].sort((a, b) => this.state.eraIndex(b.era) - this.state.eraIndex(a.era) || defs.indexOf(b) - defs.indexOf(a));

    const copies = new Map();
    let used = 0;
    for (const d of priority) {
      if (used >= MAX_VISIBLE) break;
      copies.set(d.id, 1);
      used++;
    }
    let grew = true;
    while (used < MAX_VISIBLE && grew) {
      grew = false;
      for (const d of priority) {
        if (used >= MAX_VISIBLE) break;
        const c = copies.get(d.id);
        if (c && c < MAX_PER_TYPE && c < this.state.buildingCount(d.id)) {
          copies.set(d.id, c + 1);
          used++;
          grew = true;
        }
      }
    }

    // Stable placement order: data-file order, then copy number.
    const items = [];
    for (const d of owned) {
      for (let c = 0; c < (copies.get(d.id) ?? 0); c++) items.push({ id: d.id, copy: c });
    }

    const perRow = Math.max(1, Math.ceil(items.length / 2));
    const margin = 70;
    const spacing = Math.min(150, (w - margin * 2) / (perRow + 0.5));
    const startX = (w - spacing * (perRow + 0.5)) / 2 + spacing / 2;
    const fit = Math.max(0.55, Math.min(1, spacing / 100));

    this.slots = items.map((it, i) => {
      const row = i % 2; // 0 = back, 1 = front
      const col = Math.floor(i / 2);
      return {
        ...it,
        x: startX + col * spacing + (row ? spacing * 0.5 : 0),
        y: groundY + (row ? 98 : 14),
        scale: fit * (row ? 1 : 0.88)
      };
    });
    this.slotsById = new Map();
    for (const s of this.slots) {
      if (!this.slotsById.has(s.id)) this.slotsById.set(s.id, []);
      this.slotsById.get(s.id).push(s);
    }
  }

  /** Depth-sortable draw callbacks for every visible building. */
  drawables(dt) {
    this.t += dt;
    const out = [];
    for (const slot of this.slots) {
      // Flat sprites (roads, rails) sort under everything.
      out.push({ y: FLAT.has(slot.id) ? slot.y - 1000 : slot.y, draw: (ctx) => this._drawSlot(ctx, slot) });
    }
    return out;
  }

  _drawSlot(ctx, slot) {
    const def = this.state.getBuildingDef(slot.id);
    const b = this.state.player.buildings[slot.id];
    const workers = this.state.player.population.workers[slot.id] ?? 0;
    const sprite = SPRITES[slot.id];
    const flat = FLAT.has(slot.id);

    ctx.save();
    ctx.translate(slot.x, slot.y);
    ctx.scale(slot.scale, slot.scale);
    if (!flat) softShadow(ctx, -8, 3, 64, 11, 0.38);   // sun is up-right, so the shadow falls left

    // Buildings without job slots (houses, roads) animate when they exist; others when staffed.
    const s = { working: (def?.jobs ?? 0) > 0 ? workers > 0 : true, level: b?.level ?? 1 };
    if (sprite) sprite(ctx, this.t + slot.copy * 1.3, s);
    else genericSprite(ctx, this.t, s, def);

    // Level badge (first copy of each type only)
    if (slot.copy === 0 && s.level > 1) {
      ctx.save();
      ctx.translate(40, -84);
      ctx.scale(13, 13);
      ctx.fillStyle = sphereGrad(ctx, "#ffb703");
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(40, -84, 13, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = "bold 14px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(s.level, 40, -79);
    }
    // Owned count beyond the drawn copies
    const total = b?.count ?? 0;
    const drawn = this.slotsById.get(slot.id)?.length ?? 0;
    if (slot.copy === drawn - 1 && total > drawn) {
      ctx.fillStyle = INK;
      ctx.font = "bold 16px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`x${total}`, 0, 22);
    }
    ctx.restore();
  }
}
