export class LLMSettingsController {
  constructor({ refs, registry, store, apiClient, llmClient, getConfig, setConfig, readFormConfig, patchState, statusView }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.apiClient = apiClient;
    this.llmClient = llmClient;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.readFormConfig = readFormConfig;
    this.patchState = patchState;
    this.statusView = statusView;
    this.providerStatus = new Map();
  }

  init() {
    const config = this.getConfig();
    this.refs.llmProvider.value = config.provider;
    this.refs.baseUrlInput.value = '';
    this.refs.llmModel.value = config.model;
    if (this.refs.llmMemoryToggle) this.refs.llmMemoryToggle.checked = Boolean(config.useMemory);
    this.updateMemorySessionLabel(config.sessionId);
    this.refs.systemPromptInput.value = config.systemPrompt;
    this.patchMemoryState(config);
    this.applyProviderHint(config.provider);
    this.prepareKeyUI();
    this.showProviderStatus(config.provider);
    void this.loadProviderStatus(config.provider);

    this.registry.addEventListener(this.refs.llmProvider, 'change', (event) => {
      this.applyProviderHint(event.target.value);
      this.showProviderStatus(event.target.value);
    });

    this.registry.addEventListener(this.refs.saveLLMConfigBtn, 'click', () => {
      const next = this.readFormConfig();
      this.setConfig(next);
      this.store.saveLLMConfig(next);
      this.updateMemorySessionLabel(next.sessionId);
      this.patchMemoryState(next);
      this.statusView.showLLM('success', this.formatSaveMessage(next));
    });

    if (this.refs.llmMemoryToggle) {
      this.registry.addEventListener(this.refs.llmMemoryToggle, 'change', () => {
        const next = this.readFormConfig();
        this.setConfig(next);
        this.store.saveLLMConfig(next);
        this.updateMemorySessionLabel(next.sessionId);
        this.patchMemoryState(next);
        this.statusView.showLLM('success', next.useMemory
          ? '短期记忆已开启，仅保存在后端当前进程中。'
          : '短期记忆已关闭。');
      });
    }

    this.registry.addEventListener(this.refs.testLLMBtn, 'click', async () => {
      this.statusView.showLLM('loading', '正在通过后端测试连接...');
      try {
        const reply = await this.llmClient.test(this.readFormConfig());
        this.statusView.showLLM('success', `连接成功：${reply.slice(0, 40)}`);
      } catch (error) {
        this.statusView.showLLM('error', `连接失败：${error.message.slice(0, 120)}`);
      }
    });
  }

  prepareKeyUI() {
    if (!this.refs.apiKeyInput) return;
    this.refs.apiKeyInput.value = '';
    this.refs.apiKeyInput.disabled = true;
    this.refs.apiKeyInput.placeholder = '已迁移到后端环境变量，例如 OPENAI_API_KEY';
    this.refs.apiKeyToggle.disabled = true;
    this.refs.apiKeyToggle.style.opacity = '0.35';
  }

  applyProviderHint(provider) {
    if (provider === 'stub') {
      this.refs.baseUrlInput.placeholder = '本地演示模式，无需配置 Base URL 或 API Key';
      this.refs.llmModel.value = 'stub';
      return;
    }
    this.refs.baseUrlInput.placeholder = provider === 'custom'
      ? '请在后端配置 CUSTOM_BASE_URL'
      : '请在后端配置对应 provider 的 *_BASE_URL';
  }

  async loadProviderStatus(provider) {
    if (!this.apiClient) return;
    try {
      const status = await this.apiClient.json('/api/providers', {
        source: 'providers',
        timeoutMs: 6000
      });
      this.providerStatus = new Map((status?.llm || []).map((item) => [item.provider, item]));
      this.showProviderStatus(provider || this.refs.llmProvider.value);
    } catch (error) {
      this.statusView.showLLM('error', `Provider 状态读取失败：${error.message.slice(0, 80)}`);
    }
  }

  showProviderStatus(provider) {
    const status = this.providerStatus.get(provider);
    if (provider === 'stub') {
      this.statusView.showLLM('success', '本地演示模式，无需 API Key。');
      return;
    }
    if (!status) {
      this.statusView.showLLM('loading', '真实 provider 需要在后端环境变量中配置 API Key。');
      return;
    }
    if (status.configured) {
      this.statusView.showLLM('success', '后端已配置该 provider，可尝试真实对话。');
      return;
    }
    this.statusView.showLLM('error', this.formatMissingProviderMessage(status));
  }

  formatMissingProviderMessage(status) {
    if (status.status === 'missing_base_url') {
      return '后端未配置该 provider 的 Base URL，将返回配置错误。';
    }
    if (status.status === 'missing_key_and_base_url') {
      return '后端未配置该 provider 的 API Key / Base URL，将返回配置错误。';
    }
    return '后端未配置该 provider 的 API Key，将返回配置错误。';
  }

  updateMemorySessionLabel(sessionId) {
    if (!this.refs.llmMemorySession) return;
    this.refs.llmMemorySession.textContent = `Session: ${sessionId || '-'}`;
  }

  patchMemoryState(config) {
    this.patchState?.({
      memoryEnabled: Boolean(config.useMemory),
      memory: {
        enabled: Boolean(config.useMemory),
        sessionId: config.sessionId || null
      }
    }, 'memory:config');
  }

  formatSaveMessage(config) {
    const memoryText = config.useMemory ? '短期记忆已开启。' : '短期记忆已关闭。';
    return `配置已保存。${memoryText} API Key 请配置在后端环境变量中。`;
  }
}
