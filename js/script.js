import { CharacterManager } from './avatar/CharacterManager.js';
import { MotionManager, AvatarState } from './animation/MotionManager.js';
import { LLMClient } from './ai/LLMClient.js';
import { APP_MODE, EVENT_NAMES, REQUEST_TIMEOUTS, UI_TIMING, isAllowedAvatarModelFileName } from './config/appConfig.js';
import { DEFAULT_DIALOGUES, MOOD_DIALOGUES } from './config/dialogues.js';
import { validateRuntimeConfig } from './config/validateConfig.js';
import { MINIMAX_VOICE_PRESETS, OPENAI_TTS_VOICES } from './config/voicePresets.js';
import { EventBus } from './core/EventBus.js';
import { ERROR_CODES } from './core/errors/errorCodes.js';
import { handleAppError } from './core/errors/errorHandler.js';
import { createLogger } from './core/logger.js';
import { DialogueManager } from './dialogue/DialogueManager.js';
import { InteractionManager } from './interaction/InteractionManager.js';
import { SceneRuntime } from './scene/SceneRuntime.js';
import { ApiClient } from './services/api/ApiClient.js';
import { CompanionStateStore } from './state/CompanionStateStore.js';
import { LocalConfigStore } from './storage/LocalConfigStore.js';
import { SpeechRecognitionService } from './voice/SpeechRecognitionService.js';
import { TTSService } from './voice/TTSService.js';

const globalLog = createLogger('Global');

