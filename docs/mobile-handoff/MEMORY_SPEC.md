# Memory Spec

本文说明移动端如何接入记忆能力，哪些记忆留在后端，哪些可以本地缓存。当前权威实现来自 `backend/services/MemoryService.js`、`backend/db/schema.sql` 和 `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md`。

## 核心原则

- 后端 SQLite 是记忆 source of truth。
- iOS 不直接保存长期记忆明文作为主数据源。
- iOS 可以缓存非敏感 UI 状态和最近一次摘要，用于体验优化。
- 普通闲聊不会自动进入长期记忆。
- 长期记忆只保存用户明确要求保存的稳定信息。
- API Key、token、password、身份证、银行卡、验证码、住址、手机号等敏感内容不能保存。

## 当前后端记忆层

| 层 | 表 / 存储 | 说明 |
| --- | --- | --- |
| Session | `sessions` | 记录 sessionId、avatarId、状态 |
| Raw messages | `messages` | 当前短期上下文来源，按最近 N 轮裁剪 |
| Long-term memory | `memory_items` | 显式保存的偏好、事实、目标、关系、边界、事件、风格 |
| Memory events | `memory_events` | 记忆创建、更新、合并、遗忘等生命周期记录 |
| Persona | `avatar_personas` / config | 角色人格配置，不是模型 manifest |
| Preferences | `user_preferences` | 用户偏好，当前为未来扩展 |
| Memory settings | `memory_settings` | 记忆策略和隐私控制，当前为未来扩展 |

当前默认短期上下文最大轮数是 6 轮。

## 长期记忆写入规则

当前后端只识别显式记忆意图，例如：

- “请你记住：...”
- “以后你要记得：...”
- “你要记得：...”
- “帮我记住：...”
- “我的目标是：...”
- “我喜欢：...”
- “我不喜欢：...”

长期记忆类型：

- `preference`
- `fact`
- `goal`
- `relationship`
- `boundary`
- `event`
- `style`

敏感内容会被拒绝，重复记忆会合并或更新，不会无限追加。

## iOS 应传字段

每次调用 `/api/dialogue` 时建议带：

```json
{
  "sessionId": "ios-local-session",
  "avatarId": "alice",
  "options": {
    "useMemory": true,
    "avatarId": "alice"
  }
}
```

`sessionId` 建议由 iOS 第一次启动时生成并持久化。`avatarId` 随当前角色切换更新。

## iOS 可本地缓存

| 数据 | 建议存储 | 说明 |
| --- | --- | --- |
| `sessionId` | AppStorage 或 Keychain | 非 provider secret，但仍应稳定保存 |
| `selectedAvatarId` | AppStorage | 当前选择角色 |
| `memoryEnabled` | AppStorage | 用户是否开启记忆 |
| `lastMemorySummary` | 普通缓存 | 只缓存后端返回的摘要，避免长期明文主存 |
| `lastUserMessage` | 内存 / 短期缓存 | 用于 regenerate |
| `lastAffect` | 内存 | 用于音频和 Avatar 状态 |

## iOS 不应本地保存

- OpenAI / MiniMax / Qwen / DeepSeek / custom provider API Key。
- n8n webhook URL 或 secret。
- Qdrant / vector database 凭证。
- 完整长期记忆主库。
- 未经用户确认的完整长期聊天记录。
- 用户输入中疑似密钥、密码、证件、金融账户、验证码、住址、手机号等敏感内容。

## 读取长期记忆摘要

```text
GET /api/memory?sessionId=<sessionId>&avatarId=<avatarId>&limit=20
```

返回结构：

```json
{
  "ok": true,
  "data": {
    "sessionId": "ios-local-session",
    "avatarId": "alice",
    "longTerm": {
      "used": true,
      "status": "ready",
      "count": 1,
      "items": [
        {
          "id": 1,
          "type": "preference",
          "scope": "session",
          "avatarId": "alice",
          "sessionId": "ios-local-session",
          "content": "喜欢简短直接的回复",
          "confidence": 0.78,
          "importance": 0.75,
          "status": "active",
          "updatedAt": "2026-06-06T00:00:00.000Z"
        }
      ]
    }
  }
}
```

## 清除记忆

清除短期上下文：

```text
DELETE /api/memory?sessionId=<sessionId>&avatarId=<avatarId>&scope=context
```

清除当前 session 的长期记忆：

```text
DELETE /api/memory?sessionId=<sessionId>&avatarId=<avatarId>&scope=session
```

清除当前角色的长期记忆：

```text
DELETE /api/memory?sessionId=<sessionId>&avatarId=<avatarId>&scope=avatar
```

移动端 UI 必须区分：

- 清空上下文：只清短期对话，不删长期记忆。
- 删除本会话记忆：删除当前 session 的长期记忆。
- 删除当前角色记忆：删除当前 avatar 下更大范围的长期记忆。

## 移动端 UX 建议

- 在聊天页显示一个轻量 memory badge：关闭 / 已开启 / 已记住 N 条。
- 第一次开启记忆时显示隐私说明。
- 保存成功时根据 `memory.longTermWrite` 显示短提示，例如“已记住这条偏好”。
- 被拒绝时显示温和说明，例如“这类敏感信息不适合保存为长期记忆”。
- 清除前要求用户二次确认，特别是 `scope=session` 和 `scope=avatar`。
- 不在主聊天流中暴露完整原始 message 历史。

## Swift 模型建议

```swift
struct MemoryState: Codable {
    var used: Bool
    var status: String
    var sessionId: String?
    var avatarId: String?
    var turnCount: Int?
    var maxTurns: Int?
    var longTerm: LongTermMemory?
    var longTermWrite: LongTermWrite?
}

struct LongTermMemory: Codable {
    var used: Bool
    var status: String
    var count: Int
    var items: [MemoryItem]
}

struct MemoryItem: Codable, Identifiable {
    var id: Int
    var type: String
    var scope: String
    var avatarId: String
    var sessionId: String?
    var content: String
    var confidence: Double
    var importance: Double
    var status: String
    var updatedAt: String?
}
```

