import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { TTSOrchestrator } from '../../backend/services/tts/TTSOrchestrator.js';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const allProviders = ['cosyvoice', 'voxcpm2'];
const providers = resolveProviders();
const outputDir = resolveOutputDir();
const corpus = [
  { id: 'short_4_8', category: '4-8字', text: '你好，欢迎回来。' },
  { id: 'medium_10_20', category: '10-20字', text: '今天也想陪你安静地聊一会儿。' },
  { id: 'long_30_60', category: '30-60字', text: '如果你今天有点累，我们可以先不着急解决任何事，就安静地说说你此刻的心情。' },
  { id: 'very_long', category: '长回复', text: '有时候我们以为自己需要一个立刻解决问题的答案，其实更需要的可能是一个可以慢慢说话的空间。你可以从今天最让你在意的那个瞬间开始，不用担心说得是否完整，我会跟着你的节奏听下去，也会在你需要停下来的时候留出安静。' }
];
const continuityTexts = [
  '早上好，今天也一起加油。',
  '我在这里，你可以慢慢说。',
  '先深呼吸一下，不用着急。',
  '今天有什么让你觉得开心的事吗？',
  '听起来你已经努力了很久。',
  '如果愿意，我们可以把它拆小一点。',
  '不想回答也没关系，我会陪着你。',
  '你刚才说的那个细节，我记住了。',
  '我们先做当下最重要的一步。',
  '谢谢你告诉我，我会认真听。'
];

const orchestrator = new TTSOrchestrator();
const preflight = await readPreflight();
const failures = preflight
  .filter((item) => !item.configured || !item.healthy)
  .map((item) => `${item.provider}: ${item.status}/${item.reason}`);

if (failures.length) {
  console.error('[tts-local-race] preflight failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const attempts = [];
for (const provider of providers) {
  const cases = [
    ...corpus.map((item) => ({ ...item, phase: 'corpus' })),
    ...continuityTexts.map((text, index) => ({
      id: `continuous_${String(index + 1).padStart(2, '0')}`,
      category: '连续10次',
      text,
      phase: 'continuous'
    }))
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    const attempt = await runAttempt(provider, item, index + 1);
    attempts.push(attempt);
    const marker = attempt.ok ? 'ok' : 'failed';
    console.log(`[tts-local-race] ${provider} ${item.id} ${marker} readyMs=${attempt.requestToFirstPlayableMs ?? '-'} generationMs=${attempt.fullAudioReadyMs ?? '-'} durationMs=${attempt.audioDurationMs ?? '-'} rtf=${attempt.rtf ?? '-'} peakRssBytes=${attempt.peakRssBytes ?? '-'}`);
  }
}

const report = createReport({ preflight, attempts });
await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputDir, 'LISTENING_REVIEW.md'), renderListeningReview(report), 'utf8');
console.log(`[tts-local-race] report=${path.join(outputDir, 'report.json')}`);
console.log(`[tts-local-race] listening=${path.join(outputDir, 'LISTENING_REVIEW.md')}`);
if (!report.passed) process.exit(1);

