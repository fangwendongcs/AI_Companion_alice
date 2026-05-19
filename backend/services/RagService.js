export class RagService {
  async retrieve(_query, { enabled = false } = {}) {
    return {
      used: false,
      status: enabled ? 'not_configured' : 'disabled',
      passages: []
    };
  }
}
