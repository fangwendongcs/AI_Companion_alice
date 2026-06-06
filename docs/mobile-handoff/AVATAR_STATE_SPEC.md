# Avatar State Spec

本文说明 Web 端动作状态如何映射到 iOS 的轻量 Avatar 状态。核心边界：iOS 不迁移 Three.js、FBX、AnimationMixer、DOM pointer 事件或 Web 动画队列，只复用状态语义和 motion slot。

## 当前 Web AvatarState

来源：`js/animation/states.js`

| 状态 | 语义 | iOS 是否继承 |
| --- | --- | --- |
| `boot` | 启动 / 装载 | 是，可用于 App 首次出现 |
| `entering` | 入场动作 | 是，可选 |
| `idle` | 待机 | 是 |
| `listening` | 倾听 / 录音 | 是 |
| `thinking` | 思考 / 请求中 | 是 |
| `speaking` | 说话 / TTS 播放 | 是 |
| `reacting` | 通用反馈 | 是 |
| `interrupted` | 被打断 | 可选 |
| `error` | 错误 / 兜底 | 是 |
| `interacting` | 交互中 | 可合并到 `reacting` |
| `arm_action` | 手臂触发动作 | 是 |
| `head_action` | 头部触发动作 | 是 |
| `leg_action` | 腿部触发动作 | 是 |

## 当前 MotionSlot

来源：`js/animation/MotionSlotRegistry.js`

| MotionSlot | Web 用途 | iOS 建议 |
| --- | --- | --- |
| `idle` | 基础循环 | 待机呼吸 |
| `intro` | 启动入场 | 首次出现动效 |
| `headTap` | 点击头部 | 头部反馈 |
| `legTap` | 点击腿部 | 下半身或卡片反馈 |
| `armTap` | 点击手臂 | 手臂 / 按钮反馈 |
| `bodyTap` | 点击身体 | 通用反馈 |
| `chat` | 聊天正反馈 | 开心 / 鼓励 |
| `speaking` | 说话循环 | 口型 / 声波 / 光效 |
| `listening` | 倾听循环 | 麦克风 / 倾听姿态 |

## iOS 推荐状态机

移动端第一版可以使用轻量 reducer：

```text
boot -> idle
idle -> listening -> thinking -> speaking -> idle
idle -> thinking -> speaking -> idle
idle -> reacting -> idle
idle -> head_action -> idle
idle -> arm_action -> idle
idle -> leg_action -> idle
thinking -> error -> idle
speaking -> error -> idle
```

规则：

- `thinking` 和 `speaking` 是 base state，优先级高于点击反馈。
- 点击反馈是短动作，完成后回到 `speaking` 或 `idle`。
- 错误状态要可恢复，短暂展示后回到 `idle`。
- 如果没有具体动画资源，状态也必须能用颜色、缩放、透明度、声波或文本 badge 表达。

## Dialogue / Affect 到 AvatarState

| 事件 / 字段 | AvatarState |
| --- | --- |
| 发送消息开始 | `thinking` |
| `/api/dialogue` 返回成功但未播放音频 | `idle` 或 `speaking` |
| TTS 开始播放 | `speaking` |
| TTS 结束 | `idle` |
| TTS 失败但用本机语音兜底 | `speaking`，并显示 fallback |
| API 失败 | `error` |
| `affect.motion.slot = "speaking"` | `speaking` |
| `affect.motion.slot = "thinking"` | `thinking` |
| `affect.motion.slot = "happy"` | `reacting` |
| `affect.motion.slot = "apologize"` | `error` 或 `reacting` |

## Interaction 到 AvatarState

当前 Web hit region：

- `head`
- `arm`
- `leg`
- `body`
- `chat`
- `record` 仍偏 UI 演示

移动端可以把 Avatar 区域拆成可点组件，也可以把轻量 Avatar 卡片周围放几个明确按钮：

| iOS 交互 | MotionSlot | AvatarState |
| --- | --- | --- |
| 点头像 / 头部区域 | `headTap` | `head_action` |
| 点手臂按钮 | `armTap` | `arm_action` |
| 点腿部 / 移动能力按钮 | `legTap` | `leg_action` |
| 点角色卡片 | `bodyTap` | `reacting` |
| 发送聊天 | `chat` 或 `speaking` | `speaking` / `reacting` |

## 移动端视觉映射建议

| AvatarState | SwiftUI 轻量表现 |
| --- | --- |
| `boot` | 首次载入淡入、ring 扩散 |
| `entering` | Avatar 卡片轻微上浮 |
| `idle` | 呼吸缩放、柔和待机光 |
| `listening` | 麦克风波形、低频闪烁 |
| `thinking` | 小型 loading、眼神/光点移动 |
| `speaking` | 声波、口型条、节奏光 |
| `reacting` | 短弹性反馈 |
| `head_action` | 头像轻微晃动或表情切换 |
| `arm_action` | 侧边手势图标或按钮反馈 |
| `leg_action` | 下方能量条或位移反馈 |
| `error` | 柔和降亮、错误提示，不要强烈红屏 |

## 事件模型建议

```swift
enum AvatarEvent {
    case appBooted
    case userStartedVoiceInput
    case userSentMessage
    case dialogueResponse(Affect)
    case audioStarted(Affect?)
    case audioEnded
    case userTappedBodyPart(BodyPart)
    case apiError(String)
}
```

```swift
enum AvatarState: String, Codable {
    case boot
    case entering
    case idle
    case listening
    case thinking
    case speaking
    case reacting
    case interrupted
    case error
    case headAction = "head_action"
    case armAction = "arm_action"
    case legAction = "leg_action"
}
```

## 不迁移内容

- `FBXLoader`
- `AnimationMixer`
- `AnimationController`
- `MotionManager`
- `HitTestController`
- Three.js raycaster / mesh hit test
- `public/models/animations/*.fbx` 的播放实现

这些内容属于 Web 3D runtime。移动端后续若要做 3D，需要单独设计原生资产管线。

