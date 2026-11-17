/**
 * EventBus - tiny publish/subscribe hub.
 * Systems emit events (e.g. "resource:changed"); UI and renderers listen.
 * This is the only channel through which systems and UI talk to each other.
 */
export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  /** Subscribe. Returns an unsubscribe function. */
  on(event, handler) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(event, handler) {
    const set = this._handlers.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${event}" threw`, err);
      }
    }
  }
}
