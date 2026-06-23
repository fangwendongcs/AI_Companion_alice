import { LLMClient } from '../ai/LLMClient.js';
import { AvatarState, MotionManager, MotionSlot } from '../animation/MotionManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { CharacterManager } from '../avatar/CharacterManager.js';
import { PresentationOrchestrator, createFallbackAffect } from '../avatar/presentation/PresentationOrchestrator.js';
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
    this.documentRef = documentRef;
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
    this.presentation = new PresentationOrchestrator({
      characterManager: this.characterManager,
      motionManager: this.motionManager,
      log: this.log
    });
    this.recognitionService = new SpeechRecognitionService();
    this.llmConfig = this.store.loadLLMConfig();
    this.ttsConfig = this.store.loadTTSConfig();
    this.avatarSwitchChain = Promise.resolve();
    this.avatarSwitchVersion = 0;
    this.lastDialogueInput = '';
    this.lastPresentationDebugSyncAt = 0;
    this.lastPresentationDebugSignature = '';
    this.lastMotionDebugSyncAt = 0;
    this.lastMotionDebugSignature = '';
    this.qaMode = this.getRequestedQAMode();
    this.springResetMode = this.getRequestedSpringResetMode();
    this.secondaryMotionSuppressedActionId = null;
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
        qaMode: this.qaMode || null,
        springResetMode: this.springResetMode || null,
        error: null
      },
      avatar: {
        currentAvatarId: null,
        loading: false,
        loaded: false,
        meta: null,
        capabilities: null
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
      motion: {
        current: null,
        mode: 'none',
        source: 'none',
        mixerActive: false,
        retargetReady: false,
        secondaryMotionEnabled: true,
        proceduralActive: false,
        lastError: ''
      },
      presentation: {
        lipSync: {
          active: false,
          mode: 'idle',
          audioDriven: false,
          fallback: false,
          amplitude: 0,
          smoothedAmplitude: 0,
          mouthGroup: '-',
          mouthAmount: 0,
          updatedAt: null
        },
        tts: null
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
      avatarCapabilities: null,
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
      const secondaryMotionPolicy = this.applyActionSecondaryMotionPolicy(request, 'start');
      const startPatch = {
        isAnimating: true,
        currentAnimation: request.name
      };
      if (secondaryMotionPolicy) {
        startPatch.avatarCapabilities = this.characterManager.getAvatarCapabilities();
      }
      this.patchState(startPatch, 'animation:action:start');
      this.eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_START, request);
      if (secondaryMotionPolicy) this.syncMotionDebugState({ force: true });
    };
    this.motionManager.onActionComplete = (request) => {
      const completionPatch = {
        isAnimating: false,
        currentAnimation: null
      };
      const secondaryMotionPolicy = this.applyActionSecondaryMotionPolicy(request, 'complete');
      const secondaryReset = this.applyDebugSecondaryMotionReset(request);
      if (secondaryMotionPolicy || secondaryReset) {
        completionPatch.avatarCapabilities = this.characterManager.getAvatarCapabilities();
      }
      this.patchState(completionPatch, 'animation:action:complete');
      this.eventBus.emit(EVENT_NAMES.ANIMATION_ACTION_COMPLETE, request);
      if (secondaryMotionPolicy || secondaryReset) this.syncMotionDebugState({ force: true });
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
      const presentation = this.presentation.applyDialogueResponse({
        avatarDirective,
        affect,
        source: EVENT_NAMES.DIALOGUE_ASSISTANT
      });
      this.lastDialogueAffect = presentation.affect;
      this.lastAvatarDirective = presentation.directive;
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
      this.lastDialogueAffect = this.presentation.setFallbackAffect(affect);
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

    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_REQUEST, ({ engine, affect } = {}) => {
      this.presentation.handleAudioRequest({
        engine,
        affect,
        source: EVENT_NAMES.AUDIO_REQUEST
      });
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_START, ({ engine, affect, audioSource } = {}) => {
      this.patchState({ isSpeaking: true }, EVENT_NAMES.AUDIO_START);
      const presentation = this.presentation.handleAudioStart({
        engine,
        affect,
        audioSource,
        source: EVENT_NAMES.AUDIO_START
      });
      this.lastDialogueAffect = presentation.affect;
      this.lastAvatarDirective = presentation.directive;
      this.syncPresentationDebugState({ force: true });
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_FALLBACK, ({ engine, message, error, affect } = {}) => {
      this.presentation.handleAudioFallback({
        engine,
        message,
        error,
        affect,
        source: EVENT_NAMES.AUDIO_FALLBACK
      });
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_END, ({ engine, fallback } = {}) => {
      this.resetSpeakingState(EVENT_NAMES.AUDIO_END, { engine, fallback });
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_ERROR, ({ engine, message, error, affect } = {}) => {
      handleAppError(error || new Error('Audio playback failed'), {
        eventBus: this.eventBus,
        stateStore: this.stateStore,
        source: EVENT_NAMES.AUDIO_ERROR,
        code: error?.code || ERROR_CODES.API_REQUEST_FAILED,
        userMessage: error?.message || '音频播放失败。'
      });
      this.resetSpeakingState(EVENT_NAMES.AUDIO_ERROR, { engine, message, error, affect });
    }));
  }

  async init() {
    try {
      this.eventBus.emit(EVENT_NAMES.APP_INIT, {});
      this.applyRequestedQAMode();
      const configValidation = validateRuntimeConfig();
      if (!configValidation.ok) {
        this.log.warn('运行配置校验警告:', configValidation.errors.join('；'));
      }
      localStorage.removeItem('llm_api_key');

      const avatarRegistry = await this.characterManager.loadRegistry();
      this.patchState({ avatarRegistry }, 'app:init');
      const requestedAvatarId = this.getRequestedAvatarId();
      const savedAvatarId = this.store.loadAvatarId(this.characterManager.getDefaultAvatarId());
      const hasRequestedAvatar = requestedAvatarId
        && this.characterManager.listAvatars().some((avatar) => avatar.id === requestedAvatarId);
      const hasSavedAvatar = this.characterManager.listAvatars().some((avatar) => avatar.id === savedAvatarId);
      const currentAvatarId = hasRequestedAvatar
        ? requestedAvatarId
        : hasSavedAvatar ? savedAvatarId : this.characterManager.getDefaultAvatarId();
      const characterMeta = await this.characterManager.loadManifest(currentAvatarId);
      this.patchState({ currentAvatarId, characterMeta }, 'app:init');

      this.runtime.init(this.state.characterMeta);
      this.registry.addEventListener(window, 'resize', () => this.runtime.onResize());
      this.ui.init();
      this.runtime.render((delta) => {
        this.motionManager.update(delta);
        this.characterManager.updateAvatarRenderer(delta);
        this.syncMotionDebugState();
        this.syncPresentationDebugState();
      });

      await this.switchAvatar(this.state.currentAvatarId);
      this.applyRequestedDebugMotion();
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

  getRequestedAvatarId() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('avatar') || params.get('avatarId') || '';
    } catch {
      return '';
    }
  }

  getRequestedMotionId() {
    try {
      const params = new URLSearchParams(window.location.search);
      const debugEnabled = params.get('debug') === '1' || params.get('localVrm') === '1';
      if (!debugEnabled) return '';
      return params.get('motion') || '';
    } catch {
      return '';
    }
  }

  getRequestedQAMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const debugEnabled = params.get('debug') === '1' || params.get('localVrm') === '1';
      const qaMode = String(params.get('qa') || '').trim().toLowerCase();
      if (!debugEnabled || qaMode !== 'motion') return '';
      return qaMode;
    } catch {
      return '';
    }
  }

  getRequestedSpringResetMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const debugEnabled = params.get('debug') === '1' || params.get('localVrm') === '1';
      const springResetMode = String(params.get('springReset') || '').trim().toLowerCase();
      if (!debugEnabled || this.qaMode !== 'motion' || springResetMode !== 'gestureend') return '';
      return 'gestureEnd';
    } catch {
      return '';
    }
  }

  applyRequestedQAMode() {
    if (!this.qaMode) return;
    this.documentRef.body?.classList.add(`qa-${this.qaMode}`);
    if (this.documentRef.documentElement) {
      this.documentRef.documentElement.dataset.qa = this.qaMode;
    }
  }

  applyRequestedDebugMotion() {
    const motionId = this.getRequestedMotionId();
    if (!motionId) return;
    const accepted = this.motionManager.requestSlot(motionId, {
      replacePending: true,
      transitionState: false
    });
    if (!accepted) this.log.debug('Debug motion request was not accepted:', motionId);
    this.syncMotionDebugState({ force: true });
  }

  applyDebugSecondaryMotionReset(request = {}) {
    if (this.springResetMode !== 'gestureEnd') return null;
    if (request?.layer !== 'gesture') return null;
    if (request?.meta?.mode !== 'vrma') return null;

    const result = this.characterManager.resetAvatarSecondaryMotion('debug-gesture-end');
    if (!result.ok) this.log.debug('Debug secondary motion reset was not applied:', result.reason);
    return result;
  }

  applyActionSecondaryMotionPolicy(request = {}, phase = 'start') {
    const policy = this.getActionSecondaryMotionPolicy(request);
    if (policy === 'keep') return null;

    if (phase === 'start') {
      if (policy === 'reset') {
        const result = this.characterManager.resetAvatarSecondaryMotion(`motion:${request.name}:start`);
        if (!result.ok) this.log.debug('Secondary motion reset was not applied:', result.reason);
        return result;
      }
      if (policy === 'suppress') {
        this.secondaryMotionSuppressedActionId = request.id;
        const result = this.characterManager.setAvatarSecondaryMotionEnabled(false, `motion:${request.name}:start`);
        if (!result.ok) this.log.debug('Secondary motion disable was not applied:', result.reason);
        return result;
      }
    }

    if (phase === 'complete' && policy === 'reset') {
      const result = this.characterManager.resetAvatarSecondaryMotion(`motion:${request.name}:complete`);
      if (!result.ok) this.log.debug('Secondary motion reset was not applied:', result.reason);
      return result;
    }

    if (phase === 'complete' && policy === 'suppress' && this.secondaryMotionSuppressedActionId === request.id) {
      this.secondaryMotionSuppressedActionId = null;
      const result = this.characterManager.setAvatarSecondaryMotionEnabled(true, `motion:${request.name}:complete`);
      if (!result.ok) this.log.debug('Secondary motion enable was not applied:', result.reason);
      return result;
    }

    return null;
  }

  getActionSecondaryMotionPolicy(request = {}) {
    const policy = String(request?.meta?.secondaryMotion || 'keep').trim().toLowerCase();
    if (['keep', 'reset', 'suppress'].includes(policy)) return policy;
    return 'keep';
  }

  releaseSecondaryMotionSuppression(reason = 'manual', { sync = true } = {}) {
    if (!this.secondaryMotionSuppressedActionId) return null;
    this.secondaryMotionSuppressedActionId = null;
    const result = this.characterManager.setAvatarSecondaryMotionEnabled(true, reason);
    if (!result.ok) this.log.debug('Secondary motion release was not applied:', result.reason);
    if (sync) {
      this.patchState({
        avatarCapabilities: this.characterManager.getAvatarCapabilities()
      }, reason);
      this.syncMotionDebugState({ force: true });
    }
    return result;
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
    if ('currentAvatarId' in patch || 'characterMeta' in patch || 'modelLoaded' in patch || 'avatarCapabilities' in patch) {
      layered.avatar = {
        ...this.state.avatar,
        currentAvatarId: patch.currentAvatarId ?? this.state.currentAvatarId,
        meta: patch.characterMeta ?? this.state.characterMeta,
        capabilities: patch.avatarCapabilities ?? this.state.avatar?.capabilities ?? this.state.avatarCapabilities ?? null,
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
    if ('motion' in patch) {
      layered.motion = {
        ...this.state.motion,
        ...(patch.motion || {})
      };
    }
    if ('presentation' in patch) {
      const presentation = patch.presentation || {};
      layered.presentation = {
        ...this.state.presentation,
        ...presentation,
        lipSync: {
          ...this.state.presentation?.lipSync,
          ...(presentation.lipSync || {})
        },
        tts: presentation.tts === null
          ? null
          : {
            ...(this.state.presentation?.tts || {}),
            ...(presentation.tts || {})
          }
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

  syncPresentationDebugState({ force = false } = {}) {
    const debugState = this.presentation?.getDebugState?.();
    const lipSync = debugState?.lipSync || null;
    if (!lipSync) return;

    const mode = lipSync.mode || 'idle';
    const active = Boolean(lipSync.active) || mode !== 'idle';
    const now = Date.now();
    if (!force && !active) return;
    if (!force && now - this.lastPresentationDebugSyncAt < 250) return;

    const nextPresentation = {
      lipSync,
      tts: debugState.tts || null
    };
    const signature = JSON.stringify(nextPresentation);
    if (!force && signature === this.lastPresentationDebugSignature) return;

    this.lastPresentationDebugSyncAt = now;
    this.lastPresentationDebugSignature = signature;
    this.patchState({ presentation: nextPresentation }, 'presentation:debug');
  }

  syncMotionDebugState({ force = false } = {}) {
    const motion = this.motionManager?.getDebugState?.();
    if (!motion) return;

    const capabilities = this.characterManager?.getAvatarCapabilities?.()
      || this.state.avatar?.capabilities
      || this.state.avatarCapabilities
      || {};
    const nextMotion = {
      current: motion.current || null,
      layer: motion.layer || '',
      mode: motion.mode || 'none',
      source: motion.source || 'none',
      mixerActive: Boolean(motion.mixerActive),
      mixerRoot: motion.mixerRoot || '',
      trackCount: motion.trackCount ?? null,
      originalTrackCount: motion.originalTrackCount ?? null,
      retargetReady: Boolean(capabilities.retargetReady),
      secondaryMotionEnabled: capabilities.secondaryMotionEnabled ?? true,
      proceduralActive: Boolean(motion.proceduralActive),
      activeActions: motion.activeActions || [],
      lastError: motion.lastError || '',
      retargetMissingBones: capabilities.retargetMissingBones || []
    };
    const now = Date.now();
    if (!force && now - this.lastMotionDebugSyncAt < 250) return;

    const signature = JSON.stringify(nextMotion);
    if (!force && signature === this.lastMotionDebugSignature) return;

    this.lastMotionDebugSyncAt = now;
    this.lastMotionDebugSignature = signature;
    this.patchState({ motion: nextMotion }, 'motion:debug');
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
      this.releaseSecondaryMotionSuppression('avatar:switch:start');
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
        avatarCapabilities: this.characterManager.getAvatarCapabilities(),
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
      this.syncMotionDebugState({ force: true });

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
      this.lastAvatarDirective = this.presentation.getLastDirective() || response.avatar_directive || this.lastAvatarDirective || null;
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
      this.presentation.requestAffectMotion(affect, MotionSlot.BODY_TAP);
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

  resetSpeakingState(source = 'audio:reset', audioEvent = {}) {
    if (this.state.speechTimer) {
      clearTimeout(this.state.speechTimer);
      this.state.speechTimer = null;
    }
    this.patchState({ isSpeaking: false }, source);
    if (source === EVENT_NAMES.AUDIO_ERROR) {
      this.presentation.handleAudioError({
        ...audioEvent,
        source,
        currentState: this.state.currentState,
        emotion: this.state.affect?.emotion || 'apologetic'
      });
    } else {
      this.presentation.handleAudioEnd({
        ...audioEvent,
        source,
        currentState: this.state.currentState,
        emotion: this.state.affect?.emotion || 'neutral'
      });
    }
    this.syncPresentationDebugState({ force: true });
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
    this.releaseSecondaryMotionSuppression('app:destroy', { sync: false });
    this.ui.destroy();
    this.presentation.destroy?.();
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
