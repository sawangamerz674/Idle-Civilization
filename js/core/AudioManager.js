/**
 * AudioManager - all sound is generated with the Web Audio API (no audio files, so nothing
 * to license or download). Original, simple synthesis:
 *   sound effects  click, build, upgrade, research, achievement, era, prestige, reward, error, pop
 *   music          a quiet generative loop whose scale, tempo and instruments change per era
 *
 * Rules it follows:
 *   - The AudioContext is created / resumed only after the first user gesture (browser autoplay policy).
 *   - Music and sound effects have their own toggle and volume (state.player.settings).
 *   - Everything is muted while a rewarded ad plays ("audio:mute") and suspended while the tab is hidden.
 *   - Never throws: if Web Audio is missing the game is simply silent.
 *
 * Listens: "settings:changed", "audio:mute" (ads), "audio:platformMute" (CrazyGames mute button), "era:changed", and the gameplay events listed in EVENT_SOUNDS.
 */
const EVENT_SOUNDS = {
  "building:built": "build",
  "building:upgraded": "upgrade",
  "upgrade:bought": "upgrade",
  "prestige:bought": "upgrade",
  "research:completed": "research",
  "achievement:unlocked": "achievement",
  "era:changed": "era",
  "prestige:done": "prestige",
  "ads:rewarded": "reward",
  "population:grew": "pop",
  "offline:done": "reward"
};

