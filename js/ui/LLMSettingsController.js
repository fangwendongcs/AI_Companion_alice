export class LLMSettingsController {
  constructor({ refs, registry, store, llmClient, getConfig, setConfig, readFormConfig, statusView }) {
    this.refs = refs;
    this.registry = registry;
    this.store = store;
    this.llmClient = llmClient;
    this.getConfig = getConfig;
    this.setConfig = setConfig;
    this.readFormConfig = readFormConfig;
    this.statusView = statusView;
  }

  init() {
    const config = this.getConfig();
    this.refs.llmProvider.value = config.provider;
    this.refs.baseUrlInput.value = '';
    this.refs.llmModel.value = config.model;
    this.refs.systemPromptInput.value = config.systemPrompt;
    this.applyProviderHint(config.provider);
    this.prepareKeyUI();

    this.registry.addEventListener(this.refs.llmProvider, 'change', (event) => {
      this.applyProviderHint(event.target.value);
    });

    this.registry.addEventListener(this.refs.saveLLMConfigBtn, 'click', () => {
      const next = this.readFormConfig();
      this.setConfig(next);
      this.store.saveLLMConfig(next);
      this.statusView.showLLM('success', '配置已保存。API Key 请配置在后端环境变量中。');
    });

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
}
