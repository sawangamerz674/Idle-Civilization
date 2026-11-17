/**
 * ModalManager - dialogs (info, confirm, unlock popups, offline summary).
 * One modal at a time; extras are queued.
 */
export class ModalManager {
  constructor(root) {
    this.root = root;
    this.queue = [];
    this.current = null;
  }

  /**
   * @param {{title:string, body?:string|HTMLElement, buttons?:Array<{label:string, kind?:string, onClick?:()=>void}>}} opts
   */
  open(opts) {
    this.queue.push(opts);
    if (!this.current) this._next();
  }

  /** Convenience confirm dialog; resolves true/false. */
  confirm(title, body, confirmLabel = "Confirm", danger = false) {
    return new Promise((resolve) => {
      this.open({
        title,
        body,
        buttons: [
          { label: "Cancel", kind: "btn-secondary", onClick: () => resolve(false) },
          { label: confirmLabel, kind: danger ? "btn-danger" : "", onClick: () => resolve(true) }
        ]
      });
    });
  }

  close() {
    if (this.current) {
      this.current.remove();
      this.current = null;
    }
    this._next();
  }

  _next() {
    const opts = this.queue.shift();
    if (!opts) return;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";

    const h = document.createElement("h3");
    h.textContent = opts.title;
    modal.appendChild(h);

    if (opts.body) {
      if (typeof opts.body === "string") {
        const p = document.createElement("p");
        p.textContent = opts.body;
        modal.appendChild(p);
      } else {
        modal.appendChild(opts.body);
      }
    }

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const buttons = opts.buttons && opts.buttons.length ? opts.buttons : [{ label: "OK" }];
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.className = `btn ${b.kind || ""}`.trim();
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        this.close();
        if (b.onClick) b.onClick();
      });
      actions.appendChild(btn);
    }
    modal.appendChild(actions);

    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    this.current = backdrop;
  }
}
