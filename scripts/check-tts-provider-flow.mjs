import { readFile } from 'node:fs/promises';
import { TTSOrchestrator } from '../backend/services/tts/TTSOrchestrator.js';
import { createTTSProviderRegistry } from '../backend/services/tts/TTSProviderRegistry.js';

const failures = [];

await checkMockProvider();
await checkUnknownProvider();
await checkMissingConfig();
await checkCosyVoiceBinaryResult();
await checkHiggsRequestMapping();
await checkTimeoutFallback();
await checkProviderStatusSafety();
await checkFrontendAudioResultSupport();
await checkEnvExample();

if (failures.length) {
  console.error('[check-tts-provider-flow] TTS provider 检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-tts-provider-flow] ok');

async function checkMockProvider() {
  const orchestrator = createOrchestrator();
  const result = await orchestrator.synthesize({
    provider: 'mock',
    text: '你好',
    emotion: 'warm',
    tone: 'gentle'
  });
  assert(result.tts_status === 'ok', 'mock provider 应返回 ok。');
  assert(result.provider === 'mock', 'mock provider 应保留 provider=mock。');
  assert(Boolean(result.audioBase64), 'mock provider 应返回 audioBase64。');
  assert(result.format === 'wav', 'mock provider 应返回 wav，避免依赖外部服务。');
}

async function checkUnknownProvider() {
  const result = await createOrchestrator().synthesize({
    provider: 'unknown',
    text: 'hello'
  });
  assert(result.tts_status === 'failed', 'unknown provider 应返回 failed。');
  assert(result.error?.code === 'TTS_PROVIDER_UNSUPPORTED', 'unknown provider 应返回 TTS_PROVIDER_UNSUPPORTED。');
}

async function checkMissingConfig() {
  const orchestrator = createOrchestrator();
  const result = await orchestrator.synthesize({
    provider: 'cosyvoice',
    text: 'hello'
  });
  assert(result.tts_status === 'unavailable', 'CosyVoice 未配置 baseUrl 时应返回 unavailable。');
  assert(result.error?.code === 'TTS_NOT_CONFIGURED', 'CosyVoice 未配置时应返回 TTS_NOT_CONFIGURED。');
}

async function checkCosyVoiceBinaryResult() {
  let request = null;
  const orchestrator = createOrchestrator({
    fetchImpl: async (url, options) => {
      request = { url, body: options.body, headers: options.headers };
      return createBinaryResponse('abc');
    }
  });
  const provider = orchestrator.registry.get('cosyvoice');
  provider.baseUrl = 'http://127.0.0.1:50000';
  provider.apiKey = 'cosy_test_key';

  const result = await orchestrator.synthesize({
    provider: 'cosyvoice',
    text: '请温柔地说你好',
    emotion: 'happy',
    tone: 'gentle',
    voiceId: 'alice_cn',
    model: 'client_should_not_override',
    prosody: { rate: 1.1, pitch: 1.05, volume: 1 }
  });

  assert(result.tts_status === 'ok', 'CosyVoice fake binary response 应返回 ok。');
  assert(result.provider === 'cosyvoice', 'CosyVoice result provider 应为 cosyvoice。');
  assert(result.format === 'wav', 'CosyVoice official FastAPI raw PCM response 应归一为 wav。');
  assert(result.audioBase64.startsWith('UklGR'), 'CosyVoice official FastAPI raw PCM response 应包装为 WAV。');
  assert(result.streaming === false, 'CosyVoice 返回 base64 WAV 时客户端 streaming 必须为 false。');
  assert(result.upstreamStreaming === true, 'CosyVoice official FastAPI raw PCM 流应记录 upstreamStreaming=true。');
  assert(Number.isFinite(result.metadata?.timings?.upstreamReadMs), 'CosyVoice result 应记录上游音频读取耗时。');
  assert(Number.isFinite(result.metadata?.timings?.upstreamFirstChunkMs), 'CosyVoice result 应记录上游首个 PCM chunk 耗时。');
  assert(Number.isInteger(result.metadata?.timings?.upstreamChunkCount), 'CosyVoice result 应记录上游 PCM chunk 数量。');
  assert(Array.isArray(result.metadata?.timings?.upstreamChunkBytes), 'CosyVoice result 应记录上游 PCM chunk 字节数。');
  assert(Number.isFinite(result.metadata?.timings?.wavWrapMs), 'CosyVoice result 应记录 WAV 包装耗时。');
  assert(Number.isFinite(result.metadata?.timings?.base64Ms), 'CosyVoice result 应记录 Base64 编码耗时。');
  assert(request.url === 'http://127.0.0.1:50000/inference_sft', 'CosyVoice official FastAPI 默认应调用 /inference_sft。');
  const body = new URLSearchParams(String(request.body));
  assert(body.get('spk_id') === 'alice_cn', 'CosyVoice official FastAPI 应映射 voiceId -> spk_id。');
  assert(body.get('tts_text') === '请温柔地说你好', 'CosyVoice official FastAPI 应映射 text -> tts_text。');
  assert(!String(request.body).includes('client_should_not_override'), 'CosyVoice official FastAPI 请求不应接受客户端覆盖 model。');
  assert(!JSON.stringify(result).includes('cosy_test_key'), 'CosyVoice result 不应泄露 API key。');
}

async function checkHiggsRequestMapping() {
  let request = null;
  const orchestrator = createOrchestrator({
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return createJsonResponse({
        audioBase64: Buffer.from('higgs').toString('base64'),
        format: 'mp3',
        sampleRate: 24000
      });
    }
  });
  const provider = orchestrator.registry.get('higgs');
  provider.baseUrl = 'http://127.0.0.1:8000';

  const result = await orchestrator.synthesize({
    provider: 'higgs',
    text: '我会记住这件事',
    emotion: 'warm',
    tone: 'playful',
    model: 'client_should_not_override'
  });

  assert(result.tts_status === 'ok', 'Higgs fake JSON response 应返回 ok。');
  assert(request.model === 'higgs-audio-v3', 'Higgs model 必须来自后端配置，不应被客户端覆盖。');
  assert(request.input.startsWith('<|emotion:warm|><|tone:playful|>'), 'Higgs input 应包含 inline control tokens。');
  assert(request.alice_control?.emotion === 'warm', 'Higgs payload 应带 alice_control emotion。');
  assert(result.sampleRate === 24000, 'Higgs 应保留 sampleRate。');
}

