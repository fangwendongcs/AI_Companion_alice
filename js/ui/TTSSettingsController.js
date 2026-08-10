import { APP_MODE } from '../config/appConfig.js';

const TTS_PROVIDER_OPTIONS = [
  { id: 'mock', label: 'Mock（本地演示）' },
  { id: 'cosyvoice', label: 'CosyVoice2（本地服务）' },
  { id: 'qwen3_tts', label: 'Qwen3-TTS（DashScope）' },
  { id: 'fish_audio', label: 'Fish Audio（远程 API）' }
];
const DISPLAYED_TTS_PROVIDERS = TTS_PROVIDER_OPTIONS.map((item) => item.id);
const REMOTE_TTS_PROVIDERS = new Set(['qwen3_tts', 'fish_audio']);

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
    TTS_PROVIDER_OPTIONS.forEach((provider) => {
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
      const providers = (status?.tts || [])
        .filter((item) => DISPLAYED_TTS_PROVIDERS.includes(item.provider));
      this.providerStatus = new Map(providers.map((item) => [item.provider, item]));
      let activeProvider = this.refs.ttsEngine.value;
      const currentConfig = this.getConfig();
      const canAdoptLiveDefault = activeProvider === currentConfig?.engine;
      const adoptedConfig = canAdoptLiveDefault
        ? this.store.adoptReadyTTSDefault(currentConfig, providers)
        : null;
      if (adoptedConfig) {
        this.setConfig(adoptedConfig);
        this.refs.ttsEngine.value = adoptedConfig.engine;
        activeProvider = adoptedConfig.engine;
      }
      this.showProviderStatus(activeProvider);
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

    const label = this.getProviderLabel(normalized);
    if (!status) {
      this.statusView.showTTS('loading', `正在读取 ${label} 状态。`);
      return;
    }

    if (REMOTE_TTS_PROVIDERS.has(normalized) && status.configured && status.health?.live !== true) {
      this.statusView.showTTS('loading', `${label} 后端配置完整、尚未实测；点击测试语音发起真实调用。`);
      return;
    }

    if (status.available) {
      this.statusView.showTTS('success', `${label} 可用，当前 voiceId：${status.defaultVoice || '默认'}`);
      return;
    }

    const message = REMOTE_TTS_PROVIDERS.has(normalized)
      ? '远程语音配置不完整，文字对话仍可用。'
      : '本地语音服务未启动，文字对话仍可用。';
    this.statusView.showTTS('error', message);
  }

  renderStatusSummary(status, reason = '') {
    if (!this.refs.ttsProviderStatusSummary) return;
    const provider = status?.provider || this.normalizeEngine(this.refs.ttsEngine.value);
    const label = status?.label || this.getProviderLabel(provider);
    const availableText = status
      ? (REMOTE_TTS_PROVIDERS.has(provider) && status.configured && status.health?.live !== true
        ? '已配置（未实测）'
        : (status.available ? '可用' : '不可用'))
      : '读取中';
    const voice = status?.defaultVoice || (provider === 'mock' ? 'mock-silence' : '-');
    const model = status?.defaultModel || status?.metadata?.model || (provider === 'mock' ? 'mock' : '-');
    const capabilities = this.formatCapabilities(status?.capabilities);

    this.refs.ttsCurrentProvider.textContent = label;
    this.refs.ttsProviderAvailability.textContent = availableText;
    this.refs.ttsProviderVoice.textContent = voice;
    if (this.refs.ttsProviderModel) this.refs.ttsProviderModel.textContent = model;
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
    if (!status) {
      if (provider === 'cosyvoice') return '等待本地服务 readiness';
      if (REMOTE_TTS_PROVIDERS.has(provider)) return '等待远程 provider readiness';
      return '本地 mock 可直接使用';
    }
    if (status.provider === 'mock') return '本地演示 provider';
    if (REMOTE_TTS_PROVIDERS.has(status.provider)) {
      if (status.available) return '后端配置完整；未主动调用计费接口探活';
      return status.health?.reason || status.status || '远程配置不完整';
    }
    if (status.available) return '服务已连接';
    if (status.status === 'local_service_not_running') return '本地语音服务未启动';
    if (status.status === 'missing_base_url') return '后端未配置 COSYVOICE_BASE_URL';
    return status.health?.reason || status.status || '不可用';
  }

  normalizeEngine(engine) {
    return DISPLAYED_TTS_PROVIDERS.includes(engine) ? engine : 'mock';
  }

  getProviderLabel(provider) {
    return TTS_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label
      ?.replace(/（.*）$/, '') || 'TTS Provider';
  }
}
