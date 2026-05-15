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
dialogue:assistant
dialogue:error
audio:start
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
  -> script.js reaction listener
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
  -> LLMClient
  -> /api/chat
  -> dialogue:assistant
  -> TTSService
  -> audio:start
  -> audio:end
  -> idle
```

## 生命周期要求

- `eventBus.on()` 必须保存 unsubscribe。
- 模块 `destroy()` 时必须解绑事件。
- 角色切换不得留下旧角色事件监听。
- 页面卸载时调用 runtime、motion、speech、tts、state、eventBus 清理。
