export class EventBus extends EventTarget {
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, handler) {
    const listener = (event) => handler(event.detail);
    this.addEventListener(type, listener);
    return () => this.removeEventListener(type, listener);
  }
}
