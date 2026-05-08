## Backend API

### POST /api/chat

浏览器只提交对话参数，API Key 和上游 Base URL 均由后端环境变量读取。

请求：

```json
{
  "message": "你好",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": "你是 Alice..."
}
```

响应：

```json
{
  "reply": "你好呀！"
}
```

### POST /api/tts

TTS 代理接口，支持 `openai` 与 `minimax`，返回音频二进制。

请求：

```json
{
  "text": "你好呀！",
  "provider": "minimax",
  "model": "speech-2.8-hd",
  "voice": "Chinese (Mandarin)_Crisp_Girl",
  "speed": 1.05,
  "pitch": 1.2
}
```

OpenAI 请求可额外传入 `instructions`，后端会使用 `gpt-4o-mini-tts` 作为默认模型。

### GET /api/health

健康检查。
