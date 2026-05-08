export class TTSService {
  constructor(endpoint = '/api/tts') {
    this.endpoint = endpoint;
    this.currentAudio = null;
  }

  getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  stop() {
    window.speechSynthesis?.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  async speak(text, config, { muted = false, onStart, onEnd } = {}) {
    if (muted) return;
    this.stop();
    onStart?.();

    if (config.engine === 'openai') {
      try {
        await this.speakWithBackend(text, config);
        onEnd?.();
        return;
      } catch (error) {
        console.error('[TTS] 后端 TTS 失败，降级到浏览器 TTS:', error);
      }
    }

    await this.speakWithBrowser(text, config);
    onEnd?.();
  }

  async speakWithBackend(text, config) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        provider: 'openai',
        voice: config.openaiVoice,
        speed: config.rate
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TTS HTTP ${response.status}: ${body}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    await new Promise((resolve, reject) => {
      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });

    URL.revokeObjectURL(url);
    this.currentAudio = null;
  }

  speakWithBrowser(text, config) {
    if (!('speechSynthesis' in window)) return Promise.resolve();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.onend = resolve;
      utterance.onerror = resolve;

      const selectAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const savedVoiceName = config.browserVoice;
        const preferred = [
          'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
          'Microsoft XiaoXiao',
          'Xiaoxiao',
          'Google 普通话（中国大陆）',
          'zh-CN'
        ];

        if (savedVoiceName && savedVoiceName !== 'auto') {
          utterance.voice = voices.find((voice) => voice.name === savedVoiceName) || null;
        } else {
          for (const name of preferred) {
            const found = voices.find((voice) => voice.name.includes(name) || voice.lang === name);
            if (found) {
              utterance.voice = found;
              break;
            }
          }
        }

        window.speechSynthesis.speak(utterance);
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        selectAndSpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = selectAndSpeak;
      }
    });
  }
}
