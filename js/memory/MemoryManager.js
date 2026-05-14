export class MemoryManager {
  constructor({ store = null } = {}) {
    this.store = store;
  }

  saveProfile(profile) {
    this.store?.saveMemory?.(profile);
  }

  buildContextSnippet() {
    return '';
  }
}
