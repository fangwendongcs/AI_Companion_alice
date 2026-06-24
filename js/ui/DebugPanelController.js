import { APP_MODE, EVENT_NAMES, shouldShowDebugPanel } from '../config/appConfig.js';

const TRACKED_EVENTS = [
  EVENT_NAMES.APP_INIT,
  EVENT_NAMES.APP_READY,
  EVENT_NAMES.AVATAR_SWITCH_START,
  EVENT_NAMES.AVATAR_SWITCH_COMPLETE,
  EVENT_NAMES.AVATAR_SWITCH_ERROR,
  EVENT_NAMES.INTERACTION_HIT,
  EVENT_NAMES.ANIMATION_STATE,
  EVENT_NAMES.ANIMATION_ACTION_START,
  EVENT_NAMES.ANIMATION_ACTION_COMPLETE,
  EVENT_NAMES.DIALOGUE_USER,
  EVENT_NAMES.DIALOGUE_THINKING,
  EVENT_NAMES.DIALOGUE_ASSISTANT,
  EVENT_NAMES.DIALOGUE_ERROR,
  EVENT_NAMES.AUDIO_REQUEST,
  EVENT_NAMES.AUDIO_START,
  EVENT_NAMES.AUDIO_END,
  EVENT_NAMES.AUDIO_FALLBACK,
  EVENT_NAMES.AUDIO_ERROR,
  EVENT_NAMES.SYSTEM_ERROR
];

const DISPLAY_ROWS = [
  ['app.ready', 'appReady'],
  ['app.mode', 'appMode'],
  ['qa.mode', 'qaMode'],
  ['qa.springReset', 'qaSpringReset'],
  ['currentAvatarId', 'currentAvatarId'],
  ['avatar.loading', 'avatarLoading'],
  ['avatar.loaded', 'avatarLoaded'],
  ['avatar.renderer', 'avatarRenderer'],
  ['vrm.runtime', 'vrmRuntime'],
  ['vrm.expressionManager', 'vrmExpressionManager'],
  ['vrm.lookAt', 'vrmLookAt'],
  ['vrm.springBone', 'vrmSpringBone'],
  ['vrm.secondaryMotion', 'vrmSecondaryMotion'],
  ['vrm.springBoneReset', 'vrmSpringBoneReset'],
  ['vrm.springBoneResetAt', 'vrmSpringBoneResetAt'],
  ['currentState', 'currentState'],
  ['animation.state', 'animationState'],
  ['currentAnimation', 'currentAnimation'],
  ['isThinking', 'isThinking'],
  ['isSpeaking', 'isSpeaking'],
  ['memory.enabled', 'memoryEnabled'],
  ['memory.used', 'memoryUsed'],
  ['memory.turnCount', 'memoryTurnCount'],
  ['memory.longTerm', 'memoryLongTermCount'],
  ['memory.sessionId', 'memorySessionId'],
  ['persona', 'persona'],
  ['emotion', 'emotion'],
  ['tone', 'tone'],
  ['voice.style', 'voiceStyle'],
  ['motion.slot', 'motionSlot'],
  ['motion.current', 'motionCurrent'],
  ['motion.asset', 'motionAsset'],
  ['motion.quality', 'motionQuality'],
  ['motion.secondary', 'motionSecondary'],
  ['motion.layer', 'motionLayer'],
  ['motion.mode', 'motionMode'],
  ['motion.source', 'motionSource'],
  ['motion.mixerActive', 'motionMixerActive'],
  ['motion.mixerRoot', 'motionMixerRoot'],
  ['motion.tracks', 'motionTracks'],
  ['motion.actions', 'motionActions'],
  ['motion.retargetReady', 'motionRetargetReady'],
  ['motion.proceduralActive', 'motionProceduralActive'],
  ['motion.lastError', 'motionLastError'],
  ['lipSync.mode', 'lipSyncMode'],
  ['lipSync.audioDriven', 'lipSyncAudioDriven'],
  ['lipSync.fallback', 'lipSyncFallback'],
  ['lipSync.amplitude', 'lipSyncAmplitude'],
  ['lipSync.mouth', 'lipSyncMouth'],
  ['isMuted', 'isMuted'],
  ['ttsEngine', 'ttsEngine'],
  ['lastInteractionAt', 'lastInteractionAt'],
  ['lastUserMessage', 'lastUserMessage'],
  ['lastAssistantMessage', 'lastAssistantMessage'],
  ['lastError', 'lastError'],
  ['lastEvent', 'lastEvent']
];