async function runAttempt(provider, item, sequence) {
  const pid = await readProviderPid(provider);
  const monitor = startMemoryMonitor(pid);
  const startedAt = performance.now();
  let result;
  try {
    result = await orchestrator.synthesize({
      provider,
      text: item.text,
      locale: 'zh-CN',
      emotion: 'neutral',
      tone: 'calm',
      prosody: { rate: 1, pitch: 1, volume: 1 },
      stream: false
    }, { allowLocalFallback: false });
  } finally {
    await monitor.stop();
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  const filename = `${provider}-${String(sequence).padStart(2, '0')}-${item.id}.wav`;
  const outputFile = path.join(outputDir, filename);
  const buffer = result?.audioBase64 ? Buffer.from(result.audioBase64, 'base64') : null;
  const wav = buffer ? inspectWav(buffer) : null;
  if (buffer && wav) await writeFile(outputFile, buffer);
  const latency = result?.metadata?.latency || {};
  const runtime = result?.metadata?.runtime || {};
  const generationMs = finite(runtime.modelGenerationMs) ?? finite(latency.fullGenerationMs) ?? elapsedMs;
  const audioDurationMs = wav?.durationMs ?? finite(runtime.audioDurationMs);
  const peakRssBytes = maxFinite([monitor.peakRssBytes, runtime.peakRssBytes]);
  return {
    provider,
    caseId: item.id,
    category: item.category,
    phase: item.phase,
    text: item.text,
    textLength: [...item.text].length,
    ok: result?.tts_status === 'ok' && Boolean(wav),
    status: result?.tts_status || 'invalid',
    errorCode: result?.error?.code || null,
    outputFile: buffer && wav ? filename : null,
    sampleRate: wav?.sampleRate || result?.sampleRate || null,
    audioBytes: buffer?.byteLength || 0,
    audioDurationMs,
    modelFirstChunkMs: finite(runtime.modelFirstChunkMs) ?? finite(latency.upstreamFirstChunkMs),
    requestToFirstPlayableMs: finite(latency.audioResultReadyMs) ?? elapsedMs,
    fullAudioReadyMs: finite(latency.fullGenerationMs) ?? elapsedMs,
    providerGenerationMs: generationMs,
    rtf: finite(runtime.rtf) ?? ratio(generationMs, audioDurationMs),
    peakRssBytes,
    segmentGapMs: item.phase === 'corpus' && item.id !== 'short_4_8' ? null : 0,
    runtimeDevice: runtime.device || null,
    voiceCloneApplied: runtime.voiceCloneApplied === true
  };
}

async function readPreflight() {
  const statuses = new Map(orchestrator.getProviderStatus().map((item) => [item.provider, item]));
  const health = new Map((await orchestrator.getProviderHealth()).map((item) => [item.provider, item]));
  return providers.map((provider) => {
    const status = statuses.get(provider) || {};
    const live = health.get(provider) || {};
    return {
      provider,
      configured: status.configured === true,
      healthy: live.healthy === true,
      status: live.status || status.status || 'unknown',
      reason: live.reason || status.status || 'unknown',
      model: status.defaultModel || null,
      voice: status.defaultVoice || null,
      sampleRate: status.sampleRate || null,
      runtimeReady: live.live === true,
      runtimeReadyMs: finite(process.env.TTS_LOCAL_RACE_RUNTIME_READY_MS),
      runtimeLoadMs: finite(live.loadMs),
      runtimeDevice: live.device || null,
      voiceCloneConfigured: live.voiceCloneConfigured === true
    };
  });
}

function createReport({ preflight, attempts }) {
  const summary = Object.fromEntries(providers.map((provider) => {
    const rows = attempts.filter((item) => item.provider === provider);
    const ok = rows.filter((item) => item.ok);
    const corpusRows = ok.filter((item) => item.phase === 'corpus');
    const continuousRows = rows.filter((item) => item.phase === 'continuous');
    return [provider, {
      attempts: rows.length,
      successes: ok.length,
      failureRate: rows.length ? Number(((rows.length - ok.length) / rows.length).toFixed(4)) : null,
      continuousSuccesses: continuousRows.filter((item) => item.ok).length,
      continuousAttempts: continuousRows.length,
      warmRequestToFirstPlayableP50Ms: median(ok.slice(1).map((item) => item.requestToFirstPlayableMs)),
      fullAudioReadyP50Ms: median(ok.map((item) => item.fullAudioReadyMs)),
      rtfP50: medianDecimal(ok.map((item) => item.rtf)),
      peakRssBytes: maxFinite(ok.map((item) => item.peakRssBytes)),
      corpus: Object.fromEntries(corpusRows.map((item) => [item.caseId, {
        requestToFirstPlayableMs: item.requestToFirstPlayableMs,
        fullAudioReadyMs: item.fullAudioReadyMs,
        audioDurationMs: item.audioDurationMs,
        rtf: item.rtf,
        peakRssBytes: item.peakRssBytes,
        segmentGapMs: item.segmentGapMs,
        outputFile: item.outputFile
      }]))
    }];
  }));
  return {
    schema: 'alice.tts-local-race.v1',
    generatedAt: new Date().toISOString(),
    fairness: {
      sameChineseCorpus: true,
      aliceProsody: { rate: 1, pitch: 1, volume: 1, emotion: 'neutral', tone: 'calm' },
      providerNativeGenerationDefaultsUnchanged: true,
      clientStreamingRewritten: false,
      note: 'Alice still consumes complete Audio Result; model first chunk and request-to-playable are reported separately.'
    },
    preflight,
    corpus,
    continuousCount: continuityTexts.length,
    attempts,
    summary,
    browserLifecycle: {
      cancel: null,
      mute: null,
      fallback: null,
      finalIdle: null,
      segmentGapMs: null,
      note: 'Filled only by the separate real browser acceptance; direct runtime numbers cannot prove UI lifecycle.'
    },
    qualityReview: {
      status: 'pending_blind_listening',
      dimensions: ['音质', '中文自然度', '韵律', '角色一致性', '杂音/断裂'],
      note: 'Naturalness is not inferred from latency or WAV validity. Use LISTENING_REVIEW.md and record a human result.'
    },
    passed: providers.every((provider) => summary[provider]?.failureRate === 0)
      && providers.every((provider) => summary[provider]?.continuousSuccesses === continuityTexts.length)
  };
}

function renderListeningReview(report) {
  const lines = [
    '# CosyVoice2 vs VoxCPM2 盲听记录',
    '',
    '不看 Provider 名称，逐条播放对应 WAV，对音质、中文自然度、韵律、角色一致性、杂音/断裂各打 1–5 分。',
    '',
    '| 语料 | A | B | 偏好 | 评语 |',
    '| --- | --- | --- | --- | --- |'
  ];
  corpus.forEach((item, index) => {
    const aProvider = index % 2 === 0 ? 'cosyvoice' : 'voxcpm2';
    const bProvider = aProvider === 'cosyvoice' ? 'voxcpm2' : 'cosyvoice';
    const a = report.attempts.find((row) => row.provider === aProvider && row.caseId === item.id);
    const b = report.attempts.find((row) => row.provider === bProvider && row.caseId === item.id);
    lines.push(`| ${item.category} | ${a?.outputFile || '-'} | ${b?.outputFile || '-'} | 待填 | 待填 |`);
  });
  lines.push('', 'A/B 映射仅供评分后核对：', '');
  corpus.forEach((item, index) => {
    lines.push(`- ${item.id}: A=${index % 2 === 0 ? 'cosyvoice' : 'voxcpm2'}, B=${index % 2 === 0 ? 'voxcpm2' : 'cosyvoice'}`);
  });
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function startMemoryMonitor(pid) {
  let peakRssBytes = null;
  let running = true;
  let inFlight = false;
  const sample = async () => {
    if (!running || inFlight || !pid) return;
    inFlight = true;
    try {
      const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
      const rssKb = Number(String(stdout).trim());
      if (Number.isFinite(rssKb)) peakRssBytes = Math.max(peakRssBytes || 0, rssKb * 1024);
    } catch {
      // Provider result may still include its own peak RSS metric.
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(() => void sample(), 200);
  void sample();
  return {
    get peakRssBytes() { return peakRssBytes; },
    async stop() {
      running = false;
      clearInterval(timer);
      while (inFlight) await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
}

async function readProviderPid(provider) {
  const file = provider === 'cosyvoice'
    ? path.join(rootDir, 'runtime/cosyvoice/cosyvoice-fastapi.pid')
    : path.join(rootDir, 'runtime/voxcpm2/voxcpm2-local.pid');
  try {
    return Number((await readFile(file, 'utf8')).trim()) || null;
  } catch {
    return null;
  }
}

function inspectWav(buffer) {
  if (buffer.byteLength < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  let offset = 12;
  let dataBytes = null;
  while (offset + 8 <= buffer.byteLength) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') {
      dataBytes = Math.min(size, Math.max(0, buffer.byteLength - offset - 8));
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!dataBytes || !sampleRate || !channels || !bitsPerSample) return null;
  return {
    sampleRate,
    durationMs: Math.round(dataBytes / channels / (bitsPerSample / 8) / sampleRate * 1000)
  };
}

function resolveOutputDir() {
  const explicit = getArgValue('--output-dir') || process.env.TTS_LOCAL_RACE_OUTPUT_DIR || '';
  if (explicit) return path.resolve(rootDir, explicit);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(rootDir, 'runtime/tts/local-race', stamp);
}

function resolveProviders() {
  const requested = getArgValue('--provider') || process.env.TTS_LOCAL_RACE_PROVIDER || '';
  if (!requested) return [...allProviders];
  const normalized = String(requested).trim().toLowerCase();
  if (!allProviders.includes(normalized)) {
    throw new Error(`Unsupported local race provider: ${normalized}`);
  }
  return [normalized];
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ratio(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) return null;
  return Number((left / right).toFixed(4));
}

function maxFinite(values) {
  const filtered = values.filter(Number.isFinite);
  return filtered.length ? Math.max(...filtered) : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function medianDecimal(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Number(value.toFixed(4));
}
