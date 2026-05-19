export class MemoryService {
  async getContext({ enabled = false } = {}) {
    return {
      used: false,
      status: enabled ? 'not_configured' : 'disabled',
      context: []
    };
  }

  async appendEvent(_event, { enabled = false } = {}) {
    return {
      stored: false,
      status: enabled ? 'not_configured' : 'disabled'
    };
  }
}
