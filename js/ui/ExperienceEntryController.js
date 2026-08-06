import { shouldUseDeveloperExperience } from '../config/appConfig.js';

const WELCOME_TEXT = '嗨，我是 Alice。今天想聊点什么？';

export class ExperienceEntryController {
  constructor({
    refs,
    registry,
    store,
    apiClient,
    getState,
    patchState,
    getConfig,
    setConfig,
    getDemoReadiness,
    documentRef = document
  }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.apiClient = apiClient;
    this.getState = getState;
    this.patchState = patchState;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.getDemoReadiness = getDemoReadiness;
    this.documentRef = documentRef;
    this.developerMode = shouldUseDeveloperExperience();
    this.introPending = false;
    this.avatarReady = false;
  }

  init() {
    this.syncMemoryControls(Boolean(this.getConfig()?.useMemory));
    if (this.developerMode) {
      this.hideIntro();
      return;
    }

    this.bindControls();
    this.renderReadiness();
    if (this.store.hasCompletedExperienceIntro()) {
      this.hideIntro();
      this.setEntryControlsDisabled(false);
      return;
    }

    this.presentIntro();
  }

  bindControls() {
    this.registry.addEventListener(this.refs.welcomeStartBtn, 'click', () => this.completeIntro());
    this.registry.addEventListener(this.refs.memoryBtn, 'click', () => this.togglePrivacy());
    this.registry.addEventListener(this.refs.privacyCloseBtn, 'click', () => this.closePrivacy());
    this.registry.addEventListener(this.refs.experienceMemoryToggle, 'change', (event) => {
      this.applyMemoryPreference(Boolean(event.target.checked));
      this.showPrivacyStatus(event.target.checked ? '这次聊天会被记住。' : '这次聊天不会被保存。');
    });
    this.registry.addEventListener(this.refs.experienceMemoryClearBtn, 'click', () => {
      void this.clearCurrentMemory();
    });
    this.registry.addEventListener(this.documentRef, 'keydown', (event) => {
      if (event.key === 'Escape') this.closePrivacy();
    });
  }

  presentIntro() {
    this.introPending = true;
    this.refs.welcomeCard.hidden = false;
    this.documentRef.body?.classList.add('experience-intro-active');
    this.setEntryControlsDisabled(true);
    this.registry.addTimeout(() => this.refs.welcomeStartBtn?.focus(), 0);
  }

  completeIntro() {
    const useMemory = Boolean(this.refs.welcomeMemoryToggle?.checked);
    this.applyMemoryPreference(useMemory);
    this.store.markExperienceIntroComplete();
    this.introPending = false;
    this.hideIntro();
    this.setEntryControlsDisabled(false);
    if (this.avatarReady) this.showWelcomeAndFocus();
  }

  hideIntro() {
    if (this.refs.welcomeCard) this.refs.welcomeCard.hidden = true;
    this.documentRef.body?.classList.remove('experience-intro-active');
  }

  setEntryControlsDisabled(disabled) {
    [this.refs.promptInput, this.refs.sendBtn].forEach((element) => {
      if (element) element.disabled = Boolean(disabled);
    });
  }

  handleAvatarReady() {
    this.avatarReady = true;
    if (this.developerMode || this.introPending) return;
    this.showWelcomeAndFocus();
  }

  showWelcomeAndFocus() {
    const caption = this.refs.dialogueCaption;
    if (caption && !caption.textContent) {
      caption.textContent = WELCOME_TEXT;
      caption.dataset.state = 'welcome';
      caption.hidden = false;
    }
    this.registry.addTimeout(() => this.refs.promptInput?.focus(), 0);
  }

  togglePrivacy() {
    const opening = Boolean(this.refs.privacyPopover?.hidden);
    if (this.refs.privacyPopover) this.refs.privacyPopover.hidden = !opening;
    this.refs.memoryBtn?.setAttribute('aria-expanded', String(opening));
    if (opening) {
      this.syncMemoryControls(Boolean(this.getConfig()?.useMemory));
      this.registry.addTimeout(() => this.refs.experienceMemoryToggle?.focus(), 0);
    }
  }

  closePrivacy() {
    if (!this.refs.privacyPopover || this.refs.privacyPopover.hidden) return;
    this.refs.privacyPopover.hidden = true;
    this.refs.memoryBtn?.setAttribute('aria-expanded', 'false');
    this.refs.memoryBtn?.focus();
  }

  applyMemoryPreference(useMemory) {
    const current = this.getConfig() || {};
    const next = {
      ...current,
      useMemory,
      options: {
        ...(current.options || {}),
        useMemory
      }
    };
    this.setConfig(next);
    this.store.saveLLMConfig(next);
    if (this.refs.llmMemoryToggle) this.refs.llmMemoryToggle.checked = useMemory;
    this.syncMemoryControls(useMemory);

    const state = this.getState() || {};
    this.patchState?.({
      memory: {
        ...(state.memory || {}),
        enabled: useMemory,
        used: useMemory ? Boolean(state.memory?.used) : false
      }
    }, 'experience:memory-preference');
  }

  syncMemoryControls(useMemory) {
    if (this.refs.welcomeMemoryToggle) this.refs.welcomeMemoryToggle.checked = useMemory;
    if (this.refs.experienceMemoryToggle) this.refs.experienceMemoryToggle.checked = useMemory;
    if (this.refs.memoryBtn) {
      this.refs.memoryBtn.dataset.enabled = String(useMemory);
      this.refs.memoryBtn.title = useMemory ? '记忆已开启' : '记忆与隐私';
      this.refs.memoryBtn.setAttribute('aria-label', this.refs.memoryBtn.title);
    }
  }

  async clearCurrentMemory() {
    const config = this.getConfig() || {};
    const state = this.getState() || {};
    const sessionId = config.sessionId || state.memory?.sessionId || 'default';
    const avatarId = state.currentAvatarId || 'alice';
    const button = this.refs.experienceMemoryClearBtn;
    if (button) button.disabled = true;
    this.showPrivacyStatus('正在清除…');

    try {
      await this.apiClient.json(
        `/api/memory?sessionId=${encodeURIComponent(sessionId)}&avatarId=${encodeURIComponent(avatarId)}&scope=session`,
        { method: 'DELETE', source: 'memory', timeoutMs: 8000 }
      );
      this.patchState?.({
        memory: {
          ...(state.memory || {}),
          turnCount: 0,
          longTermCount: 0,
          context: [],
          longTerm: { used: false, status: 'ready', count: 0, items: [] }
        }
      }, 'experience:memory-clear');
      this.showPrivacyStatus('这次聊天的记忆已经清除。');
    } catch {
      this.showPrivacyStatus('暂时没能清除，请稍后再试。', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  showPrivacyStatus(message, state = 'ready') {
    if (!this.refs.experienceMemoryStatus) return;
    this.refs.experienceMemoryStatus.textContent = message;
    this.refs.experienceMemoryStatus.dataset.state = state;
  }

  renderReadiness() {
    const readiness = this.getDemoReadiness?.() || {};
    let message = '';
    if (!readiness.deepseek) {
      message = '完整对话服务还在准备，当前只能进行离线体验。';
    } else if (!readiness.cosyvoice) {
      message = 'Alice 的声音还在准备，你可以先用文字和她聊。';
    }

    if (this.refs.experienceNotice) {
      this.refs.experienceNotice.textContent = message;
      this.refs.experienceNotice.hidden = !message;
    }
    this.documentRef.body?.classList.toggle('has-experience-notice', Boolean(message));
  }
}
