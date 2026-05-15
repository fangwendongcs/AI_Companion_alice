# Module Boundaries

## UI 入口

`js/script.js` 现在只作为入口文件，调用 `js/app/bootstrap.js`。

`AppController` 是当前装配层，负责创建 Runtime、Manager、EventBus、StateStore 和 UIController。它可以组织主流程，但不应该继续吸收具体 DOM 面板逻辑或 provider 请求细节。

`UIController` 负责协调 UI 子模块。子模块只管理自己的 DOM、事件和状态展示。

当前明确拆出的 UI 子控制器：

- `SettingsController`：侧边栏打开/关闭
- `AudioStatusController`：监听 audio 事件并展示 TTS 状态
- `ChatPanelController`：聊天发送、回车、静音按钮
- `AvatarSelectorController`：角色选择与上传
- `LLMSettingsController` / `TTSSettingsController`：各自 provider 设置

允许：

- 读取 DOM 输入。
- 调用 Manager 的公开方法。
- 更新少量 UI 状态。
- 订阅 EventBus。

避免：

- 在 UI 中写动作文件路径。
- 在 UI 中写具体 provider 请求细节。
- 在 UI 中直接处理复杂 RAG/Agent prompt。
- UI 子模块直接操作 Three.js runtime 内部对象，除非是明确的场景控制面板能力。

## Lifecycle

DOM listener、timeout、interval、AbortController 优先通过 `js/core/lifecycle/DisposableRegistry.js` 注册。

当前用途：

- `AppController` 清理全局 resize、主流程事件订阅和延时任务。
- `UIController` 清理所有 UI 子模块 listener。
- 子 UI Controller 不直接裸写需要长期存活的 `addEventListener`。

目标：

- 后续重复初始化或页面卸载时，不出现点击事件重复触发。
- 切换角色或销毁 runtime 时，不留下旧事件监听。

## Avatar

`CharacterManager` 负责角色 registry/meta 加载、切换和卸载。新增角色应优先新增配置和资源。

禁止把新角色写死到 `script.js`。

静态资源约束：

- JSON 资源统一通过 `loadJson()`，其内部走 `ResourceResolver + ApiClient + AppError + logger`。
- 模型和动画二进制资源统一通过 `StaticAssetLoader` 解析路径并包装加载错误。
- 不要在新模块中直接裸写 `fetch(json)` 或未解析的静态资源路径。

## Animation

`MotionManager` 接收标准动作槽位，`AnimationController` 负责运行时播放。UI 和交互层不直接调用 Three.js `AnimationAction`。

新增动作优先改：

```text
public/avatars/{avatarId}/motions.json
js/animation/MotionSlotRegistry.js
js/animation/AnimationFactory.js
```

当前动作请求链路：

```text
InteractionManager -> MotionSlot -> MotionManager.requestSlot()
  -> AnimationController.requestAction()
  -> AnimationStateMachine / AnimationQueue / AnimationBlender
```

交互和 UI 只应该请求 `headTap`、`legTap` 这类标准 slot，不应该直接绕过队列去操作 action。

## Interaction

`InteractionManager` 只负责把 pointer/touch 命中转换成语义事件，例如 `head`、`body`、`arm`、`leg`。它不直接管理台词、音频或具体动画文件。

## Audio

`TTSService` 负责语音播放和 fallback。它不直接改 UI，只通过回调和事件把状态交给装配层。

- 后端 TTS 请求统一走 `ApiClient.response()`，共享 timeout、错误模型和 HTTP 解析。
- 音频播放仍保留 `Response -> Blob -> Audio` 的二进制播放流程，不把二进制内容误塞进 JSON 流程。
- TTS 状态文案由 `AudioStatusController` 消费 `audio:*` 事件后展示，`AppController` 不再直接拼接 UI 文案。

## Dialogue

`DialogueManager` 是对话链路入口。未来 Memory/RAG/PromptBuilder/Agent 都应该挂在这里或后端 `/api/dialogue`，不要堆到 UI 文件。

## Backend

`backend/server.js` 当前只负责服务启动和挂载顶层 middleware/router。

后端模块边界：

```text
backend/routes/healthRoutes.js     HTTP health 输入输出
backend/routes/avatarRoutes.js     avatar registry / upload HTTP 层
backend/routes/dialogueRoutes.js   LLM 代理 HTTP 层
backend/routes/ttsRoutes.js        TTS 代理 HTTP 层
backend/routes/router.js           路由分发
backend/middleware/corsMiddleware.js  CORS preflight
backend/middleware/errorMiddleware.js 顶层错误处理
backend/services/AvatarService.js  registry/meta/上传落盘业务逻辑
backend/services/UploadValidationService.js 上传格式与内容校验
backend/services/StaticAssetService.js 静态资源服务
backend/utils/response.js          兼容旧格式与未来 { ok, data, error } 的响应工具
```

旧的 Express scaffold 文件目前没有接入主服务，不确定用途时不要盲删。
这些文件已加 `TODO(legacy-scaffold)` 标记；新后端逻辑请放到当前 `routes/services/utils` 结构中。

后续如果加入 RAG / n8n / long-term memory，应新增 route + service，不要重新把逻辑堆回 `backend/server.js`。
