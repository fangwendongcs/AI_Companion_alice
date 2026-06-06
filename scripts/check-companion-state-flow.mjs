import { readFile } from 'node:fs/promises';

const failures = [];

await checkFrontendDialogueContract();
await checkAudioAndMotionAffectContract();
await checkMemoryPanelContract();
await checkDebugPanelAffectFields();

if (failures.length) {
  console.error('[check-companion-state-flow] Companion 状态联动检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-companion-state-flow] ok');

async function checkFrontendDialogueContract() {
  const llm = await readFile('js/ai/LLMClient.js', 'utf8');
  const dialogue = await readFile('js/dialogue/DialogueManager.js', 'utf8');
  assert(llm.includes("avatarId: resolvedConfig.avatarId"), 'LLMClient 必须向 /api/dialogue 传递 avatarId。');
  assert(dialogue.includes('affect: response.affect'), 'DialogueManager 必须转发 affect。');
  assert(dialogue.includes('rag: response.rag'), 'DialogueManager 必须保留 rag metadata。');
  assert(dialogue.includes('workflow: response.workflow'), 'DialogueManager 必须保留 workflow metadata。');
}

async function checkAudioAndMotionAffectContract() {
  const app = await readFile('js/app/AppController.js', 'utf8');
  const audio = await readFile('js/audio/AudioManager.js', 'utf8');
  assert(app.includes('requestAffectMotion'), 'AppController 必须包含 affect -> motion 映射。');
  assert(app.includes('MotionSlot.CHAT') && app.includes('MotionSlot.BODY_TAP'), 'affect motion 必须能映射到现有 motion slot fallback。');
  assert(audio.includes('applyVoiceAffect'), 'AudioManager 必须根据 affect.voice 调整语音参数。');
  assert(audio.includes('affect'), 'AudioManager 必须透传 affect 到 audio events。');
}

async function checkMemoryPanelContract() {
  const panel = await readFile('js/ui/MemoryPanelController.js', 'utf8');
  const html = await readFile('index.html', 'utf8');
  assert(panel.includes('/api/memory'), 'MemoryPanelController 必须调用 /api/memory。');
  assert(panel.includes("method: 'DELETE'"), 'MemoryPanelController 必须支持清除长期记忆。');
  assert(!panel.includes('.innerHTML'), 'MemoryPanelController 不应使用 innerHTML 渲染记忆内容。');
  assert(html.includes('memoryItemsList'), 'index.html 必须包含长期记忆摘要容器。');
}

async function checkDebugPanelAffectFields() {
  const source = await readFile('js/ui/DebugPanelController.js', 'utf8');
  ['persona', 'emotion', 'tone', 'voice.style', 'motion.slot', 'memory.longTerm'].forEach((field) => {
    assert(source.includes(field), `DebugPanelController 必须展示 ${field}。`);
  });
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
