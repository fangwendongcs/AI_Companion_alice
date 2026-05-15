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
    if (engine === 'minimax') return 'MiniMax';
    if (engine === 'openai') return 'OpenAI';
    return '浏览器原生';
  }

  formatError(error) {
    const message = error?.message || '未知错误';
    if (message.includes('501') || message.includes('404')) {
      return 'TTS 后端没有接通。请不要用 python3 -m http.server 试听高级声线，改用 npm run dev 后访问 http://localhost:3000。';
    }
    if (message.includes('MINIMAX_API_KEY')) {
      return 'MiniMax 没有配置 API Key。请用 MINIMAX_API_KEY=你的key npm run dev 启动。';
    }
    if (message.includes('Invalid API key format')) {
      return 'API Key 格式无效。请确认环境变量里是真实 Key，不是中文占位文本，并且不要带空格或换行。';
    }
    if (message.includes('OPENAI_API_KEY')) {
      return 'OpenAI 没有配置 API Key。请用 OPENAI_API_KEY=你的key npm run dev 启动。';
    }
    return `TTS 请求失败：${message.slice(0, 160)}`;
  }
}
