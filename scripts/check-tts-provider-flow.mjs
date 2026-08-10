import { readFile } from 'node:fs/promises';
import { TTSOrchestrator } from '../backend/services/tts/TTSOrchestrator.js';
import { createTTSProviderRegistry } from '../backend/services/tts/TTSProviderRegistry.js';

const failures = [];

await checkMockProvider();
await checkUnknownProvider();
await checkMissingConfig();
await checkFailureMetadataNormalization();
await checkCosyVoiceBinaryResult();
await checkQwen3RequestMapping();
await checkQwen3Failure();
await checkFishAudioRequestMapping();
await checkFishAudioFailure();
await checkHiggsRequestMapping();
await checkTimeoutFallback();
await checkProviderStatusSafety();
await checkFrontendAudioResultSupport();
await checkEnvExample();
await checkLiveComparisonContract();

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

async function checkFailureMetadataNormalization() {
  const orchestrator = createOrchestrator();
  const emptyText = await orchestrator.synthesize({
    provider: 'mock',
    text: '  '
  });
  assert(emptyText.error?.code === 'TTS_TEXT_REQUIRED', '空文本应返回 TTS_TEXT_REQUIRED。');
  assert(emptyText.metadata?.provider === 'mock', '已注册 provider 的空文本失败也应保留统一 metadata。');
  assert(emptyText.metadata?.sampleRate === 16000, '失败 metadata 应保留 provider sampleRate。');

  orchestrator.registry.get('mock').synthesize = async () => null;
  const invalidResult = await orchestrator.synthesize({
    provider: 'mock',
    text: 'invalid provider result'
  });
  assert(invalidResult.error?.code === 'TTS_INVALID_RESPONSE', '空 provider result 应归一为 TTS_INVALID_RESPONSE。');
  assert(invalidResult.metadata?.provider === 'mock', '非法 provider result 也应保留统一 metadata。');
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

async function checkQwen3RequestMapping() {
  const requests = [];
  const signedAudioUrl = 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/qwen.wav?Signature=test';
  const orchestrator = createOrchestrator({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === signedAudioUrl) return createBinaryResponse(createMockWavBuffer(), 'audio/wav');
      return createJsonResponse({
        status_code: 200,
        output: {
          finish_reason: 'stop',
          audio: { data: '', url: signedAudioUrl }
        },
        usage: { characters: 12 }
      });
    }
  });
  const provider = orchestrator.registry.get('qwen3_tts');
  provider.baseUrl = 'https://dashscope-intl.aliyuncs.test/api/v1';
  provider.apiKey = 'qwen3_test_key';
  provider.model = 'qwen3-tts-flash';
  provider.defaultVoice = 'Cherry';
  provider.languageType = 'Chinese';
  provider.sampleRate = 24000;

  const result = await orchestrator.synthesize({
    provider: 'qwen3_tts',
    text: '请温柔地说一句中文。',
    emotion: 'warm',
    tone: 'gentle',
    model: 'client-model-must-not-win',
    voiceId: 'client-voice-must-not-win',
    prosody: { rate: 1.1, pitch: 1, volume: 1 }
  });

  const request = requests[0];
  const requestBody = JSON.parse(request.options.body);
  assert(result.tts_status === 'ok', 'Qwen3-TTS fake official response 应返回 ok。');
  assert(request.url === 'https://dashscope-intl.aliyuncs.test/api/v1/services/aigc/multimodal-generation/generation', 'Qwen3-TTS 应调用 DashScope 原生 generation endpoint。');
  assert(requestBody.model === 'qwen3-tts-flash', 'Qwen3-TTS model 必须来自后端配置。');
  assert(requestBody.input.voice === 'Cherry', 'Qwen3-TTS voice 必须来自后端配置。');
  assert(requestBody.input.language_type === 'Chinese', 'Qwen3-TTS 应显式指定中文 language_type。');
  assert(requestBody.input.text === '请温柔地说一句中文。', 'Qwen3-TTS 应映射 Alice 文本。');
  assert(!request.options.body.includes('client-model-must-not-win') && !request.options.body.includes('client-voice-must-not-win'), 'Qwen3-TTS 不得接受客户端覆盖 model / voice。');
  assert(requests[1]?.url === signedAudioUrl, 'Qwen3-TTS 应在后端下载官方返回的签名音频 URL。');
  assert(result.audioUrl === null && Boolean(result.audioBase64), 'Qwen3-TTS 不得把签名音频 URL 暴露到前端。');
  assert(result.streaming === false, 'Qwen3-TTS 本轮 Base64 Audio Result 必须保持 client streaming=false。');
  assert(result.metadata?.provider === 'qwen3_tts', '统一 metadata 必须记录 Qwen3-TTS provider。');
  assert(result.metadata?.model === 'qwen3-tts-flash', '统一 metadata 必须记录实际 Qwen3-TTS model。');
  assert(result.metadata?.voice === 'Cherry', '统一 metadata 必须记录实际 Qwen3-TTS voice。');
  assert(result.metadata?.supportsStreaming === true, '统一 metadata 必须记录远程 upstream streaming capability。');
  assert(result.metadata?.supportsVoiceClone === false, '默认 Qwen3-TTS Flash system voice 不应冒充 voice clone model。');
  assert(result.metadata?.supportsEmotion === false, '默认 Qwen3-TTS Flash 不应冒充 instruct model。');
  assert(result.metadata?.sampleRate === 24000, '统一 metadata 必须记录 Qwen3-TTS sampleRate。');
  assert(Number.isFinite(result.metadata?.latency?.synthesisMs), '统一 metadata 必须记录 synthesis latency。');
  assert(Number.isFinite(result.metadata?.latency?.fullGenerationMs), '统一 metadata 必须记录 full generation latency。');
  assert(Number.isFinite(result.metadata?.timings?.generationResponseMs), 'Qwen3-TTS adapter 必须记录生成响应耗时。');
  assert(!JSON.stringify(result).includes('qwen3_test_key') && !JSON.stringify(result).includes('Signature=test'), 'Qwen3-TTS Audio Result 不应泄露 API Key 或签名 URL。');

  provider.model = 'qwen3-tts-instruct-flash';
  assert(provider.getCapabilities().supportsEmotion === true, 'Qwen3-TTS Instruct model 应声明 emotion/instruction capability。');
}

