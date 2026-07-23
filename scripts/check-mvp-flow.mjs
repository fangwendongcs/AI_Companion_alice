import { AudioManager } from '../js/audio/AudioManager.js';
import { DialogueManager } from '../js/dialogue/DialogueManager.js';
import { EventBus } from '../js/core/EventBus.js';
import { EVENT_NAMES } from '../js/core/events/eventNames.js';
import { LLMClient } from '../js/ai/LLMClient.js';
import { normalizeApiResponse } from '../js/services/api/ApiClient.js';
import { getSegmentedPlaybackProfile, segmentTextForTTS } from '../js/voice/TTSTextSegmenter.js';
import { TTSService } from '../js/voice/TTSService.js';

const failures = [];

await checkDialogueSuccessFlow();
await checkDialogueErrorFlow();
await checkLLMClientDialogueResponseFlow();
await checkLLMClientMemoryRequestFlow();
await checkLLMClientLegacyResponseFlow();
await checkLLMClientDialogueErrorFlow();
await checkDialogueMemoryEventFlow();
await checkAudioSuccessFlow();
await checkAudioMutedFlow();
await checkAudioActiveMutedFlow();
await checkAudioReplacementCleanupFlow();
await checkAudioFallbackFlow();
await checkAudioUnexpectedErrorFlow();
await checkTTSPlaybackLifecycle();
await checkSegmentedTTSLifecycle();

if (failures.length) {
  console.error('[check-mvp-flow] MVP 主链路验收失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-mvp-flow] ok');

async function checkDialogueSuccessFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.DIALOGUE_USER,
    EVENT_NAMES.DIALOGUE_THINKING,
    EVENT_NAMES.DIALOGUE_ASSISTANT,
    EVENT_NAMES.DIALOGUE_RESPONSE
  ]);
  const dialogue = new DialogueManager({
    eventBus: bus,
    llmClient: {
      chat: async () => '你好呀'
    }
  });

  const reply = await dialogue.send('你好');
  assert(reply === '你好呀', 'DialogueManager 成功返回时必须透传回复文本。');
  assertEventOrder(events, [
    EVENT_NAMES.DIALOGUE_USER,
    EVENT_NAMES.DIALOGUE_THINKING,
    EVENT_NAMES.DIALOGUE_ASSISTANT,
    EVENT_NAMES.DIALOGUE_RESPONSE,
    EVENT_NAMES.DIALOGUE_THINKING
  ], 'DialogueManager 成功链路事件顺序异常。');
  assert(events[1]?.detail?.active === true, 'DialogueManager 成功链路必须先进入 thinking。');
  assert(events.at(-1)?.detail?.active === false, 'DialogueManager 成功链路必须退出 thinking。');
}

async function checkDialogueErrorFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.DIALOGUE_USER,
    EVENT_NAMES.DIALOGUE_THINKING,
    EVENT_NAMES.DIALOGUE_ERROR
  ]);
  const dialogue = new DialogueManager({
    eventBus: bus,
    llmClient: {
      chat: async () => {
        throw new Error('llm down');
      }
    }
  });

  let rejected = false;
  try {
    await dialogue.send('测试失败');
  } catch {
    rejected = true;
  }

  assert(rejected, 'DialogueManager 错误链路必须把异常继续抛给调用方。');
  assertEventOrder(events, [
    EVENT_NAMES.DIALOGUE_USER,
    EVENT_NAMES.DIALOGUE_THINKING,
    EVENT_NAMES.DIALOGUE_ERROR,
    EVENT_NAMES.DIALOGUE_THINKING
  ], 'DialogueManager 错误链路事件顺序异常。');
  assert(events[1]?.detail?.active === true, 'DialogueManager 错误链路必须先进入 thinking。');
  assert(events.at(-1)?.detail?.active === false, 'DialogueManager 错误链路必须退出 thinking。');
}