export class DebugPanelController {
  constructor({ eventBus, registry, getState, getTTSConfig, motionManager = null, documentRef = document }) {
    this.eventBus = eventBus;
    this.registry = registry;
    this.getState = getState;
    this.getTTSConfig = getTTSConfig;
    this.motionManager = motionManager;
    this.documentRef = documentRef;
    this.panel = null;
    this.body = null;
    this.toggleButton = null;
    this.motionSelect = null;
    this.motionPlayButton = null;
    this.valueNodes = new Map();
    this.lastEvent = null;
  }

  init() {
    if (!shouldShowDebugPanel()) return;
    this.createPanel();
    this.bindEvents();
    this.render();
  }

  createPanel() {
    const panel = this.documentRef.createElement('aside');
    panel.className = 'debug-panel collapsed';
    panel.setAttribute('aria-label', 'Debug status panel');

    const header = this.documentRef.createElement('button');
    header.type = 'button';
    header.className = 'debug-panel__header';
    header.setAttribute('aria-expanded', 'false');
    header.textContent = `Debug · ${APP_MODE}`;

    const body = this.documentRef.createElement('div');
    body.className = 'debug-panel__body';

    DISPLAY_ROWS.forEach(([label, key]) => {
      const row = this.documentRef.createElement('div');
      row.className = 'debug-panel__row';

      const keyNode = this.documentRef.createElement('span');
      keyNode.className = 'debug-panel__key';
      keyNode.textContent = label;

      const valueNode = this.documentRef.createElement('span');
      valueNode.className = 'debug-panel__value';
      valueNode.textContent = '-';

      row.append(keyNode, valueNode);
      body.append(row);
      this.valueNodes.set(key, valueNode);
    });

    this.createMotionControls(body);

    panel.append(header, body);
    this.documentRef.body.append(panel);

    this.panel = panel;
    this.body = body;
    this.toggleButton = header;

    this.registry.addEventListener(header, 'click', () => this.toggle());
    if (this.motionPlayButton) {
      this.registry.addEventListener(this.motionPlayButton, 'click', () => this.playSelectedMotion());
    }
    this.registry.add(() => panel.remove());
  }

  createMotionControls(body) {
    const state = this.getState();
    if (state.app?.qaMode !== 'motion') return;

    const controls = this.documentRef.createElement('div');
    controls.className = 'debug-panel__motion-controls';

    const label = this.documentRef.createElement('label');
    label.className = 'debug-panel__key';
    label.textContent = 'qa.motion';

    const select = this.documentRef.createElement('select');
    select.className = 'debug-panel__select';
    select.setAttribute('aria-label', 'QA motion');

    const button = this.documentRef.createElement('button');
    button.type = 'button';
    button.className = 'debug-panel__play';
    button.textContent = 'Play';

    controls.append(label, select, button);
    body.append(controls);

    this.motionSelect = select;
    this.motionPlayButton = button;
  }

  bindEvents() {
    this.registry.add(this.eventBus.on(EVENT_NAMES.STATE_CHANGED, () => this.render()));
    TRACKED_EVENTS.forEach((eventName) => {
      this.registry.add(this.eventBus.on(eventName, () => {
        this.lastEvent = {
          name: eventName,
          at: Date.now()
        };
        this.render();
      }));
    });
  }

  toggle() {
    if (!this.panel || !this.toggleButton) return;
    const collapsed = this.panel.classList.toggle('collapsed');
    this.toggleButton.setAttribute('aria-expanded', String(!collapsed));
  }

