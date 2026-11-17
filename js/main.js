import { Game } from "./core/Game.js";
import { lockViewport } from "./utils/ViewportUtils.js";

try { lockViewport(); } catch (e) { console.warn("viewport lock failed", e); }

/**
 * Entry point. Creates the Game and shows a readable error if boot fails
 * (for example when index.html is opened via file:// instead of a web server).
 */
const game = new Game();

game.init().catch((err) => {
  console.error("Idle Civilization failed to start", err);
  const text = document.getElementById("loading-text");
  if (text) {
    text.textContent =
      "Could not start the game. Please reload the page. If you are running it locally, serve the folder over HTTP (e.g. 'python3 -m http.server') instead of opening the file directly.";
  }
});

// Unexpected runtime errors are logged (progress is autosaved, so nothing is lost).
window.addEventListener("error", (e) => console.error("Unhandled error:", e.message));
window.addEventListener("unhandledrejection", (e) => console.error("Unhandled promise rejection:", e.reason));

// Debug handle for development only.
window.__idleCiv = game;
