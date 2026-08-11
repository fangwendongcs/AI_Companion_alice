import { readFile } from 'node:fs/promises';
import { ProviderStatusService } from '../backend/services/ProviderStatusService.js';
import { LLMService } from '../backend/services/LLMService.js';
import { providerDefaultModels } from '../backend/config/serverConfig.js';
import { TTSSettingsController } from '../js/ui/TTSSettingsController.js';

const failures = [];

await checkEnvExamplePlaceholders();
await checkProviderStatusContract();
await checkLLMErrorCodes();
await checkFrontendProviderBoundary();
checkSavedTTSSelectionBootstrap();
await checkTTSConfigMutationRequiresRetest();

if (failures.length) {
  console.error('[check-provider-config] provider 配置检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-provider-config] ok');

async function checkEnvExamplePlaceholders() {
  const source = await readFile('.env.example', 'utf8');
  assert(source.includes('OPENAI_API_KEY=replace_with_your_key'), '.env.example 必须使用 OPENAI_API_KEY placeholder。');
  assert(source.includes('QWEN_API_KEY=replace_with_your_key'), '.env.example 必须使用 QWEN_API_KEY placeholder。');
  assert(source.includes('DEEPSEEK_API_KEY=replace_with_your_key'), '.env.example 必须使用 DEEPSEEK_API_KEY placeholder。');
  assert(source.includes('CUSTOM_API_KEY=replace_with_your_key'), '.env.example 必须使用 CUSTOM_API_KEY placeholder。');
  assert(source.includes('QWEN3_TTS_API_KEY=replace_with_your_key'), '.env.example 必须使用 QWEN3_TTS_API_KEY placeholder。');
  assert(source.includes('FISH_AUDIO_API_KEY=replace_with_your_key'), '.env.example 必须使用 FISH_AUDIO_API_KEY placeholder。');
  assert(!/\bsk-[A-Za-z0-9_-]{12,}/.test(source), '.env.example 不应包含真实 sk- key。');
  assert(!/Bearer\s+[A-Za-z0-9._-]+/.test(source), '.env.example 不应包含 Bearer token。');
}

async function checkProviderStatusContract() {
  const status = await new ProviderStatusService().getStatus();
  const stub = status.llm.find((item) => item.provider === 'stub');
  assert(stub?.configured === true, 'Provider status 必须报告 stub configured=true。');
  assert(stub?.requiresKey === false, 'Provider status 必须报告 stub requiresKey=false。');
  assert(status.llm.some((item) => item.provider === 'openai'), 'Provider status 必须包含 openai。');
  assert(status.llm.some((item) => item.provider === 'qwen'), 'Provider status 必须包含 qwen。');
  assert(status.llm.some((item) => item.provider === 'deepseek'), 'Provider status 必须包含 deepseek。');
  assert(status.llm.some((item) => item.provider === 'custom'), 'Provider status 必须包含 custom。');
  assert(Array.isArray(status.tts), 'Provider status 必须包含 tts 列表。');
  assert(status.tts.some((item) => item.provider === 'mock' && item.configured === true), 'TTS provider status 必须包含 configured mock。');
  assert(status.tts.some((item) => item.provider === 'cosyvoice'), 'TTS provider status 必须包含 cosyvoice。');
  assert(status.tts.some((item) => item.provider === 'voxcpm2' && item.type === 'local'), 'TTS provider status 必须包含 VoxCPM2 Local descriptor。');
  assert(status.tts.some((item) => item.provider === 'qwen3_tts'), 'TTS provider status 必须包含 qwen3_tts。');
  assert(status.tts.some((item) => item.provider === 'fish_audio'), 'TTS provider status 必须包含 fish_audio。');
  assert(status.tts.some((item) => item.provider === 'self_hosted'), 'TTS provider status 必须包含 self_hosted。');
  assert(!status.tts.some((item) => ['higgs', 'openai', 'minimax', 'siliconflow'].includes(item.provider)), '公开 TTS provider status 不应暴露历史隐藏 provider。');
  assert(status.tts.every((item) => item.capabilities), 'TTS provider status 必须包含 capabilities。');
  assert(status.tts.every((item) => item.descriptor?.id === item.provider), '公开 TTS provider status 必须包含统一 descriptor。');
  assert(status.tts.every((item) => item.metadata?.provider === item.provider), 'TTS provider status 必须包含统一安全 metadata。');
  assert(status.ttsPolicy?.defaultProvider === 'cosyvoice', 'TTS policy 默认 provider 必须为 cosyvoice。');
  assert(status.ttsPolicy?.localFallbackProvider === 'cosyvoice', 'TTS policy 本地 fallback 必须为 cosyvoice。');
  assertNoSecretFields(status, 'Provider status');
  const deepseek = status.llm.find((item) => item.provider === 'deepseek');
  assert(deepseek?.defaultModel === providerDefaultModels.deepseek, 'Provider status DeepSeek defaultModel 必须与后端默认模型一致。');
}

async function checkLLMErrorCodes() {
  const previousOpenAI = process.env.OPENAI_API_KEY;
  const previousLLM = process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    await new LLMService().chat({
      message: 'provider config check',
      provider: 'openai',
      model: 'gpt-4o-mini'
    });
    failures.push('LLMService openai 缺少 API key 时必须抛出 LLM_NOT_CONFIGURED。');
  } catch (error) {
    assert(error.code === 'LLM_NOT_CONFIGURED', `openai 缺 key 应返回 LLM_NOT_CONFIGURED，实际为 ${error.code || 'missing code'}。`);
  } finally {
    restoreEnv('OPENAI_API_KEY', previousOpenAI);
    restoreEnv('LLM_API_KEY', previousLLM);
  }

  try {
    await new LLMService().chat({
      message: 'provider config check',
      provider: 'unsupported-provider',
      model: 'stub'
    });
    failures.push('LLMService unsupported provider 必须抛出 LLM_PROVIDER_UNSUPPORTED。');
  } catch (error) {
    assert(error.code === 'LLM_PROVIDER_UNSUPPORTED', `unsupported provider 应返回 LLM_PROVIDER_UNSUPPORTED，实际为 ${error.code || 'missing code'}。`);
  }
}

