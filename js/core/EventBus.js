export class EventBus extends EventTarget {
  constructor() {
    super();
    this.unsubscribeCallbacks = new Set();
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, handler) {
    const listener = (event) => handler(event.detail);
    this.addEventListener(type, listener);
    const unsubscribe = () => {
      this.removeEventListener(type, listener);
      this.unsubscribeCallbacks.delete(unsubscribe);
    };
    this.unsubscribeCallbacks.add(unsubscribe);
    return unsubscribe;
  }

  once(type, handler) {
    const unsubscribe = this.on(type, (detail) => {
      unsubscribe();
      handler(detail);
    });
    return unsubscribe;
  }

  clear() {
    [...this.unsubscribeCallbacks].forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks.clear();
  }

  destroy() {
    this.clear();
  }
}