async function checkLLMClientDialogueResponseFlow() {
  const client = new LLMClient('/api/dialogue', {
    apiClient: createFakeApiClient({
      ok: true,
      data: {
        reply: '统一入口回复',
        meta: { mode: 'llm_stub' }
      }
    })
  });

  const reply = await client.chat('你好', {
    provider: 'stub',
    model: 'stub',
    systemPrompt: ''
  });
  assert(reply === '统一入口回复', 'LLMClient 必须能解析 /api/dialogue 的 { ok, data.reply }。');

  const contractClient = new LLMClient('/api/dialogue', {
    apiClient: createFakeApiClient({
      ok: true,
      data: {
        reply_text: '跨端契约回复',
        contract: { version: 'dialogue.v1' }
      }
    })
  });
  const contractReply = await contractClient.chat('你好', {
    provider: 'stub',
    model: 'stub',
    systemPrompt: ''
  });
  assert(contractReply === '跨端契约回复', 'LLMClient 必须兼容 /api/dialogue 的 reply_text。');
}

async function checkLLMClientMemoryRequestFlow() {
  let requestBody = null;
  const client = new LLMClient('/api/dialogue', {
    apiClient: {
      json: async (_endpoint, options) => {
        requestBody = options.body;
        return {
          reply: '带记忆回复',
          memory: {
            used: true,
            sessionId: 'session-test',
            turnCount: 1
          }
        };
      }
    }
  });

  const reply = await client.chat('记住我喜欢蓝色', {
    provider: 'stub',
    model: 'stub',
    systemPrompt: '',
    useMemory: true,
    sessionId: 'session-test'
  });

  assert(reply === '带记忆回复', 'LLMClient 必须继续返回回复文本。');
  assert(requestBody?.sessionId === 'session-test', 'LLMClient 必须向 /api/dialogue 传递 sessionId。');
  assert(requestBody?.options?.useMemory === true, 'LLMClient 必须向 /api/dialogue 传递 options.useMemory。');
  assert(client.getLastResponse()?.memory?.turnCount === 1, 'LLMClient 必须保留最近一次 dialogue memory 元数据。');
}

async function checkLLMClientLegacyResponseFlow() {
  const client = new LLMClient('/api/chat', {
    apiClient: createFakeApiClient({
      reply: '旧入口回复'
    })
  });

  const reply = await client.chat('你好', {
    provider: 'stub',
    model: 'stub',
    systemPrompt: ''
  });
  assert(reply === '旧入口回复', 'LLMClient 必须继续兼容 /api/chat 的 { reply }。');
}

async function checkLLMClientDialogueErrorFlow() {
  const client = new LLMClient('/api/dialogue', {
    apiClient: createFakeApiClient({
      ok: false,
      error: {
        code: 'LLM_NOT_CONFIGURED',
        message: 'Missing API key.'
      }
    })
  });

  let error = null;
  try {
    await client.chat('你好', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: ''
    });
  } catch (caught) {
    error = caught;
  }

  assert(error?.code === 'LLM_NOT_CONFIGURED', 'LLMClient 必须把 { ok:false, error } 转成稳定错误。');
  assert(error?.message === 'Missing API key.', 'LLMClient 错误消息不应变成 [object Object]。');
}

async function checkDialogueMemoryEventFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.DIALOGUE_ASSISTANT,
    EVENT_NAMES.DIALOGUE_RESPONSE
  ]);
  const dialogue = new DialogueManager({
    eventBus: bus,
    llmClient: {
      chat: async () => '记忆事件回复',
      getLastResponse: () => ({
        reply: '记忆事件回复',
        memory: {
          used: true,
          sessionId: 'session-event',
          turnCount: 2
        }
      })
    }
  });

  await dialogue.send('继续刚才的话');

  assert(events[0]?.detail?.memory?.sessionId === 'session-event', 'DialogueManager 必须在 assistant 事件中携带 memory 状态。');
  assert(events[1]?.detail?.memory?.turnCount === 2, 'DialogueManager 必须在 response 事件中携带 memory turnCount。');
}

