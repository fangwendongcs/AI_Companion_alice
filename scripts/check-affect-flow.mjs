import { CompanionAffectService } from '../backend/services/CompanionAffectService.js';
import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';

const failures = [];

checkAffectPolicyOutputs();
await checkDialogueAffectMetadata();

if (failures.length) {
  console.error('[check-affect-flow] Affect 决策层检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-affect-flow] ok');

function checkAffectPolicyOutputs() {
  const service = new CompanionAffectService();
  const memoryHit = service.decide({
    message: '继续',
    reply: '我记得你喜欢简短回复。',
    memory: { longTerm: { count: 1 } }
  });
  assert(memoryHit.emotion === 'warm', 'memory 命中应倾向 warm。');
  assert(memoryHit.voice?.rate > 0 && memoryHit.voice?.pitch > 0, 'affect.voice 必须包含可用 rate / pitch。');
  assert(memoryHit.motion?.slot, 'affect.motion 必须包含 motion slot。');

  const error = service.decide({
    message: '测试',
    reply: '抱歉，连接出现问题。',
    error: new Error('failed')
  });
  assert(error.emotion === 'apologetic', '错误或 fallback 应倾向 apologetic。');
  assert(error.motion?.slot === 'apologize', 'apologetic 应映射到 apologize motion hint。');

  const distress = service.decide({
    message: '我今天很累，也有点空。',
    reply: '辛苦了，项目做完值得开心！',
    memory: { longTerm: { count: 2 } }
  });
  assert(distress.emotion === 'concerned', '用户明确疲惫或担心时应优先 concerned，不能被回复感叹号或 memory 覆盖。');
  assert(distress.reason === 'user_distress', '用户负面状态应保留稳定的 user_distress 原因。');
}

async function checkDialogueAffectMetadata() {
  const service = new DialogueOrchestrationService();
  const result = await service.run({
    message: '请记住：我喜欢温柔一点的语气',
    provider: 'stub',
    model: 'stub',
    sessionId: 'affect-flow-session',
    options: { useMemory: true, useRag: false, useWorkflow: false }
  });
  assert(result.affect?.emotion, '/api/dialogue 必须返回 affect.emotion。');
  assert(result.affect?.tone, '/api/dialogue 必须返回 affect.tone。');
  assert(result.affect?.voice?.style, '/api/dialogue 必须返回 affect.voice.style。');
  assert(result.affect?.motion?.slot, '/api/dialogue 必须返回 affect.motion.slot。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
