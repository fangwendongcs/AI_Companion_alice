# PROJECT REVIEW REPORT

审查日期：2026-05-14  
项目定位：从 3D 数字人 Demo 演进为 AI Digital Companion System  
当前结论：项目已经完成了从“单一 Alice 模型”到“可配置角色注册表 + 动作槽位 + 后端 API 代理”的第一阶段升级，但主入口仍然偏重、状态/事件边界还不够清晰，后端上传和前端错误渲染存在需要优先收口的安全与维护风险。

## 1. 当前项目结构概览

```text
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── script.js
│   ├── ai/
│   │   └── LLMClient.js
│   ├── animation/
│   │   ├── ActionQueue.js
│   │   ├── AnimationController.js
│   │   ├── AnimationStateMachine.js
│   │   ├── MotionManager.js
│   │   └── states.js
│   ├── avatar/
│   │   ├── AvatarLoader.js
│   │   └── CharacterManager.js
│   ├── config/
│   │   ├── providers.js
│   │   └── voicePresets.js
│   ├── core/
│   │   ├── EventBus.js
│   │   └── loadJson.js
│   ├── interaction/
│   │   ├── HitTestController.js
│   │   └── InteractionManager.js
│   ├── scene/
│   │   └── SceneRuntime.js
│   ├── storage/
│   │   └── LocalConfigStore.js
│   └── voice/
│       ├── SpeechRecognitionService.js
│       ├── TTSProviderRegistry.js
│       └── TTSService.js
├── backend/
│   ├── server.js
│   ├── README.md
│   ├── config/dbConfig.js
│   ├── controllers/userController.js
│   ├── models/userModel.js
│   └── routes/apiRoutes.js
├── public/
│   └── avatars/
│       ├── registry.json
│       ├── alice/
│       ├── osa_shiro/
│       └── osa_wambo/
├── models/
│   ├── animations/
│   ├── characters/
│   ├── environments/
│   └── objects/
├── docs/
├── scripts/
│   └── check-js.mjs
└── package.json
```

`package.json` 当前只有两个脚本：

```json
{
  "dev": "node backend/server.js",
  "check": "node scripts/check-js.mjs"
}
```

项目没有 Vite/Webpack/TypeScript 构建链路，前端通过 `index.html` import map 从 CDN 加载 Three.js，再加载 `js/script.js`。

## 2. 当前核心模块说明

### 前端入口

- `index.html`：承载 Canvas、底部输入栏、右侧控制面板、角色切换/上传、LLM/TTS 配置、快捷动作、记忆档案等 UI。
- `css/style.css`：所有 UI 样式集中在一个文件，适合当前规模，但后续面板复杂度上升后会变重。
- `js/script.js`：当前总装配入口。负责应用初始化、UI 绑定、角色加载、动作触发、语音播报、LLM 请求、上传角色、状态徽章、配置读写。职责偏多，是目前最大的耦合点。

### 3D 与角色系统

- `js/scene/SceneRuntime.js`：封装 Three.js 场景、相机、renderer、OrbitControls、灯光、avatarRoot/avatarAnim、模型归一化、镜头适配、资源 dispose。
- `js/avatar/CharacterManager.js`：读取 `public/avatars/registry.json`，按角色 ID 加载 meta，调用 `AvatarLoader` 切换角色。
- `js/avatar/AvatarLoader.js`：基于 `GLTFLoader` 加载 `.vrm/.glb/.gltf` 容器，应用角色旋转/缩放/位置，收集可交互 Mesh，检查骨骼能力。
- `public/avatars/registry.json`：当前已注册 `alice`、`osa_shiro`、`osa_wambo` 三个角色。

### 动作系统

- `js/animation/MotionManager.js`：将业务动作槽位 `idle/intro/headTap/legTap/armTap/bodyTap/chat/speaking/listening` 转换成 `AnimationController` 可执行动作。
- `js/animation/AnimationController.js`：负责 FBX 加载、骨骼重定向、动作注册、程序化动作 fallback、分层动画、动作队列、动作完成后回 idle。
- `js/animation/AnimationStateMachine.js`：维护 `boot/idle/thinking/speaking/interacting/arm_action/head_action/leg_action` 状态迁移。
- `js/animation/ActionQueue.js`：按 layer 管理动作优先级、排队和中断。