window.addEventListener('error', (event) => {
  globalLog.error('Global error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  globalLog.error('Unhandled promise rejection:', event.reason);
});

if (location.protocol === 'file:') {
  alert('请使用本地服务器运行本项目，例如：npm run dev、npx serve . 或 python -m http.server。');
}

const refs = {
  promptInput: document.getElementById('promptInput'),
  sendBtn: document.getElementById('sendBtn'),
  statusText: document.getElementById('statusText'),
  statusBadge: document.getElementById('statusBadge'),
  loading: document.getElementById('loading'),
  loaderProgress: document.getElementById('loaderProgress'),
  sidePanel: document.getElementById('sidePanel'),
  settingsBtn: document.getElementById('settingsBtn'),
  closePanelBtn: document.getElementById('closePanelBtn'),
  muteBtn: document.getElementById('muteBtn'),
  voiceBtn: document.getElementById('voiceBtn'),
  scaleSlider: document.getElementById('scaleSlider'),
  lightSlider: document.getElementById('lightSlider'),
  autoRotateToggle: document.getElementById('autoRotateToggle'),
  gridToggle: document.getElementById('gridToggle'),
  gridBg: document.getElementById('gridBg'),
  avatarSelect: document.getElementById('avatarSelect'),
  avatarMetaStatus: document.getElementById('avatarMetaStatus'),
  avatarIdInput: document.getElementById('avatarIdInput'),
  avatarNameInput: document.getElementById('avatarNameInput'),
  avatarModelFileInput: document.getElementById('avatarModelFileInput'),
  avatarMotionFileInput: document.getElementById('avatarMotionFileInput'),
  avatarSkeletonFileInput: document.getElementById('avatarSkeletonFileInput'),
  avatarTargetHeightInput: document.getElementById('avatarTargetHeightInput'),
  uploadAvatarBtn: document.getElementById('uploadAvatarBtn'),
  avatarUploadStatus: document.getElementById('avatarUploadStatus'),
  saveMemoryBtn: document.getElementById('saveMemoryBtn'),
  debugToggle: document.getElementById('debugToggle'),
  freezeAnimToggle: document.getElementById('freezeAnimToggle'),
  llmProvider: document.getElementById('llmProvider'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  apiKeyToggle: document.getElementById('apiKeyToggle'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  llmModel: document.getElementById('llmModel'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  saveLLMConfigBtn: document.getElementById('saveLLMConfigBtn'),
  testLLMBtn: document.getElementById('testLLMBtn'),
  llmStatus: document.getElementById('llmStatus'),
  ttsEngine: document.getElementById('ttsEngine'),
  voiceSelect: document.getElementById('voiceSelect'),
  openaiVoiceSelect: document.getElementById('openaiVoiceSelect'),
  openaiTTSInstructionsInput: document.getElementById('openaiTTSInstructionsInput'),
  minimaxVoiceGroup: document.getElementById('minimaxVoiceGroup'),
  minimaxVoiceSelect: document.getElementById('minimaxVoiceSelect'),
  minimaxModelSelect: document.getElementById('minimaxModelSelect'),
  customVoiceIdInput: document.getElementById('customVoiceIdInput'),
  browserVoiceGroup: document.getElementById('browserVoiceGroup'),
  openaiVoiceGroup: document.getElementById('openaiVoiceGroup'),
  speechRate: document.getElementById('speechRate'),
  speechPitch: document.getElementById('speechPitch'),
  rateVal: document.getElementById('rateVal'),
  pitchVal: document.getElementById('pitchVal'),
  testVoiceBtn: document.getElementById('testVoiceBtn'),
  ttsStatus: document.getElementById('ttsStatus'),
  ambientSlider: document.getElementById('ambientSlider'),
  fovSlider: document.getElementById('fovSlider')
};

const log = createLogger('App');
const eventBus = new EventBus();
const appDisposers = [];
const store = new LocalConfigStore();
const apiClient = new ApiClient({ timeoutMs: REQUEST_TIMEOUTS.ttsMs });
const llmClient = new LLMClient('/api/chat', { timeoutMs: REQUEST_TIMEOUTS.llmMs });
const ttsService = new TTSService('/api/tts', { timeoutMs: REQUEST_TIMEOUTS.ttsMs });
const runtime = new SceneRuntime(document.getElementById('scene'));
const characterManager = new CharacterManager(runtime);
const motionManager = new MotionManager();
const interactionManager = new InteractionManager(runtime, {
  onHit: ({ part, motionSlot }) => {
    patchState({ lastInteractionAt: Date.now() }, 'interaction:hit');
    eventBus.emit(EVENT_NAMES.INTERACTION_HIT, {
      part,
      motionSlot,
      avatarId: state.currentAvatarId
    });
  }
});
const recognitionService = new SpeechRecognitionService();
const dialogueManager = new DialogueManager({
  llmClient,
  eventBus,
  getConfig: () => readLLMFormConfig()
});

motionManager.onStateChange = ({ to }) => {
  eventBus.emit(EVENT_NAMES.ANIMATION_STATE, { state: to });
  applyAvatarState(to);
};
motionManager.onStateComplete = (nextState) => setAvatarState(nextState);
motionManager.onActionStart = (request) => {
  patchState({
    isAnimating: true,
    currentAnimation: request.name
  }, 'animation:action:start');
  eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_START, request);
};
motionManager.onActionComplete = (request) => {
  patchState({
    isAnimating: false,
    currentAnimation: null
  }, 'animation:action:complete');
  eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_COMPLETE, request);
};

const stateStore = new CompanionStateStore({
  app: {
    isReady: false,
    mode: APP_MODE,
    error: null
  },
  avatar: {
    currentAvatarId: null,
    loading: false,
    loaded: false,
    meta: null
  },
  animation: {
    currentAnimation: null,
    state: AvatarState.IDLE,
    isPlaying: false
  },
  dialogue: {
    input: '',
    thinking: false,
    lastResponse: '',
    error: null
  },
  audio: {
    speaking: false,
    muted: false,
    currentVoice: null
  },
  interaction: {
    enabled: true,
    lastInteractionAt: null
  },
  currentState: AvatarState.IDLE,
  isMuted: false,
  isSpeaking: false,
  isThinking: false,
  isAnimating: false,
  currentAnimation: null,
  animationState: AvatarState.IDLE,
  lastInteractionAt: null,
  modelLoaded: false,
  speechTimer: null,
  avatarRegistry: null,
  currentAvatarId: null,
  characterMeta: null,
  systemError: null
}, eventBus);
const state = stateStore.getState();

let llmConfig = store.loadLLMConfig();
let ttsConfig = store.loadTTSConfig();
let avatarSwitchChain = Promise.resolve();

appDisposers.push(eventBus.on(EVENT_NAMES.INTERACTION_HIT, ({ part, motionSlot }) => {
  if (state.interaction?.enabled === false) return;
  triggerReaction(part, motionSlot);
}));
window.addEventListener('beforeunload', destroyApp);

init();

function patchState(patch, source = 'app') {
  return stateStore.patch(withLayeredStatePatch(patch), source);
}

function withLayeredStatePatch(patch) {
  const layered = { ...patch };

  if ('systemError' in patch) {
    layered.app = {
      ...state.app,
      error: patch.systemError || null
    };
  }
  if ('currentAvatarId' in patch || 'characterMeta' in patch || 'modelLoaded' in patch) {
    layered.avatar = {
      ...state.avatar,
      currentAvatarId: patch.currentAvatarId ?? state.currentAvatarId,
      meta: patch.characterMeta ?? state.characterMeta,
      loaded: patch.modelLoaded ?? state.modelLoaded,
      loading: patch.modelLoaded === false ? true : patch.modelLoaded === true ? false : state.avatar?.loading
    };
  }
  if ('currentState' in patch || 'animationState' in patch || 'currentAnimation' in patch || 'isAnimating' in patch) {
    layered.animation = {
      ...state.animation,
      state: patch.animationState ?? patch.currentState ?? state.animationState,
      currentAnimation: patch.currentAnimation ?? state.currentAnimation,
      isPlaying: patch.isAnimating ?? state.isAnimating
    };
  }
  if ('isSpeaking' in patch || 'isMuted' in patch) {
    layered.audio = {
      ...state.audio,
      speaking: patch.isSpeaking ?? state.isSpeaking,
      muted: patch.isMuted ?? state.isMuted,
      currentVoice: ttsConfig?.browserVoice || ttsConfig?.openaiVoice || ttsConfig?.minimaxVoice || null
    };
  }
  if ('isThinking' in patch || 'lastAssistantMessage' in patch || 'lastUserMessage' in patch || 'dialogueError' in patch) {
    layered.dialogue = {
      ...state.dialogue,
      input: patch.lastUserMessage ?? state.dialogue?.input ?? '',
      thinking: patch.isThinking ?? state.isThinking,
      lastResponse: patch.lastAssistantMessage ?? state.dialogue?.lastResponse ?? '',
      error: patch.dialogueError ?? null
    };
  }
  if ('lastInteractionAt' in patch) {
    layered.interaction = {
      ...state.interaction,
      lastInteractionAt: patch.lastInteractionAt
    };
  }

  return layered;
}

function requestAvatarSwitch(avatarId) {
  avatarSwitchChain = avatarSwitchChain
    .catch(() => {})
    .then(() => switchAvatar(avatarId));
  return avatarSwitchChain;
}

async function init() {
  try {
    eventBus.emit(EVENT_NAMES.APP_INIT, {});
    const configValidation = validateRuntimeConfig();
    if (!configValidation.ok) {
      log.warn('运行配置校验警告:', configValidation.errors.join('；'));
    }
    localStorage.removeItem('llm_api_key');
    prepareLLMKeyUI();

    const avatarRegistry = await characterManager.loadRegistry();
    patchState({ avatarRegistry }, 'app:init');
    const savedAvatarId = store.loadAvatarId(characterManager.getDefaultAvatarId());
    const hasSavedAvatar = characterManager.listAvatars().some((avatar) => avatar.id === savedAvatarId);
    const currentAvatarId = hasSavedAvatar ? savedAvatarId : characterManager.getDefaultAvatarId();
    const characterMeta = await characterManager.loadMeta(currentAvatarId);
    patchState({ currentAvatarId, characterMeta }, 'app:init');

    runtime.init(state.characterMeta);
    bindEvents();
    runtime.render((delta) => motionManager.update(delta));

    await switchAvatar(state.currentAvatarId);
    patchState({ app: { ...state.app, isReady: true } }, 'app:ready');
    eventBus.emit(EVENT_NAMES.APP_READY, { avatarId: state.currentAvatarId });
  } catch (error) {
    const appError = handleAppError(error, {
      eventBus,
      stateStore,
      source: 'app:init',
      code: ERROR_CODES.CONFIG_INVALID,
      userMessage: error.message
    });
    showLoadingError(appError.message);
  }
}

async function switchAvatar(avatarId) {
  try {
    eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_START, { avatarId });
    patchState({ modelLoaded: false, systemError: null }, 'avatar:switch');
    refs.loaderProgress.style.width = '0%';
    motionManager.unload();

    const result = await characterManager.switchCharacter(avatarId, (percent) => {
      refs.loaderProgress.style.width = `${percent}%`;
    });

    patchState({
      currentAvatarId: result.id,
      characterMeta: result.meta,
      modelLoaded: true
    }, 'avatar:switch');
    store.saveAvatarId(result.id);
    updateAvatarMetaStatus(result.meta);
    interactionManager.setCharacter(result.meta);
    refs.loaderProgress.style.width = '100%';

    await motionManager.loadForCharacter({
      avatar: result.avatar,
      characterMeta: result.meta
    });

    setAvatarState(AvatarState.BOOT);
    setTimeout(() => {
      if (state.currentState === AvatarState.BOOT) setAvatarState(AvatarState.IDLE);
    }, UI_TIMING.bootFallbackMs);
    setTimeout(() => {
      refs.loading.style.opacity = '0';
      setTimeout(() => {
        refs.loading.style.display = 'none';
      }, UI_TIMING.loadingFadeMs);
      showDialogue('[SYSTEM] 模型装载完毕，交互系统已激活。');
    }, UI_TIMING.loadingFadeDelayMs);
    eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_COMPLETE, {
      avatarId: result.id,
      meta: result.meta
    });
  } catch (error) {
    const appError = handleAppError(error, {
      eventBus,
      stateStore,
      source: 'avatar:switch',
      code: ERROR_CODES.AVATAR_LOAD_FAILED,
      userMessage: error.message
    });
    eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_ERROR, {
      avatarId,
      message: appError.message
    });
    characterManager.createFallback();
    showLoadingError(appError.message);
  }
}

