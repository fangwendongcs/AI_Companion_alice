# API Contract For iOS

本文定义 `AliceMobile-iOS` 需要调用的后端 API。当前后端入口是 `backend/server.js`，路由在 `backend/routes/router.js`。移动端应通过后端 API 调用模型、TTS、记忆和角色能力，不直接调用第三方 provider secret API。

## 总原则

- iOS 原生 App 不保存 OpenAI、MiniMax、Qwen、DeepSeek、n8n、Qdrant 或其它 provider secret。
- App 只传非敏感选项，例如 `provider`、`model`、`voice`、`text`、`avatarId`、`sessionId`。
- 如果后端启用 `REQUIRE_API_AUTH=true`，请求需要 `Authorization: Bearer <token>` 或 `X-API-Token`。
- 公开 iOS App 不应内置长期静态 API token。正式产品应增加用户登录、短期 session token 或其它移动端鉴权方案。
- 当前 `POST /api/dialogue` 是移动端主 chat API；`POST /api/chat` 是旧兼容入口，不建议新 App 主用。

## 通用响应

新接口推荐格式：

```json
{
  "ok": true,
  "data": {}
}
```

错误格式：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

兼容注意：

- `/api/dialogue` 已使用 `{ ok, data, error }`。
- `/api/memory` 已使用 `{ ok, data }`。
- `/api/providers` 已使用 `{ ok, data }`。
- `/api/health` 返回 `{ ok: true }`。
- `/api/avatars` 当前返回 registry 原始结构。
- `/api/tts` 返回音频二进制。

## GET /api/health

用途：启动检查和后端可用性探测。

响应：

```json
{ "ok": true }
```

iOS 建议：

- App 启动或设置页测试后端地址时调用。
- 失败时提示“后端服务不可用”，不要要求用户输入 provider API Key。

## GET /api/providers

用途：读取安全的 provider readiness 状态。

响应：

```json
{
  "ok": true,
  "data": {
    "llm": [
      {
        "provider": "stub",
        "configured": true,
        "defaultModel": "stub",
        "mode": "demo",
        "requiresKey": false,
        "status": "ready"
      }
    ]
  }
}
```

约束：

- 不返回真实 API Key、base URL、secret、token、webhook。
- iOS 只用于显示状态和选择 provider。

## GET /api/avatars

用途：读取当前可选角色 registry。

当前响应是原始 registry：

```json
{
  "defaultAvatarId": "alice",
  "avatars": [
    {
      "id": "alice",
      "name": "Alice",
      "manifest": "public/avatars/alice/manifest.json"
    }
  ]
}
```

iOS 建议：

- 只消费 `id` 和 `name` 作为角色选择列表。
- 不在 iOS MVP 中读取或解析 Web manifest 的 Three.js 模型字段。
- 后续建议新增移动端友好的 persona/avatar summary API。

## POST /api/dialogue

用途：移动端主 chat API。

请求：

```json
{
  "message": "你好",
  "sessionId": "ios-local-session",
  "avatarId": "alice",
  "provider": "stub",
  "model": "stub",
  "systemPrompt": "",
  "options": {
    "useMemory": true,
    "useRag": false,
    "useWorkflow": false,
    "avatarId": "alice"
  }
}
```

成功响应重点字段：

```json
{
  "ok": true,
  "data": {
    "reply": "...",
    "sources": [],
    "memory": {},
    "rag": {},
    "workflow": {},
    "affect": {
      "emotion": "warm",
      "intensity": 0.48,
      "tone": "gentle",
      "voice": {
        "style": "gentle",
        "rate": 1.02,
        "pitch": 1.1
      },
      "motion": {
        "slot": "speaking",
        "intensity": 0.45
      }
    },
    "meta": {
      "persona": {
        "avatarId": "alice",
        "personaId": "alice_default",
        "name": "Alice",
        "tone": "warm_playful",
        "voiceStyle": "gentle",
        "motionStyle": "light",
        "memoryStrategy": "session_scoped_conservative"
      }
    }
  }
}
```

iOS 必须处理：

- `reply`：聊天文本。
- `memory`：记忆状态和长期记忆数量。
- `affect.voice`：TTS 参数。
- `affect.motion.slot`：Avatar 状态派生。
- `meta.persona`：当前角色摘要。
- `sources`：RAG 命中来源，可折叠展示。

常见错误：

- `DIALOGUE_MESSAGE_REQUIRED`
- `LLM_NOT_CONFIGURED`
- `API_AUTH_REQUIRED`
- `API_AUTH_INVALID`
- `RATE_LIMIT_EXCEEDED`
- `REQUEST_BODY_TOO_LARGE`

## POST /api/chat

用途：旧兼容入口。

请求：

```json
{
  "message": "hello",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": ""
}
```

响应：