### 交互系统

- `js/interaction/InteractionManager.js`：绑定 Canvas pointer 事件，命中后输出 `{ part, motionSlot }`。
- `js/interaction/HitTestController.js`：先用 raycast + skin weight 判断骨骼部位，命中不到时用屏幕空间最近骨骼兜底，解决细手臂/腿部不好点的问题。

### 声音、语音和对话

- `js/voice/TTSService.js`：统一浏览器原生语音和后端 TTS 播放，后端失败时可回退浏览器语音。
- `js/voice/TTSProviderRegistry.js`：抽象 `browser/openai/minimax` 三类 TTS provider。
- `js/config/voicePresets.js`：MiniMax 和 OpenAI 声线候选。
- `js/voice/SpeechRecognitionService.js`：Web Speech API 语音识别。
- `js/ai/LLMClient.js`：通过后端 `/api/chat` 调用 LLM。

### 后端

- `backend/server.js`：一个原生 Node HTTP server，同时负责静态资源、`/api/chat`、`/api/tts`、`/api/avatars` 上传、角色 registry 更新。
- API Key 已迁移到后端环境变量，前端 UI 中的 key 输入框已禁用。
- `backend/routes/apiRoutes.js`、`controllers/userController.js`、`models/userModel.js`、`config/dbConfig.js` 是旧 Express 风格占位文件，目前未被 `backend/server.js` 使用。

## 3. 当前代码中的主要问题

### P0：前端错误页存在不必要的 HTML 注入风险

位置：`js/script.js` 的 `showLoadingError(message)`

当前用 `innerHTML` 拼接 `message`。虽然主要来自本地资源加载错误，但错误文本可能包含 URL、文件名或上游返回内容。数字伙伴系统后续会接上传、RAG、后端错误、模型服务错误，错误消息来源会变复杂，应该统一使用 `textContent` 构造 DOM。

收益：消除 XSS/HTML 注入入口。  
风险：低，只影响错误页渲染方式。  
影响范围：初始化失败、模型加载失败提示。

### P0：上传模型仅校验扩展名，缺少基础内容校验

位置：`backend/server.js` 的 `handleAvatarUpload`

当前只检查 `.vrm/.glb/.gltf` 扩展名，未检查文件为空、GLB magic、glTF JSON 是否基本合法。个人本地项目风险可控，但长期做成可上传系统后，这是后端边界必须补上的能力。

收益：减少错误文件进入 `public/avatars`，降低资源污染和前端异常概率。  
风险：中低，过严校验可能拒绝少数非标准 glTF。  
影响范围：`POST /api/avatars`。

### P0/P1：主入口 `js/script.js` 职责过重

`script.js` 同时负责：

- 读取和保存 LLM/TTS/localStorage 配置
- 初始化 Three.js runtime
- 加载角色 registry/meta
- 切换角色
- 动作状态切换
- 点击交互台词
- LLM 调用
- TTS 播放
- 语音识别绑定
- 上传角色
- 所有 UI 事件绑定
- 错误提示和状态徽章

这会导致后续接入 RAG、长期记忆、Agent 工作流、情绪系统时继续堆在同一个文件里。

收益：拆出状态、事件、配置、对话服务后，后续能力可以按模块接入。  
风险：中，入口重构容易影响现有功能，因此应小步拆。  
影响范围：全局初始化、UI 绑定、对话链路。

### P1：EventBus 已存在但没有成为模块边界

位置：`js/core/EventBus.js`

当前 `EventBus` 是轻量可用的，但主流程仍然是模块互相直接调用：

```text
点击 -> triggerReaction -> setAvatarState -> MotionManager
LLM 回复 -> setAvatarState -> speakText -> TTSService
TTS end -> resetSpeakingState -> setAvatarState
```

这对当前 Demo 能跑，但后续表情、口型同步、字幕、日志、调试面板、RAG 状态、Agent 状态都要监听同一批事件，直接调用会越来越乱。