function createFakeApiClient(payload) {
  return {
    json: async (_endpoint, _options) => normalizeApiResponse(payload, { source: 'dialogue' })
  };
}

async function checkAudioSuccessFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_END
  ]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'browser' }),
    ttsService: {
      speak: async (_text, _config, hooks) => {
        hooks.onStart?.();
        hooks.onEnd?.();
      }
    }
  });

  await manager.speak('你好');
  assertEventOrder(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_END
  ], 'AudioManager 成功链路事件顺序异常。');
}

async function checkAudioMutedFlow() {
  const events = [];
  let invoked = false;
  const bus = createTrackedBus(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_END
  ]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'browser' }),
    ttsService: {
      speak: async () => {
        invoked = true;
      }
    }
  });

  await manager.speak('静音测试', { muted: true });
  assert(invoked === false, 'AudioManager 静音时不应调用 TTSService。');
  assert(events.length === 0, 'AudioManager 静音时不应发出音频事件。');
}

async function checkAudioActiveMutedFlow() {
  const events = [];
  const bus = createTrackedBus(events, [EVENT_NAMES.AUDIO_END]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'cosyvoice' }),
    ttsService: {
      stop: () => true,
      speak: async () => {
        throw new Error('静音时不应启动新播放');
      }
    }
  });

  await manager.speak('活动播放静音', { muted: true });
  assertEventOrder(events, [EVENT_NAMES.AUDIO_END], '活动播放被静音时必须发出 audio:end 清理表现层。');
  assert(events[0]?.detail?.cancelled === true, '静音取消的 audio:end 必须标记 cancelled=true。');
}

async function checkAudioReplacementCleanupFlow() {
  const events = [];
  let active = true;
  const bus = createTrackedBus(events, [
    EVENT_NAMES.AUDIO_END,
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START
  ]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'cosyvoice' }),
    ttsService: {
      stop: () => {
        const stopped = active;
        active = false;
        return stopped;
      },
      speak: async (_text, _config, hooks) => {
        hooks.onStart?.();
        hooks.onEnd?.();
      }
    }
  });

  await manager.speak('新语音替换旧语音');
  assertEventOrder(events, [
    EVENT_NAMES.AUDIO_END,
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_END
  ], '新语音必须先结束旧表现层周期，再启动新播放。');
  assert(events[0]?.detail?.cancelled === true, '替换旧语音的 audio:end 必须标记 cancelled=true。');
}

async function checkAudioFallbackFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_FALLBACK,
    EVENT_NAMES.AUDIO_END
  ]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'openai' }),
    ttsService: {
      speak: async (_text, _config, hooks) => {
        hooks.onStart?.();
        hooks.onFallback?.(new Error('backend unavailable'));
        hooks.onEnd?.();
      }
    }
  });

  await manager.speak('fallback');
  assertEventOrder(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_START,
    EVENT_NAMES.AUDIO_FALLBACK,
    EVENT_NAMES.AUDIO_END
  ], 'AudioManager fallback 链路事件顺序异常。');
  assert(events.at(-1)?.detail?.fallback === true, 'AudioManager fallback 后的 audio:end 必须标记 fallback=true。');
}

async function checkAudioUnexpectedErrorFlow() {
  const events = [];
  const bus = createTrackedBus(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_ERROR
  ]);
  const manager = new AudioManager({
    eventBus: bus,
    getConfig: () => ({ engine: 'browser' }),
    ttsService: {
      speak: async () => {
        throw new Error('speaker crashed');
      }
    }
  });

  await manager.speak('unexpected');
  assertEventOrder(events, [
    EVENT_NAMES.AUDIO_REQUEST,
    EVENT_NAMES.AUDIO_ERROR
  ], 'AudioManager 异常链路必须回到 audio:error。');
}

