# REFACTOR NOTES

日期：2026-05-14  
目标：在保留当前 Alice/Shiro/Wambo、点击交互、语音兜底、角色上传能力的基础上，补齐数字伙伴系统的架构基座。

## 1. 文档交付

新增：

- `PROJECT_REVIEW_REPORT.md`
- `ARCHITECTURE_REFACTOR_PLAN.md`
- `REFACTOR_NOTES.md`

这三份文档分别对应项目现状审查、目标架构方案、实际改动记录。

## 2. 配置层

新增：

- `js/config/appConfig.js`
- `js/config/dialogues.js`

改动原因：

- `script.js` 中原本硬编码了台词、loading/语音状态时间、上传模型扩展名、请求超时等稳定配置。
- 这些配置后续会被角色、动作、语音、调试面板共用，集中管理更容易扩展。

影响范围：

- 台词池从 `script.js` 迁移到 `DEFAULT_DIALOGUES`。
- 情绪台词从 `script.js` 迁移到 `MOOD_DIALOGUES`。
- 角色上传格式校验改为使用 `isAllowedAvatarModelFileName()`。
- loading、状态清理、语音估算时长改为读取 `UI_TIMING`。

## 3. 事件系统

复用已有：

- `js/core/EventBus.js`

新增事件常量：

- `EVENT_NAMES` in `js/config/appConfig.js`

当前接入事件：

- `app:init`
- `app:ready`
- `avatar:switch:start`
- `avatar:switch:complete`
- `avatar:switch:error`
- `interaction:hit`
- `animation:state`
- `animation:action:start`
- `animation:action:complete`
- `dialogue:user`
- `dialogue:assistant`
- `dialogue:error`
- `audio:start`
- `audio:end`
- `audio:fallback`
- `audio:error`
- `system:error`

改动原因：

- 未来表情、口型同步、字幕、日志面板、RAG 状态、Agent 工作流都需要监听同一批系统事件。
- 本轮先做轻量广播，不强行把全部业务改成事件驱动，降低回归风险。

## 4. 状态管理

新增：

- `js/state/CompanionStateStore.js`

当前状态纳入统一 patch：

- `currentState`
- `isMuted`
- `isSpeaking`
- `isThinking`
- `modelLoaded`
- `avatarRegistry`
- `currentAvatarId`
- `characterMeta`
- `systemError`
- `lastUserMessage`
- `lastAssistantMessage`
- `dialogueError`

改动原因：

- 原状态分散在 `script.js`、DOM、TTSService、MotionManager 里。
- 先用轻量 store 保留现有写法，同时为调试面板和后续 Agent/RAG 状态联动留接口。

影响范围：

- `script.js` 中关键状态更新改为 `patchState()`。
- `CompanionStateStore` 会广播 `state:changed`。

## 5. 对话系统薄封装

新增：

- `js/dialogue/DialogueManager.js`

当前行为：

- `handleChat()` 仍保留在 `script.js`。
- LLM 请求改由 `DialogueManager.send()` 调用 `LLMClient.chat()`。
- `DialogueManager` 会广播 `dialogue:user`、`dialogue:assistant`、`dialogue:error`。

改动原因：

- 后续接入 Memory/RAG/PromptBuilder/Agent 时，不再把检索和 prompt 编排堆进 UI 入口。

## 6. RAG / Memory / n8n 扩展占位

新增：

- `js/memory/MemoryManager.js`
- `js/memory/RagClient.js`
- `js/workflows/N8nClient.js`

当前策略：

- 只建立清晰接口，不实现复杂假逻辑。
- RAG 和 n8n 都应该以后端为中心接入，前端只做 client/状态展示。

## 7. LLM / TTS 请求超时

修改：

- `js/ai/LLMClient.js`
- `js/voice/TTSService.js`

改动内容：

- `LLMClient` 增加 `AbortController` 超时，默认 30 秒。
- `TTSService` 后端请求增加超时，默认 45 秒。
- TTS 后端超时/失败后仍走浏览器本机语音兜底。
- 后端音频 Blob URL 改为 `finally` 中释放，避免异常时泄漏。

影响范围：

- LLM 长时间无响应时会明确报“请求超时”。
- OpenAI/MiniMax TTS 超时会回退免费本机语音。

## 8. 交互系统稳定性

修改：

- `js/interaction/InteractionManager.js`

改动内容：

- 增加拖拽阈值 `dragThresholdPx`，避免轻微移动误判拖拽。
- 增加点击冷却 `cooldownMs`，避免连续点击把动作队列打乱。
- 增加 `unbindPointer()`，防止后续重复绑定时事件监听叠加。

影响范围：

