// ViewportUtils - keeps the game a fixed, non-scrolling, non-zooming surface on iOS / Android / desktop.
// Uses only standard DOM events; no device sniffing (CrazyGames forbids touch-detection for controls).
export function lockViewport(doc = document, win = window) {
  const stop = (e) => e.preventDefault();
  // iOS Safari pinch-zoom gestures
  ["gesturestart", "gesturechange", "gestureend"].forEach((t) => doc.addEventListener(t, stop, { passive: false }));
  // Block multi-touch pinch and double-tap zoom
  doc.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastEnd = 0;
  doc.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastEnd < 300 && !e.target.closest?.("input,textarea,select")) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
  // Long-press context menu / ctrl+wheel zoom
  doc.addEventListener("contextmenu", (e) => { if (!e.target.closest?.("input,textarea")) e.preventDefault(); });
  win.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  // Keep the document pinned after orientation changes / iOS address-bar resizes
  const reset = () => { win.scrollTo(0, 0); doc.documentElement.style.setProperty("--vh", win.innerHeight * 0.01 + "px"); };
  win.addEventListener("resize", reset); win.addEventListener("orientationchange", () => setTimeout(reset, 250));
  reset();
}
