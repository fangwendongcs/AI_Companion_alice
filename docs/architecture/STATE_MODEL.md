# State Model

状态由 `js/state/CompanionStateStore.js` 维护。当前为了兼容旧代码，同时保留少量 flat 字段和新的分层字段。

## 分层状态

```js
{
  app: {
    isReady,
    mode,
    error
  },
  avatar: {
    currentAvatarId,
    loading,
    loaded,
    meta
  },
  animation: {
    currentAnimation,
    state,
    isPlaying
  },
  dialogue: {
    input,
    thinking,
    lastResponse,
    error
  },
  audio: {
    speaking,
    muted,
    currentVoice
  },
  interaction: {
    enabled,
    lastInteractionAt
  }
}
```

## 使用规则

- 跨模块协作需要的状态放入 StateStore。
- 局部 DOM 状态、临时变量、Three.js 内部对象不放入全局状态。
- 状态变更通过 `patchState()` 或 `stateStore.patch()`。
- `state:changed` 可用于未来调试面板。
- `dialogue:thinking` 负责驱动 `dialogue.thinking / isThinking`。
- `audio:start / audio:end / audio:error` 负责驱动 `audio.speaking / isSpeaking`。
- 动画层通过事件联动得到 `speaking -> idle` 切换，不再依赖对话代码直接操作底层动作。

## 兼容字段

当前仍保留：

```text
currentState
isMuted
isSpeaking
isThinking
isAnimating
currentAnimation
animationState
modelLoaded
currentAvatarId
characterMeta
```

这些字段后续可以在 UI 更模块化后逐步减少。