```json
{ "reply": "..." }
```

iOS 建议：

- 不作为新 App 主入口。
- 只在 `/api/dialogue` 临时不可用时作为兼容诊断。

## POST /api/tts

用途：后端 TTS 代理，返回音频二进制。

OpenAI TTS 请求：

```json
{
  "text": "你好，我是 Alice。",
  "provider": "openai",
  "voice": "coral",
  "model": "gpt-4o-mini-tts",
  "speed": 1.05,
  "instructions": "使用中文普通话，声音年轻、明亮、自然。"
}
```

MiniMax TTS 请求：

```json
{
  "text": "你好，我是 Alice。",
  "provider": "minimax",
  "voice": "Chinese (Mandarin)_Crisp_Girl",
  "model": "speech-2.8-hd",
  "speed": 1.05,
  "pitch": 1.2
}
```

响应：

```text
Content-Type: audio/mpeg
Body: binary audio data
```

iOS 建议：

- 使用 `URLSession` 获取 `Data`。
- 写入临时文件或直接交给 `AVAudioPlayer`。
- 请求失败时降级 `AVSpeechSynthesizer`。
- 不在移动端传 provider API Key。

## GET /api/memory

用途：读取长期记忆摘要。

请求：

```text
GET /api/memory?sessionId=ios-local-session&avatarId=alice&limit=20
```

响应：

```json
{
  "ok": true,
  "data": {
    "sessionId": "ios-local-session",
    "avatarId": "alice",
    "longTerm": {
      "used": false,
      "status": "ready",
      "count": 0,
      "items": []
    }
  }
}
```

## DELETE /api/memory

用途：清除记忆或上下文。

清除短期上下文：

```text
DELETE /api/memory?sessionId=ios-local-session&avatarId=alice&scope=context
```

清除当前 session 长期记忆：

```text
DELETE /api/memory?sessionId=ios-local-session&avatarId=alice&scope=session
```

清除当前角色长期记忆：

```text
DELETE /api/memory?sessionId=ios-local-session&avatarId=alice&scope=avatar
```

## Persona API

当前状态：后端已有 `PersonaService` 和 `DEFAULT_AVATAR_PERSONAS`，但没有独立路由。当前 iOS 可先从 `/api/dialogue` 的 `meta.persona` 获取当前角色 persona 摘要。

建议新增只读接口：

```text
GET /api/personas
GET /api/personas/:avatarId
```

建议响应：

```json
{
  "ok": true,
  "data": {
    "personas": [
      {
        "avatarId": "alice",
        "personaId": "alice_default",
        "name": "Alice",
        "summary": "一个明亮、自然、带一点元气感的中文 AI 数字伙伴。",
        "tone": "warm_playful",
        "defaultVoice": {
          "style": "bright_gentle",
          "rate": 1.06,
          "pitch": 1.18
        },
        "defaultMotion": {
          "style": "light",
          "speakingSlot": "speaking",
          "positiveSlot": "chat"
        },
        "memoryStrategy": "session_scoped_conservative"
      }
    ]
  }
}
```

不建议返回完整 prompt 给公开移动端，除非后端确认这些内容不包含内部策略。

## Avatar State API

当前状态：没有独立 `/api/avatar-state`。Web 端 Avatar 状态由前端根据 dialogue / audio / interaction 事件派生。

iOS MVP 推荐本地派生：

```text
request started -> thinking
dialogue affect.motion.slot == speaking -> speaking
audio ended -> idle
user tapped head -> head_action
api error -> error
```

后续如需后端统一状态，可新增：

```text
POST /api/avatar-state
```

建议请求：

```json
{
  "avatarId": "alice",
  "personaId": "alice_default",
  "event": "dialogue_response",
  "affect": {
    "emotion": "happy",
    "tone": "playful",
    "motion": {
      "slot": "happy",
      "intensity": 0.72
    }
  }
}
```

建议响应：

```json
{
  "ok": true,
  "data": {
    "avatarState": "reacting",
    "motionSlot": "chat",
    "intensity": 0.72,
    "durationMs": 1200,
    "returnTo": "idle"
  }
}
```

这个接口不是当前已实现接口，不能在 iOS 第一版中假设存在。

## Swift Codable 起点

```swift
struct APIResponse<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: APIError?
}

struct DialogueRequest: Encodable {
    let message: String
    let sessionId: String
    let avatarId: String
    let provider: String
    let model: String
    let systemPrompt: String?
    let options: DialogueOptions
}

struct DialogueOptions: Encodable {
    let useMemory: Bool
    let useRag: Bool
    let useWorkflow: Bool
    let avatarId: String
}

struct DialogueResponse: Decodable {
    let reply: String
    let sources: [Source]?
    let memory: MemoryState?
    let affect: Affect?
    let meta: DialogueMeta?
}
```

