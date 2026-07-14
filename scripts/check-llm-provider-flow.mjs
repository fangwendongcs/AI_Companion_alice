import { readFile } from 'node:fs/promises';
import { LLMService, resolveLLMRequest } from '../backend/services/LLMService.js';
import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { ProviderStatusService } from '../backend/services/ProviderStatusService.js';
import { redactForLog } from '../backend/utils/redact.js';
import { providerDefaultModels } from '../backend/config/serverConfig.js';
import { LLMSettingsController } from '../js/ui/LLMSettingsController.js';
import { LLMClient } from '../js/ai/LLMClient.js';

const failures = [];
const fakeKey = 'test_llm_provider_key_123456';
const fakeBaseUrl = 'https://llm-provider-fake.invalid/v1';

await checkRealProviderSuccess();
await checkProviderSpecificModelResolution();
await checkDeepSeekModelResolution();
await checkDeepSeekFrontendSelection();
await checkMissingConfigurationFallback();
await checkTimeoutFallback();
await checkUpstreamErrorFallback();
await checkInvalidResponseFallback();
await checkEmptyResponseFallback();
await checkFallbackPreservesDialogueLifecycle();
await checkFallbackCanBeDisabled();
await checkCustomKeylessSwitch();
await checkFallbackSafetyAndDocumentation();

if (failures.length) {
  console.error('[check-llm-provider-flow] LLM provider 检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-llm-provider-flow] ok');

async function checkRealProviderSuccess() {
  let request = null;
  await withEnv({
    OPENAI_API_KEY: fakeKey,
    OPENAI_BASE_URL: fakeBaseUrl,
    LLM_API_KEY: undefined
  }, async () => {
    const service = createDialogueService({
      fetchImpl: async (url, options) => {
        request = { url, headers: options.headers, body: options.body };
        return createJsonResponse({
          choices: [{ message: { content: '真实 provider fake endpoint 回复' } }]
        });
      }
    });
    const result = await service.run(realProviderPayload());
    assert(result.reply === '真实 provider fake endpoint 回复', '真实 provider fake endpoint 应返回上游 reply。');
    assert(result.reply_text === result.reply && result.reply_text.length > 0, '真实 provider 成功时 reply_text 不得为空。');
    assert(result.meta?.mode === 'llm_only', '真实 provider 成功时 meta.mode 必须为 llm_only。');
    assert(request?.url === `${fakeBaseUrl}/chat/completions`, 'LLMService 必须调用 OpenAI-compatible /chat/completions。');
    assert(request?.headers?.Authorization === `Bearer ${fakeKey}`, '需要 Key 的 provider 必须由后端添加 Authorization。');
    assert(JSON.parse(request?.body || '{}').model === 'gpt-4o-mini', 'LLM 请求必须保留请求 model。');
  });
}

async function checkProviderSpecificModelResolution() {
  assert(resolveLLMRequest({ provider: 'openai' }).model === providerDefaultModels.openai, 'OpenAI 缺 model 时必须使用自己的 provider default。');
  assert(resolveLLMRequest({ provider: 'qwen' }).model === providerDefaultModels.qwen, 'Qwen 缺 model 时必须使用 qwen-plus，不得回退到 gpt-4o-mini。');
  try {
    resolveLLMRequest({ provider: 'custom' });
    failures.push('custom 缺 model 且无默认值时必须返回配置错误，不得回退到 gpt-4o-mini。');
  } catch (error) {
    assert(error?.code === 'LLM_NOT_CONFIGURED', `custom 缺 model 应返回 LLM_NOT_CONFIGURED，实际为 ${error?.code || 'missing code'}。`);
  }
}

async function checkDeepSeekModelResolution() {
  const requests = [];
  await withEnv({
    DEEPSEEK_API_KEY: fakeKey,
    DEEPSEEK_BASE_URL: fakeBaseUrl,
    LLM_API_KEY: undefined
  }, async () => {
    const service = createDialogueService({
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push({ url, model: body.model });
        return createJsonResponse({
          choices: [{ message: { content: `DeepSeek fake ${body.model}` } }]
        });
      }
    });

    const defaultResult = await service.run({
      message: 'DeepSeek default model check',
      provider: 'deepseek',
      options: { useMemory: false, useRag: false, useWorkflow: false }
    });
    assert(providerDefaultModels.deepseek === (String(process.env.DEEPSEEK_MODEL || '').trim() || 'deepseek-v4-flash'), 'DeepSeek 默认模型必须读取 DEEPSEEK_MODEL，并以 deepseek-v4-flash 兜底。');
    assert(requests[0]?.model === providerDefaultModels.deepseek, 'DeepSeek 未传 model 时实际请求必须使用 providerDefaultModels.deepseek。');
    assert(defaultResult.meta?.provider === 'deepseek', 'DeepSeek 默认请求 meta.provider 必须为 deepseek。');
    assert(defaultResult.meta?.model === requests[0]?.model, 'DeepSeek 默认请求 meta.model 必须等于实际上游请求模型。');

    const explicitResult = await service.run({
      message: 'DeepSeek explicit model check',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      options: { useMemory: false, useRag: false, useWorkflow: false }
    });
    assert(requests[1]?.model === 'deepseek-v4-pro', '显式 deepseek-v4-pro 必须原样发送，不得被默认模型覆盖。');
    assert(explicitResult.meta?.model === requests[1]?.model, '显式 DeepSeek 请求 meta.model 必须等于实际上游请求模型。');

    const status = await new ProviderStatusService({
      ttsRegistry: { checkHealth: async () => [], listStatus: () => [] }
    }).getStatus();
    const deepseek = status.llm.find((item) => item.provider === 'deepseek');
    assert(deepseek?.defaultModel === providerDefaultModels.deepseek, 'ProviderStatusService DeepSeek defaultModel 必须与后端默认解析模型一致。');
  });
}

