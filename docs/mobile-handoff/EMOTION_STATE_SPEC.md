# Emotion State Spec

本文定义移动端需要继承的 `emotion`、`tone` 和可派生的 `avatar_state`。当前来源是 `backend/services/EmotionPolicy.js`、`TonePolicy.js` 和 `CompanionAffectService.js`。

## 三层状态

| 层 | 来源 | 用途 |
| --- | --- | --- |
| `emotion` | 后端 affect 决策 | 表达当前回复的情绪类别 |
| `tone` | 后端 tone 决策 | 控制文案语气、声音风格和 UI 节奏 |
| `avatar_state` | iOS 从 dialogue / audio / interaction 派生 | 控制原生 Avatar 视觉状态 |

后端当前返回 `affect`，不直接返回 `avatar_state`。iOS 应先从 `affect.motion.slot` 和本地事件派生 `avatar_state`。

## Emotion 枚举

| emotion | 语义 | 常见触发 |
| --- | --- | --- |
| `neutral` | 中性 | 初始或无明显情绪 |
| `warm` | 温暖陪伴 | 默认状态、记忆命中 |
| `happy` | 开心积极 | 正向词、感谢、开心表达 |
| `curious` | 好奇 | 问题、RAG 命中 |
| `thinking` | 思考 | workflow 相关、工具状态 |
| `apologetic` | 抱歉 / 兜底 | 错误、失败、未配置 |
| `concerned` | 关切 | 预留，适合安全或情绪低落场景 |

## Tone 枚举

当前后端可能返回：

| tone | 语义 | UI / Voice 建议 |
| --- | --- | --- |
| `gentle` | 温柔、低刺激 | 柔和动效，语速略慢 |
| `playful` | 俏皮、积极 | 轻快动效，语速略快 |
| `calm` | 平稳、思考 | 减少动效，强调阅读 |
| `encouraging` | 鼓励、明亮 | 适合 Wambo / Alice 的正反馈 |

Persona 自身还有 tone 标识：

- `warm_playful`
- `calm_gentle`
- `playful_direct`

iOS 应把 persona tone 视为角色长期风格，把 affect tone 视为当前这轮回复风格。

## Affect Schema

移动端应按以下结构建模：

```json
{
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
}
```

字段说明：

| 字段 | 范围 | 说明 |
| --- | --- | --- |
| `emotion` | enum | 当前回复情绪 |
| `intensity` | 0 到 1 | 情绪强度 |
| `tone` | enum | 当前语气 |
| `reason` | string | 规则命中原因，主要用于调试 |
| `voice.style` | string | 声音风格标签 |
| `voice.rate` | 0.75 到 1.35 | 后端已裁剪，iOS 可再安全裁剪 |
| `voice.pitch` | 0.8 到 1.6 | 后端已裁剪，iOS 可再安全裁剪 |
| `motion.slot` | motion slot | Avatar 状态提示 |
| `motion.intensity` | 0 到 1 | 动作强度 |

## 后端规则摘要

| 条件 | emotion | reason |
| --- | --- | --- |
| 错误、失败、不可用、超时、未配置 | `apologetic` | `error_or_fallback` |
| 有长期记忆或本轮写入长期记忆 | `warm` | `memory_context` |
| RAG 被使用或命中 passage | `curious` | `rag_context` |
| workflow 使用或未配置 | `thinking` | `workflow_context` |
| 正向表达，如喜欢、开心、谢谢 | `happy` | `positive_text` |
| 问句 | `curious` | `question_text` |
| 默认 | `warm` | `default_warm` |

## Emotion 到移动端 Avatar 的建议映射

| emotion | 默认 avatar_state | 视觉建议 |
| --- | --- | --- |
| `neutral` | `idle` | 基础待机 |
| `warm` | `speaking` 或 `idle` | 柔和呼吸、轻微高亮 |
| `happy` | `reacting` | 短促积极反馈 |
| `curious` | `thinking` | 轻微倾听 / 思考状态 |
| `thinking` | `thinking` | loading、节奏慢 |
| `apologetic` | `error` 或 `reacting` | 降低亮度、温柔提示 |
| `concerned` | `error` 或 `listening` | 关切但不过度拟人 |

## Motion Slot 到 Avatar State 的建议映射

| `affect.motion.slot` | iOS `avatar_state` |
| --- | --- |
| `idle` | `idle` |
| `speaking` | `speaking` |
| `thinking` | `thinking` |
| `happy` | `reacting` |
| `apologize` | `error` 或 `reacting` |
| `listening` | `listening` |
| `headTap` | `head_action` |
| `armTap` | `arm_action` |
| `legTap` | `leg_action` |
| `bodyTap` | `reacting` |
| `chat` | `reacting` |

## iOS 处理建议

- `emotion` 和 `tone` 只作为表现提示，不要让它们绕过安全或隐私规则。
- 当 API 没返回 affect 时，使用 `{ emotion: "neutral", tone: "gentle", motion.slot: "idle" }`。
- 当 TTS 开始播放时，优先进入 `speaking`，播放结束回到 `idle`。
- 当请求进行中时，优先进入 `thinking`，即使上一轮 affect 是 `happy`。
- 当用户点按 Avatar 时，短暂进入 body-part action，完成后回到前一个 base state。