收益：建立 `interaction:* / animation:* / audio:* / dialogue:* / system:*` 事件语义，降低横向耦合。  
风险：低到中，先作为观测与状态同步层，不强行事件化全部业务。  
影响范围：`script.js`、动画/语音/交互回调。

### P1：状态模型分散

当前状态分散在：

- `script.js` 的 `state`
- `MotionManager/AnimationController` 的 `currentState`
- `SpeechRecognitionService.isRecording`
- `TTSService.currentAudio`
- UI DOM 文本和 class
- localStorage

这些状态没有统一快照，调试时很难回答“当前系统是否在加载/思考/说话/允许交互/当前角色是什么/当前 TTS 引擎是什么”。

收益：补一个轻量状态 store，能服务调试面板、日志、未来 Agent/RAG 状态联动。  
风险：低，不需要引入 Redux/Zustand。  
影响范围：`script.js` 和未来调试 UI。

### P1：动作控制器过大，程序化动作和重定向逻辑混在同一文件

位置：`js/animation/AnimationController.js`

当前这个文件包含：

- FBX 加载
- `AnimationMixer` 管理
- ActionQueue 执行
- 状态完成回调
- Mixamo 到目标骨骼的 retarget
- humanoid bone candidates
- 程序化 idle/speaking/listening/headTap/legTap/armTap/bodyTap/chat clip 工厂

这解决了 Shiro/Wambo 无动作的问题，但长期看应该拆成：

```text
AnimationController
AnimationRegistry
RetargetingAdapter
ProceduralMotionFactory
LayeredAnimationMixer
```

收益：后续新增表情/口型/角色动作包时更清晰。  
风险：中，动画链路敏感，建议分阶段拆。  
影响范围：全部动作播放。

### P1：交互系统已有雏形，但缺少防抖/拖拽阈值配置

位置：`js/interaction/InteractionManager.js`

当前 `pointermove` 一触发就认为拖拽，轻微移动可能吞掉点击；连续点击也没有冷却。后续要支持触摸、拖拽、语音唤醒、快捷按钮，应该把交互节流、防抖、命中参数配置化。

收益：减少动画队列被连续点击打乱，也改善触摸设备体验。  
风险：低。  
影响范围：点击身体部位触发动作。

### P1：Three.js Runtime 有基本 dispose，但缺少完整 destroy 生命周期

位置：`js/scene/SceneRuntime.js`

`clearAvatarObject()` 会释放几何体和材质，这是好的。但 `render()` 递归 `requestAnimationFrame` 没有保存 frame id，也没有 `destroy()` 取消 RAF、释放 controls、renderer、监听。这在单页运行问题不大，但后续如果做 SPA 页面切换、热替换、嵌入式组件，会有泄漏风险。

收益：为组件化/多页面/热重载做准备。  
风险：低。  
影响范围：运行时释放，不影响正常渲染。

### P1：后端 `server.js` 职责过重

当前一个文件同时管理：

- provider env 配置
- LLM proxy
- TTS proxy
- 静态资源
- multipart parser
- avatar upload
- registry 写入
- MIME/CORS

当前规模可以接受，但后续接 RAG、n8n、记忆、用户画像、日志、安全鉴权后会膨胀。建议后续拆为：

```text
backend/
  server.js
  config/providers.js
  services/llmProxy.js
  services/ttsProxy.js
  services/avatarRegistry.js
  services/uploadValidator.js
  utils/http.js
```

收益：后端能力增长时不会全堆到单文件。  
风险：中，暂不建议一次性大拆。  
影响范围：后端接口。

### P1/P2：LLM 对话还不是 DialogueManager

位置：`js/script.js` 的 `handleChat()` 与 `js/ai/LLMClient.js`

`LLMClient` 只负责发请求，这很清楚；但对话状态、prompt、记忆、RAG、语音播放、动作联动仍在 `script.js`。未来应引入 `DialogueManager`：

```text
user input
  -> DialogueManager
  -> MemoryManager
  -> RagClient
  -> PromptBuilder
  -> LLMProvider
  -> reply
  -> AudioManager/TTSProvider
  -> Animation/EventBus
```

