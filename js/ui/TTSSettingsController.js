import { MINIMAX_VOICE_PRESETS, OPENAI_TTS_VOICES } from '../config/voicePresets.js';

export class TTSSettingsController {
  constructor({ refs, registry, store, ttsService, getConfig, setConfig, speakText, statusView }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.ttsService = ttsService;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.speakText = speakText;
    this.statusView = statusView;
  }

  init() {
    this.populateOpenAIVoices();
    this.populateMinimaxVoices();
    const config = this.getConfig();

    this.refs.ttsEngine.value = config.engine;
    this.refs.speechRate.value = config.rate;
    this.refs.speechPitch.value = config.pitch;
    this.setSelectValue(this.refs.openaiVoiceSelect, config.openaiVoice);
    this.setSelectValue(this.refs.minimaxVoiceSelect, config.minimaxVoice);
    this.setSelectValue(this.refs.minimaxModelSelect, config.minimaxModel);
    config.openaiVoice = this.refs.openaiVoiceSelect.value;
    config.minimaxVoice = this.refs.minimaxVoiceSelect.value;
    config.minimaxModel = this.refs.minimaxModelSelect.value;
    this.refs.openaiTTSInstructionsInput.value = config.openaiInstructions || '';
    this.refs.customVoiceIdInput.value = config.customVoiceId || '';
    this.refs.rateVal.textContent = config.rate.toFixed(2);
    this.refs.pitchVal.textContent = config.pitch.toFixed(2);

    this.syncEngineUI();
    this.populateVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => this.populateVoices();
      this.registry.add(() => {
        if (window.speechSynthesis?.onvoiceschanged) window.speechSynthesis.onvoiceschanged = null;
      });
    }

    this.bindEvents();
    this.showEngineHint();
  }

  bindEvents() {
    this.registry.addEventListener(this.refs.ttsEngine, 'change', (event) => {
      this.updateConfig({ engine: event.target.value });
      this.syncEngineUI();
      this.showEngineHint();
    });

    this.registry.addEventListener(this.refs.voiceSelect, 'change', (event) => {
      this.updateConfig({ browserVoice: event.target.value });
    });

    this.registry.addEventListener(this.refs.speechRate, 'input', (event) => {
      const rate = parseFloat(event.target.value);
      this.refs.rateVal.textContent = rate.toFixed(2);
      this.updateConfig({ rate });
    });

    this.registry.addEventListener(this.refs.speechPitch, 'input', (event) => {
      const pitch = parseFloat(event.target.value);
      this.refs.pitchVal.textContent = pitch.toFixed(2);
      this.updateConfig({ pitch });
    });

    this.registry.addEventListener(this.refs.openaiVoiceSelect, 'change', (event) => {
      this.updateConfig({ openaiVoice: event.target.value });
    });

    this.registry.addEventListener(this.refs.openaiTTSInstructionsInput, 'input', (event) => {
      this.updateConfig({ openaiInstructions: event.target.value });
    });

    this.registry.addEventListener(this.refs.minimaxVoiceSelect, 'change', (event) => {
      this.updateConfig({ minimaxVoice: event.target.value });
      this.syncEngineUI();
    });

    this.registry.addEventListener(this.refs.minimaxModelSelect, 'change', (event) => {
      this.updateConfig({ minimaxModel: event.target.value });
    });

    this.registry.addEventListener(this.refs.customVoiceIdInput, 'input', (event) => {
      this.updateConfig({ customVoiceId: event.target.value.trim() });
    });

    this.registry.addEventListener(this.refs.testVoiceBtn, 'click', () => {
      this.speakText('你好！我是 Alice，很高兴认识你！');
    });
  }

  updateConfig(patch) {
    const next = {
      ...this.getConfig(),
      ...patch
    };
    this.setConfig(next);
    this.store.saveTTSConfig(next);
  }

  populateVoices() {
    const config = this.getConfig();
    const voices = this.ttsService.getVoices();
    const sorted = [...voices].sort((a, b) => {
      const azh = a.lang?.startsWith('zh') ? 1 : 0;
      const bzh = b.lang?.startsWith('zh') ? 1 : 0;
      if (azh !== bzh) return bzh - azh;
      return (a.name || '').localeCompare(b.name || '');
    });

    this.refs.voiceSelect.innerHTML = '<option value="auto">自动（优先晓晓 Neural）</option>';
    sorted.forEach((voice) => {
      const opt = document.createElement('option');
      opt.value = voice.name;
      opt.textContent = `${voice.name} (${voice.lang || 'unknown'})`;
      this.refs.voiceSelect.appendChild(opt);
    });

    const hasSaved = [...this.refs.voiceSelect.options].some((option) => option.value === config.browserVoice);
    this.refs.voiceSelect.value = hasSaved ? config.browserVoice : 'auto';
  }

  populateOpenAIVoices() {
    this.refs.openaiVoiceSelect.innerHTML = '';
    OPENAI_TTS_VOICES.forEach((voice) => {
      const opt = document.createElement('option');
      opt.value = voice.id;
      opt.textContent = voice.label;
      this.refs.openaiVoiceSelect.appendChild(opt);
    });
  }

  populateMinimaxVoices() {
    this.refs.minimaxVoiceSelect.innerHTML = '';
    MINIMAX_VOICE_PRESETS.forEach((voice) => {
      const opt = document.createElement('option');
      opt.value = voice.id;
      opt.textContent = `${voice.label} / ${voice.id}`;
      opt.title = voice.description;
      this.refs.minimaxVoiceSelect.appendChild(opt);
    });
  }

  setSelectValue(select, value) {
    const hasValue = [...select.options].some((option) => option.value === value);
    select.value = hasValue ? value : select.options[0]?.value || '';
  }

  syncEngineUI() {
    const config = this.getConfig();
    this.refs.browserVoiceGroup.style.display = config.engine === 'browser' ? '' : 'none';
    this.refs.openaiVoiceGroup.style.display = config.engine === 'openai' ? '' : 'none';
    this.refs.minimaxVoiceGroup.style.display = config.engine === 'minimax' ? '' : 'none';
    this.refs.customVoiceIdInput.disabled = config.minimaxVoice !== 'custom';
  }

  showEngineHint() {
    const config = this.getConfig();
    if (config.engine === 'minimax') {
      this.statusView.showTTS('loading', '已选择 MiniMax。必须用 npm run dev 启动后端，并配置 MINIMAX_API_KEY；Python 静态服务不会生效。');
      return;
    }
    if (config.engine === 'openai') {
      this.statusView.showTTS('loading', '已选择 OpenAI TTS。必须用 npm run dev 启动后端，并配置 OPENAI_API_KEY。');
      return;
    }
    this.statusView.showTTS('success', '当前使用浏览器原生语音，声音质量取决于系统/浏览器内置声线。');
  }
}
