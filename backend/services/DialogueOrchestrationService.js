import { createHttpError } from '../utils/httpError.js';
import { MemoryService } from './MemoryService.js';
import { N8nWorkflowService } from './N8nWorkflowService.js';
import { RagService } from './RagService.js';
import { LLMService, resolveLLMRequest } from './LLMService.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PersonaService } from './PersonaService.js';
import { CompanionAffectService } from './CompanionAffectService.js';
import {
  inspectDialogueReply,
  resolveDialogueBehavior
} from './DialogueBehaviorPolicy.js';
import { buildDialogueContract } from '../contracts/dialogueContract.js';
import {
  dialogueDebugLLMDiagnostics,
  dialogueFallbackToStub
} from '../config/serverConfig.js';
import { redactText } from '../utils/redact.js';
import {
  attachDialogueErrorTrace,
  attachDialogueTrace,
  elapsedMs,
  nowMs
} from '../utils/dialogueObservability.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_PROMPT_CHARS = 4000;
const MAX_SESSION_ID_CHARS = 80;
const DEFAULT_AVATAR_ID = 'alice';
const SAFE_LLM_FINISH_REASONS = new Set([
  'stop',
  'length',
  'content_filter',
  'tool_calls',
  'function_call',
  'unknown'
]);

export class DialogueOrchestrationService {
  constructor({
    memoryService = new MemoryService(),
    ragService = new RagService(),
    workflowService = new N8nWorkflowService(),
    llmService = new LLMService(),
    promptBuilder = new PromptBuilder(),
    personaService = new PersonaService(),
    affectService = new CompanionAffectService(),
    behaviorPolicy = resolveDialogueBehavior,
    fallbackToStub = dialogueFallbackToStub,
    debugLLMDiagnostics = dialogueDebugLLMDiagnostics
  } = {}) {
    this.memoryService = memoryService;
    this.ragService = ragService;
    this.workflowService = workflowService;
    this.llmService = llmService;
    this.promptBuilder = promptBuilder;
    this.personaService = personaService;
    this.affectService = affectService;
    this.behaviorPolicy = behaviorPolicy;
    this.fallbackToStub = fallbackToStub;
    this.debugLLMDiagnostics = Boolean(debugLLMDiagnostics);
  }

