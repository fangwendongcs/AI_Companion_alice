import { LLMClient } from '../ai/LLMClient.js';
import { AvatarState, MotionManager, MotionSlot } from '../animation/MotionManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { CharacterManager } from '../avatar/CharacterManager.js';
import { APP_MODE, EVENT_NAMES, REQUEST_TIMEOUTS, UI_TIMING } from '../config/appConfig.js';
import { DEFAULT_DIALOGUES, MOOD_DIALOGUES } from '../config/dialogues.js';
import { validateRuntimeConfig } from '../config/validateConfig.js';
import { EventBus } from '../core/EventBus.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { handleAppError } from '../core/errors/errorHandler.js';
import { DisposableRegistry } from '../core/lifecycle/DisposableRegistry.js';
import { createLogger } from '../core/logger.js';
import { DialogueManager } from '../dialogue/DialogueManager.js';
import { InteractionManager } from '../interaction/InteractionManager.js';
import { SceneRuntime } from '../scene/SceneRuntime.js';
import { ApiClient } from '../services/api/ApiClient.js';
import { CompanionStateStore } from '../state/CompanionStateStore.js';
import { LocalConfigStore } from '../storage/LocalConfigStore.js';
import { createDomRefs } from '../ui/domRefs.js';
import { UIController } from '../ui/UIController.js';
import { SpeechRecognitionService } from '../voice/SpeechRecognitionService.js';
import { TTSService } from '../voice/TTSService.js';

export class AppController {
  constructor({ documentRef = document } = {}) {
    this.log = createLogger('App');
    this.registry = new DisposableRegistry();
    this.refs = createDomRefs(documentRef);
    this.eventBus = new EventBus();
    this.store = new LocalConfigStore();
    this.apiClient = new ApiClient({ timeoutMs: REQUEST_TIMEOUTS.ttsMs });
    this.llmClient = new LLMClient('/api/chat', { timeoutMs: REQUEST_TIMEOUTS.llmMs });
    this.ttsService = new TTSService('/api/tts', { timeoutMs: REQUEST_TIMEOUTS.ttsMs });
    this.audioManager = new AudioManager({
      ttsService: this.ttsService,
      eventBus: this.eventBus,
      getConfig: () => this.ttsConfig
    });
    this.runtime = new SceneRuntime(documentRef.getElementById('scene'));
    this.characterManager = new CharacterManager(this.runtime);
    this.motionManager = new MotionManager();
    this.recognitionService = new SpeechRecognitionService();
    this.llmConfig = this.store.loadLLMConfig();
    this.ttsConfig = this.store.loadTTSConfig();
    this.avatarSwitchChain = Promise.resolve();
    this.destroyed = false;

    this.stateStore = new CompanionStateStore(this.createInitialState(), this.eventBus);
    this.state = this.stateStore.getState();
    this.interactionManager = new InteractionManager(this.runtime, {
      onHit: ({ part, motionSlot }) => {
        this.patchState({ lastInteractionAt: Date.now() }, 'interaction:hit');
        this.eventBus.emit(EVENT_NAMES.INTERACTION_HIT, {
          part,
          motionSlot,
          avatarId: this.state.currentAvatarId
        });
      }
    });
    this.dialogueManager = new DialogueManager({
      llmClient: this.llmClient,
      eventBus: this.eventBus,
      getConfig: () => this.readLLMFormConfig()
    });

    this.ui = new UIController(this.createUIDeps());
    this.bindCoreEvents();
  }

  createInitialState() {
    return {
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
    };
  }

  createUIDeps() {
    return {
      refs: this.refs,
      store: this.store,
      apiClient: this.apiClient,
      llmClient: this.llmClient,
      ttsService: this.ttsService,
      characterManager: this.characterManager,
      motionManager: this.motionManager,
      interactionManager: this.interactionManager,
      recognitionService: this.recognitionService,
      runtime: this.runtime,
      log: this.log,
      getState: () => this.state,
      patchState: (patch, source) => this.patchState(patch, source),
      setAvatarState: (state) => this.setAvatarState(state),
      getLLMConfig: () => this.llmConfig,
      setLLMConfig: (config) => { this.llmConfig = config; },
      getTTSConfig: () => this.ttsConfig,
      setTTSConfig: (config) => { this.ttsConfig = config; },
      readFormConfig: () => this.readLLMFormConfig(),
      requestAvatarSwitch: (avatarId) => this.requestAvatarSwitch(avatarId),
      speakText: (text) => this.speakText(text),
      actions: {
        handleChat: () => this.handleChat(),
        toggleMute: () => this.toggleMute(),
        showDialogue: (text) => this.showDialogue(text),
        triggerReaction: (part, motionSlot) => this.triggerReaction(part, motionSlot),
        setMood: (mood) => this.setMood(mood)
      }
    };
  }