  render() {
    if (!this.panel) return;
    const state = this.getState();
    const ttsConfig = this.getTTSConfig();
    const avatarCapabilities = state.avatar?.capabilities || state.avatarCapabilities || state.characterMeta?.capabilities || {};
    const vrmRuntime = avatarCapabilities.vrmRuntime || {};
    const values = {
      appReady: state.app?.isReady ?? false,
      appMode: state.app?.mode || APP_MODE,
      qaMode: state.app?.qaMode || '-',
      qaSpringReset: state.app?.springResetMode || '-',
      currentAvatarId: state.avatar?.currentAvatarId || state.currentAvatarId || '-',
      avatarLoading: state.avatar?.loading ?? false,
      avatarLoaded: state.avatar?.loaded ?? state.modelLoaded ?? false,
      avatarRenderer: avatarCapabilities.renderer || '-',
      vrmRuntime: avatarCapabilities.hasVrmRuntime ?? vrmRuntime.available ?? false,
      vrmExpressionManager: avatarCapabilities.hasExpressionManager ?? vrmRuntime.hasExpressionManager ?? false,
      vrmLookAt: avatarCapabilities.hasLookAt ?? vrmRuntime.hasLookAt ?? false,
      vrmSpringBone: avatarCapabilities.hasSpringBoneManager ?? vrmRuntime.hasSpringBoneManager ?? false,
      vrmSecondaryMotion: state.motion?.secondaryMotionEnabled ?? avatarCapabilities.secondaryMotionEnabled ?? true,
      vrmSpringBoneReset: avatarCapabilities.hasSpringBoneReset ?? false,
      vrmSpringBoneResetAt: this.formatTimestamp(avatarCapabilities.lastSpringBoneResetAt),
      currentState: state.currentState || '-',
      animationState: state.animation?.state || state.animationState || '-',
      currentAnimation: state.animation?.currentAnimation || state.currentAnimation || '-',
      isThinking: state.dialogue?.thinking ?? state.isThinking ?? false,
      isSpeaking: state.audio?.speaking ?? state.isSpeaking ?? false,
      memoryEnabled: state.memory?.enabled ?? false,
      memoryUsed: state.memory?.used ?? false,
      memoryTurnCount: state.memory?.turnCount ?? 0,
      memoryLongTermCount: state.memory?.longTermCount ?? state.memory?.longTerm?.count ?? 0,
      memorySessionId: this.truncate(state.memory?.sessionId || '', 28),
      persona: this.truncate(state.persona?.personaId || state.persona?.name || '', 28),
      emotion: state.affect?.emotion || '-',
      tone: state.affect?.tone || '-',
      voiceStyle: state.affect?.voiceStyle || '-',
      motionSlot: state.affect?.motionSlot || '-',
      motionCurrent: state.motion?.current || '-',
      motionAsset: this.formatMotionAsset(state.motion),
      motionQuality: this.formatMotionQuality(state.motion),
      motionSecondary: state.motion?.secondaryMotion || '-',
      motionLayer: state.motion?.layer || '-',
      motionMode: state.motion?.mode || '-',
      motionSource: state.motion?.source || '-',
      motionMixerActive: state.motion?.mixerActive ?? false,
      motionMixerRoot: state.motion?.mixerRoot || '-',
      motionTracks: this.formatMotionTracks(state.motion),
      motionActions: this.formatMotionActions(state.motion?.activeActions),
      motionRetargetReady: state.motion?.retargetReady ?? false,
      motionProceduralActive: state.motion?.proceduralActive ?? false,
      motionLastError: this.formatMotionError(state.motion),
      lipSyncMode: state.presentation?.lipSync?.mode || '-',
      lipSyncAudioDriven: state.presentation?.lipSync?.audioDriven ?? false,
      lipSyncFallback: state.presentation?.lipSync?.fallback ?? false,
      lipSyncAmplitude: this.formatMetric(state.presentation?.lipSync?.smoothedAmplitude ?? state.presentation?.lipSync?.amplitude),
      lipSyncMouth: this.formatLipSyncMouth(state.presentation?.lipSync),
      isMuted: state.audio?.muted ?? state.isMuted ?? false,
      ttsEngine: ttsConfig?.engine || '-',
      lastInteractionAt: this.formatTimestamp(state.interaction?.lastInteractionAt || state.lastInteractionAt),
      lastUserMessage: this.truncate(state.dialogue?.input || state.lastUserMessage || ''),
      lastAssistantMessage: this.truncate(state.dialogue?.lastResponse || state.lastAssistantMessage || ''),
      lastError: this.truncate(
        this.getErrorMessage(state.app?.error)
        || state.systemError
        || state.dialogue?.error
        || ''
      ),
      lastEvent: this.formatEvent(this.lastEvent)
    };

    Object.entries(values).forEach(([key, value]) => {
      const node = this.valueNodes.get(key);
      if (node) node.textContent = this.formatValue(value);
    });
    this.renderMotionControls(state.motion?.availableMotions || []);
  }

