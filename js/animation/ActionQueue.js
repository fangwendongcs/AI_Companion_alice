export class ActionQueue {
  constructor() {
    this.items = [];
    this.active = null;
  }

  enqueue(actionRequest) {
    const request = {
      id: `${actionRequest.name}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      priority: 0,
      interrupt: false,
      layer: 'gesture',
      createdAt: Date.now(),
      ...actionRequest
    };

    if (!this.active) {
      this.active = request;
      return { type: 'play', request };
    }

    if (request.interrupt && request.priority > this.active.priority) {
      const interrupted = this.active;
      this.active = request;
      return { type: 'interrupt', request, interrupted };
    }

    this.items.push(request);
    this.items.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return { type: 'queued', request };
  }

  complete(id) {
    if (this.active?.id !== id) return null;
    this.active = this.items.shift() || null;
    return this.active;
  }

  clear() {
    this.items = [];
    this.active = null;
  }
}
