# REFACTOR NOTES

日期：2026-05-14  
目标：在保留当前 Alice/Shiro/Wambo、点击交互、语音兜底、角色上传能力的基础上，补齐数字伙伴系统的架构基座。

## 当前阶段状态

- 阶段 1“架构基座搭建”已基本完成。
- 当前项目重点转入阶段 2“MVP 交互闭环与稳定性验收”。
- 下面较早的记录中仍会保留 `script.js`、`server.js`、`meta.json` 等历史表述；若与当前实现冲突，以最新阶段复核、架构文档和本文件后续更新为准。

## 1. 文档交付

新增：

- `docs/reports/PROJECT_REVIEW_REPORT.md`
- `docs/refactor/ARCHITECTURE_REFACTOR_PLAN.md`
- `docs/refactor/REFACTOR_NOTES.md`

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

---

日期：2026-05-14  
目标：第二轮后续技术债收口，聚焦主流程拆分、后端服务层拆分、API 响应兼容和 DOM 生命周期管理。

## 15. 前端主流程拆分

新增：

- `js/app/bootstrap.js`
- `js/app/AppController.js`
- `js/ui/UIController.js`
- `js/ui/domRefs.js`
- `js/ui/ErrorView.js`
- `js/ui/StatusView.js`
- `js/ui/ShellController.js`
- `js/ui/SceneControlsController.js`
- `js/ui/AvatarSelectorController.js`
- `js/ui/LLMSettingsController.js`
- `js/ui/TTSSettingsController.js`
- `js/ui/InteractionPanelController.js`
- `js/ui/DomEffectsController.js`

修改：

- `js/script.js`

改动内容：

- `script.js` 收口为入口文件，只调用 `bootstrap()`。
- `AppController` 接管 Runtime、Manager、EventBus、StateStore、Dialogue/TTS 和 UI 的装配。
- `UIController` 负责装配侧边栏、角色、TTS、LLM、交互、场景控制等子控制器。
- DOM 查询集中到 `domRefs.js`，减少散落查询和重复绑定。

影响范围：

- 保留原页面加载、Alice/Shiro/Wambo 切换、点击交互、聊天输入和 TTS 试听主流程。
- 以后新增 UI 面板时优先新增独立 UI Controller，不再继续膨胀入口文件。

## 16. DOM 生命周期管理

新增：

- `js/core/lifecycle/DisposableRegistry.js`

改动内容：

- 支持统一记录 DOM listener、timeout、interval、AbortController 和自定义 dispose。
- `AppController` 管理全局 resize、事件订阅和主流程延时。
- `UIController` 与各子 UI Controller 使用 registry 管理 DOM listener。
- `AppController.destroy()` 同时释放语音识别服务，避免 voice button 监听残留。

影响范围：

- 降低重复初始化造成事件重复触发的风险。
- 页面卸载或后续组件化挂载时，有统一清理入口。

## 17. API 响应兼容层

修改：

- `js/services/api/ApiClient.js`

改动内容：

- 新增 `normalizeApiResponse()`。
- 兼容旧响应对象/数组、新响应 `{ ok: true, data }`、新错误 `{ ok: false, error }`。
- `ApiClient` 统一把 `{ ok: false }` 转成 `AppError`。
- 请求超时和外部 AbortSignal 统一收口到内部 AbortController。

影响范围：

- 当前旧接口无需立刻改响应格式。
- 后续新接口可以逐步采用 `{ ok, data, error }`。

## 18. JSON 与资源加载封装

修改：

- `js/core/loadJson.js`

改动内容：

- JSON 路径先经过 `ResourceResolver` 标准化。
- JSON 加载失败会抛出 `AppError`，并通过 logger 输出来源和路径。

影响范围：

- 角色 registry、meta、motions、skeleton 等 JSON 加载错误更容易定位。
- 不改变成功路径的数据结构。

## 19. 后端 server 拆分

新增：

- `backend/config/serverConfig.js`
- `backend/routes/healthRoutes.js`
- `backend/routes/avatarRoutes.js`
- `backend/routes/dialogueRoutes.js`
- `backend/routes/ttsRoutes.js`
- `backend/services/AvatarService.js`
- `backend/services/UploadValidationService.js`
- `backend/services/StaticAssetService.js`
- `backend/utils/httpError.js`
- `backend/utils/number.js`
- `backend/utils/request.js`
- `backend/utils/response.js`
- `backend/utils/serverLogger.js`

修改：

- `backend/server.js`

改动内容：

- `server.js` 只负责 OPTIONS、路由分发、静态资源兜底、统一错误响应和启动服务。
- Avatar registry / 上传落盘 / meta 生成迁移到 `AvatarService`。
- `.vrm/.glb/.gltf` 上传内容校验迁移到 `UploadValidationService`。
- LLM 与 TTS HTTP 处理拆到 routes。
- 静态资源服务拆到 `StaticAssetService`。
- 响应工具增加 `sendOk()` / `sendError()`，但当前旧接口仍保留旧返回结构。