  async run(payload = {}, { requestId = '' } = {}) {
    const orchestrationStartedAt = nowMs();
    let llmMs = null;
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
    const behavior = this.behaviorPolicy({
      message,
      history: memory?.context
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
      const response = await this.buildStubResponse({
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
      return attachDialogueTrace(response, {
        requestId,
        orchestrationStartedAt,
        llmMs
      });
    }

    let reply = '';
    let resolvedRequest = {
      provider,
      model
    };
    let llmDiagnostics = null;
    try {
      resolvedRequest = resolveLLMRequest({ provider, model });
      const dialogueContext = this.promptBuilder.buildDialogueContext({
        systemPrompt,
        persona,
        memory,
        rag,
        workflow,
        behavior
      });
      const llmInput = {
        message,
        provider: resolvedRequest.provider,
        model: resolvedRequest.model,
        systemPrompt: dialogueContext.systemPrompt,
        history: dialogueContext.history,
        temperature: resolveDialogueTemperature(behavior),
        maxTokens: resolveDialogueMaxTokens(behavior, resolvedRequest.provider)
      };
      const llmStartedAt = nowMs();
      try {
        let result = await callLLMServiceForBehavior(this.llmService, llmInput);
        reply = result.reply;
        resolvedRequest = {
          provider: result.provider,
          model: result.model
        };
        llmDiagnostics = normalizeLLMDiagnostics(result.diagnostics);

        let inspection = inspectReplyDraft({ reply, behavior, message });
        for (let repairAttempt = 0; repairAttempt < 2 && !inspection.ok; repairAttempt += 1) {
          result = await callLLMServiceForBehavior(this.llmService, {
            ...llmInput,
            provider: resolvedRequest.provider,
            model: resolvedRequest.model,
            systemPrompt: buildBehaviorRepairPrompt(
              dialogueContext.systemPrompt,
              inspection.violations
            ),
            history: [
              ...dialogueContext.history,
              { role: 'user', content: message },
              { role: 'assistant', content: reply }
            ],
            message: '请按后端本轮重写要求改写上一条草稿。只输出新的回复正文，不要解释。',
            temperature: 0.5
          });
          reply = result.reply;
          resolvedRequest = {
            provider: result.provider,
            model: result.model
          };
          llmDiagnostics = normalizeLLMDiagnostics(result.diagnostics);
          inspection = inspectReplyDraft({ reply, behavior, message });
        }
      } finally {
        llmMs = elapsedMs(llmStartedAt);
      }
      if (!String(reply || '').trim()) {
        throw createCodedHttpError('LLM upstream returned an empty response.', 502, 'LLM_EMPTY_RESPONSE');
      }
    } catch (error) {
      if (!this.fallbackToStub || !shouldFallbackToStub(error)) {
        throw attachDialogueErrorTrace(error, {
          requestId,
          orchestrationStartedAt,
          llmMs
        });
      }
      const response = await this.buildStubResponse({
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
      return attachDialogueTrace(response, {
        requestId,
        orchestrationStartedAt,
        llmMs
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
      systemPromptReceived: Boolean(systemPrompt),
      ...(this.debugLLMDiagnostics && llmDiagnostics
        ? { llmDiagnostics }
        : {})
    };
    const response = buildDialogueResponse({
      reply,
      sources: rag.sources || [],
      memory: responseMemory,
      rag,
      workflow,
      affect,
      meta
    });
    return attachDialogueTrace(response, {
      requestId,
      orchestrationStartedAt,
      llmMs
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

function normalizeLLMDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const rawFinishReason = typeof diagnostics.finishReason === 'string'
    ? diagnostics.finishReason.trim().toLowerCase()
    : '';
  const finishReason = !rawFinishReason
    ? null
    : SAFE_LLM_FINISH_REASONS.has(rawFinishReason) ? rawFinishReason : 'unknown';
  return {
    finishReason,
    truncated: diagnostics.truncated === true || finishReason === 'length',
    promptTokens: normalizeDiagnosticTokenCount(diagnostics.usage?.promptTokens),
    completionTokens: normalizeDiagnosticTokenCount(diagnostics.usage?.completionTokens),
    totalTokens: normalizeDiagnosticTokenCount(diagnostics.usage?.totalTokens)
  };
}

async function callLLMService(llmService, input) {
  if (typeof llmService.chatDetailed === 'function') {
    const result = await llmService.chatDetailed(input);
    return {
      reply: result.reply,
      provider: result.provider || input.provider,
      model: result.model || input.model,
      diagnostics: result.diagnostics || null
    };
  }
  return {
    reply: await llmService.chat(input),
    provider: input.provider,
    model: input.model,
    diagnostics: null
  };
}

async function callLLMServiceForBehavior(llmService, input) {
  try {
    return await callLLMService(llmService, input);
  } catch (error) {
    if (error?.code !== 'LLM_EMPTY_RESPONSE') throw error;
    return {
      reply: '',
      provider: input.provider,
      model: input.model,
      diagnostics: null
    };
  }
}

function buildBehaviorRepairPrompt(systemPrompt, violations = []) {
  const labels = {
    forbidden_advice: '只承接用户的感受和边界，不给方案、行动指令或软性引导',
    missing_requested_advice: '用户已明确请求建议，直接给出至少一条具体建议，不要只追问',
    empty_reply: '必须生成一条非空、自然的中文回复',
    forbidden_question: '不要提出任何问题或变相索取信息',
    forbidden_topic_shift: '不要转移或开启新话题',
    forbidden_comfort: '不要安慰、哄劝或夸大情绪',
    response_too_long: '压缩到当前轮规定的句数',
    too_many_questions: '问题数量必须符合当前轮上限',
    over_medicalized: '删除无依据的医学化或危机化判断',
    repetitive_template: '删除重复陪伴模板',
    stage_direction: '删除所有括号动作、表情和语气提示',
    mechanical_meta: '像角色一样自然承接，不提“对话记录”“系统”或 AI 自检过程',
    misstated_memory_scope: '把内容准确表述为近期对话，不声称已保存为记忆或长期记忆',
    mechanical_echo: '不要机械复述用户原句'
  };
  const requirements = [...new Set(violations)]
    .map((item) => labels[item])
    .filter(Boolean);
  const repairSection = [
    '【后端本轮重写要求】',
    `上一次草稿未通过行为检查：${requirements.join('；') || '不符合当前轮策略'}。`,
    '重新生成一条自然、简短、保持当前 Persona 的中文最终回复。句子聚焦用户已经表达的感受或处境，不描述用户接下来该做什么，并自然尊重其即时要求。只输出回复正文，不解释规则，也不要提到重写或检查。'
  ].join('\n');
  return `${String(systemPrompt || '').trim()}\n\n${repairSection}`;
}

function inspectReplyDraft({ reply, behavior, message }) {
  if (!String(reply || '').trim()) {
    return { ok: false, violations: ['empty_reply'] };
  }
  return inspectDialogueReply({
    reply,
    behavior,
    userMessage: message
  });
}

function resolveDialogueTemperature(behavior = {}) {
  const hasExplicitBoundary = behavior.advice === 'forbidden'
    || behavior.questions === 'forbidden'
    || behavior.topicShift === 'forbidden'
    || behavior.comfort === 'reduced'
    || behavior.correction !== 'none';
  if (hasExplicitBoundary) return 0.7;
  if (behavior.lowEnergy) return 0.65;
  return 0.8;
}

function resolveDialogueMaxTokens(behavior = {}, provider = '') {
  const hasExplicitBoundary = behavior.advice === 'forbidden'
    || behavior.questions === 'forbidden'
    || behavior.topicShift === 'forbidden'
    || behavior.comfort === 'reduced'
    || behavior.correction !== 'none'
    || behavior.adviceRequested === true;
  return provider === 'deepseek' && hasExplicitBoundary ? 480 : undefined;
}

function normalizeDiagnosticTokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function safeErrorMessage(error) {
  return redactText(error?.message || 'optional context failed').slice(0, 200);
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
