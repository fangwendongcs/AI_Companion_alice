export class AnimationQueue {
  constructor({ defaultCooldownMs = 120, maxQueuedPerLayer = 8 } = {}) {
    this.layers = new Map();
    this.cooldowns = new Map();
    this.defaultCooldownMs = defaultCooldownMs;
    this.maxQueuedPerLayer = maxQueuedPerLayer;
  }

  enqueue(actionRequest) {
    const request = {
      id: `${actionRequest.name}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      priority: 0,
      interrupt: false,
      layer: 'gesture',
      loop: 'once',
      cooldown: this.defaultCooldownMs,
      createdAt: Date.now(),
      ...actionRequest
    };
    const layerQueue = this.getLayerQueue(request.layer);

    if (this.isInCooldown(request)) {
      return { type: 'ignored', reason: 'cooldown', request };
    }

    if (layerQueue.active?.name === request.name && request.loop === 'repeat') {
      return { type: 'ignored', reason: 'duplicate-loop', request };
    }

    this.markCooldown(request);

    if (!layerQueue.active) {
      layerQueue.active = request;
      return { type: 'play', request };
    }

    if (request.interrupt && request.priority > layerQueue.active.priority) {
      const interrupted = layerQueue.active;
      layerQueue.active = request;
      return { type: 'interrupt', request, interrupted };
    }

    this.enqueuePending(layerQueue, request);
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
    this.cooldowns.clear();
  }

  snapshot() {
    return [...this.layers.entries()].reduce((result, [layer, queue]) => {
      result[layer] = {
        active: queue.active?.name || null,
        queued: queue.items.map((item) => item.name)
      };
      return result;
    }, {});
  }

  getLayerQueue(layerName) {
    if (!this.layers.has(layerName)) {
      this.layers.set(layerName, { active: null, items: [] });
    }
    return this.layers.get(layerName);
  }

  enqueuePending(layerQueue, request) {
    const duplicateIndex = layerQueue.items.findIndex((item) => item.name === request.name);
    if (duplicateIndex >= 0 && request.priority <= layerQueue.items[duplicateIndex].priority) {
      return;
    }
    if (duplicateIndex >= 0) layerQueue.items.splice(duplicateIndex, 1);

    layerQueue.items.push(request);
    layerQueue.items.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    if (layerQueue.items.length > this.maxQueuedPerLayer) {
      layerQueue.items.length = this.maxQueuedPerLayer;
    }
  }

  isInCooldown(request) {
    const cooldown = request.cooldown ?? this.defaultCooldownMs;
    if (cooldown <= 0) return false;
    const key = this.getCooldownKey(request);
    const lastAt = this.cooldowns.get(key) || 0;
    return Date.now() - lastAt < cooldown;
  }

  markCooldown(request) {
    const cooldown = request.cooldown ?? this.defaultCooldownMs;
    if (cooldown <= 0) return;
    this.cooldowns.set(this.getCooldownKey(request), Date.now());
  }

  getCooldownKey(request) {
    return `${request.layer}:${request.name}`;
  }
}