  renderMotionControls(motions = []) {
    if (!this.motionSelect) return;

    const selected = this.motionSelect.value;
    const nextValue = motions.some((motion) => motion.id === selected)
      ? selected
      : motions[0]?.id || '';
    this.motionSelect.replaceChildren();

    motions.forEach((motion) => {
      const option = this.documentRef.createElement('option');
      option.value = motion.id;
      option.textContent = this.formatMotionOption(motion);
      this.motionSelect.append(option);
    });

    this.motionSelect.value = nextValue;
    if (this.motionPlayButton) this.motionPlayButton.disabled = !nextValue;
  }

  playSelectedMotion() {
    const motionId = this.motionSelect?.value || '';
    if (!motionId || !this.motionManager?.requestSlot) return;
    this.motionManager.requestSlot(motionId, {
      replacePending: true,
      transitionState: false
    });
    this.render();
  }

  formatValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
  }

  truncate(value, maxLength = 40) {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
  }

  formatTimestamp(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  }

  formatMetric(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0.00';
    return number.toFixed(2);
  }

  formatLipSyncMouth(lipSync = {}) {
    if (!lipSync?.mouthGroup || lipSync.mouthGroup === '-') return '-';
    return `${lipSync.mouthGroup}:${this.formatMetric(lipSync.mouthAmount)}`;
  }

  formatMotionError(motion = {}) {
    if (motion?.lastError) return this.truncate(motion.lastError, 96);
    const missing = motion?.retargetMissingBones || [];
    if (missing.length) return `missing:${this.truncate(missing.join(','), 28)}`;
    return '-';
  }

  formatMotionAsset(motion = {}) {
    const asset = motion?.assetId || '';
    if (!asset) return '-';
    return `${asset}${motion.qaOnly ? '/qa' : ''}`;
  }

  formatMotionQuality(motion = {}) {
    const quality = motion?.qualityStatus || '';
    if (!quality) return '-';
    return `${quality}${motion.qaOnly ? '/qa' : ''}`;
  }

  formatMotionOption(motion = {}) {
    const scope = motion.scope === 'qaSlot' ? 'qa' : 'slot';
    const status = motion.qualityStatus || 'approved';
    return `${motion.id} · ${scope} · ${status}`;
  }

  formatMotionTracks(motion = {}) {
    const trackCount = motion?.trackCount;
    const originalTrackCount = motion?.originalTrackCount;
    if (trackCount === null || trackCount === undefined) return '-';
    if (originalTrackCount === null || originalTrackCount === undefined || originalTrackCount === trackCount) {
      return String(trackCount);
    }
    return `${trackCount}/${originalTrackCount}`;
  }

  formatMotionActions(actions = []) {
    if (!Array.isArray(actions) || actions.length === 0) return '-';
    return actions
      .map((action) => {
        const weight = this.formatMetric(action.weight);
        const running = action.running ? 'run' : 'stop';
        const policy = action.secondaryMotion || 'keep';
        return `${action.layer || '?'}:${action.name}@${weight}/${running}/${policy}`;
      })
      .join(' | ');
  }

  getErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || '';
  }

  formatEvent(event) {
    if (!event) return '-';
    return `${event.name} @ ${this.formatTimestamp(event.at)}`;
  }

  destroy() {
    this.panel?.remove();
    this.panel = null;
    this.body = null;
    this.toggleButton = null;
    this.motionSelect = null;
    this.motionPlayButton = null;
    this.valueNodes.clear();
  }
}
