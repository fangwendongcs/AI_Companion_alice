export class N8nWorkflowService {
  async invokeWorkflow(_payload, { enabled = false } = {}) {
    return {
      used: false,
      status: enabled ? 'not_configured' : 'disabled'
    };
  }
}
