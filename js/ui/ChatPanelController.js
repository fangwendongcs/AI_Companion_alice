import { EVENT_NAMES } from '../core/events/eventNames.js';

export class ChatPanelController {
  constructor({ refs, registry, actions, eventBus = null }) {
    this.refs = refs;
    this.registry = registry;
    this.actions = actions;
    this.eventBus = eventBus;
  }

  init() {
    this.registry.addEventListener(this.refs.sendBtn, 'click', () => this.actions.handleChat());
    if (this.refs.regenerateBtn) {
      this.registry.addEventListener(this.refs.regenerateBtn, 'click', () => this.actions.regenerateReply());
    }
    if (this.refs.clearContextBtn) {
      this.registry.addEventListener(this.refs.clearContextBtn, 'click', () => this.actions.clearDialogueContext());
    }
    this.registry.addEventListener(this.refs.promptInput, 'keypress', (event) => {
      if (event.key === 'Enter') this.actions.handleChat();
    });
    this.registry.addEventListener(this.refs.muteBtn, 'click', () => this.actions.toggleMute());
    this.bindDialogueFeedback();
  }

  bindDialogueFeedback() {
    if (!this.eventBus || !this.refs.dialogueCaption) return;
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_THINKING, ({ active }) => {
      if (active) this.showDialogueFeedback('Alice 正在思考…', 'thinking');
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ASSISTANT, ({ text }) => {
      this.showDialogueFeedback(`Alice：${text}`, 'reply');
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.DIALOGUE_ERROR, () => {
      this.showDialogueFeedback('Alice 暂时无法回复，请检查服务状态。', 'error');
    }));
  }

  showDialogueFeedback(text, state = 'reply') {
    const caption = this.refs.dialogueCaption;
    if (!caption) return;
    caption.textContent = String(text || '').trim();
    caption.dataset.state = state;
    caption.hidden = !caption.textContent;
  }
}
