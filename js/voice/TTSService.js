export class TTSService {
  constructor(endpoint = '/api/tts') {
    this.endpoint = endpoint;
    this.currentAudio = null;
    this.backendEngines = new Set(['openai', 'minimax']);
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

  async speak(text, config, { muted = false, onStart, onEnd, onError, onFallback } = {}) {
    if (muted) return;
    this.stop();
    onStart?.();
    const isBackendEngine = this.backendEngines.has(config.engine);

    try {
      if (isBackendEngine) {
        await this.speakWithBackend(text, config);
        onEnd?.();
        return;
      }

      await this.speakWithBrowser(text, config);
      onEnd?.();
    } catch (error) {
      console.error('[TTS] 语音合成失败:', error);
      if (isBackendEngine) {
        onFallback?.(error);
        await this.speakWithBrowser(text, config);
        onEnd?.();
        return;
      }
      onError?.(error);
    }
  }

  async speakWithBackend(text, config) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.createBackendPayload(text, config))
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

  createBackendPayload(text, config) {
    if (config.engine === 'minimax') {
      const customVoice = (config.customVoiceId || '').trim();
      const selectedVoice = config.minimaxVoice === 'custom'
        ? customVoice || 'Chinese (Mandarin)_Crisp_Girl'
        : config.minimaxVoice;

      return {
        text,
        provider: 'minimax',
        voice: selectedVoice,
        model: config.minimaxModel,
        speed: config.rate,
        pitch: config.pitch
      };
    }

    return {
      text,
      provider: 'openai',
      voice: config.openaiVoice,
      model: config.openaiModel,
      speed: config.rate,
      instructions: config.openaiInstructions
    };
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
          '婷婷',
          'Tingting',
          'Google 普通话（中国大陆）',
          '美嘉',
          'Meijia',
          '善怡',
          'Sinji',
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
