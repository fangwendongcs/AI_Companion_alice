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

OpenAI TTS 代理接口，返回音频二进制。

请求：

```json
{
  "text": "你好呀！",
  "voice": "nova",
  "speed": 1.05
}
```

### GET /api/health

健康检查。