收益：后续接 RAG/Agent 不用重写 UI。  
风险：低，先做薄封装。  
影响范围：聊天链路。

### P2：RAG/长期记忆结构尚未建立

当前只有 `LocalConfigStore.saveMemory()` 写入 `localStorage`，没有短期记忆、会话摘要、长期记忆、RAG client、n8n client。考虑项目现阶段，不建议立刻实现复杂 RAG，但需要预留目录和接口。

收益：明确未来能力边界。  
风险：低，但不要写大量假逻辑。  
影响范围：未来对话系统。

### P2：TTS 抽象已有 provider registry，但还缺 AudioManager 语义

`TTSService` 已能在 OpenAI/MiniMax 失败时回退浏览器语音，这是正确方向。但未来要支持：

- 语音中断策略
- 边生成边播放
- 口型同步
- 语音播放状态事件
- 字幕/viseme
- 不同角色绑定不同默认声线

建议后续把 `TTSService` 提升为 `AudioManager + TTSProvider` 架构，当前先保留 `TTSService`，补事件和超时即可。

### P2：配置层分散

配置现在分散在：

- `js/config/providers.js`
- `js/config/voicePresets.js`
- `script.js` 的 `dialogues`
- `CharacterManager` 默认 registry URL
- `script.js` 的 boot/loading timeout
- `backend/server.js` 的 provider URLs、模型列表、上传限制

建议新增 `js/config/appConfig.js` 与 `js/config/dialogues.js`，把前端稳定常量集中化。

## 4. 当前架构的短期问题

1. 初始化失败 UI 有注入风险。
2. 上传模型缺少内容校验。
3. 入口文件过重，新增功能容易继续堆积。
4. 状态更新没有统一出口，调试和联动困难。
5. EventBus 已有但未用，事件语义尚未形成。
6. Interaction 缺少冷却和拖拽阈值。
7. LLM/TTS 请求缺少前端超时控制。
8. Runtime 缺少 destroy 生命周期。
9. 旧 backend scaffold 文件未标注用途，新人容易误判为真实后端架构。

## 5. 当前架构的长期扩展风险

### 多角色扩展风险

当前已支持 registry/meta，但角色关联的默认 LLM/TTS/动作包尚未在前端充分消费。后续如果每个角色都有角色设定 prompt、声线、动作包、命中阈值、表情能力，需要扩展 manifest schema。

### 动作系统扩展风险

程序化动作和 retarget 都在一个 controller 内，随着动作包、表情、口型同步、分层 mask 增加，文件复杂度会急剧上升。

### 语音系统扩展风险

当前 `speakText()` 同时管 UI 状态、speechTimer、TTS fallback、状态恢复。接入 streaming TTS、viseme、字幕后会很难维护。

### LLM/RAG 扩展风险

`handleChat()` 直接调用 `llmClient.chat()`，没有 DialogueManager、PromptBuilder、MemoryManager、RagClient。接入 Agent 或 RAG 时容易把检索、记忆、prompt 组装都塞进 UI 文件。

### 后端扩展风险

`backend/server.js` 原生 HTTP 写法轻量，但功能继续增长后需要模块化。尤其是 RAG 文档上传、向量库、n8n webhook、会话历史、权限/鉴权，不适合继续都写进一个文件。

## 6. 专业数字伙伴系统应该具备的模块

```text
frontend/
  app/
    CompanionApp
    CompanionStateStore
    EventBus
  avatar/
    AvatarRegistry
    CharacterManager
    AvatarLoader
    AvatarCapabilityInspector
  animation/
    AnimationController
    AnimationStateMachine
    AnimationQueue
    AnimationRegistry
    RetargetingAdapter
    ProceduralMotionFactory
  interaction/
    InteractionController
    HotspotRegistry
    HitTestController
  audio/
    AudioManager
    TTSProviderRegistry
    ASRProvider
    LipSyncController
  dialogue/
    DialogueManager
    PromptBuilder
    LLMProviderRegistry
  memory/
    ShortTermMemory
    LongTermMemory
    RagClient
  integrations/
    N8nClient
    ApiClient
  ui/
    control-panel
    debug-panel
backend/
  api/
  services/
    llm
    tts
    avatars
    rag
    memory
    workflows
  config/
  security/
  storage/
```

