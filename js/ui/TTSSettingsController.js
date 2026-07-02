import { APP_MODE } from '../config/appConfig.js';

const DISPLAYED_TTS_PROVIDERS = ['mock', 'cosyvoice'];

export class TTSSettingsController {
  constructor({ refs, registry, store, apiClient, ttsService, getConfig, setConfig, speakText, statusView }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.apiClient = apiClient;
    this.ttsService = ttsService;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.speakText = speakText;
    this.statusView = statusView;
    this.providerStatus = new Map();
  }

  init() {
    const config = this.getConfig();
    this.populateProviderOptions();
    this.refs.ttsEngine.value = this.normalizeEngine(config.engine);
    this.refs.speechRate.value = config.rate;
    this.refs.speechPitch.value = config.pitch;
    this.refs.rateVal.textContent = config.rate.toFixed(2);
    this.refs.pitchVal.textContent = config.pitch.toFixed(2);

    this.syncDevelopmentMode();
    this.bindEvents();
    this.showProviderStatus(this.refs.ttsEngine.value);
    void this.loadProviderStatus();
  }

  bindEvents() {
    this.registry.addEventListener(this.refs.ttsEngine, 'change', (event) => {
      const engine = this.normalizeEngine(event.target.value);
      this.updateConfig({ engine });
      this.refs.ttsEngine.value = engine;
      this.showProviderStatus(engine);
      void this.loadProviderStatus();
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

    this.registry.addEventListener(this.refs.testVoiceBtn, 'click', async () => {
      await this.loadProviderStatus();
      this.speakText('你好！我是 Alice，正在测试当前语音 Provider。');
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

  populateProviderOptions() {
    this.refs.ttsEngine.innerHTML = '';
    [
      { id: 'mock', label: 'Mock（本地演示）' },
      { id: 'cosyvoice', label: 'CosyVoice2（本地服务）' }
    ].forEach((provider) => {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.label;
      this.refs.ttsEngine.appendChild(option);
    });
  }

  syncDevelopmentMode() {
    const isDevelopment = APP_MODE === 'development';
    this.refs.ttsEngine.disabled = !isDevelopment;
    if (!isDevelopment) {
      this.statusView.showTTS('loading', '生产环境不允许在前端切换 TTS Provider。');
    }
  }

  async loadProviderStatus() {
    if (!this.apiClient) return;
    try {
      const status = await this.apiClient.json('/api/providers', {
        source: 'providers',
        timeoutMs: 6000
      });
      this.providerStatus = new Map((status?.tts || [])
        .filter((item) => DISPLAYED_TTS_PROVIDERS.includes(item.provider))
        .map((item) => [item.provider, item]));
      this.showProviderStatus(this.refs.ttsEngine.value);
    } catch (error) {
      this.statusView.showTTS('error', `TTS 状态读取失败：${error.message.slice(0, 80)}`);
      this.renderStatusSummary(null, '状态读取失败');
    }
  }

  showProviderStatus(provider) {
    const normalized = this.normalizeEngine(provider);
    const status = this.providerStatus.get(normalized);
    this.renderStatusSummary(status, this.formatReason(status, normalized));

    if (normalized === 'mock') {
      this.statusView.showTTS('success', '当前使用 Mock，本地演示无需外部语音服务。');
      return;
    }

    if (!status) {
      this.statusView.showTTS('loading', '正在读取 CosyVoice2 状态。');
      return;
    }

    if (status.available) {
      this.statusView.showTTS('success', `CosyVoice2 可用，当前 voiceId：${status.defaultVoice || '默认'}`);
      return;
    }

    this.statusView.showTTS('error', '本地语音服务未启动，文字对话仍可用。');
  }

  renderStatusSummary(status, reason = '') {
    if (!this.refs.ttsProviderStatusSummary) return;
    const provider = status?.provider || this.normalizeEngine(this.refs.ttsEngine.value);
    const label = status?.label || (provider === 'cosyvoice' ? 'CosyVoice2' : 'Mock');
    const availableText = status
      ? (status.available ? '可用' : '不可用')
      : '读取中';
    const voice = status?.defaultVoice || (provider === 'mock' ? 'mock-silence' : '-');
    const capabilities = this.formatCapabilities(status?.capabilities);

    this.refs.ttsCurrentProvider.textContent = label;
    this.refs.ttsProviderAvailability.textContent = availableText;
    this.refs.ttsProviderVoice.textContent = voice;
    this.refs.ttsProviderCapabilities.textContent = capabilities;
    this.refs.ttsProviderReason.textContent = reason || '-';
  }

  formatCapabilities(capabilities = {}) {
    if (!capabilities || typeof capabilities !== 'object') return '-';
    const items = [];
    if (capabilities.supportsEmotion) items.push('emotion');
    if (capabilities.supportsVoiceClone) items.push('voice-clone');
    if (capabilities.supportsStreaming) items.push('upstream-streaming');
    return items.length ? items.join(' / ') : 'basic';
  }

  formatReason(status, provider) {
    if (!status) return provider === 'cosyvoice' ? '等待后端 readiness' : '本地 mock 可直接使用';
    if (status.provider === 'mock') return '本地演示 provider';
    if (status.available) return '服务已连接';
    if (status.status === 'local_service_not_running') return '本地语音服务未启动';
    if (status.status === 'missing_base_url') return '后端未配置 COSYVOICE_BASE_URL';
    return status.health?.reason || status.status || '不可用';
  }

  normalizeEngine(engine) {
    return DISPLAYED_TTS_PROVIDERS.includes(engine) ? engine : 'mock';
  }
}
