import { readFile } from 'node:fs/promises';
import { EventBus } from '../js/core/EventBus.js';
import { EVENT_NAMES } from '../js/core/events/eventNames.js';
import { CompanionStateStore } from '../js/state/CompanionStateStore.js';

const failures = [];

await checkEventNamesContract();
await checkEventBusContract();
await checkStateStoreContract();
await checkDebugPanelContract();
await checkAppControllerContract();

if (failures.length) {
  console.error('[check-runtime-contracts] 运行时合约检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-runtime-contracts] ok');

async function checkEventNamesContract() {
  const requiredEvents = {
    APP_INIT: 'app:init',
    APP_READY: 'app:ready',
    STATE_CHANGED: 'state:changed',
    AVATAR_SWITCH_START: 'avatar:switch:start',
    AVATAR_SWITCH_COMPLETE: 'avatar:switch:complete',
    AVATAR_SWITCH_ERROR: 'avatar:switch:error',
    INTERACTION_HIT: 'interaction:hit',
    ANIMATION_STATE: 'animation:state',
    ANIMATION_ACTION_START: 'animation:action:start',
    ANIMATION_ACTION_COMPLETE: 'animation:action:complete',
    DIALOGUE_USER: 'dialogue:user',
    DIALOGUE_THINKING: 'dialogue:thinking',
    DIALOGUE_ASSISTANT: 'dialogue:assistant',
    DIALOGUE_ERROR: 'dialogue:error',
    AUDIO_REQUEST: 'audio:request',
    AUDIO_START: 'audio:start',
    AUDIO_END: 'audio:end',
    AUDIO_FALLBACK: 'audio:fallback',
    AUDIO_ERROR: 'audio:error',
    SYSTEM_ERROR: 'system:error'
  };

  Object.entries(requiredEvents).forEach(([key, value]) => {
    assert(EVENT_NAMES[key] === value, `EVENT_NAMES.${key} 必须等于 ${value}。`);
  });
}

async function checkEventBusContract() {
  const bus = new EventBus();
  const received = [];
  const unsubscribe = bus.on('contract:test', (detail) => received.push(detail.value));

  bus.emit('contract:test', { value: 1 });
  unsubscribe();
  bus.emit('contract:test', { value: 2 });

  assert(received.join(',') === '1', 'EventBus on()/unsubscribe 必须能正确订阅和解绑。');

  let onceCount = 0;
  bus.once('contract:once', () => { onceCount += 1; });
  bus.emit('contract:once');
  bus.emit('contract:once');
  assert(onceCount === 1, 'EventBus once() 必须只触发一次。');

  bus.destroy();
  assert(bus.unsubscribeCallbacks.size === 0, 'EventBus destroy() 必须清理订阅记录。');
}

async function checkStateStoreContract() {
  const initialState = {
    app: { isReady: false, mode: 'development', error: null },
    avatar: { currentAvatarId: null, loading: false, loaded: false, meta: null },
    animation: { currentAnimation: null, state: 'idle', isPlaying: false },
    dialogue: { input: '', thinking: false, lastResponse: '', error: null },
    audio: { speaking: false, muted: false, currentVoice: null },
    interaction: { enabled: true, lastInteractionAt: null },
    currentState: 'idle',
    isThinking: false,
    isSpeaking: false,
    isAnimating: false,
    currentAnimation: null,
    currentAvatarId: null,
    characterMeta: null,
    systemError: null
  };

  const requiredTopLevelKeys = [
    'app',
    'avatar',
    'animation',
    'dialogue',
    'audio',
    'interaction',
    'currentState',
    'isThinking',
    'isSpeaking',
    'isAnimating',
    'currentAnimation',
    'currentAvatarId',
    'characterMeta',
    'systemError'
  ];

  const bus = new EventBus();
  let stateChanged = null;
  bus.on(EVENT_NAMES.STATE_CHANGED, (detail) => { stateChanged = detail; });
  const store = new CompanionStateStore(initialState, bus);

  requiredTopLevelKeys.forEach((key) => {
    assert(Object.prototype.hasOwnProperty.call(store.getState(), key), `CompanionStateStore 初始状态缺少 ${key}。`);
  });

  store.patch({ isThinking: true }, 'contract:patch');
  assert(store.getState().isThinking === true, 'CompanionStateStore patch() 必须更新状态。');
  assert(stateChanged?.source === 'contract:patch', 'CompanionStateStore patch() 必须发出 state:changed。');

  store.patchPath('audio', { speaking: true }, 'contract:path');
  assert(store.getState().audio.speaking === true, 'CompanionStateStore patchPath() 必须支持分层状态更新。');

  store.destroy();
}

async function checkDebugPanelContract() {
  const source = await readFile('js/ui/DebugPanelController.js', 'utf8');
  const requiredFields = [
    'currentAvatarId',
    'avatar.loading',
    'currentState',
    'currentAnimation',
    'isThinking',
    'isSpeaking',
    'lastEvent',
    'lastError'
  ];

  assert(!source.includes('.innerHTML'), 'DebugPanelController 不应使用 innerHTML 更新调试状态。');
  assert(source.includes('EVENT_NAMES.STATE_CHANGED'), 'DebugPanelController 必须监听 state:changed 或等价状态刷新事件。');
  assert(source.includes('getState'), 'DebugPanelController 必须通过 getState 消费状态快照。');
  assert(/destroy\s*\(/.test(source), 'DebugPanelController 必须提供 destroy()。');
  requiredFields.forEach((field) => {
    assert(source.includes(field), `DebugPanelController 必须展示 ${field}。`);
  });
}

async function checkAppControllerContract() {
  const source = await readFile('js/app/AppController.js', 'utf8');
  const requiredInitialStateKeys = [
    'app',
    'avatar',
    'animation',
    'dialogue',
    'audio',
    'interaction',
    'currentState',
    'isThinking',
    'isSpeaking',
    'isAnimating',
    'currentAnimation',
    'currentAvatarId',
    'characterMeta',
    'systemError'
  ];

  requiredInitialStateKeys.forEach((key) => {
    assert(source.includes(`${key}:`), `AppController.createInitialState() 应保留 ${key}。`);
  });

  assert(source.includes('resetSpeakingState'), 'AppController 必须保留 resetSpeakingState()。');
  assert(source.includes("new LLMClient('/api/dialogue'"), 'AppController 前端主对话链路必须默认调用 /api/dialogue。');
  assert(
    /resetSpeakingState[\s\S]*MotionSlot\.IDLE/.test(source),
    'resetSpeakingState() 必须确保 speaking 结束后能请求 idle。'
  );
  assert(source.includes('avatarSwitchChain'), 'AppController 必须保留 avatar switch 串行链。');
  assert(source.includes('avatarSwitchVersion'), 'AppController 必须保留 avatar switch 版本护栏。');
  assert(source.includes('retainedAvatar'), 'AppController 切换失败时必须尝试保留已有可用角色。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
