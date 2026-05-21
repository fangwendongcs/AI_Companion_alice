import { readFile } from 'node:fs/promises';
import { ProviderStatusService } from '../backend/services/ProviderStatusService.js';
import { LLMService } from '../backend/services/LLMService.js';

const failures = [];

await checkEnvExamplePlaceholders();
await checkProviderStatusContract();
await checkLLMErrorCodes();
await checkFrontendProviderBoundary();

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
  assert(!/\bsk-[A-Za-z0-9_-]{12,}/.test(source), '.env.example 不应包含真实 sk- key。');
  assert(!/Bearer\s+[A-Za-z0-9._-]+/.test(source), '.env.example 不应包含 Bearer token。');
}

function checkProviderStatusContract() {
  const status = new ProviderStatusService().getStatus();
  const stub = status.llm.find((item) => item.provider === 'stub');
  assert(stub?.configured === true, 'Provider status 必须报告 stub configured=true。');
  assert(stub?.requiresKey === false, 'Provider status 必须报告 stub requiresKey=false。');
  assert(status.llm.some((item) => item.provider === 'openai'), 'Provider status 必须包含 openai。');
  assert(status.llm.some((item) => item.provider === 'qwen'), 'Provider status 必须包含 qwen。');
  assert(status.llm.some((item) => item.provider === 'deepseek'), 'Provider status 必须包含 deepseek。');
  assert(status.llm.some((item) => item.provider === 'custom'), 'Provider status 必须包含 custom。');
  assertNoSecretFields(status, 'Provider status');
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
  const html = await readFile('index.html', 'utf8');

  assert(providers.includes("provider: 'stub'"), '默认 provider 必须保持 stub。');
  assert(settings.includes('/api/providers'), 'LLM 设置面板必须通过 /api/providers 读取安全 provider 状态。');
  assert(settings.includes('本地演示模式，无需 API Key'), 'LLM 设置面板必须提示 stub 无需 API Key。');
  assert(html.includes('apiKeyInput') && html.includes('disabled'), '前端 API Key 输入框必须保持禁用。');
  assert(settings.includes('已迁移到后端环境变量'), 'LLM 设置控制器必须保持后端环境变量迁移提示。');
  assert(!/Authorization\s*:\s*['"`]Bearer/i.test(settings), 'LLM 设置面板不应创建 Bearer header。');
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
