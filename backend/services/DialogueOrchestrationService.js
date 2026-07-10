import { createHttpError } from '../utils/httpError.js';
import { MemoryService } from './MemoryService.js';
import { N8nWorkflowService } from './N8nWorkflowService.js';
import { RagService } from './RagService.js';
import { LLMService, resolveLLMRequest } from './LLMService.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PersonaService } from './PersonaService.js';
import { CompanionAffectService } from './CompanionAffectService.js';
import { buildDialogueContract } from '../contracts/dialogueContract.js';
import { dialogueFallbackToStub } from '../config/serverConfig.js';

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
    promptBuilder = new PromptBuilder(),
    personaService = new PersonaService(),
    affectService = new CompanionAffectService(),
    fallbackToStub = dialogueFallbackToStub
  } = {}) {
    this.memoryService = memoryService;
    this.ragService = ragService;
    this.workflowService = workflowService;
    this.llmService = llmService;
    this.promptBuilder = promptBuilder;
    this.personaService = personaService;
    this.affectService = affectService;
    this.fallbackToStub = fallbackToStub;
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
    const persona = this.personaService.getPersona(avatarId);
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
      return this.buildStubResponse({
        message,
        memory,
        rag,
        workflow,
        persona,
        options,
        sessionId,
        avatarId,
        provider,
        model,
        systemPrompt
      });
    }

    let reply = '';
    let resolvedRequest = {
      provider,
      model
    };
    try {
      resolvedRequest = resolveLLMRequest({ provider, model });
      const dialogueContext = this.promptBuilder.buildDialogueContext({
        systemPrompt,
        persona,
        memory,
        rag,
        workflow
      });
      const llmInput = {
        message,
        provider: resolvedRequest.provider,
        model: resolvedRequest.model,
        systemPrompt: dialogueContext.systemPrompt,
        history: dialogueContext.history
      };
      if (typeof this.llmService.chatDetailed === 'function') {
        const result = await this.llmService.chatDetailed(llmInput);
        reply = result.reply;
        resolvedRequest = {
          provider: result.provider,
          model: result.model
        };
      } else {
        reply = await this.llmService.chat(llmInput);
      }
      if (!String(reply || '').trim()) {
        throw createCodedHttpError('LLM upstream returned an empty response.', 502, 'LLM_EMPTY_RESPONSE');
      }
    } catch (error) {
      if (!this.fallbackToStub || !shouldFallbackToStub(error)) throw error;
      return this.buildStubResponse({
        message,
        memory,
        rag,
        workflow,
        persona,
        options,
        sessionId,
        avatarId,
        provider: resolvedRequest.provider,
        model: resolvedRequest.model,
        systemPrompt,
        fallback: buildFallbackMeta(error)
      });
    }

    const updatedMemory = await this.appendMemoryExchange({
      enabled: options.useMemory,
      sessionId,
      avatarId,
      message,
      reply
    });
    const responseMemory = updatedMemory || memory;
    const affect = this.affectService.decide({
      message,
      reply,
      persona,
      memory: responseMemory,
      rag,
      workflow
    });

    const meta = {
      mode: 'llm_only',
      orchestration: 'agent_pipeline',
      steps: buildStepMeta({ memory: responseMemory, rag, workflow }),
      persona: toPersonaMeta(persona),
      provider: resolvedRequest.provider,
      model: resolvedRequest.model,
      systemPromptReceived: Boolean(systemPrompt)
    };
    return buildDialogueResponse({
      reply,
      sources: rag.sources || [],
      memory: responseMemory,
      rag,
      workflow,
      affect,
      meta
    });
  }

  async buildStubResponse({
    message,
    memory,
    rag,
    workflow,
    persona,
    options,
    sessionId,
    avatarId,
    provider,
    model,
    systemPrompt,
    fallback = null
  }) {
    const reply = buildLocalStubReply(message, memory, rag, persona);
    const updatedMemory = await this.appendMemoryExchange({
      enabled: options.useMemory,
      sessionId,
      avatarId,
      message,
      reply
    });
    const responseMemory = updatedMemory || memory;
    const affect = this.affectService.decide({
      message,
      reply,
      persona,
      memory: responseMemory,
      rag,
      workflow
    });
    const meta = {
      mode: fallback ? 'llm_fallback_stub' : 'llm_stub',
      orchestration: 'agent_pipeline',
      steps: buildStepMeta({ memory: responseMemory, rag, workflow }),
      persona: toPersonaMeta(persona),
      provider,
      model: fallback ? (model || null) : (model || 'stub'),
      systemPromptReceived: Boolean(systemPrompt),
      ...(fallback
        ? { fallback }
        : { note: 'Local stub provider is for smoke tests and local boundary checks only.' })
    };
    return buildDialogueResponse({
      reply,
      sources: rag.sources || [],
      memory: responseMemory,
      rag,
      workflow,
      affect,
      meta
    });
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

function buildDialogueResponse({ reply, sources, memory, rag, workflow, affect, meta }) {
  const contractFields = buildDialogueContract({
    reply,
    sources,
    memory,
    affect,
    meta
  });
  return {
    ...contractFields,
    reply,
    sources,
    memory,
    rag,
    workflow,
    affect,
    meta: {
      ...meta,
      contract: contractFields.contract
    }
  };
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

function shouldFallbackToStub(error) {
  return new Set([
    'LLM_NOT_CONFIGURED',
    'LLM_INVALID_API_KEY',
    'LLM_UPSTREAM_TIMEOUT',
    'LLM_UPSTREAM_ERROR',
    'LLM_INVALID_RESPONSE',
    'LLM_EMPTY_RESPONSE'
  ]).has(error?.code);
}

function buildFallbackMeta(error) {
  const reasonByCode = {
    LLM_NOT_CONFIGURED: 'not_configured',
    LLM_INVALID_API_KEY: 'not_configured',
    LLM_UPSTREAM_TIMEOUT: 'timeout',
    LLM_INVALID_RESPONSE: 'invalid_response',
    LLM_EMPTY_RESPONSE: 'empty_response',
    LLM_UPSTREAM_ERROR: 'upstream_error'
  };
  return {
    applied: true,
    reason: reasonByCode[error?.code] || 'upstream_error'
  };
}

function buildLocalStubReply(message, memory, rag, persona = null) {
  const text = String(message || '').trim();
  if (rag?.used && rag.passages?.length) {
    return `我查到了 ${rag.passages.length} 条本地知识片段。当前仍是本地演示模式，RAG 检索链路已经跑通了。`;
  }
  if (asksForgetMemory(text)) {
    return '可以，我不会把这句话写入长期记忆。需要清除已经保存的内容时，可以在记忆面板里清除当前会话或当前角色记忆。';
  }
  if (asksMemoryRecall(text)) {
    if (memory?.longTerm?.count > 0) {
      return `我记得：${formatMemoryPreview(memory.longTerm.items)}。这些是你明确让我保存的长期记忆。`;
    }
    if (memory?.used && memory.turnCount > 0) {
      return `我记得我们刚聊过 ${memory.turnCount} 轮，但还没有保存长期记忆。`;
    }
    return '我现在还没有可用的长期记忆。你可以明确说“请记住：……”，我会按当前会话保存。';
  }
  if (memory?.used && memory.turnCount > 0) {
    if (memory.longTerm?.count > 0) {
      return `我记得 ${memory.longTerm.count} 条你明确让我保存的长期记忆。当前仍是本地演示模式，长期记忆链路已经跑通了。`;
    }
    return `我记得我们刚聊过 ${memory.turnCount} 轮。当前仍是本地演示模式，短期记忆链路已经跑通了。`;
  }
  if (/状态|测试|链路|hello|你好/i.test(text)) {
    return `${persona?.name || 'Alice'} 现在处于本地演示模式，还没有连接真实模型，但对话链路已经跑通了。`;
  }
  return `${persona?.name || 'Alice'} 在本地演示模式，可以陪你完成交互流程；接入真实模型后，我会回答得更聪明。`;
}

function asksMemoryRecall(text) {
  return /(你还记得|还记得吗|记得什么|你记得|我让你记住|保存了什么|长期记忆)/i.test(text);
}

function asksForgetMemory(text) {
  return /(忘记这个|忘掉这个|别记这个|不要记这个|不用记这个|删除记忆|清除记忆)/i.test(text);
}

function formatMemoryPreview(items = []) {
  const preview = items
    .slice(0, 3)
    .map((item) => String(item?.content || '').trim())
    .filter(Boolean)
    .join('；');
  return preview || '目前只有记忆状态，没有可展示内容';
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

function toPersonaMeta(persona = {}) {
  return {
    avatarId: persona.avatarId || DEFAULT_AVATAR_ID,
    personaId: persona.personaId || 'alice_default',
    name: persona.name || 'Alice',
    tone: persona.tone || 'warm_playful',
    voiceStyle: persona.defaultVoice?.style || 'gentle',
    motionStyle: persona.defaultMotion?.style || 'light',
    memoryStrategy: persona.memoryStrategy || 'session_scoped_conservative'
  };
}

function createCodedHttpError(message, statusCode, code) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}