function bindEvents() {
  window.addEventListener('resize', () => runtime.onResize());

  refs.settingsBtn.addEventListener('click', () => refs.sidePanel.classList.add('show'));
  refs.closePanelBtn.addEventListener('click', () => refs.sidePanel.classList.remove('show'));
  refs.sendBtn.addEventListener('click', handleChat);
  refs.promptInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') handleChat();
  });

  refs.muteBtn.addEventListener('click', () => {
    patchState({ isMuted: !state.isMuted }, 'audio:mute');
    refs.muteBtn.style.color = state.isMuted ? 'var(--muted)' : 'var(--text)';
    showDialogue(state.isMuted ? '语音播报已静音。' : '语音播报已开启。');
  });

  bindSceneControls();
  bindAvatarControls();
  bindLLMControls();
  bindTTSControls();
  bindMemoryControls();
  bindInteractionControls();
  initSmoothDetails();
  initButtonRipple();
}

function bindSceneControls() {
  refs.scaleSlider.addEventListener('input', (event) => {
    if (!state.modelLoaded) return;
    runtime.avatarRoot.scale.setScalar(parseFloat(event.target.value));
    runtime.fitCameraToObject(runtime.avatarRoot);
  });

  refs.lightSlider.addEventListener('input', (event) => {
    runtime.dirLight.intensity = parseFloat(event.target.value);
  });

  refs.ambientSlider?.addEventListener('input', (event) => {
    runtime.ambientLight.intensity = parseFloat(event.target.value);
  });

  refs.fovSlider?.addEventListener('input', (event) => {
    runtime.camera.fov = parseFloat(event.target.value);
    runtime.camera.updateProjectionMatrix();
  });

  refs.autoRotateToggle.addEventListener('change', (event) => {
    runtime.controls.autoRotate = event.target.checked;
    runtime.controls.autoRotateSpeed = 2.0;
  });

  refs.gridToggle.addEventListener('change', (event) => {
    refs.gridBg.style.opacity = event.target.checked ? '1' : '0';
  });

  refs.debugToggle.addEventListener('change', (event) => {
    runtime.debug.enabled = event.target.checked;
    runtime.debug.boxes.forEach((box) => {
      box.visible = runtime.debug.enabled;
    });
  });

  refs.freezeAnimToggle.addEventListener('change', (event) => {
    runtime.debug.freezeAnim = event.target.checked;
    if (runtime.debug.freezeAnim) {
      motionManager.stopAll();
    } else {
      setAvatarState(state.currentState);
    }
  });
}

