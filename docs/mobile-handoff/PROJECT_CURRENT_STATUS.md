# Project Current Status

生成日期：2026-06-06

本文用于把当前 AI Companion Alice Web / Backend 项目的产品进度交接给后续独立 iOS 原生项目 `AliceMobile-iOS`。结论先写清楚：iOS 项目应是独立 SwiftUI 原生项目，不是 WebView，也不是桌面 Web 的完整移植。移动端优先复用后端 API、人格、记忆、情绪状态、对话流程和资源命名约定，不直接复用 Three.js、FBX、DOM UI 或 Web 动画运行时代码。

## 当前阶段

当前项目是一个本地 MVP / 产品 Demo 基线：

- 默认 LLM provider 是 `stub`，本地演示不需要真实 API Key。
- 前端是 HTML / CSS / Vanilla JS + Three.js 的桌面 Web 体验。
- 后端是原生 Node HTTP 服务，入口是 `backend/server.js`。
- 主对话入口是 `POST /api/dialogue`，`POST /api/chat` 仅作为旧兼容入口。
- 角色系统已经从单一模型推进到 registry / manifest 结构，当前有 Alice / Shiro / Wambo。
- Phase 4 已建立部署安全基线；Phase 5 已推进到记忆、人格、affect、语气和轻量状态反馈。

## 已完成能力

| 能力 | 当前状态 | iOS 可复用内容 | 主要来源 |
| --- | --- | --- | --- |
| 3D Avatar Runtime | MVP | 只复用状态名和交互语义 | `js/scene/`, `js/avatar/`, `js/animation/` |
| 可替换角色 | MVP | 复用 avatarId、manifest 字段、角色列表思想 | `public/avatars/registry.json` |
| Alice / Shiro / Wambo | MVP | 复用角色定位、人格、语气、移动端角色卡 | `backend/config/avatarPersonas.js` |
| 点击身体部位交互 | MVP | 复用 head / arm / leg / body / chat 语义 | `public/avatars/*/manifest.json` |
| 动画状态机 | MVP / 演进中 | 复用状态枚举和 motion slot，不复用 FBX 播放逻辑 | `js/animation/states.js`, `MotionSlotRegistry.js` |
| 主对话链路 | MVP | 复用 `/api/dialogue` 请求/响应结构 | `backend/routes/dialogueRoutes.js` |
| TTS / Audio | MVP | 复用后端 TTS 代理和 affect.voice 参数 | `backend/routes/ttsRoutes.js`, `js/voice/` |
| Memory | MVP / 演进中 | 复用 sessionId / avatarId / memory.longTerm 契约 | `backend/services/MemoryService.js` |
| Persona | MVP | 复用 personaId、tone、boundaries、voiceStyle、motionStyle | `backend/services/PersonaService.js` |
| Emotion / Tone / Affect | MVP | 复用 emotion / tone / voice / motion schema | `backend/services/CompanionAffectService.js` |
| Local RAG | MVP | 可作为后端能力保留，移动端只消费 sources | `backend/services/RagService.js` |
| n8n Workflow | Boundary | 移动端只显示 workflow 状态，不直接调用 n8n | `backend/services/N8nWorkflowService.js` |
| 安全边界 | Baseline | 复用“密钥只在后端”的原则 | `docs/security/`, `.env.example` |
| 验证脚本 | Baseline | iOS 项目可参考验收清单，不直接复用脚本 | `package.json`, `scripts/` |

## 主要模块现状

### Web Frontend

当前前端运行路径：

- `index.html`
- `css/style.css`
- `js/app/AppController.js`
- `js/ui/*`
- `js/dialogue/DialogueManager.js`
- `js/ai/LLMClient.js`
- `js/audio/AudioManager.js`
- `js/voice/*`
- `js/state/CompanionStateStore.js`

这些代码主要服务于桌面 Web 和 Three.js 场景。iOS 不应迁移 DOM、CSS、Three.js runtime、浏览器 speechSynthesis 或 Web localStorage 实现，只应参考它们背后的状态语义。

### Backend

当前后端运行路径：

- `backend/server.js`
- `backend/routes/router.js`
- `backend/routes/dialogueRoutes.js`
- `backend/routes/ttsRoutes.js`
- `backend/routes/memoryRoutes.js`
- `backend/routes/avatarRoutes.js`
- `backend/routes/providerRoutes.js`
- `backend/services/*`
- `backend/db/schema.sql`

这是 iOS 优先复用的主资产。移动端应通过 HTTPS 调后端，不在 App 内保存 OpenAI、MiniMax、n8n、向量库或其它 provider secret。

### Avatar And Assets

当前角色注册表：

- `alice`
- `osa_shiro`
- `osa_wambo`

当前模型和动画资产主要在：

- `public/avatars/`
- `public/models/characters/`
- `public/models/animations/`
- `public/models/environments/`

这些资产可以作为视觉和交互设计参考；是否直接进入 iOS 原生渲染管线，需要单独评估格式、体积、授权、性能和移动端渲染方案。

## 当前对话主链路

```text
iOS/Web user input
-> POST /api/dialogue
-> memory context
-> local RAG context
-> optional workflow context
-> PromptBuilder
-> LLMService or stub
-> memory append
-> affect decision
-> reply + memory + rag + workflow + affect + meta
```

iOS 端应把 `reply` 用于文本展示，把 `affect.voice` 用于语音参数，把 `affect.motion` 派生为轻量 Avatar 状态，把 `meta.persona` 用于角色 UI 和调试。

## 当前已知缺口

- 当前没有独立 `GET /api/personas` 接口；persona 信息主要在后端配置和 `/api/dialogue` 的 `meta.persona` 中暴露。
- 当前没有独立 `/api/avatar-state` 接口；avatar state 主要由前端从 dialogue / audio / interaction 事件派生。
- `/api/tts` 返回音频二进制，不是 `{ ok, data }` JSON 包装。
- `/api/avatars` 当前返回 registry 原始结构，仍处于兼容迁移期。
- 单 token API auth 是部署前基线，不等于完整移动端用户登录系统。公开 iOS App 不应内置长期静态 token。

## 下一阶段方向

1. 新建独立 SwiftUI 项目 `AliceMobile-iOS`。
2. 先做轻量 2D / 状态化 Avatar，不迁移 Three.js 3D 场景。
3. 实现 `AliceAPIClient`，优先接入 `/api/health`、`/api/providers`、`/api/dialogue`、`/api/tts`、`/api/memory`。
4. 建立 Swift 侧状态模型：`DialogueState`、`AffectState`、`AvatarState`、`PersonaState`、`MemorySummary`。
5. 复用 Alice / Shiro / Wambo 的人格配置和 tone / voice / motion 语义。
6. 在后端补齐移动端需要的只读 persona API 和可选 avatar-state API，而不是让 iOS 读取 Web 配置文件。
7. 再评估是否需要 RealityKit / SceneKit / Rive / Lottie 的高表现 Avatar 方案。

