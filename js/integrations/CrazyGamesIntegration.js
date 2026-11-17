/**
 * CrazyGamesIntegration - the only file that touches the CrazyGames SDK.
 * Uses ONLY the official SDK v3 (window.CrazyGames.SDK, loaded by the script tag in index.html):
 *   SDK.init(), SDK.environment ("local" | "crazygames" | "disabled"),
 *   SDK.game.loadingStart/loadingStop/gameplayStart/gameplayStop,
 *   SDK.ad.requestAd("rewarded", {adStarted, adFinished, adError}), SDK.ad.hasAdblock(),
 *   SDK.data.getItem/setItem/removeItem.
 * Every call is feature-checked and wrapped, so the game runs normally (without ads and cloud
 * data) when the SDK script is blocked, offline, or the environment is "disabled".
 *
 * Emits:  "ads:started", "ads:ended" ({ok, reason}) - Game pauses the loop and mutes audio.
 *         "crazygames:ready" ({environment, adsAvailable})
 */
export class CrazyGamesIntegration {
  constructor(cfg, bus, win = typeof window !== "undefined" ? window : null) {
    this.cfg = cfg?.crazyGames ?? {};
    this.bus = bus;
    this.win = win;
    this.ready = false;
    this.environment = "none";
    this.adblock = false;
    this._playing = false;
    this._adActive = false;
  }

  get sdk() {
    return this.cfg.enabled === false ? null : this.win?.CrazyGames?.SDK ?? null;
  }

  /** True when SDK calls can be made (not "disabled", not missing). */
  get available() {
    return this.ready && this.environment !== "disabled" && this.environment !== "none";
  }

  get adsAvailable() {
    return this.available && typeof this.sdk?.ad?.requestAd === "function" && !this._adActive;
  }

  get adActive() {
    return this._adActive;
  }

  async init(timeoutMs = 5000) {
    const sdk = this.sdk;
    if (!sdk) return false;
    try {
      await Promise.race([
        sdk.init(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("CrazyGames SDK init timeout")), timeoutMs))
      ]);
      this.environment = sdk.environment ?? "none";
      this.ready = true;
    } catch (err) {
      console.warn("[CrazyGames] SDK unavailable:", err?.message ?? err);
      this.ready = false;
      return false;
    }
    if (this.available) {
      try {
        this.adblock = typeof sdk.ad?.hasAdblock === "function" ? !!(await sdk.ad.hasAdblock()) : false;
      } catch { this.adblock = false; }
    }
    // Respect the CrazyGames mute button: SDK game.settings.muteAudio and its change listener.
    try {
      const game = sdk.game;
      if (game?.settings?.muteAudio) this.bus.emit("audio:platformMute", true);
      if (typeof game?.addSettingsChangeListener === "function") {
        game.addSettingsChangeListener((st) => this.bus.emit("audio:platformMute", !!st?.muteAudio));
      }
    } catch (err) { console.warn("[CrazyGames] settings listener failed", err?.message ?? err); }
    this.bus.emit("crazygames:ready", { environment: this.environment, adsAvailable: this.adsAvailable });
    return this.available;
  }

  _game(fn) {
    if (!this.available) return;
    try { this.sdk.game?.[fn]?.(); } catch (err) { console.warn(`[CrazyGames] game.${fn} failed`, err?.message ?? err); }
  }

  loadingStart() { this._game("loadingStart"); }
  loadingStop() { this._game("loadingStop"); }

  /** The player is actively playing (not in a menu break). Safe to call repeatedly. */
  gameplayStart() {
    if (this._playing) return;
    this._playing = true;
    this._game("gameplayStart");
  }

  gameplayStop() {
    if (!this._playing) return;
    this._playing = false;
    this._game("gameplayStop");
  }

  /**
   * Show a rewarded ad (call only after the player chose to watch one).
   * Resolves {ok:true} when the ad finished, otherwise {ok:false, reason}.
   */
  requestRewarded() {
    if (!this.adsAvailable) return Promise.resolve({ ok: false, reason: "unavailable" });
    return new Promise((resolve) => {
      let settled = false;
      const end = (result) => {
        if (settled) return;
        settled = true;
        this._adActive = false;
        if (this._wasPlaying) this.gameplayStart();
        this.bus.emit("ads:ended", result);
        resolve(result);
      };
      this._adActive = true;
      this._wasPlaying = this._playing;
      try {
        this.sdk.ad.requestAd("rewarded", {
          adStarted: () => {
            this.bus.emit("ads:started");
          },
          adFinished: () => end({ ok: true }),
          adError: (error) => end({ ok: false, reason: error?.code ?? "other", message: error?.message })
        });
      } catch (err) {
        end({ ok: false, reason: "other", message: err?.message });
      }
    });
  }

  // ---- cloud data (synchronised across devices by CrazyGames) ----
  get dataAvailable() {
    return this.available && typeof this.sdk?.data?.getItem === "function";
  }

  async dataGet(key) {
    if (!this.dataAvailable) return null;
    try { return this.sdk.data.getItem(key) ?? null; } catch { return null; }
  }

  async dataSet(key, text) {
    if (!this.dataAvailable) return false;
    try { this.sdk.data.setItem(key, text); return true; } catch { return false; }
  }

  async dataRemove(key) {
    if (!this.dataAvailable) return;
    try { this.sdk.data.removeItem(key); } catch { /* ignore */ }
  }
}