async function checkDeepSeekFrontendSelection() {
  const llmModel = {
    value: 'gpt-4o-mini',
    options: [
      { value: 'deepseek-v4-flash' },
      { value: 'deepseek-v4-pro' }
    ]
  };
  const controller = new LLMSettingsController({ refs: { llmModel } });
  controller.providerStatus = new Map([[
    'deepseek',
    { defaultModel: 'deepseek-v4-flash' }
  ]]);
  controller.applyProviderDefaultModel('deepseek');
  assert(llmModel.value === 'deepseek-v4-flash', '切换到 DeepSeek 时必须把其他 provider 模型替换为 readiness defaultModel。');
  llmModel.value = 'deepseek-v4-pro';
  controller.applyProviderDefaultModel('deepseek');
  assert(llmModel.value === 'deepseek-v4-pro', '用户显式选择 deepseek-v4-pro 后不得被默认模型覆盖。');

  let requestBody = null;
  const client = new LLMClient('/api/dialogue', {
    apiClient: {
      json: async (_path, options) => {
        requestBody = options.body;
        return { reply: 'frontend fake ok' };
      }
    }
  });
  await client.chat('frontend model check', {
    provider: 'deepseek',
    model: 'deepseek-v4-pro'
  });
  assert(requestBody?.provider === 'deepseek' && requestBody?.model === 'deepseek-v4-pro', 'LLMClient 必须保留前端显式选择的 DeepSeek model。');
}

async function checkMissingConfigurationFallback() {
  await withEnv({
    OPENAI_API_KEY: undefined,
    LLM_API_KEY: undefined,
    OPENAI_BASE_URL: fakeBaseUrl
  }, async () => {
    const result = await createDialogueService({
      fetchImpl: async () => {
        throw new Error('缺 Key 时不应请求上游。');
      }
    }).run(realProviderPayload());
    assertFallback(result, 'not_configured', '真实 provider 缺配置');
  });
}

async function checkTimeoutFallback() {
  await withConfiguredOpenAI(async () => {
    const timeoutFetch = async () => {
      const error = new Error(`timeout at ${fakeBaseUrl} with ${fakeKey}`);
      error.name = 'AbortError';
      throw error;
    };
    const llm = new LLMService({ fetchImpl: timeoutFetch });
    await assertLLMError(
      () => llm.chat({ message: 'timeout', provider: 'openai', model: 'gpt-4o-mini' }),
      'LLM_UPSTREAM_TIMEOUT',
      '超时必须收敛为 LLM_UPSTREAM_TIMEOUT'
    );
    const result = await createDialogueService({ fetchImpl: timeoutFetch }).run(realProviderPayload());
    assertFallback(result, 'timeout', '真实 provider 超时');
  });
}

