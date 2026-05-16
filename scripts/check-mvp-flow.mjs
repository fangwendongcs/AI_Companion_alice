import { AudioManager } from '../js/audio/AudioManager.js';
import { DialogueManager } from '../js/dialogue/DialogueManager.js';
import { EventBus } from '../js/core/EventBus.js';
import { EVENT_NAMES } from '../js/core/events/eventNames.js';

const failures = [];

await checkDialogueSuccessFlow();
await checkDialogueErrorFlow();
await checkAudioSuccessFlow();
await checkAudioMutedFlow();
await checkAudioFallbackFlow();
await checkAudioUnexpectedErrorFlow();

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
