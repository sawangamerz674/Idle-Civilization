/** TimeUtils - duration formatting and safe elapsed-time math. */
export function formatDuration(totalSeconds) {
  let s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Elapsed seconds between two timestamps; never negative, capped at maxSeconds. */
export function safeElapsedSeconds(fromMs, toMs, maxSeconds = Infinity) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0;
  const diff = (toMs - fromMs) / 1000;
  if (diff <= 0) return 0;
  return Math.min(diff, maxSeconds);
}