- 保留原有点击头部、身体、手臂、腿部触发逻辑。
- Shiro/Wambo 的命中链路不变，仍然通过 `HitTestController` 判断部位。

## 9. Three.js 生命周期

修改：

- `js/scene/SceneRuntime.js`

改动内容：

- 保存 `requestAnimationFrame` id。
- 新增 `destroy()`，用于取消 RAF、清理角色对象、释放 controls/renderer。

影响范围：

- 当前单页运行不改变行为。
- 后续如果改为 SPA 或组件化挂载，可以避免渲染循环和 WebGL 资源泄漏。

## 10. 前端安全修复

修改：

- `js/script.js`

改动内容：

- `showLoadingError()` 不再使用 `innerHTML` 拼接错误消息。
- 改为 `document.createElement()` + `textContent`。

影响范围：

- 初始化/模型加载失败 UI 保持原功能，但消除错误信息 HTML 注入风险。

## 11. 后端安全与稳定性

修改：

- `backend/server.js`
- `backend/README.md`

改动内容：

- LLM/TTS 上游请求增加统一 `fetchWithTimeout()`，默认 45 秒。
- 上传 `.vrm/.glb` 校验 GLB magic `glTF`。
- 上传 `.gltf` 校验 JSON 和 `asset.version`。
- 响应头增加 `X-Content-Type-Options: nosniff`。
- README 增加 `UPSTREAM_TIMEOUT_MS` 和角色上传限制说明。

影响范围：

- `/api/chat`
- `/api/tts`
- `/api/avatars`

注意：

- 当前后端仍然是本地开发服务，没有鉴权。
- 如果部署公网，必须增加访问控制、CORS 来源限制、上传扫描、请求日志和速率限制。

## 12. 仓库安全

修改：

- `.gitignore`

改动内容：

- 增加 `.env.*`
- 保留 `!.env.example`
- 增加 `*.log`
- 增加 `.playwright-cli/`

## 13. 缓存刷新

修改：

- `index.html`

改动内容：

- 更新 `js/script.js` 的 query version，降低浏览器继续用旧入口脚本的概率。

## 14. 当前未做的大重构

本轮有意没有做：

- 没有迁移 TypeScript/Vite/React/Vue。
- 没有全量拆分 `backend/server.js`。
- 没有重写动画系统。
- 没有删除旧 backend scaffold 文件。
- 没有实现真实 RAG、向量数据库或 n8n 工作流。

原因：

- 当前首要目标是稳住已可运行的数字人链路，并建立可扩展基座。
- 过早大拆会增加 Alice/Shiro/Wambo 动作和上传功能的回归风险。

## 15. 验证

已运行：

```bash
npm run check
```

说明：

- 当前项目没有 `build`、`lint`、`typecheck` 脚本。
- `npm install` 不需要运行，因为项目没有声明外部 npm dependencies；Three.js 通过 `index.html` import map 从 CDN 加载。

---

## 16. 第二轮：动画系统工程化

日期：2026-05-14  
目标：拆分 `AnimationController.js` 的职责，强化动作注册、程序化动作、骨骼重定向、队列、状态机和角色 manifest 扩展能力。

### 新增动画模块

新增：

- `js/animation/animationTypes.js`
- `js/animation/AnimationRegistry.js`
- `js/animation/AnimationFactory.js`
- `js/animation/AnimationRetargeter.js`
- `js/animation/AnimationBlender.js`
- `js/animation/AnimationQueue.js`

保留：

- `js/animation/ActionQueue.js`

说明：

- `ActionQueue.js` 现在作为兼容导出，避免旧 import 立即失效。
- 新代码统一使用 `AnimationQueue`。

### AnimationController 拆分

修改：

- `js/animation/AnimationController.js`

拆分前它同时负责：

- FBX 加载
- 动作注册
- 动作元数据管理
- 程序化动作生成
- 骨骼重定向
- 分层动画混合
- 队列执行
- 动作结束回 idle
- mixer listener 生命周期

拆分后：

- 文件动作加载仍由 `AnimationController` 发起。
- 动作元数据归 `AnimationRegistry`。
- 程序化动作归 `AnimationFactory`。
- 骨骼适配归 `AnimationRetargeter`。
- base/gesture 播放与 layer weight 归 `AnimationBlender`。
- 队列、冷却、去重归 `AnimationQueue`。

### 状态机升级

修改：

- `js/animation/states.js`
- `js/animation/AnimationStateMachine.js`
- `js/animation/MotionManager.js`

新增状态：

- `entering`
- `listening`
- `reacting`
- `interrupted`
- `error`

保留旧状态：

- `boot`
- `interacting`
- `arm_action`
- `head_action`
- `leg_action`

原因：

