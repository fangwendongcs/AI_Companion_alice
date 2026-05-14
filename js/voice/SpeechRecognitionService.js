export class SpeechRecognitionService {
  constructor({ lang = 'zh-CN' } = {}) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.recognition = this.supported ? new Recognition() : null;
    this.isRecording = false;
    this.boundButton = null;
    this.boundClickHandler = null;

    if (this.recognition) {
      this.recognition.lang = lang;
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
    }
  }

  bind(button, { onResult, onError }) {
    if (!button) return;
    if (!this.supported) {
      button.title = '当前浏览器不支持语音识别';
      button.style.opacity = '0.3';
      return;
    }

    this.recognition.onresult = (event) => {
      onResult?.(event.results[0][0].transcript);
    };
    this.recognition.onend = () => {
      this.isRecording = false;
      button.classList.remove('recording');
    };
    this.recognition.onerror = (event) => {
      this.isRecording = false;
      button.classList.remove('recording');
      onError?.(event);
    };

    this.boundButton = button;
    this.boundClickHandler = () => {
      if (this.isRecording) {
        this.recognition.stop();
      } else {
        this.recognition.start();
        this.isRecording = true;
        button.classList.add('recording');
      }
    };
    button.addEventListener('click', this.boundClickHandler);
  }

  destroy() {
    if (this.boundButton && this.boundClickHandler) {
      this.boundButton.removeEventListener('click', this.boundClickHandler);
    }
    try {
      this.recognition?.stop?.();
    } catch {
      // Web Speech throws if stop() is called while not recording.
    }
    this.boundButton = null;
    this.boundClickHandler = null;
    this.isRecording = false;
  }
}