影响范围：

- `/api/health`
- `/api/avatars`
- `/api/chat`
- `/api/tts`
- 静态资源服务

注意：

- 旧的 `backend/routes/apiRoutes.js`、`backend/controllers/userController.js`、`backend/models/userModel.js` 仍未接入主服务，本轮没有删除，避免误删不确定用途的 scaffold。
- 当前后端仍是本地开发服务；公网部署前仍需鉴权、CORS 来源限制、上传扫描和限流。

## 20. 文档更新

修改：

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/api/API_CONTRACT.md`
- `docs/guides/DEVELOPMENT_GUIDE.md`

改动内容：

- 记录 `script.js -> bootstrap -> AppController -> UIController` 的前端入口链路。
- 记录 `backend/server.js -> routes/services/utils` 的后端结构。
- 说明 API 合约处于兼容迁移期。
- 说明 DOM listener 生命周期管理方式。
- 标注下一轮继续拆动画系统时的建议入口。

---

日期：2026-05-14  
目标：收口上一轮风险点，并启动下一轮动画请求链路优化。

## 21. 风险内容处理

修改：

- `backend/routes/apiRoutes.js`
- `backend/controllers/userController.js`
- `backend/models/userModel.js`
- `backend/config/dbConfig.js`
- `backend/README.md`
- `docs/security/DEPLOYMENT_SECURITY.md`

改动内容：

- 对旧 Express scaffold 文件增加 `TODO(legacy-scaffold)` 标记，明确它们没有挂载到当前 `backend/server.js`，新逻辑不要继续写入这些文件。
- 新增部署安全清单，明确当前后端是本地开发服务，不应直接裸露公网。
- 在后端 README 中补充 CORS 白名单、接口鉴权、上传限流、文件扫描、日志脱敏和 API Key 管理要求。

影响范围：

- 不改变运行时代码路径。
- 降低后续误把旧 scaffold 当成主服务入口的风险。

## 22. 动画请求链路优化

新增：

- `js/animation/MotionSlotRegistry.js`

修改：

- `js/animation/MotionManager.js`
- `js/animation/AnimationController.js`
- `js/interaction/InteractionManager.js`
- `js/app/AppController.js`
- `docs/architecture/ANIMATION_ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/guides/DEVELOPMENT_GUIDE.md`

改动内容：

- 将标准动作槽位、槽位默认参数、`motionSlot -> AvatarState` 映射、`motions.json` 解析逻辑从 `MotionManager` 拆到 `MotionSlotRegistry`。
- `InteractionManager` 改为直接依赖轻量 `MotionSlotRegistry` 常量，不再为了拿 slot 常量而导入完整 `MotionManager`。
- `AnimationController` 新增 `requestAction()`，作为动作进入状态机/队列/分层播放前的统一入口。
- `MotionManager.requestSlot()` 改为请求标准 slot，而不是先把 slot 转成 state 再走 `setState()`。
- `AppController.triggerReaction()` 改为调用 `motionManager.requestSlot()`，保留原有点击台词和 TTS 逻辑。
- 如果动作被 cooldown/队列策略忽略，`AnimationController` 会回滚本次尝试进入的临时状态，避免内部状态卡住。
- gesture slot 默认开启 `replacePending`，快速点击时会保留当前 active 动作和最新 pending 动作，避免播放一长串过期点击动作。

当前主链路：

```text
InteractionManager
  -> motionSlot
  -> MotionManager.requestSlot()
  -> MotionSlotRegistry
  -> AnimationController.requestAction()
  -> AnimationStateMachine
  -> AnimationQueue
  -> AnimationBlender
  -> returnToIdle
