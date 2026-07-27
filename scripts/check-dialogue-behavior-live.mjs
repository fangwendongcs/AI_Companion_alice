import {
  inspectDialogueReply,
  resolveDialogueBehavior
} from '../backend/services/DialogueBehaviorPolicy.js';
import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { LLMService } from '../backend/services/LLMService.js';
import { MemoryService } from '../backend/services/MemoryService.js';

const LIVE_CASES = [
  { id: 1, message: '我今天很累，先别给建议。', expectedEmotion: 'concerned' },
  { id: 2, message: '我就是想抱怨一下。', expectedEmotion: 'concerned' },
  { id: 3, message: '你别老问我问题。' },
  { id: 4, message: '不想聊这个了。' },
  { id: 5, message: '不用安慰我，我只是随口说说。', expectedEmotion: 'warm' },
  { id: 6, message: '其实我刚才是在开玩笑。' },
  { id: 7, message: '你还记得我前面说的吗？', requireHistoryReference: true },
  { id: 8, message: '算了，当我没说。', expectedEmotion: 'warm' },
  { id: 9, message: '最近几天一直都很累。', expectedEmotion: 'concerned' },
  { id: 10, message: '我今天挺开心的。', expectedEmotion: 'happy' },
  { id: 11, message: '我感觉有点空，但不想解决。', expectedEmotion: 'concerned' },
  { id: 12, message: '你可以给我一些建议了。', requireAdvice: true }
];

if (!hasUsableDeepSeekKey(process.env)) {
  console.log('[check-dialogue-behavior-live] skipped: usable DeepSeek key is not available.');
  process.exit(0);
}

const memoryService = new MemoryService({ maxTurns: 6 });
const trackedLlm = createTrackedLLMService();
const service = new DialogueOrchestrationService({
  memoryService,
  llmService: trackedLlm.service,
  fallbackToStub: true
});
const failures = [];
const sessionId = `dialogue-behavior-live-${Date.now()}`;
const requestedCaseId = readRequestedCaseId(process.argv.slice(2));
const selectedCases = requestedCaseId
  ? LIVE_CASES.filter((item) => item.id === requestedCaseId)
  : LIVE_CASES;

for (const item of selectedCases) {
  const contextBefore = await memoryService.getContext({
    enabled: true,
    sessionId,
    avatarId: 'alice'
  });
  const behavior = resolveDialogueBehavior({
    message: item.message,
    history: contextBefore.context
  });
  const startedAt = Date.now();
  const attemptStartIndex = trackedLlm.attempts.length;
  let result = null;

  try {
    result = await service.run({
      message: item.message,
      provider: 'deepseek',
      model: '',
      sessionId,
      avatarId: 'alice',
      options: { useMemory: true, useRag: false, useWorkflow: false }
    });
  } catch (error) {
    failures.push(`用例 ${item.id} 请求失败：${safeError(error)}`);
    console.log(JSON.stringify({
      id: item.id,
      message: item.message,
      error: safeError(error),
      llmAttempts: trackedLlm.attempts.slice(attemptStartIndex),
      elapsedMs: Date.now() - startedAt
    }));
    continue;
  }

  const inspection = inspectDialogueReply({
    reply: result.reply_text,
    behavior,
    userMessage: item.message
  });
  const emotion = result.emotion?.name || '-';
  const fallback = result.meta?.mode !== 'llm_only' || result.meta?.fallback?.applied === true;
  const historyReferenced = !item.requireHistoryReference
    || /(?:累|抱怨|问题|话题|安慰|随口|玩笑|开玩笑)/.test(result.reply_text);
  const adviceRestored = !item.requireAdvice || inspection.hasSubstantiveAdvice;
  const record = {
    id: item.id,
    message: item.message,
    reply: result.reply_text,
    provider: result.meta?.provider || '-',
    model: result.meta?.model || '-',
    mode: result.meta?.mode || '-',
    fallback,
    fallbackReason: result.meta?.fallback?.reason || null,
    emotion,
    tone: result.tone || '-',
    behaviorMode: behavior.mode,
    violations: inspection.violations,
    sentenceCount: inspection.sentenceCount,
    questionCount: inspection.questionCount,
    llmAttempts: trackedLlm.attempts.slice(attemptStartIndex),
    elapsedMs: Date.now() - startedAt
  };
  console.log(JSON.stringify(record));

  if (fallback) failures.push(`用例 ${item.id} 触发了 fallback。`);
  if (result.meta?.provider !== 'deepseek') failures.push(`用例 ${item.id} provider 不是 deepseek。`);
  if (!inspection.ok) failures.push(`用例 ${item.id} 违反行为约束：${inspection.violations.join(', ')}。`);
  if (item.expectedEmotion && emotion !== item.expectedEmotion) {
    failures.push(`用例 ${item.id} emotion 应为 ${item.expectedEmotion}，实际为 ${emotion}。`);
  }
  if (behavior.lowEnergy && emotion === 'happy') {
    failures.push(`用例 ${item.id} 低能量表达错误进入 happy。`);
  }
  if (!historyReferenced) failures.push(`用例 ${item.id} 未实际承接近期上下文。`);
  if (!adviceRestored) failures.push(`用例 ${item.id} 未在用户允许后恢复建议能力。`);
}

if (failures.length) {
  console.error('[check-dialogue-behavior-live] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[check-dialogue-behavior-live] ok (${selectedCases.length} DeepSeek cases)`);

function hasUsableDeepSeekKey(env) {
  const value = String(env.DEEPSEEK_API_KEY || env.LLM_API_KEY || '').trim();
  return Boolean(value)
    && !/(replace|placeholder|your[_-]?key|test[_-]?key|example|dummy|fake)/i.test(value);
}

function safeError(error) {
  return String(error?.code || error?.message || 'unknown_error')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 160);
}

function readRequestedCaseId(args) {
  const value = args
    .map((item) => String(item || ''))
    .find((item) => item.startsWith('--case='));
  if (!value) return null;
  const number = Number(value.slice('--case='.length));
  return Number.isInteger(number) && LIVE_CASES.some((item) => item.id === number)
    ? number
    : null;
}

function createTrackedLLMService() {
  const base = new LLMService();
  const attempts = [];
  return {
    attempts,
    service: {
      chatDetailed: async (input) => {
        try {
          const result = await base.chatDetailed(input);
          attempts.push({
            temperature: input.temperature ?? null,
            replyChars: String(result.reply || '').length,
            finishReason: result.diagnostics?.finishReason || null,
            truncated: result.diagnostics?.truncated === true
          });
          return result;
        } catch (error) {
          attempts.push({
            temperature: input.temperature ?? null,
            errorCode: String(error?.code || 'unknown_error'),
            statusCode: Number(error?.statusCode || 0) || null,
            finishReason: error?.diagnostics?.finishReason || null,
            truncated: error?.diagnostics?.truncated === true,
            completionTokens: Number(error?.diagnostics?.usage?.completionTokens ?? -1) >= 0
              ? Number(error.diagnostics.usage.completionTokens)
              : null
          });
          throw error;
        }
      }
    }
  };
}
