export class ChatPanelController {
  constructor({ refs, registry, actions }) {
    this.refs = refs;
    this.registry = registry;
    this.actions = actions;
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
  }
}
