# Backend

当前后端提供本地开发静态服务和模型代理接口，避免在浏览器中保存 API Key。

## 启动

```bash
OPENAI_API_KEY=sk-... MINIMAX_API_KEY=... npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `OPENAI_API_KEY`：OpenAI Chat/TTS
- `MINIMAX_API_KEY`：MiniMax TTS
- `QWEN_API_KEY`：通义千问 OpenAI-compatible 接口
- `DEEPSEEK_API_KEY`：DeepSeek OpenAI-compatible 接口
- `CUSTOM_API_KEY`：自定义 OpenAI-compatible 接口
- `LLM_API_KEY`：通用兜底 Key
- `OPENAI_BASE_URL`：OpenAI 兼容代理地址
- `MINIMAX_BASE_URL`：MiniMax TTS 代理地址，未配置时使用 `https://api.minimax.io/v1`
- `QWEN_BASE_URL`：通义千问兼容接口地址，未配置时使用默认值
- `DEEPSEEK_BASE_URL`：DeepSeek 兼容接口地址，未配置时使用默认值
- `CUSTOM_BASE_URL`：自定义 OpenAI-compatible 接口地址
- `OPENAI_TTS_MODEL`：OpenAI TTS 模型，默认 `gpt-4o-mini-tts`
- `MINIMAX_TTS_MODEL`：MiniMax TTS 模型，默认 `speech-2.8-hd`

## 接口

- `POST /api/chat`
- `POST /api/tts`
- `GET /api/health`
