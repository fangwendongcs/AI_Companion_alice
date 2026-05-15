# Architecture

本项目当前是一个静态前端 + 本地 Node 后端的 AI Digital Companion 原型。目标不是一次性做成大型框架项目，而是在保持可运行的基础上，逐步把模型、动作、语音、对话、后端代理和未来 RAG/Agent 能力模块化。

## 运行时结构

```text
index.html
  -> js/script.js
    -> js/app/bootstrap.js
      -> AppController
        -> UIController
          -> AvatarSelectorController
          -> ChatPanelController / SettingsController
          -> TTS / LLM / Interaction 面板控制器
        -> SceneRuntime
        -> CharacterManager / AvatarLoader
        -> MotionManager / AnimationController
        -> InteractionManager / HitTestController
        -> TTSService / SpeechRecognitionService
        -> DialogueManager / LLMClient
        -> EventBus
        -> CompanionStateStore

backend/server.js
  -> middleware/*
  -> routes/*
  -> services/*
  -> utils/*
  -> static files
```

## 核心原则

- 角色资源通过 `public/avatars/registry.json` 和 `meta.json` 配置加载。
- 动作通过标准槽位管理，不在 UI 中写具体 FBX 文件名。
- 模块间优先通过 EventBus、StateStore 或明确 Manager 接口协作。
- API Key 只允许在后端环境变量中出现。
- TTS 默认使用浏览器本机语音兜底，保证无 Key 时也有声音。

## 当前关键目录

```text
js/
  app/            bootstrap 与 AppController，负责主流程装配
  animation/      动作槽位、状态机、队列、注册表、工厂、重定向、混合播放
  avatar/         角色注册表、meta 加载、模型加载与切换
  config/         前端运行配置、台词、provider、配置校验
  core/           EventBus、错误、日志、生命周期、资源路径解析/静态资源加载
  dialogue/       对话管理薄封装
  interaction/    点击/命中区域管理
  memory/         RAG/Memory 预留接口
  scene/          Three.js runtime
  services/api/   统一 ApiClient
  state/          CompanionStateStore
  ui/             DOM 查询、UI 总控和侧边栏/面板子控制器
  voice/          TTS/ASR

backend/
  config/         端口、上传限制、provider endpoint、MIME 等服务端配置
  middleware/     CORS 与顶层错误处理
  routes/         HTTP 输入输出：health、avatar、dialogue、tts
  services/       角色注册表、上传校验、静态资源等业务逻辑
  utils/          response、request、logger、http error 等基础工具
```

## 主流程边界

- `js/script.js` 只保留入口职责，当前调用 `bootstrap()`。
- `AppController` 负责初始化 Runtime、Manager、StateStore、EventBus 和 UI。
- `UIController` 只协调 UI 子模块，不直接承担 Three.js 细节。
- UI 子模块通过 Manager 接口、EventBus、StateStore 协作，DOM listener 统一交给 `DisposableRegistry` 清理。
- `backend/server.js` 只负责创建服务、调用 middleware/router 和启动监听。

## 后续演进方向

短期继续保持原生模块结构。只有当 UI 面板、状态和路由复杂到明显阻碍开发时，再考虑 Vite/TypeScript 或前端框架迁移。

公网部署前的安全事项见 [DEPLOYMENT_SECURITY.md](../security/DEPLOYMENT_SECURITY.md)。
