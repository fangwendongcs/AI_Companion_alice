export class DisposableRegistry {
  constructor() {
    this.disposables = new Set();
    this.destroyed = false;
  }

  add(dispose) {
    if (typeof dispose !== 'function') return () => {};
    if (this.destroyed) {
      dispose();
      return () => {};
    }
    this.disposables.add(dispose);
    return () => {
      dispose();
      this.disposables.delete(dispose);
    };
  }

  addEventListener(target, type, handler, options) {
    if (!target?.addEventListener) return () => {};
    target.addEventListener(type, handler, options);
    return this.add(() => target.removeEventListener(type, handler, options));
  }

  addTimeout(handler, delay) {
    const id = globalThis.setTimeout(() => {
      this.disposables.delete(dispose);
      handler();
    }, delay);
    const dispose = () => globalThis.clearTimeout(id);
    this.disposables.add(dispose);
    return id;
  }

  clearTimeout(id) {
    globalThis.clearTimeout(id);
  }

  addInterval(handler, delay) {
    const id = globalThis.setInterval(handler, delay);
    this.add(() => globalThis.clearInterval(id));
    return id;
  }

  addAbortController() {
    const controller = new AbortController();
    this.add(() => controller.abort());
    return controller;
  }

  destroy() {
    if (this.destroyed) return;
    [...this.disposables].reverse().forEach((dispose) => {
      try {
        dispose();
      } catch {
        // Disposal should be best-effort; individual cleanup failures should not block the rest.
      }
    });
    this.disposables.clear();
    this.destroyed = true;
  }
}
