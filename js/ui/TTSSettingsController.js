const TYPE_LABELS = {
  local: '默认语音',
  remote: '云端语音',
  selfHosted: '自建语音服务'
};

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
    this.providerDescriptors = new Map();
    this.pendingProviderId = 'cosyvoice';
    this.testedProviderId = null;
    this.testedConfigFingerprint = null;
    this.configLoadEpoch = 0;
  }

  init() {
    const config = this.getConfig();
    this.pendingProviderId = this.normalizeEngine(config.engine);
    this.populateProviderOptions([]);
    this.refs.speechRate.value = config.rate;
    this.refs.speechPitch.value = config.pitch;
    this.refs.rateVal.textContent = config.rate.toFixed(2);
    this.refs.pitchVal.textContent = config.pitch.toFixed(2);
    this.bindEvents();
    this.showProviderStatus(this.pendingProviderId);
    void this.loadProviderStatus();
  }

  bindEvents() {
    this.registry.addEventListener(this.refs.ttsEngine, 'change', (event) => {
      const providerId = this.normalizeEngine(event.target.value);
      this.pendingProviderId = providerId;
      this.clearTestedConfig();
      const descriptor = this.providerDescriptors.get(providerId);
      if (descriptor?.type === 'local') {
        this.updateConfig({ engine: providerId });
        this.hideProviderConfig();
        this.statusView.showTTS('success', '已切换到默认语音；不需要 API Key。');
      } else {
        this.showProviderConfig();
        void this.loadEditableConfig(providerId);
        this.statusView.showTTS('loading', '请先测试声音，成功后再保存并切换。');
      }
      this.showProviderStatus(providerId);
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

    this.registry.addEventListener(this.refs.ttsProviderConfigFields, 'input', () => {
      this.clearTestedConfig();
      this.refs.saveTTSProviderBtn.disabled = true;
    });

    this.registry.addEventListener(this.refs.testVoiceBtn, 'click', async () => {
      await this.testSelectedProvider();
    });

    this.registry.addEventListener(this.refs.saveTTSProviderBtn, 'click', async () => {
      await this.saveAndSwitchProvider();
    });
  }

  updateConfig(patch) {
    const next = { ...this.getConfig(), ...patch };
    this.setConfig(next);
    this.store.saveTTSConfig(next);
  }

  populateProviderOptions(providers) {
    const hasAuthoritativeDescriptors = providers.length > 0;
    const descriptors = providers.length
      ? providers.map((item) => item.descriptor).filter((item) => item?.selectable !== false)
      : [{ id: 'cosyvoice', displayName: '默认语音', type: 'local', selectable: true }];
    const selected = this.pendingProviderId || this.getConfig()?.engine || 'cosyvoice';
    this.providerDescriptors.clear();
    this.refs.ttsEngine.innerHTML = '';
    ['local', 'remote', 'selfHosted'].forEach((type) => {
      const items = descriptors.filter((descriptor) => descriptor.type === type);
      if (!items.length) return;
      const group = document.createElement('optgroup');
      group.label = TYPE_LABELS[type];
      items.forEach((descriptor) => {
        this.providerDescriptors.set(descriptor.id, descriptor);
        const option = document.createElement('option');
        option.value = descriptor.id;
        option.textContent = descriptor.displayName;
        group.appendChild(option);
      });
      this.refs.ttsEngine.appendChild(group);
    });
    const resolvedSelection = this.providerDescriptors.has(selected) ? selected : 'cosyvoice';
    this.refs.ttsEngine.value = resolvedSelection;
    if (hasAuthoritativeDescriptors || !this.pendingProviderId) {
      this.pendingProviderId = resolvedSelection;
    }
  }

  async loadProviderStatus() {
    if (!this.apiClient) return;
    try {
      const status = await this.apiClient.json('/api/providers', {
        source: 'providers',
        timeoutMs: 6000
      });
      const providers = (status?.tts || []).filter((item) => item?.descriptor);
      this.providerStatus = new Map(providers.map((item) => [item.provider, item]));
      this.populateProviderOptions(providers);
      const descriptor = this.providerDescriptors.get(this.pendingProviderId);
      if (descriptor?.type === 'local') this.hideProviderConfig();
      else {
        this.showProviderConfig();
        await this.loadEditableConfig(this.pendingProviderId);
      }
      this.showProviderStatus(this.pendingProviderId);
    } catch (error) {
      this.statusView.showTTS('error', `语音服务状态读取失败：${shortMessage(error)}`);
      this.renderStatusSummary(null, '状态读取失败');
    }
  }

  async loadEditableConfig(providerId) {
    const descriptor = this.providerDescriptors.get(providerId);
    if (!descriptor || descriptor.type === 'local') return;
    const epoch = ++this.configLoadEpoch;
    this.renderConfigFields(descriptor, {});
    try {
      const config = await this.apiClient.json(`/api/tts/providers/${providerId}/config`, {
        source: 'tts:provider-config',
        timeoutMs: 6000
      });
      if (epoch !== this.configLoadEpoch || providerId !== this.pendingProviderId) return;
      this.renderConfigFields(descriptor, config);
    } catch (error) {
      if (epoch !== this.configLoadEpoch) return;
      this.statusView.showTTS('error', `配置读取失败：${shortMessage(error)}`);
    }
  }

  renderConfigFields(descriptor, config = {}) {
    const fields = [...(descriptor.requiredFields || []), ...(descriptor.optionalFields || [])];
    this.refs.ttsProviderConfigFields.innerHTML = '';
    fields.forEach((field) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'tts-provider-config-field';
      const label = document.createElement('label');
      label.textContent = field.label;
      const input = document.createElement('input');
      input.className = 'custom-input';
      input.type = field.type || 'text';
      input.dataset.ttsField = field.id;
      const isSecret = field.type === 'password';
      input.autocomplete = isSecret ? 'new-password' : 'off';
      const secretConfigured = config.secretFields?.[field.id]?.configured === true;
      input.placeholder = secretConfigured
        ? '已由后端安全保存；留空继续使用'
        : (field.placeholder || '');
      if (!isSecret) {
        input.value = config.values?.[field.id] ?? field.defaultValue ?? '';
      }
      wrapper.append(label, input);
      this.refs.ttsProviderConfigFields.appendChild(wrapper);
    });
    this.clearTestedConfig();
    this.refs.saveTTSProviderBtn.disabled = true;
  }

  collectConfigFields() {
    const config = {};
    this.refs.ttsProviderConfigFields
      .querySelectorAll('[data-tts-field]')
      .forEach((input) => {
        config[input.dataset.ttsField] = input.type === 'number'
          ? (input.value ? Number(input.value) : '')
          : input.value.trim();
      });
    return config;
  }

  async testSelectedProvider() {
    const providerId = this.pendingProviderId;
    const descriptor = this.providerDescriptors.get(providerId);
    if (!descriptor || descriptor.type === 'local') {
      this.speakText('你好，我是 Alice。当前使用默认本地语音。');
      return;
    }

    this.refs.testVoiceBtn.disabled = true;
    this.refs.saveTTSProviderBtn.disabled = true;
    this.statusView.showTTS('loading', '正在安全测试语音服务…');
    const testedConfig = this.collectConfigFields();
    const testedFingerprint = configFingerprint(testedConfig);
    try {
      const result = await this.apiClient.json(`/api/tts/providers/${providerId}/test`, {
        method: 'POST',
        body: { config: testedConfig },
        source: 'tts:provider-test',
        timeoutMs: 90000
      });
      if (result?.tts_status !== 'ok') {
        const error = new Error(result?.error?.message || '语音服务测试失败。');
        error.code = result?.error?.code;
        throw error;
      }
      await this.ttsService.playTestResult(result);
      if (providerId !== this.pendingProviderId || testedFingerprint !== configFingerprint(this.collectConfigFields())) {
        this.clearTestedConfig();
        this.statusView.showTTS('loading', '配置已变化，请重新测试后再保存。');
        return;
      }
      this.testedProviderId = providerId;
      this.testedConfigFingerprint = testedFingerprint;
      this.refs.saveTTSProviderBtn.disabled = false;
      this.statusView.showTTS('success', '测试成功。现在可以保存并切换。');
    } catch (error) {
      this.clearTestedConfig();
      this.statusView.showTTS('error', `测试失败：${shortMessage(error)}`);
    } finally {
      this.refs.testVoiceBtn.disabled = false;
    }
  }

  async saveAndSwitchProvider() {
    const providerId = this.pendingProviderId;
    const config = this.collectConfigFields();
    if (this.testedProviderId !== providerId || this.testedConfigFingerprint !== configFingerprint(config)) {
      this.statusView.showTTS('error', '配置已变化，请重新测试后再保存。');
      return;
    }
    this.refs.saveTTSProviderBtn.disabled = true;
    this.statusView.showTTS('loading', '正在由 Alice 后端加密保存配置…');
    try {
      await this.apiClient.json(`/api/tts/providers/${providerId}/config`, {
        method: 'PUT',
        body: { config },
        source: 'tts:provider-save',
        timeoutMs: 10000
      });
      this.updateConfig({ engine: providerId });
      this.clearTestedConfig();
      await this.loadProviderStatus();
      this.statusView.showTTS('success', '已安全保存并切换语音服务。');
    } catch (error) {
      this.refs.saveTTSProviderBtn.disabled = false;
      this.statusView.showTTS('error', `保存失败：${shortMessage(error)}`);
    }
  }

  showProviderStatus(providerId) {
    const status = this.providerStatus.get(providerId);
    this.renderStatusSummary(status, this.formatReason(status, providerId));
    if (!status) return;
    if (status.type === 'local') {
      const message = status.available
        ? '默认语音已就绪，不需要 API Key。'
        : '默认语音 runtime 未就绪；仍会使用本机系统语音安全兜底。';
      this.statusView.showTTS(status.available ? 'success' : 'loading', message);
    }
  }

  renderStatusSummary(status, reason = '') {
    if (!this.refs.ttsProviderStatusSummary) return;
    const providerId = status?.provider || this.pendingProviderId;
    const descriptor = status?.descriptor || this.providerDescriptors.get(providerId);
    const active = this.getConfig()?.engine === providerId;
    const readiness = status
      ? (status.available
        ? '可用'
        : (status.type === 'local' ? '系统语音兜底' : (status.configured ? '已配置' : '待配置')))
      : '读取中';
    this.refs.ttsCurrentProvider.textContent = `${descriptor?.displayName || '语音服务'}${active ? '（使用中）' : ''}`;
    this.refs.ttsProviderAvailability.textContent = readiness;
    this.refs.ttsProviderVoice.textContent = status?.defaultVoice || '-';
    if (this.refs.ttsProviderModel) this.refs.ttsProviderModel.textContent = status?.defaultModel || '-';
    this.refs.ttsProviderCapabilities.textContent = this.formatCapabilities(status?.capabilities || descriptor?.capabilities);
    this.refs.ttsProviderReason.textContent = reason || '-';
  }

  formatCapabilities(capabilities = {}) {
    const items = [];
    if (capabilities?.supportsEmotion) items.push('情绪');
    if (capabilities?.supportsVoiceClone) items.push('克隆声线');
    if (capabilities?.supportsStreaming) items.push('支持流式上游');
    return items.length ? items.join(' / ') : '基础语音';
  }

  formatReason(status, providerId) {
    if (!status) return '等待服务状态';
    if (status.type === 'local') {
      return status.available ? '本地服务已连接' : '本地服务未启动；系统语音仍可兜底';
    }
    if (status.configured) return '后端已有配置；请用测试声音确认真实可调用性';
    if (status.type === 'selfHosted') return '填写自己的 Server URL、Model 和 Voice';
    return '填写服务商配置；API Key 从对应云平台获取';
  }

  showProviderConfig() {
    this.refs.ttsProviderConfigActions.hidden = false;
  }

  hideProviderConfig() {
    this.configLoadEpoch += 1;
    this.refs.ttsProviderConfigActions.hidden = true;
    this.refs.ttsProviderConfigFields.innerHTML = '';
    this.refs.saveTTSProviderBtn.disabled = true;
  }

  clearTestedConfig() {
    this.testedProviderId = null;
    this.testedConfigFingerprint = null;
  }

  normalizeEngine(engine) {
    const normalized = String(engine || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : 'cosyvoice';
  }
}

function shortMessage(error) {
  return String(error?.message || '未知错误').replace(/HTTP \d+:\s*/i, '').slice(0, 160);
}

function configFingerprint(config = {}) {
  return JSON.stringify(config);
}
