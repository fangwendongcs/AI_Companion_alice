import { createHttpError } from '../utils/httpError.js';
import { MemoryService } from './MemoryService.js';
import { N8nWorkflowService } from './N8nWorkflowService.js';
import { RagService } from './RagService.js';
import { LLMService } from './LLMService.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;
const MAX_SESSION_ID_CHARS = 80;

export class DialogueOrchestrationService {
  constructor({
    memoryService = new MemoryService(),
    ragService = new RagService(),
    workflowService = new N8nWorkflowService(),
    llmService = new LLMService()
  } = {}) {
    this.memoryService = memoryService;
    this.ragService = ragService;
    this.workflowService = workflowService;
    this.llmService = llmService;
  }

  async run(payload = {}) {
    const message = normalizeMessage(payload.message);
    if (!message) {
      throw createCodedHttpError('Missing dialogue message.', 400, 'DIALOGUE_MESSAGE_REQUIRED');
    }

    const provider = normalizeProvider(payload.provider);
    const model = normalizePublicValue(payload.model);
    const systemPrompt = normalizeSystemPrompt(payload.systemPrompt);
    const options = normalizeOptions(payload.options);
    const sessionId = normalizeSessionId(payload.sessionId || options.sessionId);
    const memory = await this.memoryService.getContext({
      message,
      enabled: options.useMemory,
      sessionId
    });
    const rag = await this.ragService.retrieve(message, {
      enabled: options.useRag
    });
    const workflow = await this.workflowService.invokeWorkflow({
      message,
      provider,
      model
    }, {
      enabled: options.useWorkflow
    });

    if (isLocalStubProvider(provider)) {
      const reply = buildLocalStubReply(message, memory);
      const updatedMemory = await this.appendMemoryExchange({
        enabled: options.useMemory,
        sessionId,
        message,
        reply
      });
      return {
        reply,
        sources: [],
        memory: updatedMemory || memory,
        rag,
        workflow,
        meta: {
          mode: 'llm_stub',
          provider,
          model: model || 'stub',
          systemPromptReceived: Boolean(systemPrompt),
          note: 'Local stub provider is for smoke tests and local boundary checks only.'
        }
      };
    }

    const reply = await this.llmService.chat({
      message,
      provider,
      model,
      systemPrompt: buildSystemPrompt(systemPrompt, memory)
    });
    const updatedMemory = await this.appendMemoryExchange({
      enabled: options.useMemory,
      sessionId,
      message,
      reply
    });

    return {
      reply,
      sources: [],
      memory: updatedMemory || memory,
      rag,
      workflow,
      meta: {
        mode: 'llm_only',
        provider,
        model: model || 'gpt-4o-mini',
        systemPromptReceived: Boolean(systemPrompt)
      }
    };
  }

  async appendMemoryExchange({ enabled, sessionId, message, reply }) {
    if (!enabled) return null;
    await this.memoryService.appendExchange({
      sessionId,
      userMessage: message,
      assistantMessage: reply
    }, { enabled });
    return this.memoryService.getContext({
      enabled,
      sessionId
    });
  }
}

function normalizeMessage(value) {
  return String(value || '').trim().slice(0, MAX_MESSAGE_CHARS);
}

function normalizeSystemPrompt(value) {
  return String(value || '').trim().slice(0, MAX_SYSTEM_PROMPT_CHARS);
}

function normalizeSessionId(value) {
  return String(value || 'default')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_SESSION_ID_CHARS) || 'default';
}

function normalizePublicValue(value) {
  return String(value || '').trim().slice(0, 120);
}

function normalizeProvider(value) {
  return String(value || 'openai').trim().toLowerCase().slice(0, 120);
}

function normalizeOptions(options) {
  return {
    useMemory: Boolean(options?.useMemory),
    useRag: Boolean(options?.useRag),
    useWorkflow: Boolean(options?.useWorkflow),
    sessionId: normalizeSessionId(options?.sessionId)
  };
}

function isLocalStubProvider(provider) {
  return ['stub', 'local', 'boundary'].includes(provider);
}

function buildLocalStubReply(message, memory) {
  const text = String(message || '').trim();
  if (memory?.used && memory.turnCount > 0) {
    return `我记得我们刚聊过 ${memory.turnCount} 轮。当前仍是本地演示模式，短期记忆链路已经跑通了。`;
  }
  if (/状态|测试|链路|hello|你好/i.test(text)) {
    return '我现在处于本地演示模式，还没有连接真实模型，但对话链路已经跑通了。';
  }
  return '我在本地演示模式，可以陪你完成交互流程；接入真实模型后，我会回答得更聪明。';
}

function buildSystemPrompt(systemPrompt, memory) {
  const basePrompt = systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。';
  if (!memory?.used || !memory.context?.length) return basePrompt;

  const memoryLines = memory.context
    .map((item) => `${item.role === 'assistant' ? 'Alice' : 'User'}: ${item.content}`)
    .join('\n');
  return `${basePrompt}\n\n短期对话记忆（仅供当前会话参考）：\n${memoryLines}`.slice(0, MAX_SYSTEM_PROMPT_CHARS);
}

function createCodedHttpError(message, statusCode, code) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}