## 7. 当前项目与专业数字伙伴系统的差距

| 能力 | 当前状态 | 差距 |
| --- | --- | --- |
| 多人物模型 | 已有 registry/meta/上传 | schema 还不完整，缺少版本校验、角色能力声明 |
| 多动作资源 | 已有 slots + fallback | 缺少独立 AnimationRegistry，动作能力报告不完整 |
| 点击部位交互 | 已有 head/body/arm/leg | 缺少可配置阈值、冷却、防抖、Hotspot 扩展 |
| 动作队列/优先级 | 已有 ActionQueue | 需要更明确的中断策略和调试可视化 |
| 分层动画 | 已有 base/gesture/expression/lipsync layer | expression/lipsync 仍是预留，没有实际控制器 |
| TTS | browser/openai/minimax 已接 | 缺 AudioManager、streaming、口型同步、声线与角色绑定 |
| ASR | Web Speech API | 缺 provider 抽象、错误状态和权限提示 |
| LLM | 后端代理已接 | 缺 DialogueManager、PromptBuilder、上下文管理 |
| RAG | 未接 | 需要 RagClient/后端向量库/文档上传 |
| 长期记忆 | localStorage 轻量保存 | 缺结构化记忆、隐私边界、用户画像 |
| 后端安全 | API key 后端化 | 上传校验、超时、鉴权、日志还需要补 |
| 性能 | 基本可运行 | 缺资源缓存策略、模型压缩建议、完整 destroy |

## 8. 建议的重构方向

### 适度重构原则

当前项目仍是个人项目，不建议一次性引入大型框架或状态库。更合适的策略是：

1. 保持静态 HTML + 原生模块结构。
2. 先把高风险点收口：错误渲染、上传校验、请求超时。
3. 建立轻量 `EventBus + CompanionStateStore + appConfig`。
4. 把 `script.js` 中稳定配置抽离。
5. 对话链路先抽薄 `DialogueManager`，暂不接复杂 RAG。
6. 后端先补校验和超时，暂不大拆 `server.js`。
7. 文档同步记录未来拆分边界。

### 推荐中期目录

```text
js/
  app/
    CompanionApp.js              # 中期再拆，当前先保留 script.js
  api/
    ApiClient.js
  core/
    EventBus.js
    logger.js
  state/
    CompanionStateStore.js
  config/
    appConfig.js
    providers.js
    voicePresets.js
    dialogues.js
  avatar/
  animation/
  interaction/
  dialogue/
    DialogueManager.js
  memory/
    MemoryManager.js
    RagClient.js
  workflows/
    N8nClient.js
  voice/
backend/
  server.js                      # 当前保留
  services/                      # 后续拆
```

## 9. 改动优先级

### P0：必须优先处理

| 改动 | 收益 | 风险 | 影响范围 |
| --- | --- | --- | --- |
| 修复 `showLoadingError` 的 `innerHTML` | 消除错误信息注入风险 | 低 | 初始化/加载错误 UI |
| 上传模型内容校验 | 防止无效/伪造资源进入 avatars | 中低 | `/api/avatars` |
| 请求超时控制 | 避免 LLM/TTS 长时间挂起导致 UI 卡状态 | 低 | LLM/TTS |
| `.gitignore` 加强 `.env.*`、日志、临时目录 | 降低密钥/缓存误提交风险 | 低 | 仓库安全 |

### P1：核心架构优化

| 改动 | 收益 | 风险 | 影响范围 |
| --- | --- | --- | --- |
| 新增 `appConfig/dialogues` | 配置集中，减少入口硬编码 | 低 | `script.js` |
| 使用 EventBus 记录关键事件 | 方便日志、调试、后续模块监听 | 低 | 全局链路 |
| 新增 CompanionStateStore | 形成统一状态快照 | 低 | 初始化、角色、动画、语音 |
| Interaction 加冷却和拖拽阈值 | 降低误触和连续点击干扰 | 低 | 点击交互 |
| SceneRuntime 增加 destroy 生命周期 | 降低后续 SPA/组件化泄漏风险 | 低 | Three.js runtime |

