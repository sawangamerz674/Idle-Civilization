/**
 * ArtKit - shared drawing helpers for the procedural art: colour maths, cached gradients,
 * a seeded random generator, and soft shadow / highlight primitives.
 * (Extra file in js/rendering/.) Pure drawing helpers, no game state.
 */
const TAU = Math.PI * 2;
const cache = new Map();

/** Parse "#rgb" / "#rrggbb" to [r,g,b], or null for anything else (rgba(), gradients...). */
export function parseHex(c) {
  if (typeof c !== "string" || c[0] !== "#") return null;
  let h = c.slice(1);
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  if (!A || !B) return a;
  const k = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0");
  return `#${k(0)}${k(1)}${k(2)}`;
}
export const lighten = (c, t) => mix(c, "#ffffff", t);
export const darken = (c, t) => mix(c, "#1e140b", t);

function remember(key, make) {
  let v = cache.get(key);
  if (!v) {
    if (cache.size > 4000) cache.clear(); // animated coordinates must not grow the cache forever
    v = make();
    cache.set(key, v);
  }
  return v;
}

/** Vertical shaded gradient for a solid colour: lit on top, darker underneath. */
export function vGrad(ctx, color, y, h, hi = 0.24, lo = 0.2) {
  if (!parseHex(color)) return color;
  return remember(`v|${color}|${y}|${h}|${hi}|${lo}`, () => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, lighten(color, hi));
    g.addColorStop(0.5, color);
    g.addColorStop(1, darken(color, lo));
    return g;
  });
}

/** Horizontal gradient: light from the left (the sun is up-right, so right sides are shaded). */
export function hGrad(ctx, color, x, w, hi = 0.18, lo = 0.22) {
  if (!parseHex(color)) return color;
  return remember(`h|${color}|${x}|${w}|${hi}|${lo}`, () => {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, lighten(color, hi));
    g.addColorStop(0.55, color);
    g.addColorStop(1, darken(color, lo));
    return g;
  });
}

/** Unit-circle radial gradient (use under translate/scale) with an off-centre highlight. */
export function sphereGrad(ctx, color) {
  if (!parseHex(color)) return color;
  return remember(`s|${color}`, () => {
    const g = ctx.createRadialGradient(-0.32, -0.4, 0.05, 0, 0, 1.05);
    g.addColorStop(0, lighten(color, 0.38));
    g.addColorStop(0.45, color);
    g.addColorStop(1, darken(color, 0.28));
    return g;
  });
}

/** Soft contact shadow (an ellipse that fades out at the edge). */
export function softShadow(ctx, x, y, rx, ry, alpha = 0.32) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = remember(`sh|${alpha}`, () => {
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(20,14,6,${alpha})`);
    gr.addColorStop(0.6, `rgba(20,14,6,${alpha * 0.55})`);
    gr.addColorStop(1, "rgba(20,14,6,0)");
    return gr;
  });
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Rounded-rectangle path (works without ctx.roundRect). */
export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Small deterministic random generator (stable decorations between frames). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { TAU };
