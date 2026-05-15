import { UI_TIMING } from '../config/appConfig.js';

export class StatusView {
  constructor(refs, registry) {
    this.refs = refs;
    this.registry = registry;
  }

  showAvatarUpload(type, message) {
    this.show(this.refs.avatarUploadStatus, type, message, {
      resetOnSuccess: true,
      resetMs: UI_TIMING.successStatusMs
    });
  }

  showTTS(type, message) {
    this.show(this.refs.ttsStatus, type, message, {
      resetOnSuccess: true,
      resetMs: UI_TIMING.statusResetMs
    });
  }

  showLLM(type, message) {
    this.show(this.refs.llmStatus, type, message, {
      resetWhen: type !== 'loading',
      resetMs: UI_TIMING.statusResetMs
    });
  }

  show(element, type, message, { resetOnSuccess = false, resetWhen = false, resetMs = UI_TIMING.statusResetMs } = {}) {
    if (!element) return;
    element.className = `llm-status ${type}`;
    element.textContent = message;
    if ((resetOnSuccess && type === 'success') || resetWhen) {
      this.registry.addTimeout(() => {
        element.className = 'llm-status';
      }, resetMs);
    }
  }
}
