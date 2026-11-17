/**
 * BasePanel - shared behavior for every navigation panel.
 * Subclasses set `id`, `title`, and override build() (one-time DOM) and
 * refresh() (called on a throttle while the panel is visible).
 * Panels read GameState and talk to systems only through the EventBus.
 */
export class BasePanel {
  constructor(id, title, state, bus) {
    this.id = id;
    this.title = title;
    this.state = state;
    this.bus = bus;
    this.el = document.createElement("div");
    this.el.className = "panel panel-content";
    this.el.dataset.panel = id;
    this._built = false;
  }

  /** One-time DOM construction. Override. */
  build() {
    this.el.innerHTML = `<h2>${this.title}</h2>`;
  }

  /** Periodic refresh while visible. Override. */
  refresh() {}

  mount(container) {
    if (!this._built) {
      this.build();
      this._built = true;
    }
    container.appendChild(this.el);
  }

  show() {
    this.el.classList.add("active");
    this.refresh();
  }

  hide() {
    this.el.classList.remove("active");
  }

}