// semitone offsets from the root note
const SCALES = {
  stone_age:  { root: 57, scale: [0, 3, 5, 7, 10], bpm: 78,  lead: "triangle", pad: "sine",     drums: true,  name: "minor pentatonic" },
  ancient:    { root: 55, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 88, lead: "triangle", pad: "sine", drums: false, name: "dorian" },
  medieval:   { root: 60, scale: [0, 2, 4, 5, 7, 9, 10], bpm: 96, lead: "sine",     pad: "triangle", drums: false, name: "mixolydian" },
  industrial: { root: 52, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 108, lead: "square",  pad: "sawtooth", drums: true,  name: "natural minor" },
  futuristic: { root: 62, scale: [0, 2, 4, 7, 9],        bpm: 112, lead: "sawtooth", pad: "sine",    drums: false, name: "major pentatonic" }
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioManager {
  constructor(state, bus, win = typeof window !== "undefined" ? window : null) {
    this.state = state;
    this.bus = bus;
    this.win = win;
    this.ctx = null;
    this.master = this.musicGain = this.sfxGain = null;
    this.muted = false;       // forced mute (ads)
    this.unlocked = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this._lastSfx = new Map();
    this.noiseBuffer = null;

    bus.on("settings:changed", () => this.applySettings());
    bus.on("audio:mute", (on) => this.setMuted(!!on));
    bus.on("audio:platformMute", (on) => this.setPlatformMuted(!!on));
    bus.on("era:changed", () => { this._step = 0; });
    for (const [ev, snd] of Object.entries(EVENT_SOUNDS)) bus.on(ev, () => this.play(snd));
    bus.on("notify", (n) => { if (n?.type === "error") this.play("error"); });

    if (win?.document) {
      const unlock = () => this.unlock();
      for (const ev of ["pointerdown", "keydown", "touchstart", "touchend", "click"]) win.document.addEventListener(ev, unlock, { capture: true });
      // Button click sounds by delegation (one listener for every UI button).
      win.document.addEventListener("click", (e) => {
        const b = e.target?.closest?.("button");
        if (!b || b.disabled) return;
        this.play(b.classList.contains("nav-btn") || b.classList.contains("chip") ? "tick" : "click");
      });
      win.document.addEventListener("visibilitychange", () => {
        if (win.document.hidden) this.ctx?.suspend?.();
        else if (this.unlocked && !this.muted) this.ctx?.resume?.();
      });
    }
  }

  // ---------------- setup ----------------
  get settings() { return this.state.player.settings; }

  /** Create / resume the AudioContext (must be called from a user gesture). */
  unlock() {
    if (this.unlocked && this.ctx?.state === "running") return;
    try {
      if (!this.ctx) {
        const AC = this.win?.AudioContext || this.win?.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this._makeNoise();
      }
      this.ctx.resume?.();
      this.unlocked = true;
      this.applySettings();
    } catch (err) {
      console.warn("[Audio] unavailable:", err?.message ?? err);
    }
  }

  _makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** The CrazyGames mute button (SDK game.settings.muteAudio). It overrides the in-game audio options. */
  setPlatformMuted(on) {
    this._platformMute = !!on;
    this.setMuted(this._adMute);
  }

  setMuted(on) {
    this._adMute = !!on;
    on = this._adMute || !!this._platformMute;
    this.muted = on;
    this.applySettings();
    if (on) this.ctx?.suspend?.();
    else if (this.unlocked) this.ctx?.resume?.();
  }

  /** Push the current settings to the gain nodes and start/stop the music. */
  applySettings() {
    if (!this.ctx) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.musicGain.gain.setTargetAtTime(s.music ? 0.5 * (s.musicVolume ?? 0.5) : 0, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(s.sfx ? (s.sfxVolume ?? 0.7) : 0, t, 0.03);
    if (s.music && !this.muted) this.startMusic();
    else this.stopMusic();
  }

  // ---------------- sound effects ----------------
  /** Play a named effect (rate-limited so bursts of events stay pleasant). */
  play(name) {
    if (!this.ctx || !this.unlocked || this.muted || !this.settings.sfx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const gap = name === "pop" ? 1.5 : name === "tick" || name === "click" ? 0.04 : 0.08;
    if (now - (this._lastSfx.get(name) ?? -9) < gap) return;
    this._lastSfx.set(name, now);
    try {
      this[`_sfx_${name}`]?.(now);
    } catch (err) {
      console.warn("[Audio] effect failed", name, err?.message ?? err);
    }
  }

  _tone(freq, start, dur, { type = "sine", vol = 0.3, slideTo = null, dest = this.sfxGain, attack = 0.005 } = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  _noise(start, dur, { vol = 0.2, freq = 2000, q = 1, type = "bandpass", dest = this.sfxGain } = {}) {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noiseBuffer;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  _sfx_click(t) { this._tone(520, t, 0.07, { type: "square", vol: 0.12, slideTo: 380 }); }
  _sfx_tick(t) { this._tone(700, t, 0.05, { type: "triangle", vol: 0.14 }); }
  _sfx_error(t) { this._tone(180, t, 0.18, { type: "sawtooth", vol: 0.14, slideTo: 120 }); }
  _sfx_pop(t) { this._tone(600, t, 0.08, { type: "sine", vol: 0.1, slideTo: 900 }); }
  _sfx_build(t) {
    this._noise(t, 0.09, { vol: 0.25, freq: 700, q: 2 });          // thud / hammer
    this._tone(220, t, 0.12, { type: "triangle", vol: 0.3, slideTo: 140 });
    this._tone(523, t + 0.1, 0.12, { type: "triangle", vol: 0.2 });
    this._tone(784, t + 0.18, 0.2, { type: "triangle", vol: 0.2 });
  }
  _sfx_upgrade(t) { [392, 494, 587, 784].forEach((f, i) => this._tone(f, t + i * 0.07, 0.16, { type: "triangle", vol: 0.22 })); }
  _sfx_research(t) { [659, 880, 1319].forEach((f, i) => this._tone(f, t + i * 0.12, 0.6, { type: "sine", vol: 0.2 })); }
  _sfx_reward(t) { [880, 1175, 1568, 2093].forEach((f, i) => this._tone(f, t + i * 0.06, 0.25, { type: "sine", vol: 0.14 })); this._noise(t, 0.3, { vol: 0.05, freq: 6000, q: 0.7, type: "highpass" }); }
  _sfx_achievement(t) { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, t + i * 0.1, 0.35, { type: "triangle", vol: 0.22 })); }
  _sfx_era(t) {
    [262, 330, 392, 523, 392, 523, 659].forEach((f, i) => this._tone(f, t + i * 0.14, 0.45, { type: "triangle", vol: 0.24 }));
    this._tone(131, t, 1.2, { type: "sine", vol: 0.3 });
  }
  _sfx_prestige(t) {
    this._tone(110, t, 1.4, { type: "sawtooth", vol: 0.12, slideTo: 440 });
    this._noise(t, 1.2, { vol: 0.12, freq: 400, q: 0.6, type: "lowpass" });
    [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, t + 0.5 + i * 0.12, 0.7, { type: "sine", vol: 0.2 }));
  }

  // ---------------- music ----------------
  currentTheme() { return SCALES[this.state.player.era] ?? SCALES.stone_age; }

  startMusic() {
    if (this._timer || !this.ctx) return;
    this._nextTime = this.ctx.currentTime + 0.2;
    this._timer = setInterval(() => this._schedule(), 120);
  }

  stopMusic() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /** Schedule notes ~0.5 s ahead. One step = an eighth note; 32 steps = 4 bars. */
  _schedule() {
    if (!this.ctx || this.ctx.state !== "running") { this._nextTime = this.ctx?.currentTime ?? 0; return; }
    const th = this.currentTheme();
    const eighth = 60 / th.bpm / 2;
    while (this._nextTime < this.ctx.currentTime + 0.5) {
      this._step_(th, this._step, this._nextTime, eighth);
      this._step = (this._step + 1) % 32;
      this._nextTime += eighth;
    }
  }

  _degree(th, d, octave = 0) {
    const n = th.scale.length;
    const idx = ((d % n) + n) % n;
    return th.root + th.scale[idx] + 12 * (Math.floor(d / n) + octave);
  }

  _step_(th, step, t, eighth) {
    const dest = this.musicGain;
    // chord progression over 4 bars: scale degrees of the bass note
    const bass = [0, 3, 4, 2][Math.floor(step / 8) % 4];
    if (step % 8 === 0) {
      const bar = eighth * 8;
      for (const off of [0, 2, 4]) this._tone(midi(this._degree(th, bass + off, -1)), t, bar * 0.95, { type: th.pad, vol: 0.09, attack: 0.25, dest });
    }
    // gentle bass pulse
    if (step % 4 === 0) this._tone(midi(this._degree(th, bass, -2)), t, eighth * 3, { type: "sine", vol: 0.22, dest });
    // melody: pseudo-random but repeatable, sparse
    const r = Math.sin(step * 12.9898 + th.root * 78.233) * 43758.5453;
    const frac = r - Math.floor(r);
    if (frac > 0.45 && step % 2 === 0) {
      const d = bass + Math.floor(frac * 7) % 5;
      this._tone(midi(this._degree(th, d, 1)), t, eighth * 1.8, { type: th.lead, vol: 0.1, dest, attack: 0.01 });
    }
    // soft percussion
    if (th.drums && step % 4 === 0) this._tone(110, t, 0.15, { type: "sine", vol: 0.3, slideTo: 55, dest });
    if (th.drums && step % 8 === 4) this._noise(t, 0.06, { vol: 0.06, freq: 4000, q: 1, type: "highpass", dest });
  }
}
