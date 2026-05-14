# Module Boundaries

## UI 入口

`js/script.js` 是当前装配层，负责 DOM 绑定和模块编排。它不应该长期继续吸收新业务逻辑。新增能力优先放到对应 manager/service 中。

允许：

- 读取 DOM 输入。
- 调用 Manager 的公开方法。
- 更新少量 UI 状态。
- 订阅 EventBus。

避免：

- 在 UI 中写动作文件路径。
- 在 UI 中写具体 provider 请求细节。
- 在 UI 中直接处理复杂 RAG/Agent prompt。

## Avatar

`CharacterManager` 负责角色 registry/meta 加载、切换和卸载。新增角色应优先新增配置和资源。

禁止把新角色写死到 `script.js`。

## Animation

`MotionManager` 接收标准动作槽位，`AnimationController` 负责运行时播放。UI 和交互层不直接调用 Three.js `AnimationAction`。

新增动作优先改：

```text
public/avatars/{avatarId}/motions.json
js/animation/AnimationFactory.js
```

## Interaction

`InteractionManager` 只负责把 pointer/touch 命中转换成语义事件，例如 `head`、`body`、`arm`、`leg`。它不直接管理台词、音频或具体动画文件。

## Audio

`TTSService` 负责语音播放和 fallback。它不直接改 UI，只通过回调和事件把状态交给装配层。

## Dialogue

`DialogueManager` 是对话链路入口。未来 Memory/RAG/PromptBuilder/Agent 都应该挂在这里或后端 `/api/dialogue`，不要堆到 UI 文件。

## Backend

`backend/server.js` 当前仍是轻量本地服务。后续变复杂时再拆：

```text
backend/services/llmProxy.js
backend/services/ttsProxy.js
backend/services/avatarRegistry.js
backend/services/ragService.js
```

旧的 Express scaffold 文件目前没有接入主服务，不确定用途时不要盲删。