- 新状态更接近数字伙伴长期架构。
- 旧状态仍用于兼容当前点击动作和 UI 状态，不强行迁移。

### AnimationQueue 优化

新增能力：

- layer 级队列
- 优先级排序
- 高优先级动作打断低优先级动作
- 同名 pending action 去重
- 循环动作 active 时不重复堆叠
- action cooldown
- 每个 layer 最大队列长度限制

影响：

- 连续快速点击不会无限堆积动作。
- 一次性动作结束后仍能回到 idle。
- speaking/listening/idle 等 base 动作不会被重复堆叠。

### 程序化动作迁移

从 `AnimationController.js` 迁移到：

- `js/animation/AnimationFactory.js`

当前内置程序化动作：

- `idle`
- `speaking`
- `listening`
- `intro`
- `headTap`
- `legTap`
- `armTap`
- `bodyTap`
- `chat`

影响：

- Shiro / Wambo 缺少真实动作文件时，仍然可以正常待机和响应点击。
- 后续新增程序化动作不需要再改 controller 主逻辑。

### 骨骼重定向迁移

从 `AnimationController.js` 迁移到：

- `js/animation/AnimationRetargeter.js`

影响：

- 骨骼候选名称和 Mixamo -> Humanoid 映射逻辑不再污染 controller。
- 后续可以按角色配置 `retargetProfile` 或接入更专业的 VRM retarget adapter。

### 角色 manifest 扩展

修改：

- `js/avatar/CharacterManager.js`
- `backend/server.js`
- `public/avatars/alice/meta.json`
- `public/avatars/osa_shiro/meta.json`
- `public/avatars/osa_wambo/meta.json`

新增兼容字段：

- `thumbnail`
- `skeleton`
- `animations`
- `voice`

保留旧字段：

- `motionManifest`
- `skeletonMap`
- `integrations`

原因：

- 新字段更接近长期角色 manifest。
- 旧字段保留，确保现有 Alice / Shiro / Wambo 和上传角色不被破坏。

### 事件与状态联动

修改：

- `js/script.js`

新增/强化状态：

- `animationState`
- `currentAnimation`
- `isAnimating`
- `lastInteractionAt`

改动：

- `interaction:hit` 事件现在由事件监听触发反应动作。
- `animation:action:start` 同步 `currentAnimation/isAnimating`。
- `animation:action:complete` 清理 `currentAnimation/isAnimating`。

### 快速切换角色的竞态修复

验证中发现：

- 浏览器快速连续切换 Alice / Shiro / Wambo 时，旧的异步加载流程可能与新的加载流程交错。
- `MotionManager.loadForCharacter()` 曾经在 `await loadJson()` 之后继续读取 `this.motionManifest`，如果期间发生 `unload()`，可能拿到 `null` 并触发 `Cannot read properties of null (reading 'slots')`。

修复：

- `MotionManager.loadForCharacter()` 改为使用局部 `motionManifest/skeletonMap` 完成一次加载，再同步到实例字段。
- `script.js` 新增 `requestAvatarSwitch()`，将 UI 触发的角色切换串行化，避免连续下拉切换产生并发加载。

影响：

- Alice / Shiro / Wambo 快速切换不会再因为旧异步流程残留导致动作 manifest 为空。
- 上传后自动切换也走同一条串行队列。

### 生命周期清理

新增：

- `AnimationController.destroy()`
- `MotionManager.destroy()`

改进：

- `AnimationController.reset()` 会移除 mixer `finished` listener。
- 清理 action、queue、completion timer、layer active 状态和 retarget/factory 引用。

### 文档

新增：

- `ANIMATION_ARCHITECTURE.md`

内容包括：

- 当前动画系统结构
- 每个模块职责
- 动作注册方式
- 状态机规则
- 队列和优先级策略
- 如何新增动作
- 如何给角色绑定动作
- 如何排查动画不播放问题

---

## 17. 第三轮：全局工程治理与代码质量

日期：2026-05-14  
目标：不新增大功能，不迁移框架，补齐工程治理基座，让后续迭代更容易检查、恢复和维护。

### 统一事件名

新增：

- `js/core/events/eventNames.js`

调整：

- `js/config/appConfig.js` 改为 re-export `EVENT_NAMES`

原因：

- 事件名不再散落在配置文件或业务代码中。
- 后续新增事件优先改 `eventNames.js`。

### 统一错误模型

新增：

- `js/core/errors/errorCodes.js`
- `js/core/errors/AppError.js`
- `js/core/errors/errorHandler.js`

覆盖范围：

- avatar 加载失败
- animation 播放失败预留
- audio/TTS 失败
- dialogue/LLM 请求失败
- n8n/RAG 请求失败
- 上传校验失败
- API 超时
- 配置错误