async function checkTTSPlaybackLifecycle() {
  const originalWindow = globalThis.window;
  const originalAudio = globalThis.Audio;
  const fakeSpeechSynthesis = {
    cancel() {},
    getVoices() {
      return [];
    }
  };
  globalThis.window = { speechSynthesis: fakeSpeechSynthesis };

  try {
    const service = new TTSService('/api/tts');
    const pending = [createDeferred(), createDeferred()];
    const lifecycle = [];
    let invocation = 0;
    service.speakWithBackend = async (_text, _config, _provider, { onStart } = {}) => {
      const index = invocation;
      invocation += 1;
      await pending[index].promise;
      onStart?.({ audioSource: { id: index } });
    };

    const first = service.speak('first', { engine: 'mock' }, {
      onStart: () => lifecycle.push('first:start'),
      onEnd: () => lifecycle.push('first:end')
    });
    const second = service.speak('second', { engine: 'mock' }, {
      onStart: () => lifecycle.push('second:start'),
      onEnd: () => lifecycle.push('second:end')
    });

    pending[1].resolve();
    await second;
    pending[0].resolve();
    await first;
    assert(
      JSON.stringify(lifecycle) === JSON.stringify(['second:start', 'second:end']),
      `新语音替代旧长音频请求后，不应收到陈旧 start/end。实际：${lifecycle.join(' -> ')}`
    );

    let fakeAudio = null;
    globalThis.Audio = class FakeAudio {
      constructor(url) {
        this.url = url;
        this.paused = false;
        this.onended = null;
        this.onerror = null;
        fakeAudio = this;
      }

      play() {
        return Promise.resolve();
      }

      pause() {
        this.paused = true;
      }
    };

    let audioSource = null;
    const playback = service.playAudioUrl('blob:test-audio', {
      onStart: (detail) => {
        audioSource = detail.audioSource;
      }
    });
    await Promise.resolve();
    await Promise.resolve();
    const stopped = service.stop();
    await playback;
    assert(stopped === true, 'TTSService.stop() 必须报告是否取消了活动播放。');
    assert(audioSource?.audioElement === fakeAudio, 'HTMLAudioElement 必须作为安全 audioSource 暴露给表现层。');
    assert(fakeAudio?.paused === true, 'stop() 必须暂停被替代的长音频。');
    assert(service.currentPlayback === null && service.currentAudio === null, '被替代的长音频 Promise 必须完成并清理当前播放引用。');
    service.destroy();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
}

async function checkSegmentedTTSLifecycle() {
  const originalWindow = globalThis.window;
  const originalAudio = globalThis.Audio;
  const originalAtob = globalThis.atob;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
  globalThis.window = {
    speechSynthesis: {
      cancel() {},
      getVoices() {
        return [];
      }
    }
  };
  globalThis.atob = (value) => Buffer.from(String(value), 'base64').toString('binary');
  globalThis.URL.createObjectURL = () => `blob:test-${Math.random()}`;
  globalThis.URL.revokeObjectURL = () => {};

  try {
    const longText = '我会先用一小段声音回应你，让你更快听到我。然后再继续把后面的内容按顺序说完，避免长回复必须等完整音频全部生成。最后整个回答仍然是同一次播放会话。';
    const segments = segmentTextForTTS(longText);
    const punctuationlessSegments = segmentTextForTTS('今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情也希望你能继续提醒我慢慢来先处理最重要的一件事');
    const shortWithoutBreakSegments = segmentTextForTTS('我想听你用温柔声音回应我一下好吗');
    const systemSegments = segmentTextForTTS('[SYSTEM]模型装载完毕，交互系统已激活。');
    const shortResponseSegments = segmentTextForTTS('我在这儿，先陪你慢慢呼吸一下。');
    const shortPunctuationSegments = segmentTextForTTS('别着急，我们先把注意力放回呼吸上。');
    const mediumWithoutBreakSegments = segmentTextForTTS('我会陪你把这件事慢慢拆开不需要一下子解决全部问题先处理最重要的部分');
    const naturalFirstSegments = segmentTextForTTS('好的，我在这里陪你。我们先慢慢呼吸一下，然后把今天最烦的一件事放到一边。你不用马上解决所有问题。');
    const veryShortSegments = segmentTextForTTS('我在这里陪你');
    const shortPlaybackProfile = getSegmentedPlaybackProfile('我在这儿，先陪你慢慢呼吸一下。');
    assert(segments.length > 1, '长回复应被拆成多个 TTS 分段。');
    assert(punctuationlessSegments.length > 1, '无标点长回复也应拆出快速首段。');
    assert(punctuationlessSegments[0].length <= 8, '快速首段必须足够短，避免首音继续等待完整长句生成。');
    assert(naturalFirstSegments[0] === '好的，我在这里陪你。', '中长回复首段应优先选择 8-14 字自然停顿，避免 5 字硬切造成段间空洞。');
    assert(veryShortSegments.length === 1, '12 字以内很短回复应保持单段。');
    assert(shortResponseSegments.length > 1, '13-24 字短回复应允许首段优先发声。');
    assert(shortPunctuationSegments.length > 1, '带自然停顿的 13-24 字短回复应允许自然首段优先发声。');
    assert(shortPunctuationSegments[0].endsWith('，'), '短回复首段应优先选择自然中文停顿。');
    assert(mediumWithoutBreakSegments.length > 1, '25 字以上无标点回复应拆出快速首段，避免首音等待完整中句生成。');
    assert(mediumWithoutBreakSegments[0].length <= 8, '25 字以上无标点回复首段应保持短小。');
    assert(!segmentTextForTTS('我会陪你。别着急，我们慢慢来。').some((segment) => segment === '。'), 'TTS 分段不应产生孤立标点段。');
    assert(shortWithoutBreakSegments.length > 1, '13-24 字无自然停顿短回复应拆出快速首段，避免首音等待整句生成。');
    assert(shortWithoutBreakSegments[0] === '我想听你用温柔声音', '无自然停顿短回复首段应保持短小，同时避免把“声音”等常见中文词切断。');
    assert(segmentTextForTTS('今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情').join('|') === '今天我有点累|想听你慢慢说几句|温柔的话陪我整理一下心情', '中等回复应优先按中文语义 cue 切分，并继续压短早期后续段，避免第二段过长导致播放空洞。');
    assert(segmentTextForTTS('今天我有点累。想听你慢慢说几句温柔的话。陪我整理一下心情。你可以先简单回应我。然后继续说一些让我安心的话。').join('|').startsWith('今天我有点累。|想听你慢慢说几句温柔的话。'), '长回复应保留自然句段，避免过碎分段造成后段排队。');
    assert(shortPlaybackProfile.isShortText && shortPlaybackProfile.maxInFlight === 2, '短回复应使用 2 路受控并发，避免本地 CosyVoice 过度争抢。');
    assert(!systemSegments.join('').includes('[SYSTEM]'), 'TTS 分段前应移除开头 SYSTEM 标签，避免语音读出或切碎标签。');
    assert(segmentTextForTTS('短句你好').length === 1, '短回复不应被不必要地拆分。');

    const requests = [];
    const starts = [];
    let endCount = 0;
    let pausedCount = 0;
    const firstResponse = createDeferred();
    globalThis.Audio = class FakeAudio {
      constructor(url) {
        this.url = url;
        this.paused = false;
        this.onended = null;
        this.onerror = null;
      }

      play() {
        setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }

      pause() {
        this.paused = true;
        pausedCount += 1;
      }
    };

    const service = new TTSService('/api/tts', {
      apiClient: {
        response: async (_endpoint, options = {}) => {
          requests.push(options.body?.text || '');
          if (requests.length === 1) return firstResponse.promise;
          return {
            headers: {
              get(name) {
                return String(name).toLowerCase() === 'content-type' ? 'application/json' : '';
              }
            },
            json: async () => ({
              ok: true,
              data: {
                tts_status: 'ok',
                provider: 'cosyvoice',
                format: 'wav',
                contentType: 'audio/wav',
                audioBase64: createSilentWavBase64(24000, 120),
                metadata: {
                  timings: {
                    upstreamReadMs: 3,
                    wavWrapMs: 1,
                    base64Ms: 1
                  }
                }
              }
            })
          };
        }
      }
    });

    const speech = service.speak(longText, {
      engine: 'cosyvoice',
      rate: 1,
      pitch: 1,
      segmentedTTSOptions: {
        prefetchDelayMs: 0,
        initialPrefetchMode: 'delay',
        secondSegmentDelayMs: 0,
        maxInFlight: 2
      }
    }, {
      timing: {
        dialogueCompletedAt: performance.now(),
        textVisibleAt: performance.now()
      },
      onStart: (detail) => starts.push(detail),
      onEnd: () => {
        endCount += 1;
      }
    });
    await Promise.resolve();
    await Promise.resolve();
    assert(requests.length >= 2, '分段 TTS 应在首段返回前受控预取下一段，降低中段等待。');
    firstResponse.resolve(createFakeTTSAudioResponse());
    await speech;

    assert(requests.length === segments.length, `分段 TTS 请求数应等于分段数。实际：${requests.length}/${segments.length}`);
    assert(requests[0].length < longText.length, '首段 TTS 请求必须短于完整回复。');
    assert(starts.length === segments.length, '每个音频段开始播放时应更新 audioSource，供 lip-sync 接续。');
    assert(endCount === 1, '分段播放只能在最后统一触发一次 onEnd。');
    assert(pausedCount === 0, '正常分段播放不应触发取消暂停。');
    const metrics = service.getLastMetrics();
    assert(metrics?.mode === 'segmented', 'TTSService metrics 必须标记 segmented。');
    assert(metrics?.segmentCount === segments.length, 'TTSService metrics 必须记录 segmentCount。');
    assert(metrics?.segmentMaxInFlight === 2, 'TTSService metrics 必须记录受控预取并发数。');
    assert(metrics?.segmentPrefetchDelayMs === 0, 'TTSService metrics 必须记录预取延迟。');
    assert(metrics?.segmentConfiguredInitialPrefetchMode === 'delay', 'TTSService metrics 必须记录配置的初始预取模式。');
    assert(metrics?.segmentInitialPrefetchMode === 'delay', 'TTSService metrics 必须记录初始预取模式。');
    assert(metrics?.segmentSecondPrefetchDelayMs === 0, 'TTSService metrics 必须记录第二段预取延迟。');
    assert(Number.isFinite(metrics?.segmentPlaybackAwareLeadMs), 'TTSService metrics 必须记录基于播放时长的预取 lead。');
    assert(Number.isFinite(metrics?.segmentShortInitialAudioThresholdMs), 'TTSService metrics 必须记录短首段缓冲阈值。');
    assert(Number.isFinite(metrics?.segmentShortInitialPlaybackBufferMs), 'TTSService metrics 必须记录短首段最大等待时间。');
    assert(Number.isFinite(metrics?.ttsRequestToFirstAudioReadyMs), 'TTSService metrics 必须记录首段音频 ready 耗时。');
    assert(Number.isFinite(metrics?.firstAudioReadyToPlayStartMs), 'TTSService metrics 必须记录首段 ready 到播放开始耗时。');
    assert(Number.isFinite(metrics?.totalAudioDurationMs), 'TTSService metrics 必须记录分段音频总时长。');
    assert(Number.isFinite(metrics?.segments?.[0]?.audioDurationMs), 'TTSService segment metrics 必须记录 WAV 时长。');
    assert(metrics?.segmentShortInitialPlaybackBufferMs === 0, '默认不应额外等待短首段播放，以减少首音人为延迟。');
    assert(Number.isFinite(metrics?.segments?.[1]?.segmentGapMs), 'TTSService segment metrics 必须记录显式 segmentGapMs。');
    assert(metrics?.segments?.[0]?.providerTimings?.upstreamReadMs === 3, 'TTSService metrics 必须保留 provider timing。');
    service.destroy();

    const firstReadyRequests = [];
    const firstReadyResponse = createDeferred();
    const firstReadyService = new TTSService('/api/tts', {
      apiClient: {
        response: async (_endpoint, options = {}) => {
          firstReadyRequests.push(options.body?.text || '');
          if (firstReadyRequests.length === 1) return firstReadyResponse.promise;
          return createFakeTTSAudioResponse();
        }
      }
    });
    const firstReadyText = '我想听你用温柔声音回应我一下好吗';
    const firstReadySpeech = firstReadyService.speak(firstReadyText, {
      engine: 'cosyvoice',
      rate: 1,
      pitch: 1,
      segmentedTTSOptions: {
        maxInFlight: 2
      }
    });
    await Promise.resolve();
    await Promise.resolve();
    assert(firstReadyRequests.length === 1, '默认 first-ready 模式下，首段 ready 前不应预取第二段抢占本地 CosyVoice 推理。');
    firstReadyResponse.resolve(createFakeTTSAudioResponse());
    await firstReadySpeech;
    const firstReadyMetrics = firstReadyService.getLastMetrics();
    assert(firstReadyRequests.length === shortWithoutBreakSegments.length, 'first-ready 模式下首段返回后仍应按顺序生成所有后续分段。');
    assert(firstReadyMetrics?.segmentConfiguredInitialPrefetchMode === 'adaptive', '默认分段 TTS 应记录 adaptive 配置模式。');
    assert(firstReadyMetrics?.segmentInitialPrefetchMode === 'first-ready', '默认两段分段 TTS 应解析为 first-ready 初始预取模式。');
    firstReadyService.destroy();

    const mediumDelayRequests = [];
    const mediumDelayFirstResponse = createDeferred();
    const mediumDelayService = new TTSService('/api/tts', {
      apiClient: {
        response: async (_endpoint, options = {}) => {
          mediumDelayRequests.push(options.body?.text || '');
          if (mediumDelayRequests.length === 1) return mediumDelayFirstResponse.promise;
          return createFakeTTSAudioResponse();
        }
      }
    });
    const mediumDelaySpeech = mediumDelayService.speak('今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情', {
      engine: 'cosyvoice',
      rate: 1,
      pitch: 1,
      segmentedTTSOptions: {
        maxInFlight: 2
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert(mediumDelayRequests.length >= 2, '25 字以上回复应延迟预取第二段，避免首段播放后长时间空洞。');
    mediumDelayFirstResponse.resolve(createFakeTTSAudioResponse());
    await mediumDelaySpeech;
    const mediumDelayMetrics = mediumDelayService.getLastMetrics();
    assert(mediumDelayMetrics?.segmentInitialPrefetchMode === 'delay', '25 字以上回复默认应使用 delay 初始预取模式。');
    assert(mediumDelayMetrics?.segmentSecondPrefetchDelayMs === 0, '中长回复第二段默认应立即受控预取，降低首段后播放空洞。');
    mediumDelayService.destroy();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
    if (originalAtob === undefined) delete globalThis.atob;
    else globalThis.atob = originalAtob;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
}

function createFakeTTSAudioResponse() {
  return {
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? 'application/json' : '';
      }
    },
    json: async () => ({
      ok: true,
      data: {
        tts_status: 'ok',
        provider: 'cosyvoice',
        format: 'wav',
        contentType: 'audio/wav',
        audioBase64: createSilentWavBase64(24000, 120),
        metadata: {
          timings: {
            upstreamReadMs: 3,
            wavWrapMs: 1,
            base64Ms: 1
          }
        }
      }
    })
  };
}

function createSilentWavBase64(sampleRate = 24000, durationMs = 120) {
  const samples = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer.toString('base64');
}

function createDeferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createTrackedBus(events, names) {
  const bus = new EventBus();
  names.forEach((name) => {
    bus.on(name, (detail) => events.push({ name, detail }));
  });
  return bus;
}

function assertEventOrder(events, expected, message) {
  const names = events.map((event) => event.name);
  assert(JSON.stringify(names) === JSON.stringify(expected), `${message} 实际：${names.join(' -> ')}`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
