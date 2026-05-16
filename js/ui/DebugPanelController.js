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
  ['currentAvatarId', 'currentAvatarId'],
  ['avatar.loading', 'avatarLoading'],
  ['avatar.loaded', 'avatarLoaded'],
  ['currentState', 'currentState'],
  ['animation.state', 'animationState'],
  ['currentAnimation', 'currentAnimation'],
  ['isThinking', 'isThinking'],
  ['isSpeaking', 'isSpeaking'],
  ['isMuted', 'isMuted'],
  ['ttsEngine', 'ttsEngine'],
  ['lastInteractionAt', 'lastInteractionAt'],
  ['lastUserMessage', 'lastUserMessage'],
  ['lastAssistantMessage', 'lastAssistantMessage'],
  ['lastError', 'lastError'],
  ['lastEvent', 'lastEvent']
];

export class DebugPanelController {
  constructor({ eventBus, registry, getState, getTTSConfig, documentRef = document }) {
    this.eventBus = eventBus;
    this.registry = registry;
    this.getState = getState;
    this.getTTSConfig = getTTSConfig;
    this.documentRef = documentRef;
    this.panel = null;
    this.body = null;
    this.toggleButton = null;
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

    panel.append(header, body);
    this.documentRef.body.append(panel);

    this.panel = panel;
    this.body = body;
    this.toggleButton = header;

    this.registry.addEventListener(header, 'click', () => this.toggle());
    this.registry.add(() => panel.remove());
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
    const values = {
      appReady: state.app?.isReady ?? false,
      appMode: state.app?.mode || APP_MODE,
      currentAvatarId: state.avatar?.currentAvatarId || state.currentAvatarId || '-',
      avatarLoading: state.avatar?.loading ?? false,
      avatarLoaded: state.avatar?.loaded ?? state.modelLoaded ?? false,
      currentState: state.currentState || '-',
      animationState: state.animation?.state || state.animationState || '-',
      currentAnimation: state.animation?.currentAnimation || state.currentAnimation || '-',
      isThinking: state.dialogue?.thinking ?? state.isThinking ?? false,
      isSpeaking: state.audio?.speaking ?? state.isSpeaking ?? false,
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

  getErrorMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return error.message || '';
  }

  formatEvent(event) {
    if (!event) return '-';
    return `${event.name} @ ${this.formatTimestamp(event.at)}`;
  }
}