async function checkQwen3Failure() {
  const orchestrator = createOrchestrator({
    fetchImpl: async () => createErrorResponse(503, 'temporary qwen upstream failure')
  });
  const provider = orchestrator.registry.get('qwen3_tts');
  provider.baseUrl = 'https://dashscope-intl.aliyuncs.test/api/v1';
  provider.apiKey = 'qwen3_test_key';
  provider.model = 'qwen3-tts-flash';
  provider.defaultVoice = 'Cherry';

  const result = await orchestrator.synthesize({
    provider: 'qwen3_tts',
    text: 'Qwen3 远程故障回归'
  });
  assert(result.tts_status === 'failed', 'Qwen3-TTS 上游故障应返回 failed 供现有 Web fallback 使用。');
  assert(result.error?.code === 'TTS_UPSTREAM_ERROR', 'Qwen3-TTS 上游故障应归一为 TTS_UPSTREAM_ERROR。');
  assert(result.metadata?.provider === 'qwen3_tts', 'Qwen3-TTS 故障结果也应保留安全 metadata。');
}

async function checkFishAudioRequestMapping() {
  let request = null;
  const orchestrator = createOrchestrator({
    fetchImpl: async (url, options) => {
      request = { url, headers: options.headers, body: JSON.parse(options.body) };
      return createBinaryResponse(createMockMp3Buffer(), 'audio/mpeg');
    }
  });
  const provider = orchestrator.registry.get('fish_audio');
  provider.baseUrl = 'https://api.fish.test';
  provider.apiKey = 'fish_test_key';
  provider.model = 's2.1-pro-free';
  provider.defaultVoice = 'fish-voice-model-id';
  provider.sampleRate = 44100;

  const result = await orchestrator.synthesize({
    provider: 'fish_audio',
    text: '你好，我是 Alice。',
    model: 'client-model-must-not-win',
    voiceId: 'client-voice-must-not-win',
    prosody: { rate: 1.1, pitch: 1, volume: 1 }
  });

  assert(result.tts_status === 'ok', 'Fish Audio fake binary response 应返回 ok。');
  assert(request.url === 'https://api.fish.test/v1/tts', 'Fish Audio 应调用原生 /v1/tts endpoint。');
  assert(request.headers.model === 's2.1-pro-free', 'Fish Audio model 必须通过官方 model header 且来自后端配置。');
  assert(request.body.reference_id === 'fish-voice-model-id', 'Fish Audio reference_id 必须来自后端 voice 配置。');
  assert(request.body.text === '你好，我是 Alice。', 'Fish Audio 应映射 Alice 文本。');
  assert(request.body.format === 'mp3' && request.body.sample_rate === 44100, 'Fish Audio format/sample rate 必须来自后端配置。');
  assert(!JSON.stringify(request.body).includes('client-model-must-not-win') && !JSON.stringify(request.body).includes('client-voice-must-not-win'), 'Fish Audio 不得接受客户端覆盖 model / voice。');
  assert(result.streaming === false, 'Fish Audio 本轮 Base64 Audio Result 必须保持 client streaming=false。');
  assert(result.metadata?.provider === 'fish_audio', '统一 metadata 必须记录 Fish Audio provider。');
  assert(result.metadata?.model === 's2.1-pro-free', '统一 metadata 必须记录 Fish Audio model。');
  assert(result.metadata?.voice === 'fish-voice-model-id', '统一 metadata 必须记录 Fish Audio voice。');
  assert(result.metadata?.supportsStreaming === true, 'Fish Audio 应记录 upstream streaming capability。');
  assert(result.metadata?.supportsVoiceClone === true, 'Fish Audio 应记录 voice clone capability。');
  assert(result.metadata?.supportsEmotion === false, 'Fish Audio 当前原生 API 无 emotion 字段，不应冒充 emotion capability。');
  assert(result.metadata?.sampleRate === 44100, '统一 metadata 必须记录 Fish Audio sampleRate。');
  assert(Number.isFinite(result.metadata?.timings?.upstreamFirstChunkMs), 'Fish Audio adapter 必须记录上游首 chunk 耗时。');
  assert(!JSON.stringify(result).includes('fish_test_key'), 'Fish Audio Audio Result 不应泄露 API Key。');
}