async function checkTimeoutFallback() {
  const orchestrator = createOrchestrator({
    fetchImpl: async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }
  });
  const provider = orchestrator.registry.get('higgs');
  provider.baseUrl = 'http://127.0.0.1:8000';

  const result = await orchestrator.synthesize({
    provider: 'higgs',
    text: 'timeout check'
  });
  assert(result.tts_status === 'failed', 'provider timeout 应返回 failed。');
  assert(result.error?.code === 'TTS_PROVIDER_TIMEOUT', 'provider timeout 应返回 TTS_PROVIDER_TIMEOUT。');
}

async function checkProviderStatusSafety() {
  const registry = createTTSProviderRegistry();
  const status = registry.listStatus();
  const health = await registry.checkHealth();
  const providers = new Set(status.map((item) => item.provider));
  ['mock', 'cosyvoice', 'higgs', 'openai', 'minimax'].forEach((provider) => {
    assert(providers.has(provider), `TTS provider status 必须包含 ${provider}。`);
  });
  assert(status.every((item) => item.capabilities), '每个 TTS provider status 必须包含 capabilities。');
  assert(status.every((item) => item.health && typeof item.health.healthy === 'boolean'), '每个 TTS provider status 必须包含 health readiness。');
  assert(health.some((item) => item.provider === 'mock' && item.healthy === true), 'TTS registry health check 必须标记 mock healthy。');
  assert(health.some((item) => item.provider === 'cosyvoice' && item.status === 'missing_base_url'), 'CosyVoice 未配置时 health 应说明 missing_base_url。');
  assert(!JSON.stringify(status).match(/apiKey|secret|token|Bearer/i), 'TTS provider status 不应返回 secret 字段。');
  assert(!JSON.stringify(health).match(/apiKey|secret|token|Bearer/i), 'TTS provider health 不应返回 secret 字段。');
}

async function checkFrontendAudioResultSupport() {
  const service = await readFile('js/voice/TTSService.js', 'utf8');
  const registry = await readFile('js/voice/TTSProviderRegistry.js', 'utf8');
  const route = await readFile('backend/routes/ttsRoutes.js', 'utf8');
  assert(service.includes('audioBase64') && service.includes('playAudioResult'), 'TTSService 必须支持统一 Audio Result JSON。');
  assert(registry.includes("id: 'mock'") && registry.includes("id: 'cosyvoice'"), '前端 TTS registry 必须识别 mock/cosyvoice backend provider。');
  assert(!/id:\s*['"`](higgs|openai|minimax)['"`]/i.test(registry), '前端 TTS registry 当前不应暴露 higgs/openai/minimax provider。');
  assert(route.includes("'mock'") && route.includes("'cosyvoice'") && route.includes('publicTTSProviders'), '/api/tts 必须对白名单 provider 做集中校验。');
  assert(registry.includes("responseFormat: 'json'"), '前端 backend TTS payload 必须请求统一 JSON Audio Result。');
  assert(!/COSYVOICE_API_KEY|HIGGS_API_KEY/.test(registry), '前端 registry 不应出现后端 TTS secret 环境变量名。');
}

async function checkEnvExample() {
  const source = await readFile('.env.example', 'utf8');
  [
    'TTS_PROVIDER=mock',
    'COSYVOICE_BASE_URL=',
    'COSYVOICE_API_STYLE=official_fastapi',
    'COSYVOICE_API_MODE=sft',
    'COSYVOICE_MODEL=iic/CosyVoice2-0.5B',
    'TTS_UPSTREAM_TIMEOUT_MS=90000',
    'HIGGS_BASE_URL=',
    'HIGGS_MODEL=higgs-audio-v3'
  ].forEach((snippet) => {
    assert(source.includes(snippet), `.env.example 必须包含 ${snippet}`);
  });
}

function createOrchestrator(options = {}) {
  const registry = createTTSProviderRegistry(options);
  return new TTSOrchestrator({ registry });
}

function createBinaryResponse(text) {
  const buffer = Buffer.from(text);
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'audio/mpeg' : '';
      }
    },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function createJsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : '';
      }
    },
    json: async () => payload
  };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
