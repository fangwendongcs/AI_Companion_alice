import { readFile } from 'node:fs/promises';

const failures = [];

await checkFrontendDialogueContract();
await checkAudioAndMotionAffectContract();
await checkMemoryPanelContract();
await checkDialoguePolishControls();
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
  const presentation = await readFile('js/avatar/presentation/PresentationOrchestrator.js', 'utf8');
  const motionController = await readFile('js/avatar/presentation/MotionController.js', 'utf8');
  const ttsController = await readFile('js/avatar/presentation/TTSController.js', 'utf8');
  const audio = await readFile('js/audio/AudioManager.js', 'utf8');
  const ttsService = await readFile('js/voice/TTSService.js', 'utf8');
  assert(app.includes('PresentationOrchestrator'), 'AppController 必须通过 PresentationOrchestrator 协调表现层。');
  assert(app.includes('EVENT_NAMES.AUDIO_REQUEST') && app.includes('handleAudioRequest'), 'AppController 必须把 audio:request 交给 PresentationOrchestrator。');
  assert(app.includes('EVENT_NAMES.AUDIO_FALLBACK') && app.includes('handleAudioFallback'), 'AppController 必须把 audio:fallback 交给 PresentationOrchestrator。');
  assert(app.includes('audioSource') && app.includes('handleAudioStart'), 'AppController 必须把可选 audioSource 透传给表现层。');
  assert(app.includes('handleAudioError'), 'AppController 必须把 audio:error 交给 PresentationOrchestrator 做表现层收敛。');
  assert(app.includes('syncPresentationDebugState'), 'AppController 必须把表现层 debug snapshot 同步到状态基座。');
  assert(presentation.includes('MotionController'), 'PresentationOrchestrator 必须委托 MotionController 处理动作表现。');
  assert(presentation.includes('TTSController'), 'PresentationOrchestrator 必须委托 TTSController 处理 TTS 生命周期。');
  assert(presentation.includes('getDebugState'), 'PresentationOrchestrator 必须暴露表现层 debug snapshot。');
  assert(presentation.includes('audioSource') && presentation.includes('lipSync.onAudioStart'), 'PresentationOrchestrator 必须把 audioSource 交给 LipSyncController。');
  assert(motionController.includes('requestAffectMotion'), 'MotionController 必须包含 affect -> motion 映射入口。');
  assert(motionController.includes('PresentationMotionSlot.CHAT') && motionController.includes('PresentationMotionSlot.BODY_TAP'), 'affect motion 必须能映射到现有 motion slot fallback。');
  assert(ttsController.includes('onRequest') && ttsController.includes('onStart') && ttsController.includes('onEnd') && ttsController.includes('onError'), 'TTSController 必须覆盖 request/start/end/error 生命周期。');
  assert(audio.includes('audioSource'), 'AudioManager 必须透传可选 audioSource。');
  assert(ttsService.includes('audioSource') && ttsService.includes('html-audio'), 'TTSService backend audio 应提供安全的 html-audio source。');
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

async function checkDialoguePolishControls() {
  const app = await readFile('js/app/AppController.js', 'utf8');
  const chat = await readFile('js/ui/ChatPanelController.js', 'utf8');
  const refs = await readFile('js/ui/domRefs.js', 'utf8');
  const html = await readFile('index.html', 'utf8');
  assert(html.includes('regenerateBtn') && html.includes('clearContextBtn'), '底部对话栏必须包含重新生成和清空上下文按钮。');
  assert(refs.includes('regenerateBtn') && refs.includes('clearContextBtn'), 'domRefs 必须暴露对话体验按钮。');
  assert(chat.includes('regenerateReply') && chat.includes('clearDialogueContext'), 'ChatPanelController 必须绑定对话体验动作。');
  assert(app.includes('sendDialogueText') && app.includes('scope=context'), 'AppController 必须复用对话发送链路并只清短期上下文。');
}

async function checkDebugPanelAffectFields() {
  const source = await readFile('js/ui/DebugPanelController.js', 'utf8');
  [
    'persona',
    'emotion',
    'tone',
    'voice.style',
    'motion.slot',
    'memory.longTerm',
    'avatar.renderer',
    'vrm.runtime',
    'vrm.expressionManager',
    'vrm.lookAt',
    'vrm.springBone',
    'lipSync.mode',
    'lipSync.audioDriven',
    'lipSync.amplitude',
    'lipSync.mouth'
  ].forEach((field) => {
    assert(source.includes(field), `DebugPanelController 必须展示 ${field}。`);
  });
  assert(source.includes('state.presentation?.lipSync'), 'DebugPanelController 必须从 presentation.lipSync 读取口型 debug 状态。');
  assert(source.includes('state.avatar?.capabilities'), 'DebugPanelController 必须从 avatar.capabilities 读取 renderer capability debug 状态。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
