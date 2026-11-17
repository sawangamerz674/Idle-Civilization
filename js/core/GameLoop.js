/**
 * GameLoop - drives logic ticks at a fixed rate and render frames at display rate.
 * Logic: fixed timestep (accumulator) so economy math is frame-rate independent.
 * Render: requestAnimationFrame, receives an interpolation-free delta.
 */
export class GameLoop {
  /**
   * @param {{tickRate:number, maxFrameDelta:number, update:(dt:number)=>void, render:(dt:number)=>void}} opts
   */
  constructor({ tickRate = 10, maxFrameDelta = 0.25, update, render }) {
    this.step = 1 / tickRate;
    this.maxFrameDelta = maxFrameDelta;
    this.update = update;
    this.render = render;
    this._running = false;
    this._last = 0;
    this._acc = 0;
    this._raf = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._acc = 0;
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  get running() {
    return this._running;
  }

  _frame(now) {
    if (!this._running) return;
    let dt = (now - this._last) / 1000;
    this._last = now;
    // Clamp so a background tab or breakpoint cannot cause a huge catch-up burst.
    if (!(dt >= 0)) dt = 0;
    if (dt > this.maxFrameDelta) dt = this.maxFrameDelta;

    this._acc += dt;
    while (this._acc >= this.step) {
      this.update(this.step);
      this._acc -= this.step;
    }
    this.render(dt);
    this._raf = requestAnimationFrame(this._frame);
  }
}
