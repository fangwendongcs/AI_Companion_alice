import { EVENT_NAMES } from '../core/events/eventNames.js';

export class CompanionStateStore {
  constructor(initialState = {}, eventBus = null) {
    this.initialState = this.clone(initialState);
    this.state = this.clone(initialState);
    this.eventBus = eventBus;
    this.listeners = new Set();
    this.destroyed = false;
  }

  getState() {
    return this.state;
  }

  setState(nextState, source = 'app') {
    if (this.destroyed) return this.state;
    this.replaceState(this.clone(nextState || {}));
    this.notify({
      source,
      patch: this.snapshot(),
      state: this.snapshot()
    });
    return this.state;
  }

  patch(patch, source = 'app') {
    if (this.destroyed) return this.state;
    Object.assign(this.state, patch);
    this.notify({
      source,
      patch: { ...patch },
      state: this.snapshot()
    });
    return this.state;
  }

  patchPath(path, patch, source = 'app') {
    if (this.destroyed) return this.state;
    const keys = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
    if (!keys.length) return this.patch(patch, source);

    let target = this.state;
    keys.slice(0, -1).forEach((key) => {
      target[key] = target[key] && typeof target[key] === 'object' ? target[key] : {};
      target = target[key];
    });

    const lastKey = keys[keys.length - 1];
    target[lastKey] = {
      ...(target[lastKey] || {}),
      ...(patch || {})
    };
    this.notify({
      source,
      patch: { [keys.join('.')]: patch },
      state: this.snapshot()
    });
    return this.state;
  }

  reset(source = 'app:reset') {
    this.replaceState(this.clone(this.initialState));
    this.notify({
      source,
      patch: this.snapshot(),
      state: this.snapshot()
    });
    return this.state;
  }

  subscribe(listener) {
    if (this.destroyed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.listeners.clear();
    this.destroyed = true;
  }

  snapshot() {
    return this.clone(this.state);
  }

  notify(detail) {
    this.listeners.forEach((listener) => listener(detail));
    this.eventBus?.emit(EVENT_NAMES.STATE_CHANGED, detail);
  }

  replaceState(nextState) {
    Object.keys(this.state).forEach((key) => delete this.state[key]);
    Object.assign(this.state, nextState);
  }

  clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }
}