当前接入：

- `script.js` 初始化和 avatar 切换错误通过 `handleAppError()` 统一进入 `system:error` 和 StateStore。
- `LLMClient` 通过 `AppError` 表达 API timeout/request failure。
- `ApiClient` 统一生成 `AppError`。

### Logger 治理

修改：

- `js/core/logger.js`

能力：

- `debug/info/warn/error`
- 根据 `APP_MODE` 区分输出等级
- development 输出 debug 及以上
- production 默认只输出 warn/error

接入：

- `script.js`
- `TTSService.js`
- `AnimationController.js`
- `AnimationRetargeter.js`

保留：

- backend 和 scripts 仍使用 `console`，因为它们是命令行/Node 进程输出，不属于用户端开发日志。

### EventBus 生命周期

修改：

- `js/core/EventBus.js`

新增：

- `once()`
- `clear()`
- `destroy()`
- 自动记录 unsubscribe callbacks

接入：

- `script.js` 保存 `eventBus.on()` 的 disposer。
- `destroyApp()` 统一清理 eventBus、StateStore、Runtime、Motion、TTS、Speech 和 pointer listener。

### StateStore 分层

修改：

- `js/state/CompanionStateStore.js`
- `js/script.js`

新增能力：

- `setState()`
- `patchPath()`
- `reset()`
- `destroy()`

新增分层状态：

- `app`
- `avatar`
- `animation`
- `dialogue`
- `audio`
- `interaction`

兼容：

- 旧 flat 字段仍保留，避免一次性大改 UI 逻辑。
- `patchState()` 会同步关键 flat 字段到分层状态。

### 配置校验

新增：

- `js/config/configSchema.js`
- `js/config/validateConfig.js`

校验内容：

- timeout 范围
- interaction cooldown / drag threshold
- 默认 TTS engine
- avatar registry 默认角色、重复 id、meta 路径
- avatar meta 的 model、motion manifest、interaction mapping

接入：

- `CharacterManager.loadRegistry()`
- `CharacterManager.loadMeta()`
- `script.js` 初始化时运行 runtime config validation
- `scripts/check-config.mjs`

### 资源路径解析

新增：

- `js/core/resources/ResourceResolver.js`

能力：

- `resolveAvatarPath`
- `resolveAnimationPath`
- `resolveAudioPath`
- `resolveThumbnailPath`
- `normalizePublicPath`
- `validateAssetPath`
- `inferModelFormat`

接入：

- `CharacterManager.inferModelFormat()`

说明：

- 本轮只接入低风险路径。后续可以继续把 motion/audio/thumbnail 路径解析迁移进来。

### 统一 ApiClient

新增：

- `js/services/api/ApiClient.js`

能力：

- baseUrl
- timeout
- AbortController
- JSON/text/response parse
- FormData 支持
- 统一 AppError

接入：

- `LLMClient`
- `RagClient`
- `N8nClient`
- `script.js` 的 avatar upload

保留：

- `TTSService` 的音频请求仍保留专用 blob 流程。
- `loadJson()` 仍作为静态 JSON 资源加载工具。

### 生命周期清理

新增/修改：

- `SpeechRecognitionService.destroy()`
- `TTSService.destroy()`
- `script.js destroyApp()`

清理内容：

- Web Speech click listener
- speech recognition stop
- speech synthesis/audio stop
- pointer listener
- animation/runtime/state/eventBus

### 检查脚本

新增：

- `scripts/check-config.mjs`
- `scripts/check-assets.mjs`
- `scripts/smoke-test.mjs`

修改：

- `package.json`

新增命令：

```bash
npm run check:js
npm run check:config
npm run check:assets
npm run smoke
```

`npm run check` 现在会依次执行：

```bash
npm run check:js
npm run check:config
npm run check:assets
```

### 文档补齐

新增：

- `docs/ARCHITECTURE.md`
- `docs/MODULE_BOUNDARIES.md`
- `docs/EVENT_FLOW.md`
- `docs/STATE_MODEL.md`
- `docs/CONFIG_GUIDE.md`
- `docs/API_CONTRACT.md`
- `docs/DEVELOPMENT_GUIDE.md`

### 暂未改动

- 没有迁移 React/Vue/TypeScript，避免扩大风险。
- 没有一次性统一后端 API 响应格式，避免破坏现有前端调用。
- 没有删除旧 backend scaffold 文件，不确定外部用途。
- 没有实现复杂 RAG/n8n/长期记忆，只保留 client 和文档入口。
- 没有改 TTS blob 请求为通用 JSON ApiClient，因为音频二进制链路需要保持稳定。
