# Backend

当前后端提供本地开发静态服务和模型代理接口，避免在浏览器中保存 API Key。

## 启动

```bash
OPENAI_API_KEY=sk-... npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `OPENAI_API_KEY`：OpenAI Chat/TTS
- `QWEN_API_KEY`：通义千问 OpenAI-compatible 接口
- `DEEPSEEK_API_KEY`：DeepSeek OpenAI-compatible 接口
- `ANTHROPIC_API_KEY`：Anthropic 相关代理配置
- `CUSTOM_API_KEY`：自定义 OpenAI-compatible 接口
- `LLM_API_KEY`：通用兜底 Key
- `OPENAI_BASE_URL`：OpenAI 兼容代理地址
- `OPENAI_TTS_MODEL`：TTS 模型，默认 `tts-1`

## 接口

- `POST /api/chat`
- `POST /api/tts`
- `GET /api/health`
