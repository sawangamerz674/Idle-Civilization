/**
 * NotificationManager - toast messages. Listens for "notify" events on the bus:
 *   bus.emit("notify", { text, type: "success"|"warn"|"error"|"info", duration })
 */
export class NotificationManager {
  constructor(root, bus) {
    this.root = root;
    bus.on("notify", (n) => this.show(n.text, n.type, n.duration));
  }

  show(text, type = "info", duration = 3000) {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = text;
    this.root.appendChild(el);
    // Keep the stack short on small screens.
    while (this.root.children.length > 4) this.root.firstChild.remove();
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 260);
    }, duration);
  }
}