function bindAvatarControls() {
  populateAvatarSelect();
  refs.avatarSelect.addEventListener('change', async (event) => {
    refs.loading.style.display = 'flex';
    refs.loading.style.opacity = '1';
    await requestAvatarSwitch(event.target.value);
  });
  refs.uploadAvatarBtn.addEventListener('click', handleAvatarUpload);
}

function populateAvatarSelect() {
  refs.avatarSelect.innerHTML = '';
  characterManager.listAvatars().forEach((avatar) => {
    const opt = document.createElement('option');
    opt.value = avatar.id;
    opt.textContent = avatar.name || avatar.id;
    refs.avatarSelect.appendChild(opt);
  });
  refs.avatarSelect.value = state.currentAvatarId;
}

function updateAvatarMetaStatus(meta) {
  if (!refs.avatarMetaStatus || !meta) return;
  const format = (meta.model?.format || meta.type || 'gltf').toUpperCase();
  const license = typeof meta.license === 'string' ? meta.license : meta.license?.name;
  const source = typeof meta.license === 'object' ? meta.license.source : '';
  const licenseLabel = license ? `${license}${source ? ` / ${source}` : ''}` : '本地角色';
  refs.avatarMetaStatus.className = 'llm-status success';
  refs.avatarMetaStatus.textContent = `${format} / ${licenseLabel} / 动作与语音交互已接入`;
}

async function handleAvatarUpload() {
  const modelFile = refs.avatarModelFileInput.files?.[0];
  const motionFile = refs.avatarMotionFileInput.files?.[0] || null;
  const skeletonFile = refs.avatarSkeletonFileInput.files?.[0] || null;
  const avatarId = refs.avatarIdInput.value.trim();
  const avatarName = refs.avatarNameInput.value.trim();

  if (!modelFile) {
    showAvatarUploadStatus('error', '请选择 .vrm / .glb / .gltf 人物模型文件。');
    return;
  }

  if (!isAllowedAvatarModel(modelFile.name)) {
    showAvatarUploadStatus('error', '模型格式不支持。请上传 .vrm / .glb / .gltf。');
    return;
  }

  const formData = new FormData();
  formData.append('model', modelFile);
  if (motionFile) formData.append('motions', motionFile);
  if (skeletonFile) formData.append('skeleton', skeletonFile);
  formData.append('avatarId', avatarId);
  formData.append('name', avatarName || modelFile.name.replace(/\.[^.]+$/, ''));
  formData.append('targetHeight', refs.avatarTargetHeightInput.value || '120');
  formData.append('llmProvider', llmConfig.provider);
  formData.append('llmModel', llmConfig.model);
  formData.append('ttsEngine', ttsConfig.engine);

  refs.uploadAvatarBtn.disabled = true;
  showAvatarUploadStatus('loading', '正在上传角色资源...');
  try {
    const payload = await apiClient.json('/api/avatars', {
      method: 'POST',
      body: formData,
      source: 'avatar:upload',
      timeoutMs: REQUEST_TIMEOUTS.ttsMs
    });

    await characterManager.loadRegistry({ force: true });
    patchState({ avatarRegistry: characterManager.registry }, 'avatar:upload');
    populateAvatarSelect();

    refs.loading.style.display = 'flex';
    refs.loading.style.opacity = '1';
    await requestAvatarSwitch(payload.avatar.id);
    refs.avatarSelect.value = payload.avatar.id;
    showAvatarUploadStatus('success', `已上传并切换到 ${payload.avatar.name}。`);
  } catch (error) {
    showAvatarUploadStatus('error', `上传失败：${error.message.slice(0, 140)}`);
  } finally {
    refs.uploadAvatarBtn.disabled = false;
  }
}