async function checkUpstreamErrorFallback() {
  await withConfiguredOpenAI(async () => {
    const result = await createDialogueService({
      fetchImpl: async () => createTextResponse(503, `upstream body leaks ${fakeKey} ${fakeBaseUrl}`)
    }).run(realProviderPayload());
    assertFallback(result, 'upstream_error', '真实 provider 上游错误');
  });
}

async function checkInvalidResponseFallback() {
  await withConfiguredOpenAI(async () => {
    const invalidFetch = async () => createJsonResponse({ choices: [{ message: {} }] });
    const llm = new LLMService({ fetchImpl: invalidFetch });
    await assertLLMError(
      () => llm.chat({ message: 'invalid', provider: 'openai', model: 'gpt-4o-mini' }),
      'LLM_INVALID_RESPONSE',
      '非法上游结构必须收敛为 LLM_INVALID_RESPONSE'
    );
    const result = await createDialogueService({ fetchImpl: invalidFetch }).run(realProviderPayload());
    assertFallback(result, 'invalid_response', '真实 provider 非法响应');
  });
}

async function checkEmptyResponseFallback() {
  await withConfiguredOpenAI(async () => {
    const emptyFetch = async () => createJsonResponse({
      choices: [{ message: { content: '   ' } }]
    });
    const llm = new LLMService({ fetchImpl: emptyFetch });
    await assertLLMError(
      () => llm.chat({ message: 'empty', provider: 'openai', model: 'gpt-4o-mini' }),
      'LLM_EMPTY_RESPONSE',
      '空 content 必须收敛为 LLM_EMPTY_RESPONSE'
    );
    const result = await createDialogueService({ fetchImpl: emptyFetch }).run(realProviderPayload());
    assertFallback(result, 'empty_response', '真实 provider 空响应');
  });
}

async function checkFallbackPreservesDialogueLifecycle() {
  const calls = [];
  let storedAssistantMessage = '';
  const memoryService = {
    getContext: async ({ sessionId, avatarId }) => {
      calls.push('memory:get');
      return {
        used: true,
        status: 'ready',
        sessionId,
        avatarId,
        turnCount: storedAssistantMessage ? 1 : 0,
        maxTurns: 6,
        context: [],
        longTerm: { used: true, status: 'ready', count: 0, items: [] }
      };
    },
    appendExchange: async ({ assistantMessage }) => {
      calls.push('memory:append');
      storedAssistantMessage = assistantMessage;
      return { longTermWrite: null };
    }
  };

  await withEnv({
    OPENAI_API_KEY: undefined,
    LLM_API_KEY: undefined,
    OPENAI_BASE_URL: fakeBaseUrl
  }, async () => {
    const result = await createDialogueService({ memoryService }).run({
      ...realProviderPayload(),
      sessionId: 'llm-fallback-memory',
      avatarId: 'alice',
      options: { useMemory: true, useRag: false, useWorkflow: false }
    });
    assertFallback(result, 'not_configured', '带 Memory 的真实 provider 缺配置');
    assert(calls.join('>') === 'memory:get>memory:append>memory:get', 'fallback 必须在读取上下文后写入 stub user/assistant exchange。');
    assert(storedAssistantMessage === result.reply, 'fallback 写入 Memory 的 assistantMessage 必须与最终 reply 一致。');
    assert(result.memory?.status === 'ready' && result.memory?.turnCount === 1, 'fallback 响应必须返回写入后的 Memory 状态。');
    assert(result.memory_event?.short_context_updated === true, 'fallback dialogue.v1 必须同步 memory_event。');
  });
}

