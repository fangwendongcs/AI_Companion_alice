# Dialogue Flow Spec

本文定义移动端可复用的对话流程、输入输出结构和状态流转。当前权威实现来自 Web 前端的 `DialogueManager` / `LLMClient` 和后端 `DialogueOrchestrationService`。

## 当前主流程

```text
User input
-> client validates non-empty text
-> dialogue.thinking = true
-> POST /api/dialogue
-> backend validates input
-> memory context
-> local RAG context
-> optional workflow context
-> persona-aware PromptBuilder
-> LLMService or stub
-> append memory exchange
-> affect decision
-> response: reply + memory + rag + workflow + affect + meta
-> client updates UI
-> audio starts
-> avatar speaking / affect motion
-> audio ends
-> avatar idle
```

## iOS 输入结构

移动端主对话请求应调用 `POST /api/dialogue`：

```json
{
  "message": "你好 Alice",
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

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `message` | 是 | 用户输入，当前后端最多保留 4000 字符 |
| `sessionId` | 建议 | 移动端本地生成并持久化的会话 ID |
| `avatarId` | 建议 | 当前角色，默认 `alice` |
| `provider` | 建议 | 本地演示用 `stub`，真实模型由后端环境变量决定 |
| `model` | 可选 | 只传模型名，不传密钥 |
| `systemPrompt` | 可选 | 本轮补充规则，不建议移动端开放给普通用户 |
| `options.useMemory` | 建议 | 是否启用后端 Memory |
| `options.useRag` | 可选 | 当前移动端 MVP 建议默认 false |
| `options.useWorkflow` | 可选 | 当前移动端 MVP 建议默认 false |

## iOS 输出结构

`/api/dialogue` 成功响应经标准包装：

```json
{
  "ok": true,
  "data": {
    "reply": "Alice 现在处于本地演示模式，对话链路已经跑通了。",
    "sources": [],
    "memory": {
      "used": true,
      "status": "ready",
      "sessionId": "ios-local-session",
      "avatarId": "alice",
      "turnCount": 1,
      "maxTurns": 6,
      "context": [],
      "longTerm": {
        "used": false,
        "status": "ready",
        "count": 0,
        "items": []
      }
    },
    "rag": {
      "used": false,
      "status": "disabled",
      "passages": []
    },
    "workflow": {
      "used": false,
      "status": "disabled",
      "result": null
    },
    "affect": {
      "emotion": "warm",
      "intensity": 0.48,
      "tone": "gentle",
      "reason": "default_warm",
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
      "mode": "llm_stub",
      "orchestration": "agent_pipeline",
      "steps": {
        "memory": "ready",
        "rag": "disabled",
        "workflow": "disabled"
      },
      "persona": {
        "avatarId": "alice",
        "personaId": "alice_default",
        "name": "Alice",
        "tone": "warm_playful",
        "voiceStyle": "gentle",
        "motionStyle": "light",
        "memoryStrategy": "session_scoped_conservative"
      },
      "provider": "stub",
      "model": "stub"
    }
  }
}
```

移动端应至少消费：

- `data.reply`
- `data.memory.status`
- `data.memory.longTerm.count`
- `data.affect.emotion`
- `data.affect.tone`
- `data.affect.voice`
- `data.affect.motion.slot`
- `data.meta.persona`
- `data.sources`

## 对话状态流转

建议 iOS 使用以下状态：

| 状态 | 触发 | UI 行为 |
| --- | --- | --- |
| `idle` | 默认 / 回复结束 | 输入可用，Avatar 呼吸待机 |
| `listening` | 语音输入中 | 麦克风高亮，Avatar 倾听 |
| `thinking` | 请求发出到响应返回 | 禁用发送按钮，显示思考状态 |
| `speaking` | TTS / 本机语音播放中 | 播放音频，Avatar 说话 |
| `reacting` | 用户点按 Avatar 或收到积极反馈 | 短动作，不打断主要阅读 |
| `error` | API / TTS / 网络失败 | 显示可恢复错误和重试入口 |

典型流转：

```text
idle -> thinking -> speaking -> idle
listening -> thinking -> speaking -> idle
idle -> reacting -> idle
thinking -> error -> idle
speaking -> error -> idle
```

## Regenerate

Web 端当前做法是保存上一条用户输入，再次调用同一个 `/api/dialogue`，并在 `options.regenerate = true` 传递标记。移动端可复用这个策略：

- 保留 `lastUserMessage`。
- 用户点击重新生成时，重新发送上一条 message。
- 不需要单独新建 regenerate API。

## Clear Context

清除短期上下文调用：

```text
DELETE /api/memory?sessionId=<sessionId>&avatarId=<avatarId>&scope=context
```

语义：

- 清除当前 session 的短期 messages。
- 不删除显式保存的长期 `memory_items`。
- UI 提示应明确“上下文已清空，长期记忆未删除”。

## Memory Recall

当前 stub 对这些表达有本地演示逻辑：

- “你还记得吗”
- “记得什么”
- “我让你记住”
- “长期记忆”

移动端不需要本地解析这些意图，直接把用户输入发给 `/api/dialogue`，由后端返回 memory 状态和 reply。

## 错误处理

常见错误：

| 错误码 | 场景 | iOS 建议 |
| --- | --- | --- |
| `DIALOGUE_MESSAGE_REQUIRED` | 空消息 | 本地先禁用发送 |
| `LLM_NOT_CONFIGURED` | 真实 provider 缺少后端 API Key | 提示后端未配置，不要求用户输入 Key |
| `API_AUTH_REQUIRED` | 后端启用鉴权但缺 token | 进入登录/配置流程 |
| `API_AUTH_INVALID` | token 错误 | 清除本地会话凭据并提示 |
| `RATE_LIMIT_EXCEEDED` | 请求过快 | 按 `Retry-After` 延迟重试 |
| `REQUEST_BODY_TOO_LARGE` | 请求过大 | 缩短输入 |

失败时建议设置：

```json
{
  "emotion": "apologetic",
  "tone": "gentle",
  "avatarState": "error"
}
```

