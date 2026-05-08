export class ActionQueue {
  constructor() {
    this.layers = new Map();
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
    const layerQueue = this.getLayerQueue(request.layer);

    if (!layerQueue.active) {
      layerQueue.active = request;
      return { type: 'play', request };
    }

    if (request.interrupt && request.priority > layerQueue.active.priority) {
      const interrupted = layerQueue.active;
      layerQueue.active = request;
      return { type: 'interrupt', request, interrupted };
    }

    layerQueue.items.push(request);
    layerQueue.items.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    return { type: 'queued', request };
  }

  complete(id, layerName = 'gesture') {
    const layerQueue = this.getLayerQueue(layerName);
    if (layerQueue.active?.id !== id) return null;
    layerQueue.active = layerQueue.items.shift() || null;
    return layerQueue.active;
  }

  clearLayer(layerName) {
    this.layers.set(layerName, { active: null, items: [] });
  }

  clear() {
    this.layers.clear();
  }

  getLayerQueue(layerName) {
    if (!this.layers.has(layerName)) {
      this.layers.set(layerName, { active: null, items: [] });
    }
    return this.layers.get(layerName);
  }
}
