import { EVENT_NAMES } from '../core/events/eventNames.js';

export class AudioStatusController {
  constructor({ eventBus, registry, statusView }) {
    this.eventBus = eventBus;
    this.registry = registry;
    this.statusView = statusView;
  }

  init() {
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_REQUEST, ({ engine }) => {
      if (engine !== 'browser') {
        this.statusView.showTTS('loading', `正在请求 ${this.getEngineName(engine)} 语音服务...`);
      }
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_END, ({ engine, fallback }) => {
      if (engine !== 'browser' && !fallback) {
        this.statusView.showTTS('success', `${this.getEngineName(engine)} 语音播放完成。`);
      }
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_FALLBACK, ({ error }) => {
      this.statusView.showTTS('error', `${this.formatError(error)} 已自动使用免费本机语音兜底。`);
    }));
    this.registry.add(this.eventBus.on(EVENT_NAMES.AUDIO_ERROR, ({ error }) => {
      this.statusView.showTTS('error', this.formatError(error));
    }));
  }

  getEngineName(engine) {
    if (engine === 'cosyvoice') return '默认语音';
    if (engine === 'voxcpm2') return '本地语音 · VoxCPM2';
    if (engine === 'qwen3_tts' || engine === 'fish_audio') return '云端语音';
    if (engine === 'self_hosted') return '自建语音服务';
    if (engine === 'mock') return 'Mock';
    return '本机兜底';
  }

  formatError(error) {
    const message = error?.message || '未知错误';
    if (message.includes('501') || message.includes('404')) {
      return 'TTS 后端没有接通。请不要用 python3 -m http.server 试听高级声线，改用 npm run dev 后访问 http://localhost:3000。';
    }
    if (message.includes('Invalid API key format')) {
      return 'API Key 格式无效。请确认环境变量里是真实 Key，不是中文占位文本，并且不要带空格或换行。';
    }
    if (message.includes('local_service_not_running') || message.includes('TTS_NOT_CONFIGURED')) {
      return '本地语音服务未启动，文字对话仍可用。';
    }
    return `TTS 请求失败：${message.slice(0, 160)}`;
  }
}
