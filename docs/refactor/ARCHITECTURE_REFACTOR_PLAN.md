# ARCHITECTURE REFACTOR PLAN

目标：在不破坏当前 Alice/Shiro/Wambo、点击交互、动作、语音兜底、上传角色功能的前提下，把项目从 Demo 结构推进到可持续扩展的 AI Digital Companion System 基座。

## 1. 总体架构目标

```text
User Input
  -> InteractionController / Chat UI / ASR
  -> EventBus
  -> CompanionStateStore
  -> DialogueManager
  -> MemoryManager + RagClient
  -> LLMProvider
  -> Reply
  -> AudioManager / TTSProvider
  -> AnimationController / Expression / LipSync
  -> UI Status + Logs
```

核心原则：

- UI 不直接知道具体模型文件和动作文件。
- 业务代码不直接写死 FBX/VRM 路径。
- 点击部位只产出语义事件：`head/body/arm/leg/chat`。
- 动作系统只消费标准槽位：`idle/intro/headTap/legTap/armTap/bodyTap/chat/speaking/listening`。
- 语音系统只暴露 `speak/stop/state`，不把 OpenAI/MiniMax 细节散落到 UI。
- LLM/RAG/Agent 通过 `DialogueManager` 接入，不让 `script.js` 承担 prompt 和记忆编排。

## 2. 推荐目录结构

### 当前阶段落地结构

```text
js/
  ai/
    LLMClient.js
  animation/
    ActionQueue.js
    AnimationController.js
    AnimationStateMachine.js
    MotionManager.js
    states.js
  avatar/
    AvatarLoader.js
    CharacterManager.js
  config/
    appConfig.js
    dialogues.js
    providers.js
    voicePresets.js
  core/
    EventBus.js
    loadJson.js
    logger.js
  dialogue/
    DialogueManager.js
  interaction/
    HitTestController.js
    InteractionManager.js
  memory/
    MemoryManager.js
    RagClient.js
  scene/
    SceneRuntime.js
  state/
    CompanionStateStore.js
  storage/
    LocalConfigStore.js
  voice/
    SpeechRecognitionService.js
    TTSProviderRegistry.js
    TTSService.js
  workflows/
    N8nClient.js
  script.js
```

### 中期后端拆分方向

```text
backend/
  server.js
  config/
    providers.js
    security.js
  services/
    avatarRegistry.js
    uploadValidator.js
    llmProxy.js
    ttsProxy.js
    ragService.js
    memoryService.js
    n8nService.js
  utils/
    http.js
    multipart.js
```

本轮先不大拆后端，以降低风险。

## 3. 模块职责设计

### CharacterManager

职责：

- 读取 `public/avatars/registry.json`
- 加载角色 `meta.json`
- 卸载当前角色
- 切换角色
- 应用角色相机配置
- 委托 `AvatarLoader` 加载底层模型

输入：

```json
{
  "id": "osa_shiro",
  "meta": "public/avatars/osa_shiro/meta.json"
}
```

输出：

```js
{
  id,
  meta,
  avatar,
  animations,
  baseScale,
  capability
}
```

### Avatar Manifest

角色配置建议保持：

```json
{
  "id": "avatar_id",
  "name": "Avatar Name",
  "type": "humanoid-vrm",
  "model": {
    "url": "public/avatars/avatar_id/model.vrm",
    "format": "vrm"
  },
  "motionManifest": "public/avatars/avatar_id/motions.json",
  "skeletonMap": "public/avatars/avatar_id/skeleton.mixamo.json",
  "transform": {
    "targetHeight": 120,
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "scale": 1
  },
  "hitRegions": {
    "head": ["head", "neck"],
    "arm": ["arm", "hand", "shoulder"],
    "leg": ["leg", "foot", "toe"]
  },
  "interactions": {
    "head": { "motionSlot": "headTap" },
    "body": { "motionSlot": "bodyTap" },
    "arm": { "motionSlot": "armTap" },
    "leg": { "motionSlot": "legTap" },
    "chat": { "motionSlot": "chat" }
  },
  "integrations": {
    "llm": { "provider": "openai", "model": "gpt-4o-mini" },
    "tts": { "engine": "browser" }
  }
}
```

### MotionManager

职责：

- 读取 motion manifest。
- 将动作槽位转换成 controller action entry。
- 屏蔽具体 FBX 文件名。
- 为缺失动作提供程序化 fallback。
- 保留旧交互逻辑的 slot/state 映射。

标准槽位：

```text
idle
intro
headTap
legTap
armTap
bodyTap
chat
speaking
listening
```

后续增加动作时优先加 slot 配置，不改业务代码。

### AnimationController

当前职责较多，本轮不大拆。后续拆分方向：

```text
AnimationController
  -> LayeredActionPlayer
  -> AnimationRegistry
  -> RetargetingAdapter
  -> ProceduralMotionFactory
```

当前必须保留的能力：

- idle 默认动作
- intro 进场动作
- 动作队列
- 优先级
- 中断
- base/gesture 分层
- 动作完成后回 idle
- Shiro/Wambo 程序化 fallback

### InteractionManager

职责：

- 将 pointer/mouse/touch 事件统一为交互事件。
- 将命中部位映射为动作槽位。
- 提供点击冷却和拖拽阈值。

事件建议：

```js
eventBus.emit('interaction:hit', {
  part: 'head',
  motionSlot: 'headTap',
  avatarId: 'alice'
});
```