async function checkFishAudioFailure() {
  const orchestrator = createOrchestrator({
    fetchImpl: async () => createErrorResponse(503, 'temporary fish upstream failure')
  });
  const provider = orchestrator.registry.get('fish_audio');
  provider.baseUrl = 'https://api.fish.test';
  provider.apiKey = 'fish_test_key';
  provider.model = 's2.1-pro-free';
  provider.defaultVoice = 'fish-voice-model-id';

  const result = await orchestrator.synthesize({
    provider: 'fish_audio',
    text: 'Fish Audio 远程故障回归'
  });
  assert(result.tts_status === 'failed', 'Fish Audio 上游故障应返回 failed 供现有 Web fallback 使用。');
  assert(result.error?.code === 'TTS_UPSTREAM_ERROR', 'Fish Audio 上游故障应归一为 TTS_UPSTREAM_ERROR。');
  assert(result.metadata?.provider === 'fish_audio', 'Fish Audio 故障结果也应保留安全 metadata。');
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
  ['mock', 'cosyvoice', 'qwen3_tts', 'fish_audio', 'higgs', 'openai', 'minimax'].forEach((provider) => {
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
  assert(registry.includes("id: 'mock'") && registry.includes("id: 'cosyvoice'") && registry.includes("id: 'qwen3_tts'") && registry.includes("id: 'fish_audio'"), '前端 TTS registry 必须识别公开 backend TTS provider。');
  assert(!/id:\s*['"`](higgs|openai|minimax)['"`]/i.test(registry), '前端 TTS registry 当前不应暴露 higgs/openai/minimax provider。');
  assert(route.includes("'mock'") && route.includes("'cosyvoice'") && route.includes("'qwen3_tts'") && route.includes("'fish_audio'") && route.includes('publicTTSProviders'), '/api/tts 必须对白名单 provider 做集中校验。');
  assert(registry.includes("responseFormat: 'json'"), '前端 backend TTS payload 必须请求统一 JSON Audio Result。');
  assert(!/COSYVOICE_API_KEY|QWEN3_TTS_API_KEY|DASHSCOPE_API_KEY|QWEN_API_KEY|FISH_AUDIO_API_KEY|FISH_AUDIO_TTS_BASE_URL|HIGGS_API_KEY/.test(registry), '前端 registry 不应出现后端 TTS secret 或 URL 环境变量名。');
}

async function checkEnvExample() {
  const source = await readFile('.env.example', 'utf8');
  const serverConfig = await readFile('backend/config/serverConfig.js', 'utf8');
  [
    'TTS_PROVIDER=mock',
    'COSYVOICE_BASE_URL=',
    'COSYVOICE_API_STYLE=official_fastapi',
    'COSYVOICE_API_MODE=sft',
    'COSYVOICE_MODEL=iic/CosyVoice2-0.5B',
    'TTS_UPSTREAM_TIMEOUT_MS=90000',
    'QWEN3_TTS_API_KEY=replace_with_your_key',
    'QWEN3_TTS_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1',
    'QWEN3_TTS_MODEL=qwen3-tts-flash',
    'QWEN3_TTS_VOICE=Cherry',
    'FISH_AUDIO_API_KEY=replace_with_your_key',
    'FISH_AUDIO_TTS_BASE_URL=https://api.fish.audio',
    'FISH_AUDIO_TTS_MODEL=s2.1-pro-free',
    'FISH_AUDIO_TTS_VOICE=replace_with_voice_model_id',
    'HIGGS_BASE_URL=',
    'HIGGS_MODEL=higgs-audio-v3'
  ].forEach((snippet) => {
    assert(source.includes(snippet), `.env.example 必须包含 ${snippet}`);
  });
  assert(
    serverConfig.includes('process.env[ttsQwen3ApiKeyEnv]')
      && serverConfig.includes('process.env.DASHSCOPE_API_KEY')
      && serverConfig.includes('process.env.QWEN_API_KEY'),
    'Qwen3-TTS 后端 Key 必须支持专用 Key、DashScope 标准 Key 与已有后端 Qwen Key，且由 provider 拒绝 placeholder。'
  );
}

async function checkLiveComparisonContract() {
  const liveCheck = await readFile('scripts/check-tts-live.mjs', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert(
    packageJson.scripts?.['check:tts-compare-live']?.includes('--providers=cosyvoice,qwen3_tts,fish_audio')
      && packageJson.scripts?.['check:tts-compare-live']?.includes('--repeats=2')
      && packageJson.scripts?.['check:tts-compare-live']?.includes('--require-all'),
    '真实 TTS 对照命令必须严格运行 CosyVoice2 / Qwen3-TTS / Fish Audio 各两轮。'
  );
  assert(liveCheck.includes('alice.tts-live-comparison.v2'), '真实 TTS 对照报告必须使用稳定 schema。');
  assert(liveCheck.includes('comparisons'), '真实 TTS 对照报告必须支持多个远程 provider 与同一 local baseline 比较。');
  assert(liveCheck.includes('firstChunkP50DeltaMs') && liveCheck.includes('fullGenerationP50DeltaMs'), '真实 TTS 对照报告必须记录首 chunk / 完整生成差值。');
  assert(liveCheck.includes('invalid_wav_signature') && liveCheck.includes('invalid_mp3_signature'), '真实 TTS 检查必须验证常用音频格式签名，不能只检查 Base64 非空。');
  assert(liveCheck.includes('textLength') && !liveCheck.includes('apiKey:'), '真实 TTS 对照报告不得写入 Key，并只记录文本长度。');
}

function createOrchestrator(options = {}) {
  const registry = createTTSProviderRegistry(options);
  return new TTSOrchestrator({ registry });
}

function createBinaryResponse(value, contentType = 'audio/mpeg') {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : '';
      }
    },
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function createMockWavBuffer() {
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(0, 40);
  return buffer;
}

function createMockMp3Buffer() {
  const buffer = Buffer.alloc(128);
  buffer.write('ID3', 0, 'ascii');
  return buffer;
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

function createErrorResponse(status, text) {
  return {
    ok: false,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'text/plain' : '';
      }
    },
    text: async () => text
  };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
