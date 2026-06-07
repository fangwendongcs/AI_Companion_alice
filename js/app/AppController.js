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
    this.llmClient = new LLMClient('/api/dialogue', { timeoutMs: REQUEST_TIMEOUTS.llmMs });
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
    this.avatarSwitchVersion = 0;
    this.lastDialogueInput = '';
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
      memory: {
        enabled: this.llmConfig?.useMemory ?? false,
        used: false,
        sessionId: this.llmConfig?.sessionId || null,
        turnCount: 0,
        longTermCount: 0,
        maxTurns: null
      },
      persona: {
        avatarId: null,
        personaId: null,
        name: null,
        tone: null
      },
      affect: {
        emotion: 'neutral',
        intensity: 0,
        tone: 'calm',
        voiceStyle: null,
        motionSlot: null
      },
      avatarDirective: null,
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
      eventBus: this.eventBus,
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
        regenerateReply: () => this.regenerateReply(),
        clearDialogueContext: () => this.clearDialogueContext(),
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
      this.scheduleInteractionStateSettle();
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
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ASSISTANT, ({ text, memory, affect, avatarDirective, meta }) => {
      this.lastDialogueAffect = affect || null;
      this.lastAvatarDirective = avatarDirective || null;
      this.applyAvatarDirective(avatarDirective, EVENT_NAMES.DIALOGUE_ASSISTANT);
      this.patchState({
        lastAssistantMessage: text,
        memory,
        affect,
        avatarDirective,
        persona: meta?.persona || null,
        dialogueError: null
      }, EVENT_NAMES.DIALOGUE_ASSISTANT);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ERROR, ({ error, message }) => {
      const affect = createFallbackAffect();
      this.lastDialogueAffect = affect;
      this.patchState({
        dialogueError: message,
        affect
      }, EVENT_NAMES.DIALOGUE_ERROR);
      handleAppError(error || new Error(message), {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: EVENT_NAMES.DIALOGUE_ERROR,
        code: error?.code || ERROR_CODES.API_REQUEST_FAILED,
        userMessage: message
      });
    }));

    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_START, ({ affect } = {}) => {
      this.patchState({ isSpeaking: true }, EVENT_NAMES.AUDIO_START);
      this.applyAvatarDirective(this.lastAvatarDirective || createSpeakingDirective(affect || this.lastDialogueAffect), EVENT_NAMES.AUDIO_START);
      this.requestAffectMotion(affect || this.lastDialogueAffect, MotionSlot.SPEAKING, this.lastAvatarDirective);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_END, () => {
      this.resetSpeakingState(EVENT_NAMES.AUDIO_END);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_ERROR, ({ error }) => {
      handleAppError(error || new Error('Audio playback failed'), {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: EVENT_NAMES.AUDIO_ERROR,
        code: error?.code || ERROR_CODES.API_REQUEST_FAILED,
        userMessage: error?.message || '音频播放失败。'
      });
      this.resetSpeakingState(EVENT_NAMES.AUDIO_ERROR);
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
      const characterMeta = await this.characterManager.loadManifest(currentAvatarId);
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
        currentAnimation: 'currentAnimation' in patch
          ? patch.currentAnimation
          : this.state.currentAnimation,
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
    if ('memory' in patch || 'memoryEnabled' in patch) {
      const memory = patch.memory || {};
      layered.memory = {
        ...this.state.memory,
        ...memory,
        longTermCount: memory.longTerm?.count ?? memory.longTermCount ?? this.state.memory?.longTermCount ?? 0,
        enabled: patch.memoryEnabled ?? memory.enabled ?? this.state.memory?.enabled ?? false
      };
    }
    if ('persona' in patch) {
      layered.persona = {
        ...this.state.persona,
        ...(patch.persona || {})
      };
    }
    if ('affect' in patch) {
      layered.affect = normalizeAffectState(patch.affect, this.state.affect);
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
    const switchVersion = ++this.avatarSwitchVersion;
    const previousAvatar = this.characterManager.current;
    try {
      this.eventBus.emit(EVENT_NAMES.AVATAR_SWITCH_START, { avatarId });
      this.audioManager.stop();
      this.resetSpeakingState('avatar:switch');
      this.patchState({
        modelLoaded: false,
        systemError: null,
        isAnimating: false,
        currentAnimation: null
      }, 'avatar:switch');
      this.refs.loaderProgress.style.width = '0%';

      const result = await this.characterManager.switchCharacter(avatarId, (percent) => {
        this.refs.loaderProgress.style.width = `${percent}%`;
      });

      this.motionManager.unload();
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
        if (switchVersion === this.avatarSwitchVersion && this.state.currentState === AvatarState.BOOT) {
          this.setAvatarState(AvatarState.IDLE);
        }
      }, UI_TIMING.bootFallbackMs);
      this.ui.errorView.hideLoading({
        registry: this.registry,
        fadeDelayMs: UI_TIMING.loadingFadeDelayMs,
        fadeMs: UI_TIMING.loadingFadeMs,
        onHidden: () => {
          if (switchVersion === this.avatarSwitchVersion) {
            this.showDialogue('[SYSTEM] 模型装载完毕，交互系统已激活。');
          }
        }
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
      const retainedAvatar = this.characterManager.current || previousAvatar;
      if (retainedAvatar) {
        this.runtime.applyCameraConfig(retainedAvatar.meta?.camera);
        this.patchState({
          currentAvatarId: retainedAvatar.id,
          characterMeta: retainedAvatar.meta,
          modelLoaded: true,
          isAnimating: false,
          currentAnimation: null
        }, 'avatar:switch:error');
        this.interactionManager.setCharacter(retainedAvatar.meta);
      } else {
        this.patchState({
          modelLoaded: false,
          isAnimating: false,
          currentAnimation: null
        }, 'avatar:switch:error');
        this.characterManager.createFallback();
      }
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
    this.lastDialogueInput = text;
    await this.sendDialogueText(text);
  }

  async regenerateReply() {
    const text = this.lastDialogueInput || this.state.lastUserMessage || this.state.dialogue?.input || '';
    if (!text.trim()) {
      this.showDialogue('还没有可以重新生成的上一条消息。');
      return;
    }
    await this.sendDialogueText(text, { regenerate: true });
  }

  async clearDialogueContext() {
    this.llmConfig = this.readLLMFormConfig();
    const sessionId = this.llmConfig.sessionId || 'default';
    const avatarId = this.state.currentAvatarId || 'alice';
    this.setDialogueBusy(true);

    try {
      const result = await this.apiClient.json(
        `/api/memory?sessionId=${encodeURIComponent(sessionId)}&avatarId=${encodeURIComponent(avatarId)}&scope=context`,
        {
          method: 'DELETE',
          source: 'memory'
        }
      );
      this.lastDialogueInput = '';
      this.refs.promptInput.value = '';
      this.patchState({
        lastUserMessage: '',
        lastAssistantMessage: '',
        dialogueError: null,
        memory: {
          ...(this.state.memory || {}),
          used: Boolean(this.llmConfig.useMemory),
          sessionId,
          turnCount: 0,
          context: [],
          lastClearedScope: result?.scope || 'context'
        }
      }, 'dialogue:clear-context');
      this.showDialogue('当前上下文已经清空，我会从这里重新陪你聊。');
    } catch (error) {
      this.log.error('清空上下文失败:', error);
      this.patchState({
        dialogueError: error?.message || '清空上下文失败。'
      }, 'dialogue:clear-context:error');
      this.showDialogue('清空上下文失败了，请确认后端服务正常。');
    } finally {
      this.setDialogueBusy(false);
    }
  }

  async sendDialogueText(text, { regenerate = false } = {}) {
    this.setDialogueBusy(true);

    try {
      this.llmConfig = this.readLLMFormConfig();
      const reply = await this.dialogueManager.send(text, {
        ...this.llmConfig,
        options: {
          ...(this.llmConfig.options || {}),
          regenerate
        }
      });
      const response = this.llmClient.getLastResponse?.() || {};
      this.lastAvatarDirective = response.avatar_directive || this.lastAvatarDirective || null;
      this.speakText(reply, { affect: response.affect || this.lastDialogueAffect });
    } catch (error) {
      this.log.error('LLM 调用失败:', error);
      const fallbackReply = '抱歉，连接出现问题。请确认后端服务已启动，并配置了对应模型的 API Key。';
      const affect = createFallbackAffect();
      this.eventBus.emit(EVENT_NAMES.DIALOGUE_ASSISTANT, {
        text: fallbackReply,
        fallback: true,
        affect,
        meta: {
          persona: this.state.persona || null
        }
      });
      this.requestAffectMotion(affect, MotionSlot.BODY_TAP);
      this.speakText(fallbackReply, { affect });
    } finally {
      this.setDialogueBusy(false);
    }
  }

  setDialogueBusy(isBusy) {
    [this.refs.sendBtn, this.refs.regenerateBtn, this.refs.clearContextBtn].forEach((button) => {
      if (button) button.disabled = Boolean(isBusy);
    });
  }

  readLLMFormConfig() {
    const useMemory = Boolean(this.refs.llmMemoryToggle?.checked);
    const sessionId = this.llmConfig?.sessionId || this.store.loadMemorySessionId();
    return {
      provider: this.refs.llmProvider.value,
      baseUrl: '',
      model: this.refs.llmModel.value,
      systemPrompt: this.refs.systemPromptInput.value.trim(),
      useMemory,
      sessionId,
      avatarId: this.state.currentAvatarId,
      options: {
        useMemory,
        avatarId: this.state.currentAvatarId,
        useRag: false,
        useWorkflow: false
      }
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

  speakText(text, { affect = null } = {}) {
    if (this.state.speechTimer) clearTimeout(this.state.speechTimer);

    const estimatedDuration = Math.max(UI_TIMING.speechMinMs, text.length * UI_TIMING.speechMsPerChar);
    this.state.speechTimer = this.registry.addTimeout(() => this.resetSpeakingState('audio:timer'), estimatedDuration);
    void this.audioManager.speak(text, {
      muted: this.state.isMuted,
      affect
    });
  }

  requestAffectMotion(affect, fallbackSlot = MotionSlot.SPEAKING, avatarDirective = null) {
    const slot = this.getMotionSlotForDirective(avatarDirective) || this.getMotionSlotForAffect(affect) || fallbackSlot;
    this.motionManager.requestSlot(MotionSlot.SPEAKING, { replacePending: false });
    if (slot && slot !== MotionSlot.SPEAKING && slot !== MotionSlot.IDLE) {
      this.motionManager.requestSlot(slot, { replacePending: false });
    }
  }

  applyAvatarDirective(avatarDirective, source = 'avatar:directive') {
    if (!avatarDirective) return null;
    const result = this.characterManager.applyAvatarDirective(avatarDirective);
    if (result?.ok === false) {
      this.log.debug('Avatar directive 未应用:', source, result.reason);
    }
    return result;
  }

  getMotionSlotForDirective(avatarDirective) {
    const gesture = avatarDirective?.gesture;
    if (gesture === 'thinking') return MotionSlot.LISTENING;
    if (gesture === 'soft_nod') return MotionSlot.CHAT;
    if (gesture === 'wave') return MotionSlot.ARM_TAP;
    if (avatarDirective?.state === 'idle') return MotionSlot.IDLE;
    if (avatarDirective?.state === 'speaking') return MotionSlot.SPEAKING;
    return null;
  }

  getMotionSlotForAffect(affect) {
    const slot = affect?.motion?.slot;
    if (slot === 'happy') return MotionSlot.CHAT;
    if (slot === 'apologize') return MotionSlot.BODY_TAP;
    if (slot === 'thinking') return MotionSlot.LISTENING;
    if (slot === 'speaking') return MotionSlot.SPEAKING;
    if (slot === 'idle') return MotionSlot.IDLE;
    return null;
  }

  resetSpeakingState(source = 'audio:reset') {
    if (this.state.speechTimer) {
      clearTimeout(this.state.speechTimer);
      this.state.speechTimer = null;
    }
    this.patchState({ isSpeaking: false }, source);
    this.applyAvatarDirective({
      state: 'idle',
      emotion: this.state.affect?.emotion || 'neutral',
      gesture: 'none',
      gaze: 'user',
      lip_sync: 'none',
      intensity: 0
    }, source);
    if (this.state.currentState === AvatarState.SPEAKING) {
      this.motionManager.requestSlot(MotionSlot.IDLE, {
        replacePending: false
      });
    }
  }

  scheduleInteractionStateSettle() {
    this.registry.addTimeout(() => {
      if (this.destroyed) return;
      if (this.state.isThinking || this.state.isSpeaking || this.state.currentAnimation) return;
      if (!isInteractionAvatarState(this.state.currentState)) return;

      this.motionManager.requestSlot(MotionSlot.IDLE, {
        replacePending: false
      });
    }, 80);
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

function isInteractionAvatarState(state) {
  return [
    AvatarState.REACTING,
    AvatarState.INTERACTING,
    AvatarState.ARM_ACTION,
    AvatarState.HEAD_ACTION,
    AvatarState.LEG_ACTION,
    AvatarState.INTERRUPTED,
    AvatarState.ERROR
  ].includes(state);
}

function normalizeAffectState(affect, previous = {}) {
  if (!affect) return previous || {};
  return {
    emotion: affect.emotion || previous?.emotion || 'neutral',
    intensity: affect.intensity ?? previous?.intensity ?? 0,
    tone: affect.tone || previous?.tone || 'calm',
    voiceStyle: affect.voice?.style || previous?.voiceStyle || null,
    motionSlot: affect.motion?.slot || previous?.motionSlot || null,
    reason: affect.reason || previous?.reason || null
  };
}

function createFallbackAffect() {
  return {
    emotion: 'apologetic',
    intensity: 0.62,
    tone: 'gentle',
    reason: 'frontend_error_fallback',
    voice: {
      style: 'soft_gentle',
      rate: 0.96,
      pitch: 1.02
    },
    motion: {
      slot: 'apologize',
      intensity: 0.5
    }
  };
}

function createSpeakingDirective(affect = {}) {
  return {
    state: 'speaking',
    emotion: affect?.emotion || 'neutral',
    gesture: affect?.motion?.slot === 'happy' ? 'soft_nod' : 'none',
    gaze: 'user',
    lip_sync: 'auto',
    intensity: affect?.intensity ?? affect?.motion?.intensity ?? 0.45
  };
}
