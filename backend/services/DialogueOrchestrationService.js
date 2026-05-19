import { createHttpError } from '../utils/httpError.js';
import { MemoryService } from './MemoryService.js';
import { N8nWorkflowService } from './N8nWorkflowService.js';
import { RagService } from './RagService.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;

export class DialogueOrchestrationService {
  constructor({
    memoryService = new MemoryService(),
    ragService = new RagService(),
    workflowService = new N8nWorkflowService()
  } = {}) {
    this.memoryService = memoryService;
    this.ragService = ragService;
    this.workflowService = workflowService;
  }

  async run(payload = {}) {
    const message = normalizeMessage(payload.message);
    if (!message) {
      throw createHttpError('Missing dialogue message.', 400);
    }

    const options = normalizeOptions(payload.options);
    const memory = await this.memoryService.getContext({
      message,
      enabled: options.useMemory
    });
    const rag = await this.ragService.retrieve(message, {
      enabled: options.useRag
    });
    const workflow = await this.workflowService.invokeWorkflow({
      message,
      provider: normalizePublicValue(payload.provider),
      model: normalizePublicValue(payload.model)
    }, {
      enabled: options.useWorkflow
    });

    return {
      reply: buildBoundaryReply(),
      sources: [],
      memory,
      rag,
      workflow,
      meta: {
        mode: 'boundary_stub',
        provider: normalizePublicValue(payload.provider),
        model: normalizePublicValue(payload.model),
        systemPromptReceived: Boolean(normalizeSystemPrompt(payload.systemPrompt)),
        next: 'Keep the current MVP on /api/chat until real backend orchestration is configured.'
      }
    };
  }
}

function normalizeMessage(value) {
  return String(value || '').trim().slice(0, MAX_MESSAGE_CHARS);
}

function normalizeSystemPrompt(value) {
  return String(value || '').trim().slice(0, MAX_SYSTEM_PROMPT_CHARS);
}

function normalizePublicValue(value) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeOptions(options) {
  return {
    useMemory: Boolean(options?.useMemory),
    useRag: Boolean(options?.useRag),
    useWorkflow: Boolean(options?.useWorkflow)
  };
}

function buildBoundaryReply() {
  return 'Dialogue backend boundary is ready. Real Memory, RAG, and workflow integrations are not configured in this phase.';
}