```

影响范围：

- 保留 Alice/Shiro/Wambo 的点击交互和动作 fallback。
- 为后续新增动作槽位、角色动作差异配置、动作调试面板打基础。

注意：

- `AnimationStateMachine` 里仍保留旧状态到动作计划映射，兼容 `setAvatarState()` 的思考/说话/idle 等状态入口。
- 下一轮可以继续把 `AnimationController` 的“加载 FBX”和“播放执行”再拆成更小运行时模块。

---

日期：2026-05-15  
目标：治理项目根目录，收拢文档、归档历史资产，并保持运行时路径清晰。

## 23. 项目文件结构治理

新增：

- `docs/architecture/`
- `docs/api/`
- `docs/guides/`
- `docs/product/`
- `docs/process/`
- `docs/refactor/`
- `docs/reports/`
- `docs/security/`
- `archive/README.md`
- `archive/legacy-config/`
- `archive/legacy-scripts/`
- `archive/source-assets/`
- `archive/unknown/`

搬迁：

- 根目录架构/审查文档迁入 `docs/architecture/`、`docs/refactor/`、`docs/reports/`
- 原 `docs/` 一级文档按主题拆入 `architecture/api/guides/product/security`
- `01文档/` 内容迁入 `docs/product/` 与 `docs/process/`
- 旧 `config/` 迁入 `archive/legacy-config/runtime-config/`
- 一次性脚本 `scripts/patch_loader_multiple_5.py` 迁入 `archive/legacy-scripts/`
- 原始模型素材 `02模型/` 迁入 `archive/source-assets/models/02模型/`

清理：

- 移除被 Git 跟踪的 `.DS_Store`
- `.gitignore` 改为忽略 `archive/source-assets/`，避免原始大素材重新进入待提交列表

文档修复：

- 重写 `docs/README.md` 为新的文档索引
- 新增 `archive/README.md` 说明归档目录边界
- 修复 `backend/README.md`、`docs/guides/DEVELOPMENT_GUIDE.md`、`docs/architecture/ARCHITECTURE.md` 的相对链接
- 更新本文件与 `ARCHITECTURE_REFACTOR_PLAN.md` 中的文档路径引用

结果：

- 根目录只保留项目级文件、HTML 入口和目录。
- 运行时代码路径未改动，归档内容不会被新代码直接引用。

---

日期：2026-05-15  
目标：按“split app and server entry flows”清单补齐入口边界、资源加载与兼容层。

## 24. 入口流拆分核对与补齐

---

日期：2026-05-15  
目标：按阶段验收标准补齐第一阶段“项目结构治理”的最后缺口。

## 25. 阶段验收补齐：运行时资源收口

### 发现的问题

- 根目录虽然已经完成文档与旧素材归档，但当前真正被运行时引用的 `models/` 目录仍停留在根目录。
- 这与“旧模型、动画资源统一归档到 `assets/models` 或 `public/models`”的阶段标准仍有一处不一致。

### 本轮改动

- 将当前运行时模型和动作目录从 `models/` 迁入 `public/models/`
- 同步修复 Alice 的 `manifest.json`、`meta.json`、`motions.json` 静态资源路径
- 同步修复上传新角色时生成的默认动作路径
- 更新 `README.md`、`docs/README.md`、`AVATAR_ARCHITECTURE.md`、`ANIMATION_ARCHITECTURE.md`、`PROJECT_REVIEW_REPORT.md`、`AGENTS.md` 中的目录说明
- 删除根目录残留 `.DS_Store`

### 移动清单

- `models/animations/` -> `public/models/animations/`
- `models/characters/` -> `public/models/characters/`
- `models/environments/` -> `public/models/environments/`
- `models/objects/` -> `public/models/objects/`

### 风险与处理

- **静态资源路径变化风险**：已同步修改 Alice 现有 manifest / motions 与新上传角色默认动作模板，避免加载 404。
- **历史文档失真风险**：当前架构文档与 README 已同步更新；旧归档材料保持原样，不再作为运行时真相来源。
- **业务行为回归风险**：本轮只迁移目录和修复引用，不改变动画、交互、TTS 逻辑。

### 结果

- 根目录继续只保留项目级文件、入口和目录。
- 运行时可公开访问的模型/动画资源统一位于 `public/models/`。
- 第一阶段结构治理标准现已完整闭环。

### 验证

- `npm run check` 通过
- `npm run check:config` 通过
- `npm run check:assets` 通过
- `npm run smoke` 通过（在本地服务启动后执行）
- `GET /public/models/characters/avatar_v2.glb` 返回 `200`
- `GET /public/models/animations/boot.fbx` 返回 `200`
- 浏览器页面可正常启动，Alice 可从 `BOOT` 自动回到 `IDLE`
- `/api/avatars` 仍返回 Alice / Shiro / Wambo

---

日期：2026-05-15  
目标：把四阶段达标项固化为可重复执行的 smoke / regression 验收。

## 31. 阶段验收自动化

### 新增检查

- 新增 `scripts/check-regression.mjs`
  - 校验 `idle -> boot -> idle`
  - 校验动作队列的 `cooldown`、高优先级打断、循环动作去重
  - 校验 Alice / Shiro / Wambo 都继续走 `manifest.json`
  - 校验每个角色具备 `intro / idle / headTap / armTap / legTap` 动作能力，兼容显式 slot 与 procedural fallback
  - 校验 TTS 默认仍是 `browser`，未知 provider 会 fallback 到 `browser`
  - 校验前端默认 TTS 配置中不出现 API key 字段

- 增强 `scripts/smoke-test.mjs`
  - 除 `/api/health`、`/api/avatars` 外，继续通过 HTTP 校验每个角色的 `manifest`
  - 校验 `model / motionManifest / skeletonMap` 静态资源可访问
  - 校验关键动作槽位在运行态 manifest 链路中可读取

### npm scripts

- 新增 `npm run check:regression`
- `npm run check` 现在会把 regression check 一并纳入总检查

### 目的

- 以后继续改 Agent、RAG、口型同步或更换角色时，先把已经稳定的主流程保护住。
- 让“能跑”从人工记忆变成可重复的工程断言。

---

日期：2026-05-16  
目标：进入阶段 2 前，补齐 MVP 目标、Codex 执行标准和下一阶段计划，并同步历史文档状态。

## 32. 阶段 2 文档基线

新增：

- `docs/product/MVP_ACCEPTANCE.md`
- `docs/process/CODEX_EXECUTION_STANDARD.md`
- `docs/process/NEXT_PHASE_PLAN.md`

同步：

- `README.md`
- `docs/README.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/reports/PROJECT_REVIEW_REPORT.md`
- `docs/refactor/CHANGESET_BOUNDARIES.md`
- `docs/refactor/REFACTOR_NOTES.md`

结果：

- 明确当前已完成阶段 1，下一步进入阶段 2“MVP 交互闭环与稳定性验收”。
- 为阶段 2 写清楚用户链路、验收标准、执行规范、分期计划和不做事项。
- 历史审查报告保留原始基线，同时新增“已处理 / 仍待处理”状态更新，避免后续被旧结论误导。

前端新增/调整：

- `js/ui/SettingsController.js`
- `js/ui/ChatPanelController.js`
- 删除已被拆空的 `js/ui/ShellController.js`
- `js/ui/UIController.js`

结果：

- `js/script.js` 继续只保留 `bootstrap()` 入口。
- 侧边栏开关和聊天输入从原先混合 controller 拆成独立 controller。
- DOM listener 继续统一由 `DisposableRegistry` 管理。

资源加载新增/调整：

- `js/core/resources/StaticAssetLoader.js`
- `js/core/loadJson.js`
- `js/services/api/ApiClient.js`
- `js/avatar/AvatarLoader.js`
- `js/animation/AnimationController.js`

结果：

- `loadJson()` 现在通过 `ResourceResolver + ApiClient + AppError + logger`。
- JSON API 仍兼容旧格式、`{ ok: true, data }`、`{ ok: false, error }`。
- 模型和动画静态资源通过 `StaticAssetLoader` 统一解析路径并包装加载错误。

后端新增/调整：

- `backend/middleware/corsMiddleware.js`
- `backend/middleware/errorMiddleware.js`
- `backend/routes/router.js`
- `backend/server.js`

结果：

- `backend/server.js` 只负责创建 server、挂载顶层 middleware/router、启动监听。
- 路由分发迁入 `routes/router.js`，CORS 与顶层错误处理迁入 middleware。

---

日期：2026-05-15  
目标：处理上一轮总结中仍留着的注意事项。

## 25. 风险项收口

TTS 传输统一：

- `js/voice/TTSService.js`
- `js/services/api/ApiClient.js`

改动内容：

- 后端 TTS 请求不再裸用专用 `fetchWithTimeout()`。
- 改为统一调用 `ApiClient.response()`，共享 timeout、HTTP error、`AppError` 模型。
- 音频二进制播放仍保留 `Response -> Blob -> Audio`，不破坏试听链路。
- 后端超时时继续转换成“已准备切换到免费本机语音兜底”的用户可读错误。
- 后端 TTS 失败但可自动兜底时只记 info，不再把预期降级写成 console error。

综合 diff 审查边界：

- 新增 `docs/refactor/CHANGESET_BOUNDARIES.md`
- 把当前多轮改动按入口拆分、动画链路、目录治理、资源/TTS 统一 4 组写清楚。
- 当前没有自动提交；如果后续需要拆提交，可按文档中的建议顺序执行。

---

日期：2026-05-15  
目标：在不重复重做动画系统的前提下，完成角色配置主入口标准化。

## 26. Avatar Manifest 标准化

已确认：

- 动画系统工程化已完成主体拆分，当前没有必要为了目录名再次重构。
- 角色体系此前仍以 `meta.json` 为主，尚未达到“每个角色一个 `manifest.json`”的目标。

本轮改动：

- 为 `alice`、`osa_shiro`、`osa_wambo` 新增 `manifest.json`。
- `registry.json` 新增 `manifest` 字段，同时保留旧 `meta` 字段。
- `CharacterManager` 通过 `ResourceResolver.resolveAvatarManifestPath()` 优先读取 manifest。
- 新增 `validateAvatarManifest()`，旧 `validateAvatarMeta()` 保持兼容转发。
- `check-config`、`check-assets` 改为优先校验 manifest。
- `AvatarService` 上传新角色时生成 `manifest.json`，并在返回 registry 前读取 manifest 补全角色名称。

收益：

- 新增角色时已经可以把模型、动作、骨骼、交互、声音统一放进单一 manifest。
- 旧角色和旧上传流程仍然可用，没有引入破坏式迁移。
- 后续若要逐步删除旧 `meta.json` 依赖，只需要继续缩小兼容层，不需要再改核心装载链路。

---

日期：2026-05-15  
目标：把“对话 -> 语音 -> 动画”主链路从装配层直连，收口为事件驱动流程。

## 27. Dialogue-Audio-Animation 联动

新增：

- `js/audio/AudioManager.js`

调整：

- `DialogueManager` 改为统一使用 `EVENT_NAMES`，并补齐 `dialogue:thinking` / `dialogue:response`。
- `AppController` 通过事件监听更新 dialogue/audio 状态。
- `audio:start` 触发 `speaking` 槽位，`audio:end` / `audio:error` 触发 `idle` 槽位。
- `LLM` 错误进入 `handleAppError()`，继续保留可恢复的语音兜底文本。

结果：

- `DialogueManager` 不操作 DOM。
- `AudioManager` 不操作 DOM。
- 对话、语音、动画之间的协作点已经集中到 EventBus，而不是继续把状态跳转散落到聊天处理函数里。
- 后续接 RAG、n8n、更多 TTS provider 时，可以继续挂在 `DialogueManager` / `AudioManager` 外围，不需要重写 UI。

---

日期：2026-05-15  
目标：继续收口角色兼容层，并把剩余音频 UI 逻辑从装配层下沉。

## 28. Manifest 兼容层收口

角色配置：

- 内置 registry 条目只保留 `manifest`，不再把 `meta` 作为并列主字段。
- `CharacterManager.loadManifest()` 成为主入口，旧 `loadMeta()` 仅保留兼容代理。
- 运行时先读 `manifest`；只有旧 registry 条目仍声明了 `meta` 且 manifest 不可用时，才会走 fallback。
- `AvatarService` 的新上传流程只生成 `manifest.json`，新角色不再新增 `meta.json`。

音频 UI：

- 新增 `AudioStatusController`。
- 新增 `audio:request` 事件。
- `AppController` 不再负责拼 TTS 状态文案；成功、fallback、错误提示都由 UI controller 消费音频事件后展示。

收益：

- 新旧角色配置的边界更清楚，后续删除 legacy `meta.json` 依赖会更容易。
- 新角色新增流程已经完全固定到 manifest。
- `AppController` 更接近装配层职责，语音 UI 和语音业务的边界更干净。

---

日期：2026-05-15  
目标：为 legacy `meta.json` fallback 补充可执行回归，并给兼容层设置明确退场时间。

## 29. Legacy Meta 回归与退场计划

新增：

- `js/avatar/AvatarManifestLoader.js`
- `scripts/check-legacy-avatar-compat.mjs`
- `tests/fixtures/avatars/legacy-meta-only/*`
- `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md`

改动：

- `CharacterManager` 改为复用独立的 `AvatarManifestLoader`，生产代码与回归脚本共用同一段 fallback 逻辑。
- `loadMeta()` 标注为 deprecated：`2026-05-15` 起废弃，`2026-08-16` 起满足条件后可删除。
- `npm run check` 现在会自动包含 `npm run check:legacy-avatar`。
- 当运行时真的走到 legacy `meta` fallback，会输出带截止日期的 warning。

结果：

- legacy 兼容不再只是“代码还没删”，而是有了真实 fixture 和回归检查。
- 删除窗口已经明确：支持到 `2026-08-15`，`2026-08-16` 起按文档条件清理。

### 本阶段收口补强

- `check:legacy-avatar` 现在除了验证 fallback 顺序，还会验证 fallback 后的配置能通过 avatar manifest schema。
- `validateAvatarRegistry()` 现在拒绝 `manifest + meta` 双轨条目，避免新配置重新长回两套入口。
- `check:config` 会对仍存在的 `meta`-only 历史角色输出兼容截止日期提示，方便迁移跟踪。

---

日期：2026-05-15  
目标：按新的阶段提示词复核 Avatar Manifest 标准化是否仍有未完成工作。

## 30. Avatar Manifest 阶段复核

逐项确认：

- 每个内置角色都已拥有独立 `manifest.json`。
- `model / skeleton / animations / interactions / voice` 已全部进入 manifest。
- 新增角色主流程只需要新增资源和 manifest，不需要改核心代码。
- `/api/avatars` 返回 Alice / Shiro / Wambo，并使用 manifest-only registry 输出。
- `AvatarService` 已读取 manifest，`ResourceResolver` 负责路径解析。
- `validateAvatarManifest()` 和 `check:config` 已负责 manifest 校验。
- 新增角色流程已经写入 `docs/guides/CONFIG_GUIDE.md`。

本轮没有重复改造以下内容：

- 没有为了贴合示例目录而搬移 Alice 的旧模型二进制资源。
- 没有为了示例扩展名而把 Shiro / Wambo 的 `.vrm` 强行改名或重导出。
- 没有虚构 thumbnail 资源；字段已配置，真实缩略图可在后续 UI 需要时再补。

原因：

- 这些属于资源整理或体验增强，不是 Manifest 标准化的功能缺口。
- 继续强行搬资产会增加二进制改动和回归风险，收益低于当前阶段目标。

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

- `docs/architecture/ANIMATION_ARCHITECTURE.md`

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

- `TTSService` 的后端请求已统一走 `ApiClient.response()`，音频播放阶段仍保留 `Response -> Blob -> Audio`。
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

- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/EVENT_FLOW.md`
- `docs/architecture/STATE_MODEL.md`
- `docs/guides/CONFIG_GUIDE.md`
- `docs/api/API_CONTRACT.md`
- `docs/guides/DEVELOPMENT_GUIDE.md`

### 暂未改动

- 没有迁移 React/Vue/TypeScript，避免扩大风险。
- 没有一次性统一后端 API 响应格式，避免破坏现有前端调用。
- 没有删除旧 backend scaffold 文件，不确定外部用途。
- 没有实现复杂 RAG/n8n/长期记忆，只保留 client 和文档入口。
- 没有把 TTS 音频内容强行改成 JSON 解析；当前只统一请求传输层，播放层继续保持二进制链路稳定。

## 33. Phase 2.1 Debug 状态面板

- 新增 `js/ui/DebugPanelController.js`，以只读方式消费 `CompanionStateStore` 与 `EventBus`。
- `APP_MODE=development` 时默认展示 Debug Panel；`?debug=1` 可强制显示，`?debug=0` 可强制隐藏。
- 面板默认折叠，展示 app、avatar、animation、dialogue、audio、最近交互、最近错误与最近事件。
- Debug Panel 统一通过 `textContent` 写入文本，不拼接外部 HTML，不接触 API Key 或敏感配置。
- `UIController` 将其作为独立子控制器装配，监听器与动态 DOM 统一纳入现有 `DisposableRegistry` 生命周期。
- 顺手修复分层动画状态在动作结束后无法把 `currentAnimation` 正确清空的问题，避免调试状态残留旧动作名。
- 本轮没有修改动画核心、后端接口或业务主链路，只补充开发态可观察性。

## 34. Phase 2.2 对话 / 语音 / 动作状态闭环

- `AudioManager` 现在会兜住未预期的 `TTSService` 抛错，并统一收敛为 `audio:error` 事件，避免静默 promise rejection 让状态链路失联。
- `AppController` 在 LLM 失败时会把本地兜底回复也写入 `dialogue:assistant`，让调试状态与用户实际听到的内容一致。
- `speakText()` 明确将音频播放作为 fire-and-forget 异步任务，不再让未使用的 Promise 语义含糊。
- `resetSpeakingState()` 现在在定时兜底触发时也会把动画状态收回 `idle`，修复 fallback 场景下 `isSpeaking=false` 但角色仍停留在 `speaking` 的状态分裂。
- `DebugPanelController` 对错误对象会优先显示 `message`，避免面板出现 `[object Object]`。
- 新增 `scripts/check-mvp-flow.mjs`，覆盖对话成功、对话失败、音频成功、静音、fallback、异常收口六条轻量主链路。
- `npm run check` 已纳入 `check:mvp-flow`，后续改动会自动保护 `thinking -> speaking -> idle` 的事件基础。

## 35. Phase 2.3 角色切换与上传稳定性

- `CharacterManager.switchCharacter()` 不再在加载新角色前提前卸载当前角色；manifest 或模型加载失败时，已有可用角色会被保留。
- `AppController` 在切换开始时停止旧音频，并用 `avatarSwitchVersion` 防止旧切换的延迟回调污染后续角色状态。
- 切换失败时会恢复已保留角色的 `currentAvatarId / characterMeta / modelLoaded`，并让交互映射继续指向可用角色。
- `AvatarSelectorController` 会在切换结束后用真实 `currentAvatarId` 回写下拉框，避免失败时 UI 停留在不可用目标。
- Debug Panel 新增 `avatar.loading`，可以直接观察角色加载过程。
- 新增 `scripts/check-avatar-flow.mjs`，覆盖 registry 主入口、manifest/id 一致性、关键资源存在性、动作能力和运行时路径约束。
- `scripts/smoke-test.mjs` 新增非法上传回归：确认非 `.vrm/.glb/.gltf` 文件会被拒绝，且失败上传不会污染 registry。

## 36. Phase 2.4 自动化回归补强与浏览器验收沉淀

- 新增 `scripts/check-runtime-contracts.mjs`，覆盖事件名、EventBus、CompanionStateStore、Debug Panel 与 AppController 关键收口合约。
- `npm run check` 已纳入 `check:runtime-contracts`，进一步保护 MVP 主链路的运行时边界。
- 新增 `scripts/check-browser-capability.mjs`，只检测本地是否已有 Playwright，不联网安装，不纳入强制 check。
- 新增 `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md`，沉淀角色连切、点击交互、对话/TTS fallback、非法上传和控制台检查的浏览器手动验收清单。
- `README.md` 与 `docs/README.md` 已补充验收入口，明确浏览器级验收仍需手动执行。
- `DebugPanelController` 增加 `destroy()`，与运行时生命周期合约保持一致。

## 37. Phase 2.5 RAG / n8n / Agent 后端边界准备

- 新增 `backend/services/DialogueOrchestrationService.js`、`MemoryService.js`、`RagService.js`、`N8nWorkflowService.js`，只建立后端 service 边界，不连接真实外部服务。
- 新增 `POST /api/dialogue`，当前返回 `{ ok: true, data }` boundary stub；现有 MVP 主链路仍继续使用 `/api/chat`。
- `RagClient` 与 `N8nClient` 收紧为只能调用本项目后端 `/api/` 路径，避免前端直接连接 Qdrant 或 n8n webhook。
- 新增 `scripts/check-integration-boundaries.mjs`，并纳入 `npm run check`，用于保护前端 secret 边界、后端 dialogue service 边界和 `/api/dialogue` 文档合约。
- `scripts/smoke-test.mjs` 新增 `/api/dialogue` smoke 验收，确认 boundary stub 稳定返回且 memory / rag / workflow 默认不启用。
- 新增 `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md`，同步更新 API 文档、架构索引、MVP 验收与后端 README。

## 38. Phase 2.6 `/api/dialogue` LLM-only 编排

- 新增 `backend/services/LLMService.js`，抽出 `/api/chat` 原有 OpenAI-compatible provider 调用能力，避免 `/api/chat` 与 `/api/dialogue` 复制两套上游请求逻辑。
- `/api/chat` 继续保留旧响应结构 `{ reply }`，但内部改为复用 `LLMService`。
- `DialogueOrchestrationService` 现在支持真实 provider 的 `llm_only` 模式；Memory / RAG / Workflow 仍只返回 `disabled / not_configured`。
- `/api/dialogue` 保留 `provider: "stub" | "local" | "boundary"` 的本地 `llm_stub` 路径，供无 API Key 的 smoke 和边界检查使用，不代表生产 LLM。
- `scripts/smoke-test.mjs` 补充 `/api/dialogue` 的 stub 成功、optional context not_configured、空消息错误、unsupported provider 错误验收。
- `scripts/check-integration-boundaries.mjs` 更新为检查 `LLMService`、`llm_only` 和 `llm_stub` 合约。
- API 文档与 `DIALOGUE_BACKEND_BOUNDARY.md` 已更新：前端主链路尚未切换，真实 RAG / n8n / Memory 仍未接入。

## 39. Phase 2.7 前端主链路切换到 `/api/dialogue`

- `AppController` 的 `LLMClient` 默认 endpoint 从 `/api/chat` 切换为 `/api/dialogue`。
- `LLMClient` 默认 endpoint 同步改为 `/api/dialogue`，但仍可显式传入 `/api/chat` 作为回退兼容。
- `scripts/check-mvp-flow.mjs` 补充 LLMClient 对 `{ ok: true, data: { reply } }`、旧 `{ reply }`、`{ ok: false, error }` 的解析回归。
- `scripts/check-runtime-contracts.mjs` 增加 AppController 默认调用 `/api/dialogue` 的静态合约。
- 文档同步说明：前端主链路已切换，`/api/chat` 仍保留兼容，Memory / RAG / Workflow 仍未启用。

## 40. Phase 2.8 Local Stub Dialogue Provider

- 默认 LLM 配置改为 `provider: "stub"` / `model: "stub"`，让无 API Key 的本地开发环境也能跑通对话演示。
- 设置面板新增本地演示 Stub provider / model 选项，并允许 `LocalConfigStore` 保存该 provider。
- `LocalConfigStore` 增加一次性迁移：旧默认 `openai + gpt-4o-mini + 空 baseUrl` 会自动切到 `stub`，避免历史 localStorage 继续触发无 Key 错误。
- `DialogueOrchestrationService` 的本地 stub 回复改成简短中文数字伙伴文案，不访问外部网络、不读取真实 Key。
- `scripts/check-integration-boundaries.mjs` 新增前端 stub provider 边界检查，确保默认配置、设置面板与本地存储都支持 stub。
- 文档同步说明：`/api/dialogue` 仍是前端主入口，`/api/chat` 保留兼容；真实 provider 的错误链路不被吞掉。

## 41. Phase 2.9 MVP 基线封版与阶段 2 收口

- 新增 `docs/product/MVP_BASELINE.md`，记录阶段 2 封版结论、已确认能力、自动化验收基线、浏览器手动验收基线和下一阶段边界。
- `README.md`、`docs/README.md`、`MVP_ACCEPTANCE.md`、`ARCHITECTURE.md`、`NEXT_PHASE_PLAN.md` 同步更新为“阶段 2 已收口，下一阶段才进入真实 RAG / Memory / n8n / Agent”。
- 本轮只做文档基线收口，不修改业务代码、模型资源、动画资源、TTS 逻辑或后端接口。

## 42. Phase 3.1 真实智能能力路线决策

- 新增 `docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md`，明确 `/api/dialogue` 长期职责、后端 orchestration 边界、LLM/Memory/RAG/n8n/Agent 推荐路线。
- 新增 `docs/process/PHASE3_IMPLEMENTATION_PLAN.md`，将 Phase 3 拆为 3.1 到 3.7，并为每阶段写明目标、范围、不做事项、验收标准、测试命令和风险。
- 新增 `docs/product/PHASE3_ACCEPTANCE.md`，定义真实 provider、Memory、RAG、n8n、Agent、安全、浏览器和自动化验收标准。
- 同步更新 README、docs 索引、`NEXT_PHASE_PLAN.md`、`DIALOGUE_BACKEND_BOUNDARY.md` 和部署安全文档。
- 本轮只做路线决策与文档规划，不接真实 Qdrant、n8n、Memory 数据库或新 provider，不修改业务代码。

## 43. Phase 3.2 真实 Provider 配置与演示模式切换

- 新增 `ProviderStatusService` 和 `GET /api/providers`，只返回 provider readiness、安全 mode、默认 model 和是否需要 Key，不返回真实 Key、secret、token 或上游地址。
- LLM 设置面板会读取 `/api/providers`，区分 `stub` 本地演示、真实 provider 已配置和未配置状态。
- `LLMService` 的未配置错误保持稳定错误码 `LLM_NOT_CONFIGURED`，同时避免在接口错误文案中暴露具体后端 env 名。
- 新增 `scripts/check-provider-config.mjs` 并纳入 `npm run check`，保护默认 stub、provider readiness 合约和前端 secret 边界。
- `smoke` 增加 `/api/providers` 验收，确认 stub 可用且 provider status 不泄露 secret-shaped 字段。
- 本轮不接真实 RAG、n8n、Memory 数据库，不新增依赖，不修改角色、模型、动画或 TTS 主逻辑。

## 44. Phase 3.3 Memory 最小闭环

- `MemoryService` 改为后端进程内短期 Memory，按 `sessionId` 保存最近 N 轮 user/assistant 消息，服务重启后自动丢失。
- `/api/dialogue` 支持 `sessionId` 与 `options.useMemory`；`useMemory=false` 保持 disabled，不读不写。
- `DialogueOrchestrationService` 会在 LLM/stub 回复后写入本轮 user/assistant，并在真实 provider prompt 中附加短期记忆上下文。
- 新增 `scripts/check-memory-flow.mjs`，覆盖 disabled、记录最近轮次、maxTurns 裁剪和真实 provider prompt 注入。
- `smoke` 增加短期 Memory 的两轮对话验收，同时确认 RAG / Workflow 仍未启用。
- 本轮不接 Qdrant、不接 n8n、不做 SQLite/JSON 长期记忆，不把 Memory 对话正文写入前端 localStorage。

## 45. Phase 3.4 Memory 前端开关与 Debug 可观测

- LLM 设置区新增短期 Memory 开关和 sessionId 显示，用户可开启 / 关闭后端进程内 Memory。
- `LocalConfigStore` 只保存 Memory 开关偏好和 sessionId，不保存用户/assistant 对话正文。
- `LLMClient` 会向 `/api/dialogue` 传递 `sessionId` 与 `options.useMemory`，并保留后端返回的 memory 元数据。
- `DialogueManager` 将 memory 元数据附加到 `dialogue:assistant` / `dialogue:response` 事件，`AppController` 同步到状态基座。
- Debug Panel 新增 `memory.enabled / memory.used / memory.turnCount / memory.sessionId`，方便浏览器验收当前会话记忆状态。
- `check:mvp-flow` 与 `check:runtime-contracts` 增加 Memory 请求、事件和 Debug 字段合约。
- 本轮不做长期记忆管理 UI、不做记忆编辑器、不接 RAG / n8n。
