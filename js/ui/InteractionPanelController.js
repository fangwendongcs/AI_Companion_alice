export class InteractionPanelController {
  constructor({
    refs,
    registry,
    store,
    recognitionService,
    interactionManager,
    runtime,
    log,
    actions
  }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.recognitionService = recognitionService;
    this.interactionManager = interactionManager;
    this.runtime = runtime;
    this.log = log;
    this.actions = actions;
  }

  init() {
    this.bindMemoryControls();
    this.bindVoiceInput();
    this.interactionManager.bindPointer(this.runtime.renderer.domElement);
    this.registry.add(() => this.interactionManager.unbindPointer());
    this.registry.addEventListener(document, 'click', (event) => this.handleDocumentClick(event));
  }

  bindMemoryControls() {
    this.registry.addEventListener(this.refs.saveMemoryBtn, 'click', () => {
      const name = this.refs.nameInput.value;
      const birthday = this.refs.birthdayInput.value;
      const likes = this.refs.likesInput.value;
      this.store.saveMemory({ name, birthday, likes });
      this.actions.showDialogue(`好的${name ? '，' + name : ''}！我已经记住啦～`);
    });
  }

  bindVoiceInput() {
    this.recognitionService.bind(this.refs.voiceBtn, {
      onResult: (transcript) => {
        this.refs.promptInput.value = transcript;
        this.actions.handleChat();
      },
      onError: (event) => this.log.warn('Speech 识别错误:', event.error)
    });
  }

  handleDocumentClick(event) {
    const reactionTarget = event.target.closest('[data-reaction]');
    if (reactionTarget) {
      const part = reactionTarget.dataset.reaction;
      this.actions.triggerReaction(part, this.interactionManager.getMotionSlotForPart(part));
      return;
    }

    const moodTarget = event.target.closest('[data-mood]');
    if (moodTarget) {
      this.actions.setMood(moodTarget.dataset.mood);
    }
  }
}
