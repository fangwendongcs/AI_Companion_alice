import { createHttpError } from '../utils/httpError.js';
import { MemoryService } from './MemoryService.js';
import { N8nWorkflowService } from './N8nWorkflowService.js';
import { RagService } from './RagService.js';
import { LLMService } from './LLMService.js';
import { PromptBuilder } from './PromptBuilder.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;
const MAX_SESSION_ID_CHARS = 80;
const DEFAULT_AVATAR_ID = 'alice';

export class DialogueOrchestrationService {
  constructor({
    memoryService = new MemoryService(),
    ragService = new RagService(),
    workflowService = new N8nWorkflowService(),
    llmService = new LLMService(),
    promptBuilder = new PromptBuilder()
  } = {}) {
    this.memoryService = memoryService;
    this.ragService = ragService;
    this.workflowService = workflowService;
    this.llmService = llmService;
    this.promptBuilder = promptBuilder;
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
    const avatarId = normalizeAvatarId(payload.avatarId || options.avatarId);
    const memory = await this.getMemoryContext({
      message,
      enabled: options.useMemory,
      sessionId,
      avatarId
    });
    const rag = await this.getRagContext(message, {
      enabled: options.useRag
    });
    const workflow = await this.getWorkflowContext({
      message,
      provider,
      model
    }, {
      enabled: options.useWorkflow
    });

    if (isLocalStubProvider(provider)) {
      const reply = buildLocalStubReply(message, memory, rag);
      const updatedMemory = await this.appendMemoryExchange({
        enabled: options.useMemory,
        sessionId,
        avatarId,
        message,
        reply
      });
      const responseMemory = updatedMemory || memory;
      return {
        reply,
        sources: rag.sources || [],
        memory: responseMemory,
        rag,
        workflow,
        meta: {
          mode: 'llm_stub',
          orchestration: 'agent_pipeline',
          steps: buildStepMeta({ memory: responseMemory, rag, workflow }),
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
      systemPrompt: this.promptBuilder.build({
        systemPrompt,
        memory,
        rag,
        workflow
      })
    });
    const updatedMemory = await this.appendMemoryExchange({
      enabled: options.useMemory,
      sessionId,
      avatarId,
      message,
      reply
    });
    const responseMemory = updatedMemory || memory;

    return {
      reply,
      sources: rag.sources || [],
      memory: responseMemory,
      rag,
      workflow,
      meta: {
        mode: 'llm_only',
        orchestration: 'agent_pipeline',
        steps: buildStepMeta({ memory: responseMemory, rag, workflow }),
        provider,
        model: model || 'gpt-4o-mini',
        systemPromptReceived: Boolean(systemPrompt)
      }
    };
  }

  async appendMemoryExchange({ enabled, sessionId, avatarId, message, reply }) {
    if (!enabled) return null;
    try {
      const stored = await this.memoryService.appendExchange({
        sessionId,
        avatarId,
        userMessage: message,
        assistantMessage: reply
      }, { enabled });
      const context = await this.memoryService.getContext({
        enabled,
        sessionId,
        avatarId
      });
      return {
        ...context,
        longTermWrite: stored?.longTermWrite || null
      };
    } catch (error) {
      return {
        used: false,
        status: 'error',
        reason: 'memory_append_error',
        sessionId,
        avatarId,
        turnCount: 0,
        context: [],
        longTerm: {
          used: false,
          status: 'error',
          count: 0,
          items: []
        },
        error: safeErrorMessage(error)
      };
    }
  }

  async getMemoryContext({ message, enabled, sessionId, avatarId }) {
    try {
      return await this.memoryService.getContext({
        message,
        enabled,
        sessionId,
        avatarId
      });
    } catch (error) {
      return {
        used: false,
        status: 'error',
        reason: 'memory_error',
        sessionId: enabled ? sessionId : null,
        avatarId,
        turnCount: 0,
        context: [],
        longTerm: {
          used: false,
          status: 'error',
          count: 0,
          items: []
        },
        error: safeErrorMessage(error)
      };
    }
  }

  async getRagContext(message, { enabled }) {
    try {
      return await this.ragService.retrieve(message, { enabled });
    } catch (error) {
      return {
        used: false,
        status: 'error',
        reason: 'rag_error',
        passages: [],
        sources: [],
        error: safeErrorMessage(error)
      };
    }
  }

  async getWorkflowContext(payload, { enabled }) {
    try {
      return await this.workflowService.invokeWorkflow(payload, { enabled });
    } catch (error) {
      return {
        used: false,
        status: 'error',
        reason: 'workflow_error',
        result: null,
        error: safeErrorMessage(error)
      };
    }
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

function normalizeAvatarId(value) {
  return String(value || DEFAULT_AVATAR_ID)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_SESSION_ID_CHARS) || DEFAULT_AVATAR_ID;
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
    sessionId: normalizeSessionId(options?.sessionId),
    avatarId: normalizeAvatarId(options?.avatarId)
  };
}

function isLocalStubProvider(provider) {
  return ['stub', 'local', 'boundary'].includes(provider);
}

function buildLocalStubReply(message, memory, rag) {
  const text = String(message || '').trim();
  if (rag?.used && rag.passages?.length) {
    return `我查到了 ${rag.passages.length} 条本地知识片段。当前仍是本地演示模式，RAG 检索链路已经跑通了。`;
  }
  if (memory?.used && memory.turnCount > 0) {
    if (memory.longTerm?.count > 0) {
      return `我记得 ${memory.longTerm.count} 条你明确让我保存的长期记忆。当前仍是本地演示模式，长期记忆链路已经跑通了。`;
    }
    return `我记得我们刚聊过 ${memory.turnCount} 轮。当前仍是本地演示模式，短期记忆链路已经跑通了。`;
  }
  if (/状态|测试|链路|hello|你好/i.test(text)) {
    return '我现在处于本地演示模式，还没有连接真实模型，但对话链路已经跑通了。';
  }
  return '我在本地演示模式，可以陪你完成交互流程；接入真实模型后，我会回答得更聪明。';
}

function buildStepMeta({ memory, rag, workflow }) {
  return {
    memory: memory?.status || 'unknown',
    rag: rag?.status || 'unknown',
    workflow: workflow?.status || 'unknown'
  };
}

function safeErrorMessage(error) {
  return String(error?.message || 'optional context failed').slice(0, 200);
}

function createCodedHttpError(message, statusCode, code) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}
