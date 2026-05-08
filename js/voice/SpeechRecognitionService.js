export class SpeechRecognitionService {
  constructor({ lang = 'zh-CN' } = {}) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(Recognition);
    this.recognition = this.supported ? new Recognition() : null;
    this.isRecording = false;

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

    button.addEventListener('click', () => {
      if (this.isRecording) {
        this.recognition.stop();
      } else {
        this.recognition.start();
        this.isRecording = true;
        button.classList.add('recording');
      }
    });
  }
}
