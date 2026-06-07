import { readFile } from 'node:fs/promises';
import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { MemoryService } from '../backend/services/MemoryService.js';

const failures = [];

await checkDialogueResponseContract();
await checkFrontendConsumesContractCompatibly();
await checkContractDocumentation();

if (failures.length) {
  console.error('[check-dialogue-contract] 统一对话契约检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-dialogue-contract] ok');

async function checkDialogueResponseContract() {
  const service = new DialogueOrchestrationService({
    memoryService: new MemoryService()
  });
  const response = await service.run({
    message: '请用本地 stub 验证跨端 dialogue contract',
    provider: 'stub',
    model: 'stub',
    sessionId: 'contract-check-session',
    avatarId: 'alice',
    options: {
      useMemory: true,
      useRag: false,
      useWorkflow: false
    }
  });

  assert(typeof response.reply === 'string' && response.reply.length > 0, '必须保留 legacy reply 字段，避免 Web 主链路回退。');
  assert(response.reply_text === response.reply, 'reply_text 必须与 reply 同步，供跨端消费。');
  assert(response.companion_state === 'speaking', '成功 reply 的 companion_state 应为 speaking。');
  assert(response.emotion?.name && Number.isFinite(response.emotion?.intensity), '必须返回稳定 emotion 对象。');
  assert(response.tone, '必须返回 top-level tone。');
  assert(response.avatar_directive?.state === 'speaking', 'avatar_directive 必须包含 semantic state。');
  assert(response.avatar_directive?.gesture, 'avatar_directive 必须包含 semantic gesture。');
  assert(response.avatar_directive?.gaze === 'user', 'avatar_directive 必须包含 gaze。');
  assert(response.avatar_directive?.lip_sync === 'auto', 'avatar_directive 必须包含 lip_sync。');
  assert(response.memory_event?.badge, '必须返回 memory_event badge。');
  assert(response.tts?.status === 'pending' && response.tts.audio_url === null, 'dialogue 契约必须声明 TTS pending 状态。');
  assert(response.contract?.version === 'dialogue.v1', '必须返回 dialogue contract version。');
  assert(response.contract?.renderer_agnostic === true, 'contract 必须标明 renderer_agnostic。');
  assert(response.meta?.contract?.version === 'dialogue.v1', 'meta.contract 必须保留契约版本，方便客户端调试。');

  const serialized = JSON.stringify(response);
  ['animationFile', 'fbxPath', 'riveInput', 'vrmExpressionPreset', 'boneName'].forEach((field) => {
    assert(!serialized.includes(field), `/api/dialogue response 不应包含 renderer 绑定字段 ${field}。`);
  });
}

async function checkFrontendConsumesContractCompatibly() {
  const llm = await readFile('js/ai/LLMClient.js', 'utf8');
  const dialogue = await readFile('js/dialogue/DialogueManager.js', 'utf8');
  const app = await readFile('js/app/AppController.js', 'utf8');
  assert(llm.includes('reply_text'), 'LLMClient 必须兼容 reply_text。');
  assert(dialogue.includes('avatarDirective'), 'DialogueManager 必须转发 avatar_directive。');
  assert(app.includes('getMotionSlotForDirective'), 'AppController 必须通过语义 directive 映射到现有 motion slot。');
}

async function checkContractDocumentation() {
  const contractDoc = await readFile('docs/contracts/DIALOGUE_CONTRACT.md', 'utf8');
  const apiDoc = await readFile('docs/api/API.md', 'utf8');
  assert(contractDoc.includes('reply_text') && contractDoc.includes('avatar_directive'), '契约文档必须说明跨端字段。');
  assert(contractDoc.includes('iOS') && contractDoc.includes('Web'), '契约文档必须说明 Web / iOS 共用消费方式。');
  assert(apiDoc.includes('dialogue.v1'), 'API 文档必须标注 /api/dialogue 契约版本。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
