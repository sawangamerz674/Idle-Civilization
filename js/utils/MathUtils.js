/** MathUtils - small shared math helpers. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));

/** Geometric cost growth: base * growth^owned */
export const scaledCost = (base, growth, owned) => base * Math.pow(growth, owned);