### P2：能力预留

| 改动 | 收益 | 风险 | 影响范围 |
| --- | --- | --- | --- |
| 新增 DialogueManager 薄封装 | 后续接记忆/RAG/Agent 不改 UI | 低 | 聊天链路 |
| 新增 MemoryManager/RagClient 占位接口 | 明确未来 RAG/长期记忆边界 | 低 | 未来模块 |
| 新增 N8nClient 占位接口 | 预留 Agent workflow 接入点 | 低 | 未来模块 |
| 文档化 Avatar/Motion schema | 新增角色不依赖读源码 | 低 | 角色扩展 |

### P3：体验与性能优化

| 改动 | 收益 | 风险 | 影响范围 |
| --- | --- | --- | --- |
| loading/error 状态更清晰 | 降低用户困惑 | 低 | UI |
| debug 状态事件化 | 便于排查动作/模型问题 | 低 | 调试 |
| 模型压缩与缓存建议 | 降低加载时间 | 中，需要资源处理 | 模型资源 |
| 移动端面板微调 | 改善触摸体验 | 低 | UI |

## 10. 安全检查结果

### 已做得正确的点

- 前端没有保存真实 API Key，`script.js` 初始化时会移除旧的 `llm_api_key`。
- `index.html` 中 API Key 输入框已禁用，提示用户配置后端环境变量。
- `backend/server.js` 通过环境变量读取 `OPENAI_API_KEY`、`MINIMAX_API_KEY`、`QWEN_API_KEY`、`DEEPSEEK_API_KEY`、`CUSTOM_API_KEY`、`LLM_API_KEY`。
- `.gitignore` 已包含 `.env`。

### 需要继续收口的点

- `.gitignore` 应加入 `.env.*`、日志和临时测试目录。
- 上传接口缺少基础 magic/JSON 校验。
- 后端没有鉴权，当前适合本地个人项目；如果部署公网必须加访问控制。
- CORS 目前是 `*`，本地开发方便，公网部署要限制来源。
- `showLoadingError` 使用 `innerHTML` 渲染错误消息，需要立即改成 DOM/textContent。

## 11. 性能检查结果

### 已有基础

- `SceneRuntime.clearAvatarObject()` 会 dispose geometry/material。
- `MotionManager.unload()` 会 reset animation controller。
- 静态服务对 `.html/.js/.json/public/avatars` 使用 `no-store`，避免开发期角色 registry 缓存问题。
- Shiro/Wambo 使用程序化 fallback 动作，避免不适配 FBX 直接套到 VRM 造成姿态异常。

### 风险与建议

- `SceneRuntime.render()` 缺少 RAF id 和 destroy。
- `AnimationController` 中程序化动作 clip 每次加载角色都会重新创建，当前没问题，未来可按 avatar capability 做缓存。
- `.vrm/.glb` 模型没有 Draco/Meshopt/纹理压缩流程，后续角色多了会影响加载。
- CDN import map 依赖公网，离线或网络不稳定时 Three.js 加载失败；产品化建议本地 vendor 或构建工具。
- 上传 `.gltf` 若依赖外部 `.bin/贴图`，当前只保存单文件，实际加载会失败。UI 已提示，但后端也应文档化限制。

## 12. 当前最适合的优化边界

本轮不建议做：

- 全量迁移 React/Vue/TypeScript。
- 大拆 `backend/server.js`。
- 直接实现完整 RAG/向量库。
- 重写动画系统。
- 删除旧 scaffold 文件。

本轮建议做：

- 文档化审查与计划。
- 增加轻量配置层。
- 接入已有 EventBus。
- 增加轻量状态 store。
- 修复安全和超时问题。
- 为 Dialogue/RAG/n8n 建立薄接口。
- 小幅优化 Interaction 和 SceneRuntime 生命周期。

这样可以保证当前功能继续可运行，同时把后续扩展的地基垫平。