async function checkFallbackCanBeDisabled() {
  await withEnv({
    OPENAI_API_KEY: undefined,
    LLM_API_KEY: undefined,
    OPENAI_BASE_URL: fakeBaseUrl
  }, async () => {
    const service = createDialogueService({ fallbackToStub: false });
    await assertLLMError(
      () => service.run(realProviderPayload()),
      'LLM_NOT_CONFIGURED',
      '关闭 fallback 后 /api/dialogue service 应保留安全配置错误'
    );
  });
}

async function checkCustomKeylessSwitch() {
  let headers = null;
  await withEnv({
    CUSTOM_API_KEY: undefined,
    LLM_API_KEY: undefined,
    CUSTOM_BASE_URL: fakeBaseUrl
  }, async () => {
    const llm = new LLMService({
      customKeyOptional: true,
      fetchImpl: async (_url, options) => {
        headers = options.headers;
        return createJsonResponse({ choices: [{ message: { content: 'custom keyless ok' } }] });
      }
    });
    const reply = await llm.chat({ message: 'custom keyless', provider: 'custom', model: 'local-model' });
    assert(reply === 'custom keyless ok', 'custom 显式允许无 Key 时应能调用兼容端点。');
    assert(!Object.prototype.hasOwnProperty.call(headers || {}, 'Authorization'), 'custom 无 Key 模式不得发送空 Bearer header。');

    const status = await new ProviderStatusService({
      customKeyOptional: true,
      ttsRegistry: { checkHealth: async () => [], listStatus: () => [] }
    }).getStatus();
    const custom = status.llm.find((item) => item.provider === 'custom');
    assert(custom?.configured === true && custom.requiresKey === false && custom.status === 'ready', 'custom 无 Key 开关必须反映在既有 provider readiness 字段中。');
    assert(
      Object.keys(custom || {}).sort().join(',') === 'configured,defaultModel,mode,provider,requiresKey,status',
      '/api/providers 的 LLM readiness 响应字段集合不得改变。'
    );
  });
}

