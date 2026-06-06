# iOS Migration Scope

本文定义后续 `AliceMobile-iOS` 的迁移范围。核心原则：iOS 是独立原生项目，不是 WebView，不是桌面 Web 的完整移植，也不是把 Three.js / FBX / DOM UI 搬进 Xcode。

## 迁移目标

`AliceMobile-iOS` 的目标是复用当前项目已经验证过的产品语义和后端能力：

- 角色人格
- 对话编排
- 记忆边界
- 情绪 / 语气 / 语音 / Avatar 状态
- 后端 API 契约
- 轻量 Companion 产品体验

移动端第一版应优先做“可聊、可听、可记住、可感知状态”的原生 App，而不是优先复刻桌面 Web 的 3D 场景。

## 应该迁移

| 内容 | 迁移方式 | 说明 |
| --- | --- | --- |
| 产品定位 | 文档 / PRD 迁移 | AI digital companion，而不是普通 chatbot |
| Alice / Shiro / Wambo 人格 | Swift 本地模型 + 后端 persona API | 先静态内置，后续从后端拉取 |
| `/api/dialogue` | 原生网络调用 | 移动端主 chat API |
| `/api/tts` | 原生网络调用 + AVAudioPlayer | 只传非密钥参数，密钥留后端 |
| `/api/memory` | 原生网络调用 | 展示和清除长期记忆摘要 |
| `affect` schema | Swift Codable 模型 | 驱动语音、表情、Avatar 状态 |
| AvatarState / MotionSlot 名称 | Swift enum | 作为轻量状态机输入 |
| 角色选择 | SwiftUI 原生界面 | 使用 avatarId / displayName，不依赖 Web DOM |
| 记忆开关和 sessionId | AppStorage / Keychain 视情况 | 不保存 provider secret |
| 错误码和 requestId | Swift 错误处理 | 用于用户提示和问题排查 |

## 不应该迁移

| 内容 | 不迁移原因 | 替代方案 |
| --- | --- | --- |
| Three.js 渲染代码 | 浏览器专用，移动端维护成本高 | SwiftUI / Rive / Lottie / SceneKit / RealityKit |
| FBX 播放与 retarget 逻辑 | Web runtime 绑定 Three.js AnimationMixer | 先映射为轻量状态，后续单独评估 native 3D |
| DOM UI 控制器 | Web DOM 专用 | SwiftUI View / ViewModel |
| CSS 视觉实现 | 不适合原生控件体系 | 提炼颜色、节奏、信息架构 |
| Browser speechSynthesis | 浏览器能力 | iOS AVSpeechSynthesizer 或后端 TTS |
| Web localStorage 实现 | 平台不同 | AppStorage / SQLite / Keychain |
| Node backend 代码 | 不应塞进 iOS App | 后端继续独立部署 |
| `.env` / API keys / webhook secret | 安全风险 | 后端环境变量 / Secret Manager |
| 上传 Avatar 的 Web 表单 | iOS MVP 不需要 | 后续做管理后台或受控上传流程 |
| n8n webhook 直连 | Secret 暴露风险 | iOS 只调用后端封装接口 |

## 建议的 iOS 模块划分

| iOS 模块 | 职责 |
| --- | --- |
| `AliceAPIClient` | 统一封装后端请求、错误解析、超时、鉴权 header |
| `ChatViewModel` | 管理输入、发送、thinking、reply、regenerate |
| `PersonaStore` | 管理当前 avatarId / personaId / tone / voiceStyle |
| `MemoryViewModel` | 读取、展示、清空长期记忆摘要 |
| `AvatarStateReducer` | 从 dialogue / audio / interaction 事件推导 AvatarState |
| `AudioPlaybackService` | 播放后端 TTS 音频，失败时降级 AVSpeechSynthesizer |
| `SessionStore` | 保存 sessionId、selectedAvatarId、memoryEnabled 等非敏感设置 |
| `CompanionHomeView` | 原生主界面：Avatar 状态、聊天、语音、记忆入口 |

## 分阶段迁移建议

### Phase iOS-0：文档和接口准备

- 固化 API 契约。
- 后端补只读 persona API 的计划。
- 明确移动端不会使用 WebView。
- 准备 Swift Codable 数据结构。

### Phase iOS-1：原生最小闭环

- SwiftUI 单页 companion 界面。
- 文本输入调用 `/api/dialogue`。
- 展示 reply、thinking、persona、memory badge、affect 状态。
- TTS 可先用 iOS 本机语音，后续接 `/api/tts`。

### Phase iOS-2：语音与记忆

- 接入后端 TTS 二进制音频。
- 接入 memory list / clear。
- 支持 Alice / Shiro / Wambo 切换。
- 用 `affect.motion.slot` 驱动轻量 Avatar 动效。

### Phase iOS-3：表现升级

- 选择 Rive / Lottie / SceneKit / RealityKit 方案之一。
- 将 AvatarState 映射到表情、姿态、卡片、粒子或 3D 动画。
- 仅在必要时评估模型资产转换，不把 Web runtime 搬过来。

## 验收标准

- App 首屏是原生 SwiftUI，不是 WebView。
- 能调用后端 `/api/dialogue` 并展示回复。
- 能展示 persona / emotion / tone / avatar_state。
- 能开启或关闭 memory，并调用 `/api/memory` 清理。
- 没有 OpenAI、MiniMax、n8n、Qdrant、API provider secret 出现在 iOS 代码或 plist 中。
- Three.js、FBXLoader、DOM 事件、CSS 布局代码没有进入 iOS 项目。