function isAllowedAvatarModel(filename) {
  return isAllowedAvatarModelFileName(filename);
}

function showAvatarUploadStatus(type, message) {
  refs.avatarUploadStatus.className = `llm-status ${type}`;
  refs.avatarUploadStatus.textContent = message;
  if (type === 'success') {
    setTimeout(() => {
      refs.avatarUploadStatus.className = 'llm-status';
    }, UI_TIMING.successStatusMs);
  }
}

function bindLLMControls() {
  refs.llmProvider.value = llmConfig.provider;
  refs.baseUrlInput.value = '';
  refs.llmModel.value = llmConfig.model;
  refs.systemPromptInput.value = llmConfig.systemPrompt;

  refs.llmProvider.addEventListener('change', (event) => {
    refs.baseUrlInput.placeholder = event.target.value === 'custom'
      ? '请在后端配置 CUSTOM_BASE_URL'
      : '请在后端配置对应 provider 的 *_BASE_URL';
  });

  refs.saveLLMConfigBtn.addEventListener('click', () => {
    llmConfig = {
      provider: refs.llmProvider.value,
      baseUrl: '',
      model: refs.llmModel.value,
      systemPrompt: refs.systemPromptInput.value.trim()
    };
    store.saveLLMConfig(llmConfig);
    showLLMStatus('success', '配置已保存。API Key 请配置在后端环境变量中。');
  });

  refs.testLLMBtn.addEventListener('click', async () => {
    showLLMStatus('loading', '正在通过后端测试连接...');
    try {
      const reply = await llmClient.test(readLLMFormConfig());
      showLLMStatus('success', `连接成功：${reply.slice(0, 40)}`);
    } catch (error) {
      showLLMStatus('error', `连接失败：${error.message.slice(0, 120)}`);
    }
  });
}