async function checkFallbackSafetyAndDocumentation() {
  let capturedError = null;
  let response = null;
  await withConfiguredOpenAI(async () => {
    const upstreamFailure = async () => createTextResponse(502, `unsafe ${fakeKey} ${fakeBaseUrl}`);
    try {
      await new LLMService({ fetchImpl: upstreamFailure }).chat({
        message: 'safety',
        provider: 'openai',
        model: 'gpt-4o-mini'
      });
    } catch (error) {
      capturedError = error;
    }
    response = await createDialogueService({ fetchImpl: upstreamFailure }).run(realProviderPayload());
  });

  const responseAndLog = JSON.stringify({
    response,
    error: { code: capturedError?.code, message: capturedError?.message },
    log: redactForLog({ error: capturedError })
  });
  assert(capturedError?.code === 'LLM_UPSTREAM_ERROR', '非成功上游响应必须使用 LLM_UPSTREAM_ERROR。');
  assert(!responseAndLog.includes(fakeKey), 'fallback response 与结构化日志不得泄露 API Key。');
  assert(!responseAndLog.includes(fakeBaseUrl), 'fallback response 与结构化日志不得泄露 provider base URL。');
  assert(response?.reply_text?.trim(), 'fallback 后 reply_text 永不为空。');
  assert(response?.contract?.version === 'dialogue.v1', 'fallback 后必须保留完整 dialogue.v1 contract。');

  const [envExample, gitignore, packageSource, apiContract, developmentGuide, backendReadme, orchestration, html, settings] = await Promise.all([
    readFile('.env.example', 'utf8'),
    readFile('.gitignore', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('docs/api/API_CONTRACT.md', 'utf8'),
    readFile('docs/guides/DEVELOPMENT_GUIDE.md', 'utf8'),
    readFile('backend/README.md', 'utf8'),
    readFile('backend/services/DialogueOrchestrationService.js', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('js/ui/LLMSettingsController.js', 'utf8')
  ]);
  assert(envExample.includes('DIALOGUE_FALLBACK_TO_STUB=true'), '.env.example 必须说明默认 LLM fallback 开关。');
  assert(envExample.includes('CUSTOM_API_KEY_OPTIONAL=false'), '.env.example 必须默认关闭 custom 无 Key 开关。');
  assert(envExample.includes('DEEPSEEK_MODEL=deepseek-v4-flash'), '.env.example 必须声明 DeepSeek 默认模型。');
  assert(envExample.includes('http://localhost:11434/v1'), '.env.example 必须给出通用 OpenAI-compatible /v1 示例。');
  assert(gitignore.split('\n').includes('.env'), '本地 .env 必须保持 Git ignore。');
  const packageJson = JSON.parse(packageSource);
  const devCommand = String(packageJson.scripts?.dev || '');
  assert(devCommand === 'node --env-file-if-exists=.env backend/server.js', 'npm run dev 必须使用 Node 原生可选 .env 加载且不依赖 dotenv。');
  assert(apiContract.includes('llm_fallback_stub') && apiContract.includes('CUSTOM_API_KEY_OPTIONAL'), 'API 契约必须说明 fallback 与 custom 无 Key 决策。');
  assert(developmentGuide.includes('node --env-file-if-exists=.env backend/server.js'), '开发文档必须说明 npm run dev 的原生可选 .env 加载方式。');
  assert(developmentGuide.includes('`.env` 不存在时') && developmentGuide.includes('默认 `stub` LLM 与 `mock` TTS'), '开发文档必须说明无 .env 时仍可零费用启动。');
  assert(backendReadme.includes('--env-file-if-exists=.env') && backendReadme.includes('Git ignore'), 'Backend README 必须提示本地 .env 自动加载与禁止提交边界。');
  assert(orchestration.includes("'llm_fallback_stub'"), '编排服务必须实现 llm_fallback_stub mode。');
  assert(html.includes('deepseek-v4-flash') && html.includes('deepseek-v4-pro') && !html.includes('deepseek-chat'), 'Web 模型列表必须只保留当前 DeepSeek v4 模型。');
  assert(settings.includes('applyProviderDefaultModel') && settings.includes('defaultModel') && settings.includes('DEEPSEEK_MODELS'), '切换 DeepSeek provider 时必须使用 /api/providers defaultModel，并保留显式 v4-pro。');
}

function createDialogueService({ fetchImpl = fetch, fallbackToStub = true, memoryService } = {}) {
  return new DialogueOrchestrationService({
    llmService: new LLMService({ fetchImpl }),
    fallbackToStub,
    ...(memoryService ? { memoryService } : {})
  });
}

function realProviderPayload() {
  return {
    message: 'LLM provider flow check',
    provider: 'openai',
    model: 'gpt-4o-mini',
    options: { useMemory: false, useRag: false, useWorkflow: false }
  };
}

function assertFallback(result, reason, label) {
  assert(result?.meta?.mode === 'llm_fallback_stub', `${label} 时必须使用 llm_fallback_stub。`);
  assert(result?.meta?.fallback?.applied === true && result.meta.fallback.reason === reason, `${label} 时必须返回安全 fallback reason=${reason}。`);
  assert(typeof result?.reply_text === 'string' && result.reply_text.trim().length > 0, `${label} 时 reply_text 不得为空。`);
  assert(result?.reply === result?.reply_text, `${label} 时 legacy reply 必须与 reply_text 一致。`);
  assert(result?.contract?.version === 'dialogue.v1', `${label} 时必须保持 dialogue.v1。`);
  assert(result?.tts?.status === 'pending', `${label} 时必须保留 TTS pending 生命周期。`);
  assert(result?.avatar_directive?.state === 'speaking' && result.avatar_directive.lip_sync === 'auto', `${label} 时必须保留 renderer-agnostic AvatarDirective。`);
}

async function assertLLMError(action, expectedCode, message) {
  try {
    await action();
    failures.push(`${message}（未抛错）。`);
  } catch (error) {
    assert(error?.code === expectedCode, `${message}（实际为 ${error?.code || 'missing code'}）。`);
  }
}

function createJsonResponse(payload, status = 200) {
  return createTextResponse(status, JSON.stringify(payload));
}

function createTextResponse(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text
  };
}

async function withConfiguredOpenAI(callback) {
  await withEnv({
    OPENAI_API_KEY: fakeKey,
    OPENAI_BASE_URL: fakeBaseUrl,
    LLM_API_KEY: undefined
  }, callback);
}

async function withEnv(values, callback) {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
