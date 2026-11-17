/** NumberFormatter - compact display of large idle-game numbers. */
const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function formatNumber(value, decimals = 1) {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  let n = Math.abs(value);
  if (n < 1000) {
    return sign + (n < 10 && n % 1 !== 0 ? n.toFixed(decimals) : Math.floor(n).toString());
  }
  const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
  n = n / Math.pow(1000, tier);
  return sign + n.toFixed(decimals) + SUFFIXES[tier];
}

/** Format a per-second rate with sign, e.g. +1.5/s */
export function formatRate(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "0/s";
  return (value > 0 ? "+" : "-") + formatNumber(Math.abs(value), 2) + "/s";
}