function bindTTSControls() {
  populateOpenAIVoices();
  populateMinimaxVoices();

  refs.ttsEngine.value = ttsConfig.engine;
  refs.speechRate.value = ttsConfig.rate;
  refs.speechPitch.value = ttsConfig.pitch;
  setSelectValue(refs.openaiVoiceSelect, ttsConfig.openaiVoice);
  setSelectValue(refs.minimaxVoiceSelect, ttsConfig.minimaxVoice);
  setSelectValue(refs.minimaxModelSelect, ttsConfig.minimaxModel);
  ttsConfig.openaiVoice = refs.openaiVoiceSelect.value;
  ttsConfig.minimaxVoice = refs.minimaxVoiceSelect.value;
  ttsConfig.minimaxModel = refs.minimaxModelSelect.value;
  refs.openaiTTSInstructionsInput.value = ttsConfig.openaiInstructions || '';
  refs.customVoiceIdInput.value = ttsConfig.customVoiceId || '';
  refs.rateVal.textContent = ttsConfig.rate.toFixed(2);
  refs.pitchVal.textContent = ttsConfig.pitch.toFixed(2);

  syncTTSEngineUI();
  populateVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;

  refs.ttsEngine.addEventListener('change', (event) => {
    ttsConfig.engine = event.target.value;
    store.saveTTSConfig(ttsConfig);
    syncTTSEngineUI();
    showTTSEngineHint();
  });

  refs.voiceSelect.addEventListener('change', (event) => {
    ttsConfig.browserVoice = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.speechRate.addEventListener('input', (event) => {
    ttsConfig.rate = parseFloat(event.target.value);
    refs.rateVal.textContent = ttsConfig.rate.toFixed(2);
    store.saveTTSConfig(ttsConfig);
  });

  refs.speechPitch.addEventListener('input', (event) => {
    ttsConfig.pitch = parseFloat(event.target.value);
    refs.pitchVal.textContent = ttsConfig.pitch.toFixed(2);
    store.saveTTSConfig(ttsConfig);
  });

  refs.openaiVoiceSelect.addEventListener('change', (event) => {
    ttsConfig.openaiVoice = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.openaiTTSInstructionsInput.addEventListener('input', (event) => {
    ttsConfig.openaiInstructions = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.minimaxVoiceSelect.addEventListener('change', (event) => {
    ttsConfig.minimaxVoice = event.target.value;
    store.saveTTSConfig(ttsConfig);
    syncTTSEngineUI();
  });

  refs.minimaxModelSelect.addEventListener('change', (event) => {
    ttsConfig.minimaxModel = event.target.value;
    store.saveTTSConfig(ttsConfig);
  });

  refs.customVoiceIdInput.addEventListener('input', (event) => {
    ttsConfig.customVoiceId = event.target.value.trim();
    store.saveTTSConfig(ttsConfig);
  });

  refs.testVoiceBtn.addEventListener('click', () => {
    speakText('你好！我是 Alice，很高兴认识你！');
  });

  showTTSEngineHint();
}

function bindMemoryControls() {
  refs.saveMemoryBtn.addEventListener('click', () => {
    const name = document.getElementById('nameInput').value;
    const birthday = document.getElementById('birthdayInput').value;
    const likes = document.getElementById('likesInput').value;
    store.saveMemory({ name, birthday, likes });
    showDialogue(`好的${name ? '，' + name : ''}！我已经记住啦～`);
  });
}

function bindInteractionControls() {
  recognitionService.bind(refs.voiceBtn, {
    onResult: (transcript) => {
      refs.promptInput.value = transcript;
      handleChat();
    },
    onError: (event) => log.warn('Speech 识别错误:', event.error)
  });

  interactionManager.bindPointer(runtime.renderer.domElement);

  document.addEventListener('click', (event) => {
    const reactionTarget = event.target.closest('[data-reaction]');
    if (reactionTarget) {
      const part = reactionTarget.dataset.reaction;
      triggerReaction(part, interactionManager.getMotionSlotForPart(part));
      return;
    }

    const moodTarget = event.target.closest('[data-mood]');
    if (moodTarget) {
      setMood(moodTarget.dataset.mood);
    }
  });
}

function setMood(mood) {
    document.querySelectorAll('[id^="mood"]').forEach((el) => el.classList.remove('active'));
    const el = document.getElementById(`mood${mood.charAt(0).toUpperCase() + mood.slice(1)}`);
    if (el) el.classList.add('active');
    showDialogue(MOOD_DIALOGUES[mood] || '嗯...');
}

function triggerReaction(type, motionSlot = interactionManager.getMotionSlotForPart(type)) {
    const pool = DEFAULT_DIALOGUES[type] || DEFAULT_DIALOGUES.idle;
    const text = pool[Math.floor(Math.random() * pool.length)];
    setAvatarState(motionManager.getStateForSlot(motionSlot));
    showDialogue(text);
}

async function handleChat() {
  const text = refs.promptInput.value.trim();
  if (!text) return;

  refs.promptInput.value = '';
  refs.sendBtn.disabled = true;
  patchState({
    isThinking: true,
    lastUserMessage: text,
    dialogueError: null
  }, 'dialogue:user');
  setAvatarState(AvatarState.THINKING);

  try {
    llmConfig = readLLMFormConfig();
    const reply = await dialogueManager.send(text, llmConfig);
    patchState({
      isThinking: false,
      lastAssistantMessage: reply
    }, 'dialogue:assistant');
    setAvatarState(AvatarState.SPEAKING);
    speakText(reply);
  } catch (error) {
    log.error('LLM 调用失败:', error);
    patchState({
      isThinking: false,
      dialogueError: error.message
    }, 'dialogue:error');
    setAvatarState(AvatarState.SPEAKING);
    speakText('抱歉，连接出现问题。请确认后端服务已启动，并配置了对应模型的 API Key。');
  } finally {
    refs.sendBtn.disabled = false;
  }
}

function readLLMFormConfig() {
  return {
    provider: refs.llmProvider.value,
    baseUrl: '',
    model: refs.llmModel.value,
    systemPrompt: refs.systemPromptInput.value.trim()
  };
}

function setAvatarState(newState) {
  const accepted = runtime.debug.freezeAnim ? true : motionManager.setState(newState);
  if (!accepted) return false;
  if (runtime.debug.freezeAnim) applyAvatarState(newState);
  return true;
}

function applyAvatarState(newState) {
  patchState({
    currentState: newState,
    animationState: newState
  }, 'animation:state');
  refs.statusText.textContent = `ONLINE / ${newState.toUpperCase()}`;
  refs.statusBadge.className = 'status-badge';
  if (newState === AvatarState.THINKING) {
    refs.statusBadge.textContent = 'THINKING';
    refs.statusBadge.classList.add('thinking');
  } else if (newState === AvatarState.SPEAKING) {
    refs.statusBadge.textContent = 'SPEAKING';
    refs.statusBadge.classList.add('speaking');
  } else {
    refs.statusBadge.textContent = 'ONLINE';
  }
}

function showDialogue(text) {
  speakText(text);
}

function speakText(text) {
  if (state.speechTimer) clearTimeout(state.speechTimer);

  const estimatedDuration = Math.max(UI_TIMING.speechMinMs, text.length * UI_TIMING.speechMsPerChar);
  state.speechTimer = setTimeout(resetSpeakingState, estimatedDuration);
  let usedFallbackVoice = false;
  if (ttsConfig.engine !== 'browser') {
    showTTSStatus('loading', `正在请求 ${getTTSEngineName(ttsConfig.engine)} 语音服务...`);
  }

  ttsService.speak(text, ttsConfig, {
    muted: state.isMuted,
    onStart: () => {
      patchState({ isSpeaking: true }, 'audio:start');
      eventBus.emit(EVENT_NAMES.AUDIO_START, {
        engine: ttsConfig.engine
      });
    },
    onEnd: () => {
      resetSpeakingState();
      patchState({ isSpeaking: false }, 'audio:end');
      eventBus.emit(EVENT_NAMES.AUDIO_END, {
        engine: ttsConfig.engine,
        fallback: usedFallbackVoice
      });
      if (ttsConfig.engine !== 'browser' && !usedFallbackVoice) {
        showTTSStatus('success', `${getTTSEngineName(ttsConfig.engine)} 语音播放完成。`);
      }
    },
    onFallback: (error) => {
      usedFallbackVoice = true;
      eventBus.emit(EVENT_NAMES.AUDIO_FALLBACK, {
        engine: ttsConfig.engine,
        message: error.message
      });
      showTTSStatus('error', `${formatTTSError(error)} 已自动使用免费本机语音兜底。`);
    },
    onError: (error) => {
      patchState({ isSpeaking: false }, 'audio:error');
      eventBus.emit(EVENT_NAMES.AUDIO_ERROR, {
        engine: ttsConfig.engine,
        message: error.message
      });
      showTTSStatus('error', formatTTSError(error));
      resetSpeakingState();
    }
  });
}

function resetSpeakingState() {
  if (state.speechTimer) {
    clearTimeout(state.speechTimer);
    state.speechTimer = null;
  }
  if (state.currentState === AvatarState.SPEAKING) setAvatarState(AvatarState.IDLE);
  patchState({ isSpeaking: false }, 'audio:reset');
}

function populateVoices() {
  const voices = ttsService.getVoices();
  const sorted = [...voices].sort((a, b) => {
    const azh = a.lang?.startsWith('zh') ? 1 : 0;
    const bzh = b.lang?.startsWith('zh') ? 1 : 0;
    if (azh !== bzh) return bzh - azh;
    return (a.name || '').localeCompare(b.name || '');
  });

  refs.voiceSelect.innerHTML = '<option value="auto">自动（优先晓晓 Neural）</option>';
  sorted.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value = voice.name;
    opt.textContent = `${voice.name} (${voice.lang || 'unknown'})`;
    refs.voiceSelect.appendChild(opt);
  });

  const hasSaved = [...refs.voiceSelect.options].some((option) => option.value === ttsConfig.browserVoice);
  refs.voiceSelect.value = hasSaved ? ttsConfig.browserVoice : 'auto';
}

function populateOpenAIVoices() {
  refs.openaiVoiceSelect.innerHTML = '';
  OPENAI_TTS_VOICES.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value = voice.id;
    opt.textContent = voice.label;
    refs.openaiVoiceSelect.appendChild(opt);
  });
}

function populateMinimaxVoices() {
  refs.minimaxVoiceSelect.innerHTML = '';
  MINIMAX_VOICE_PRESETS.forEach((voice) => {
    const opt = document.createElement('option');
    opt.value = voice.id;
    opt.textContent = `${voice.label} / ${voice.id}`;
    opt.title = voice.description;
    refs.minimaxVoiceSelect.appendChild(opt);
  });
}

function setSelectValue(select, value) {
  const hasValue = [...select.options].some((option) => option.value === value);
  select.value = hasValue ? value : select.options[0]?.value || '';
}

function syncTTSEngineUI() {
  refs.browserVoiceGroup.style.display = ttsConfig.engine === 'browser' ? '' : 'none';
  refs.openaiVoiceGroup.style.display = ttsConfig.engine === 'openai' ? '' : 'none';
  refs.minimaxVoiceGroup.style.display = ttsConfig.engine === 'minimax' ? '' : 'none';
  refs.customVoiceIdInput.disabled = ttsConfig.minimaxVoice !== 'custom';
}

function showTTSEngineHint() {
  if (ttsConfig.engine === 'minimax') {
    showTTSStatus('loading', '已选择 MiniMax。必须用 npm run dev 启动后端，并配置 MINIMAX_API_KEY；Python 静态服务不会生效。');
    return;
  }
  if (ttsConfig.engine === 'openai') {
    showTTSStatus('loading', '已选择 OpenAI TTS。必须用 npm run dev 启动后端，并配置 OPENAI_API_KEY。');
    return;
  }
  showTTSStatus('success', '当前使用浏览器原生语音，声音质量取决于系统/浏览器内置声线。');
}

function getTTSEngineName(engine) {
  if (engine === 'minimax') return 'MiniMax';
  if (engine === 'openai') return 'OpenAI';
  return '浏览器原生';
}

function formatTTSError(error) {
  const message = error?.message || '未知错误';
  if (message.includes('501') || message.includes('404')) {
    return 'TTS 后端没有接通。请不要用 python3 -m http.server 试听高级声线，改用 npm run dev 后访问 http://localhost:3000。';
  }
  if (message.includes('MINIMAX_API_KEY')) {
    return 'MiniMax 没有配置 API Key。请用 MINIMAX_API_KEY=你的key npm run dev 启动。';
  }
  if (message.includes('Invalid API key format')) {
    return 'API Key 格式无效。请确认环境变量里是真实 Key，不是中文占位文本，并且不要带空格或换行。';
  }
  if (message.includes('OPENAI_API_KEY')) {
    return 'OpenAI 没有配置 API Key。请用 OPENAI_API_KEY=你的key npm run dev 启动。';
  }
  return `TTS 请求失败：${message.slice(0, 160)}`;
}

function showTTSStatus(type, message) {
  refs.ttsStatus.className = `llm-status ${type}`;
  refs.ttsStatus.textContent = message;
  if (type === 'success') {
    setTimeout(() => {
      refs.ttsStatus.className = 'llm-status';
    }, UI_TIMING.statusResetMs);
  }
}

function showLLMStatus(type, message) {
  refs.llmStatus.className = `llm-status ${type}`;
  refs.llmStatus.textContent = message;
  if (type !== 'loading') {
    setTimeout(() => {
      refs.llmStatus.className = 'llm-status';
    }, UI_TIMING.statusResetMs);
  }
}

function prepareLLMKeyUI() {
  if (!refs.apiKeyInput) return;
  refs.apiKeyInput.value = '';
  refs.apiKeyInput.disabled = true;
  refs.apiKeyInput.placeholder = '已迁移到后端环境变量，例如 OPENAI_API_KEY';
  refs.apiKeyToggle.disabled = true;
  refs.apiKeyToggle.style.opacity = '0.35';
}

function showLoadingError(message) {
  refs.loaderProgress.style.backgroundColor = 'red';
  refs.loading.replaceChildren();

  const title = document.createElement('div');
  title.style.color = 'red';
  title.style.marginBottom = '12px';
  title.textContent = 'SYSTEM ERROR: FAILED TO LOAD ASSETS';

  const detail = document.createElement('div');
  detail.style.fontSize = '12px';
  detail.style.color = '#888';
  detail.style.maxWidth = '80%';
  detail.style.textAlign = 'center';
  detail.textContent = `${message || '资源加载失败'}\n\n请确认使用本地服务器运行，并检查模型、动作和 manifest 路径。`;
  detail.style.whiteSpace = 'pre-line';

  refs.loading.append(title, detail);
}

function initSmoothDetails() {
  document.querySelectorAll('details.section').forEach((detail) => {
    const content = detail.querySelector('.details-content');
    const summary = detail.querySelector('summary');
    if (!content || !summary) return;

    if (detail.open) {
      content.style.opacity = '1';
      content.style.maxHeight = 'none';
      content.style.overflow = 'visible';
    } else {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      content.style.overflow = 'hidden';
    }

    summary.addEventListener('click', (event) => {
      event.preventDefault();

      if (detail.open) {
        content.style.overflow = 'hidden';
        content.style.maxHeight = `${content.scrollHeight || 0}px`;
        requestAnimationFrame(() => {
          content.style.maxHeight = '0';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function handler() {
          detail.open = false;
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      } else {
        detail.open = true;
        content.style.overflow = 'hidden';
        content.style.maxHeight = '0';
        requestAnimationFrame(() => {
          content.style.maxHeight = `${content.scrollHeight || 0}px`;
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function handler() {
          content.style.maxHeight = 'none';
          content.style.overflow = 'visible';
          content.removeEventListener('transitionend', handler);
        }, { once: true });
      }
    });
  });
}

function initButtonRipple() {
  document.querySelectorAll('.custom-btn, .tag, .dock-btn').forEach((btn) => {
    btn.addEventListener('click', function(event) {
      const existingRipple = this.querySelector('.ripple-effect');
      if (existingRipple) existingRipple.remove();

      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.classList.add('ripple-effect');
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

      this.style.position = 'relative';
      this.style.overflow = 'hidden';
      this.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  });
}

function destroyApp() {
  appDisposers.splice(0).forEach((dispose) => dispose());
  window.removeEventListener('beforeunload', destroyApp);
  interactionManager.unbindPointer();
  recognitionService.destroy?.();
  ttsService.destroy?.();
  motionManager.destroy?.();
  runtime.destroy?.();
  stateStore.destroy();
  eventBus.destroy();
}
