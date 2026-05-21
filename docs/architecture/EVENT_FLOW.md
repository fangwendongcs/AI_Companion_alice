# Event Flow

事件名集中在 `js/core/events/eventNames.js`。

## 关键事件

```text
app:init
app:ready
state:changed
avatar:switch:start
avatar:switch:complete
avatar:switch:error
interaction:hit
animation:state
animation:action:start
animation:action:complete
dialogue:user
dialogue:thinking
dialogue:assistant
dialogue:response
dialogue:error
audio:start
audio:request
audio:end
audio:fallback
audio:error
system:error
```

## 点击交互流

```text
Pointer event
  -> InteractionManager
  -> HitTestController
  -> eventBus.emit(interaction:hit)
  -> AppController reaction listener
  -> MotionManager slot/state
  -> AnimationController
  -> animation:action:start
  -> animation:action:complete
  -> idle
```

## 对话流

```text
用户输入
  -> DialogueManager
  -> dialogue:user
  -> dialogue:thinking(active=true)
  -> LLMClient
  -> /api/dialogue
  -> dialogue:assistant / dialogue:response
  -> dialogue:thinking(active=false)
  -> AppController.speakText()
  -> AudioManager
  -> TTSService
  -> audio:start
  -> MotionManager.requestSlot(speaking)
  -> AnimationController
  -> audio:end
  -> MotionManager.requestSlot(idle)
  -> idle
```

错误路径：

```text
LLMClient / TTSService error
  -> AppError
  -> dialogue:error / audio:error
  -> errorHandler / StateStore
```

说明：

- `/api/dialogue` 是当前前端主入口。
- `/api/chat` 仍保留旧兼容入口，但不再是默认前端链路。
- 开发环境默认使用 `provider: "stub"`，不需要真实 API Key 也能验证 `thinking -> speaking -> idle`。

## 生命周期要求

- `eventBus.on()` 必须保存 unsubscribe。
- 模块 `destroy()` 时必须解绑事件。
- 角色切换不得留下旧角色事件监听。
- 页面卸载时调用 runtime、motion、speech、tts、state、eventBus 清理。