async function checkFrontendProviderBoundary() {
  const providers = await readFile('js/config/providers.js', 'utf8');
  const settings = await readFile('js/ui/LLMSettingsController.js', 'utf8');
  const ttsSettings = await readFile('js/ui/TTSSettingsController.js', 'utf8');
  const ttsRegistry = await readFile('js/voice/TTSProviderRegistry.js', 'utf8');
  const html = await readFile('index.html', 'utf8');
  const ttsSection = extractTTSSection(html);

  assert(providers.includes("provider: 'stub'"), '默认 provider 必须保持 stub。');
  assert(settings.includes('/api/providers'), 'LLM 设置面板必须通过 /api/providers 读取安全 provider 状态。');
  assert(ttsSettings.includes('/api/providers'), 'TTS 设置面板必须通过 /api/providers 读取安全 provider 状态。');
  assert(ttsSettings.includes('/test') && ttsSettings.includes('/config'), 'TTS Settings 必须实现 Test → Save 配置闭环。');
  assert(ttsSettings.includes('descriptor.type') && ttsSettings.includes('requiredFields'), 'TTS Settings 必须由 descriptor 动态渲染 Provider。');
  assert(['mock', 'cosyvoice', 'voxcpm2', 'qwen3_tts', 'fish_audio', 'self_hosted'].every((id) => ttsRegistry.includes(`backendProvider('${id}'`)), '前端 TTS registry 必须识别当前公开 provider id。');
  assert(!/provider:\s*['"`](higgs|openai|minimax|siliconflow)['"`]/i.test(ttsRegistry), '前端 TTS registry 当前不应暴露 Higgs / OpenAI / MiniMax / SiliconFlow provider。');
  assert(!/Higgs Audio v3|SiliconFlow|value="higgs"|value="openai"|value="minimax"|value="siliconflow"/i.test(ttsSection), 'TTS Settings UI 当前不应展示 Higgs / OpenAI / MiniMax / SiliconFlow。');
  assert(providers.includes("engine: 'cosyvoice'"), '默认 TTS 必须是无需云端 Key 的 cosyvoice local。');
  assert(ttsSection.includes('默认语音') && ttsSection.includes('云端语音') && ttsSection.includes('自建语音服务'), 'TTS Settings 必须使用三类产品语言。');
  assert(ttsSettings.includes("input.type = field.type") && ttsSettings.includes("autocomplete = isSecret ? 'new-password'"), 'TTS Key 输入必须使用临时 password 控件。');
  assert(!ttsSettings.includes('localStorage'), 'TTS Settings 不得将 Provider 配置或 Key 直接写入 localStorage。');
  assert(settings.includes('本地演示模式，无需 API Key'), 'LLM 设置面板必须提示 stub 无需 API Key。');
  assert(html.includes('apiKeyInput') && html.includes('disabled'), '前端 API Key 输入框必须保持禁用。');
  assert(settings.includes('已迁移到后端环境变量'), 'LLM 设置控制器必须保持后端环境变量迁移提示。');
  assert(!/Authorization\s*:\s*['"`]Bearer/i.test(settings), 'LLM 设置面板不应创建 Bearer header。');
  assert(!/Authorization\s*:\s*['"`]Bearer/i.test(ttsSettings), 'TTS 设置面板不应创建 Bearer header。');
}

function checkSavedTTSSelectionBootstrap() {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      appendChild() {}
    })
  };
  try {
    const refs = {
      ttsEngine: {
        innerHTML: '',
        value: '',
        appendChild() {}
      }
    };
    const controller = new TTSSettingsController({
      refs,
      getConfig: () => ({ engine: 'fish_audio' })
    });
    controller.pendingProviderId = 'fish_audio';
    controller.populateProviderOptions([]);
    assert(controller.pendingProviderId === 'fish_audio', 'Settings 初始占位选项不得覆盖已保存的 remote provider。');
    controller.populateProviderOptions([
      { descriptor: { id: 'cosyvoice', displayName: '默认语音', type: 'local', selectable: true } },
      { descriptor: { id: 'fish_audio', displayName: '云端语音 · Fish Audio', type: 'remote', selectable: true } }
    ]);
    assert(refs.ttsEngine.value === 'fish_audio', 'descriptor 就绪后必须恢复已保存的 remote provider 选择。');
    assert(controller.pendingProviderId === 'fish_audio', 'descriptor 就绪后 pending provider 必须保持已保存值。');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
}

async function checkTTSConfigMutationRequiresRetest() {
  const inputs = [
    { dataset: { ttsField: 'apiKey' }, type: 'password', value: 'test-only-key' },
    { dataset: { ttsField: 'model' }, type: 'text', value: 'model-a' },
    { dataset: { ttsField: 'voice' }, type: 'text', value: 'voice-a' }
  ];
  const calls = [];
  let mutateDuringTest = true;
  const refs = {
    testVoiceBtn: { disabled: false },
    saveTTSProviderBtn: { disabled: true },
    ttsProviderConfigFields: {
      querySelectorAll: () => inputs
    }
  };
  const controller = new TTSSettingsController({
    refs,
    apiClient: {
      async json(path, options = {}) {
        calls.push({ path, method: options.method });
        if (path.endsWith('/test')) {
          if (mutateDuringTest) inputs[1].value = 'model-b';
          return { tts_status: 'ok', provider: 'fish_audio', audioBase64: 'test' };
        }
        return {};
      }
    },
    ttsService: { playTestResult: async () => {} },
    statusView: { showTTS() {} }
  });
  controller.pendingProviderId = 'fish_audio';
  controller.providerDescriptors.set('fish_audio', { id: 'fish_audio', type: 'remote' });

  await controller.testSelectedProvider();
  assert(refs.saveTTSProviderBtn.disabled === true, 'Test 进行中配置变化后不得启用 Save。');
  assert(controller.testedProviderId === null, 'Test 进行中配置变化后必须清除通过状态。');

  mutateDuringTest = false;
  await controller.testSelectedProvider();
  assert(refs.saveTTSProviderBtn.disabled === false, '未变化配置通过 Test 后应启用 Save。');
  inputs[2].value = 'voice-b';
  await controller.saveAndSwitchProvider();
  assert(!calls.some((item) => item.method === 'PUT'), 'Test 后配置变化时不得调用 Save API。');
}

function extractTTSSection(html) {
  const start = html.indexOf('语音合成配置');
  const end = html.indexOf('3D 场景与渲染配置');
  if (start === -1 || end === -1 || end <= start) return html;
  return html.slice(start, end);
}

function assertNoSecretFields(value, label) {
  const seen = [];
  walk(value, seen);
  for (const key of seen) {
    if (/^(apiKey|secret|token|webhookUrl)$/i.test(key)) {
      failures.push(`${label} 不应返回 ${key} 字段。`);
    }
  }
}

function walk(value, keys) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    walk(child, keys);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