### DialogueManager

职责：

- 接收用户输入。
- 管理对话请求状态。
- 调用 `LLMClient`。
- 后续接入 Memory/RAG/PromptBuilder。
- 不直接操作 DOM。

当前阶段薄实现：

```js
const reply = await dialogueManager.send(text);
```

后续扩展：

```text
send()
  -> shortTermMemory.appendUserMessage()
  -> ragClient.retrieve()
  -> promptBuilder.build()
  -> llmProvider.chat()
  -> memoryManager.remember()
  -> return reply
```

### Audio/TTS

当前保留 `TTSService + TTSProviderRegistry`。后续升级为：

```text
AudioManager
  -> BrowserTTSProvider
  -> OpenAITTSProvider
  -> MiniMaxTTSProvider
  -> LocalTTSProvider
  -> LipSyncController
```

事件建议：

```js
audio:start
audio:end
audio:error
audio:fallback
```

### Memory/RAG

当前只做接口预留，不实现复杂逻辑。

```text
memory/
  MemoryManager.js
  RagClient.js
```

原因：RAG 需要后端、文档解析、向量数据库、索引刷新、鉴权和存储策略，不应该硬塞到前端 Demo。

## 4. EventBus 事件规范

推荐事件：

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

当前阶段 EventBus 只做轻量广播，不强行把所有模块改为纯事件驱动。

## 5. 状态模型

建议状态快照：

```js
{
  avatar: {
    id,
    meta,
    loaded,
    loading
  },
  animation: {
    state,
    activeAction,
    queueLength
  },
  audio: {
    muted,
    speaking,
    engine,
    voice
  },
  dialogue: {
    thinking,
    lastUserMessage,
    lastAssistantMessage,
    error
  },
  system: {
    ready,
    error,
    debug
  }
}
```

当前项目为了低风险，可先保留扁平 state，同时引入 `CompanionStateStore` 做统一 patch/subscribe。

## 6. 声音系统建议

当前默认策略合理：

- 默认 `browser`，确保无 API Key 也有声音。
- 高质量声线走 MiniMax/OpenAI 后端。
- 后端失败自动 fallback 浏览器语音。

后续建议：

1. 角色 meta 增加默认声线：

```json
{
  "voice": {
    "defaultEngine": "browser",
    "preferredProvider": "minimax",
    "preset": "Chinese (Mandarin)_Crisp_Girl"
  }
}
```

2. TTSProvider 支持 streaming。
3. AudioManager 广播播放状态。
4. LipSyncController 订阅 `audio:start/audio:end/audio:viseme`。

## 7. AI Agent / RAG 接入建议

### 不建议当前马上做的事

- 前端直接接向量数据库。
- 前端保存 API Key。
- 把 RAG 检索和 prompt 拼接写在 `script.js`。
- 用 localStorage 保存大量对话历史或敏感资料。

### 推荐路径

```text
阶段 1：DialogueManager 薄封装
阶段 2：后端新增 /api/dialogue，统一 chat + memory + rag
阶段 3：后端接文档上传和向量库
阶段 4：接 n8n webhook 做工具/工作流
阶段 5：长期记忆和用户画像独立存储
```

### 后端建议接口

```text
POST /api/dialogue
POST /api/rag/documents
POST /api/rag/query
GET  /api/memory/profile
POST /api/memory/events
POST /api/workflows/n8n
```

## 8. 执行顺序

### 本轮执行

1. 写 `docs/reports/PROJECT_REVIEW_REPORT.md`
2. 写 `docs/refactor/ARCHITECTURE_REFACTOR_PLAN.md`
3. 新增前端配置和状态/事件基座
4. 修复错误渲染和上传校验
5. 增加请求超时
6. 增加 Dialogue/Memory/RAG/n8n 薄接口
7. 写 `docs/refactor/REFACTOR_NOTES.md`
8. 运行 `npm run check` 和服务健康检查

### 后续建议

1. 将 `AnimationController` 拆出 `ProceduralMotionFactory` 和 `RetargetingAdapter`。
2. 将 `backend/server.js` 拆成 service 层。
3. 为 avatar/motion manifest 增加 schema 校验。
4. 加入 Playwright 回归：角色列表、切换三角色、点击 head/body/arm/leg、TTS fallback。
5. 根据部署方式决定是否迁移 Vite/TypeScript。

## 9. 新增角色流程保持不变

新增角色仍然只需要：

1. 放入 `public/avatars/{avatarId}/model.vrm` 或上传。
2. 写 `meta.json`。
3. 写 `motions.json`。
4. 写 `skeleton.mixamo.json`。
5. 在 `registry.json` 追加角色。

旧交互逻辑仍是：

```text
head -> headTap -> HEAD_ACTION
body -> bodyTap -> INTERACTING
arm  -> armTap  -> ARM_ACTION
leg  -> legTap  -> LEG_ACTION
chat -> chat    -> INTERACTING
```

## 10. 成功标准

- 新增角色不改核心代码。
- 新增动作不改 UI 逻辑。
- 新增点击部位只改 manifest/interaction mapping。
- 替换 TTS provider 不改 DialogueManager。
- 替换 LLM provider 不改 UI。
- 接入 RAG 不重写 `script.js`。
- 当前 Alice/Shiro/Wambo 均可切换。
- 当前点击动作和语音兜底仍可用。
- `npm run check` 通过。
