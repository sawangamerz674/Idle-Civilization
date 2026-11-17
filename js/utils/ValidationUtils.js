/** ValidationUtils - defensive checks used by loaders and the save system. */
export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

export function toNumber(v, fallback = 0) {
  return isFiniteNumber(v) ? v : fallback;
}

/** Throw if `obj` is missing any of the listed keys. */
export function requireKeys(obj, keys, label = "object") {
  if (!isObject(obj)) throw new Error(`${label} must be an object`);
  for (const k of keys) {
    if (!(k in obj)) throw new Error(`${label} is missing "${k}"`);
  }
}