  bindCoreEvents() {
    this.motionManager.onStateChange = ({ to }) => {
      this.eventBus.emit(EVENT_NAMES.ANIMATION_STATE, { state: to });
      this.applyAvatarState(to);
    };
    this.motionManager.onStateComplete = (nextState) => this.setAvatarState(nextState);
    this.motionManager.onActionStart = (request) => {
      this.patchState({
        isAnimating: true,
        currentAnimation: request.name
      }, 'animation:action:start');
      this.eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_START, request);
    };
    this.motionManager.onActionComplete = (request) => {
      this.patchState({
        isAnimating: false,
        currentAnimation: null
      }, 'animation:action:complete');
      this.eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_COMPLETE, request);
    };

    this.registry.add(this.eventBus.on(EVENT_NAMES.INTERACTION_HIT, ({ part, motionSlot }) => {
      if (this.state.interaction?.enabled === false) return;
      this.triggerReaction(part, motionSlot);
    }));

    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_USER, ({ text }) => {
      this.patchState({
        lastUserMessage: text,
        dialogueError: null
      }, EVENT_NAMES.DIALOGUE_USER);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_THINKING, ({ active }) => {
      this.patchState({ isThinking: active }, EVENT_NAMES.DIALOGUE_THINKING);
      if (active) {
        this.setAvatarState(AvatarState.THINKING);
      } else if (this.state.currentState === AvatarState.THINKING) {
        this.motionManager.requestSlot(MotionSlot.IDLE);
      }
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ASSISTANT, ({ text }) => {
      this.patchState({
        lastAssistantMessage: text,
        dialogueError: null
      }, EVENT_NAMES.DIALOGUE_ASSISTANT);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ERROR, ({ error, message }) => {
      this.patchState({
        dialogueError: message
      }, EVENT_NAMES.DIALOGUE_ERROR);
      handleAppError(error || new Error(message), {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: EVENT_NAMES.DIALOGUE_ERROR,
        code: error?.code || ERROR_CODES.API_REQUEST_FAILED,
        userMessage: message
      });
    }));

    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_START, () => {
      this.patchState({ isSpeaking: true }, EVENT_NAMES.AUDIO_START);
      this.motionManager.requestSlot(MotionSlot.SPEAKING, {
        replacePending: false
      });
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_END, ({ fallback }) => {
      this.resetSpeakingState();
      this.motionManager.requestSlot(MotionSlot.IDLE, {
        replacePending: false
      });
      if (this.ttsConfig.engine !== 'browser' && !fallback) {
        this.ui.statusView.showTTS('success', `${this.getTTSEngineName(this.ttsConfig.engine)} 语音播放完成。`);
      }
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_FALLBACK, ({ error }) => {
      this.ui.statusView.showTTS('error', `${this.formatTTSError(error)} 已自动使用免费本机语音兜底。`);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_ERROR, ({ error }) => {
      this.patchState({ isSpeaking: false }, EVENT_NAMES.AUDIO_ERROR);
      handleAppError(error || new Error('Audio playback failed'), {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: EVENT_NAMES.AUDIO_ERROR,
        code: error?.code || ERROR_CODES.API_REQUEST_FAILED,
        userMessage: error?.message || '音频播放失败。'
      });
      this.ui.statusView.showTTS('error', this.formatTTSError(error));
      this.resetSpeakingState();
      this.motionManager.requestSlot(MotionSlot.IDLE, {
        replacePending: false
      });
    }));
  }

  async init() {
    try {
      this.eventBus.emit(EVENT_NAMES.APP_INIT, {});
      const configValidation = validateRuntimeConfig();
      if (!configValidation.ok) {
        this.log.warn('运行配置校验警告:', configValidation.errors.join('；'));
      }
      localStorage.removeItem('llm_api_key');

      const avatarRegistry = await this.characterManager.loadRegistry();
      this.patchState({ avatarRegistry }, 'app:init');
      const savedAvatarId = this.store.loadAvatarId(this.characterManager.getDefaultAvatarId());
      const hasSavedAvatar = this.characterManager.listAvatars().some((avatar) => avatar.id === savedAvatarId);
      const currentAvatarId = hasSavedAvatar ? savedAvatarId : this.characterManager.getDefaultAvatarId();
      const characterMeta = await this.characterManager.loadMeta(currentAvatarId);
      this.patchState({ currentAvatarId, characterMeta }, 'app:init');

      this.runtime.init(this.state.characterMeta);
      this.registry.addEventListener(window, 'resize', () => this.runtime.onResize());
      this.ui.init();
      this.runtime.render((delta) => this.motionManager.update(delta));

      await this.switchAvatar(this.state.currentAvatarId);
      this.patchState({ app: { ...this.state.app, isReady: true } }, 'app:ready');
      this.eventBus.emit(EVENT_NAMES.APP_READY, { avatarId: this.state.currentAvatarId });
    } catch (error) {
      const appError = handleAppError(error, {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: 'app:init',
        code: ERROR_CODES.CONFIG_INVALID,
        userMessage: error.message
      });
      this.ui.errorView.showLoadingError(appError.message);
    }
  }

  patchState(patch, source = 'app') {
    return this.stateStore.patch(this.withLayeredStatePatch(patch), source);
  }

  withLayeredStatePatch(patch) {
    const layered = { ...patch };

    if ('systemError' in patch) {
      layered.app = {
        ...this.state.app,
        error: patch.systemError || null
      };
    }
    if ('currentAvatarId' in patch || 'characterMeta' in patch || 'modelLoaded' in patch) {
      layered.avatar = {
        ...this.state.avatar,
        currentAvatarId: patch.currentAvatarId ?? this.state.currentAvatarId,
        meta: patch.characterMeta ?? this.state.characterMeta,
        loaded: patch.modelLoaded ?? this.state.modelLoaded,
        loading: patch.modelLoaded === false ? true : patch.modelLoaded === true ? false : this.state.avatar?.loading
      };
    }
    if ('currentState' in patch || 'animationState' in patch || 'currentAnimation' in patch || 'isAnimating' in patch) {
      layered.animation = {
        ...this.state.animation,
        state: patch.animationState ?? patch.currentState ?? this.state.animationState,
        currentAnimation: patch.currentAnimation ?? this.state.currentAnimation,
        isPlaying: patch.isAnimating ?? this.state.isAnimating
      };
    }
    if ('isSpeaking' in patch || 'isMuted' in patch) {
      layered.audio = {
        ...this.state.audio,
        speaking: patch.isSpeaking ?? this.state.isSpeaking,
        muted: patch.isMuted ?? this.state.isMuted,
        currentVoice: this.ttsConfig?.browserVoice || this.ttsConfig?.openaiVoice || this.ttsConfig?.minimaxVoice || null
      };
    }
    if ('isThinking' in patch || 'lastAssistantMessage' in patch || 'lastUserMessage' in patch || 'dialogueError' in patch) {
      layered.dialogue = {
        ...this.state.dialogue,
        input: patch.lastUserMessage ?? this.state.dialogue?.input ?? '',
        thinking: patch.isThinking ?? this.state.isThinking,
        lastResponse: patch.lastAssistantMessage ?? this.state.dialogue?.lastResponse ?? '',
        error: patch.dialogueError ?? null
      };
    }
    if ('lastInteractionAt' in patch) {
      layered.interaction = {
        ...this.state.interaction,
        lastInteractionAt: patch.lastInteractionAt
      };
    }

    return layered;
  }

  requestAvatarSwitch(avatarId) {
    this.avatarSwitchChain = this.avatarSwitchChain
      .catch(() => {})
      .then(() => this.switchAvatar(avatarId));
    return this.avatarSwitchChain;
  }

  async switchAvatar(avatarId) {
    try {
      this.eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_START, { avatarId });
      this.patchState({ modelLoaded: false, systemError: null }, 'avatar:switch');
      this.refs.loaderProgress.style.width = '0%';
      this.motionManager.unload();

      const result = await this.characterManager.switchCharacter(avatarId, (percent) => {
        this.refs.loaderProgress.style.width = `${percent}%`;
      });

      this.patchState({
        currentAvatarId: result.id,
        characterMeta: result.meta,
        modelLoaded: true
      }, 'avatar:switch');
      this.store.saveAvatarId(result.id);
      this.ui.avatarPanel.updateMetaStatus(result.meta);
      this.interactionManager.setCharacter(result.meta);
      this.refs.loaderProgress.style.width = '100%';

      await this.motionManager.loadForCharacter({
        avatar: result.avatar,
        characterMeta: result.meta
      });

      this.setAvatarState(AvatarState.BOOT);
      this.registry.addTimeout(() => {
        if (this.state.currentState === AvatarState.BOOT) this.setAvatarState(AvatarState.IDLE);
      }, UI_TIMING.bootFallbackMs);
      this.ui.errorView.hideLoading({
        registry: this.registry,
        fadeDelayMs: UI_TIMING.loadingFadeDelayMs,
        fadeMs: UI_TIMING.loadingFadeMs,
        onHidden: () => this.showDialogue('[SYSTEM] 模型装载完毕，交互系统已激活。')
      });
      this.eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_COMPLETE, {
        avatarId: result.id,
        meta: result.meta
      });
    } catch (error) {
      const appError = handleAppError(error, {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: 'avatar:switch',
        code: ERROR_CODES.AVATAR_LOAD_FAILED,
        userMessage: error.message
      });
      this.eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_ERROR, {
        avatarId,
        message: appError.message
      });
      this.characterManager.createFallback();
      this.ui.errorView.showLoadingError(appError.message);
    }
  }

  toggleMute() {
    this.patchState({ isMuted: !this.state.isMuted }, 'audio:mute');
    this.refs.muteBtn.style.color = this.state.isMuted ? 'var(--muted)' : 'var(--text)';
    this.showDialogue(this.state.isMuted ? '语音播报已静音。' : '语音播报已开启。');
  }

  setMood(mood) {
    document.querySelectorAll('[id^="mood"]').forEach((el) => el.classList.remove('active'));
    const el = document.getElementById(`mood${mood.charAt(0).toUpperCase() + mood.slice(1)}`);
    if (el) el.classList.add('active');
    this.showDialogue(MOOD_DIALOGUES[mood] || '嗯...');
  }

  triggerReaction(type, motionSlot = this.interactionManager.getMotionSlotForPart(type)) {
    const pool = DEFAULT_DIALOGUES[type] || DEFAULT_DIALOGUES.idle;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const accepted = this.motionManager.requestSlot(motionSlot);
    if (!accepted) this.log.debug('动画槽位请求被队列策略忽略:', motionSlot);
    this.showDialogue(text);
  }

  async handleChat() {
    const text = this.refs.promptInput.value.trim();
    if (!text) return;

    this.refs.promptInput.value = '';
    this.refs.sendBtn.disabled = true;

    try {
      this.llmConfig = this.readLLMFormConfig();
      const reply = await this.dialogueManager.send(text, this.llmConfig);
      this.speakText(reply);
    } catch (error) {
      this.log.error('LLM 调用失败:', error);
      this.speakText('抱歉，连接出现问题。请确认后端服务已启动，并配置了对应模型的 API Key。');
    } finally {
      this.refs.sendBtn.disabled = false;
    }
  }

  readLLMFormConfig() {
    return {
      provider: this.refs.llmProvider.value,
      baseUrl: '',
      model: this.refs.llmModel.value,
      systemPrompt: this.refs.systemPromptInput.value.trim()
    };
  }

  setAvatarState(newState) {
    const accepted = this.runtime.debug.freezeAnim ? true : this.motionManager.setState(newState);
    if (!accepted) return false;
    if (this.runtime.debug.freezeAnim) this.applyAvatarState(newState);
    return true;
  }

  applyAvatarState(newState) {
    this.patchState({
      currentState: newState,
      animationState: newState
    }, 'animation:state');
    this.refs.statusText.textContent = `ONLINE / ${newState.toUpperCase()}`;
    this.refs.statusBadge.className = 'status-badge';
    if (newState === AvatarState.THINKING) {
      this.refs.statusBadge.textContent = 'THINKING';
      this.refs.statusBadge.classList.add('thinking');
    } else if (newState === AvatarState.SPEAKING) {
      this.refs.statusBadge.textContent = 'SPEAKING';
      this.refs.statusBadge.classList.add('speaking');
    } else {
      this.refs.statusBadge.textContent = 'ONLINE';
    }
  }

  showDialogue(text) {
    this.speakText(text);
  }

  speakText(text) {
    if (this.state.speechTimer) clearTimeout(this.state.speechTimer);

    const estimatedDuration = Math.max(UI_TIMING.speechMinMs, text.length * UI_TIMING.speechMsPerChar);
    this.state.speechTimer = this.registry.addTimeout(() => this.resetSpeakingState(), estimatedDuration);
    if (this.ttsConfig.engine !== 'browser') {
      this.ui.statusView.showTTS('loading', `正在请求 ${this.getTTSEngineName(this.ttsConfig.engine)} 语音服务...`);
    }
    this.audioManager.speak(text, {
      muted: this.state.isMuted
    });
  }

  resetSpeakingState() {
    if (this.state.speechTimer) {
      clearTimeout(this.state.speechTimer);
      this.state.speechTimer = null;
    }
    this.patchState({ isSpeaking: false }, 'audio:reset');
  }

  getTTSEngineName(engine) {
    if (engine === 'minimax') return 'MiniMax';
    if (engine === 'openai') return 'OpenAI';
    return '浏览器原生';
  }

  formatTTSError(error) {
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

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ui.destroy();
    this.motionManager.destroy?.();
    this.interactionManager.unbindPointer?.();
    this.recognitionService.destroy?.();
    this.audioManager.destroy?.();
    this.runtime.destroy?.();
    this.eventBus.destroy();
    this.stateStore.destroy();
    this.registry.destroy();
  }
}
