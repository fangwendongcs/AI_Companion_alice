# Development Guide

## 启动

```bash
npm run dev
```

### 环境变量注入

当前仓库不安装或调用 `dotenv`。`npm run dev` 使用 Node 原生参数启动：

```bash
node --env-file-if-exists=.env backend/server.js
```

- 仓库根目录存在 `.env` 时，`npm run dev` 会自动加载它。
- `.env` 不存在时，Node 会继续启动，Alice 保持默认 `stub` LLM 与 `mock` TTS，本地演示不需要真实 Key。
- 只自动加载根目录 `.env`，不会自动加载 `.env.local` 或其他文件名。
- `.env` 与 `.env.*` 已被 Git 忽略，禁止提交；`.env.example` 只能保留 placeholder。
- 真实 Key 不要写进命令历史、仓库文件、前端 UI 或 localStorage。部署时继续使用平台 Environment Variables / Secret Manager。

请使用支持 `--env-file-if-exists` 的 Node 版本；可通过以下命令确认当前运行时是否支持：

```bash
node --help | rg -- '--env-file-if-exists'
```

Shell / 系统已经注入的环境变量仍可用于单次启动或部署，例如：

```bash
PORT=3101 npm run dev
```

PowerShell：

```powershell
$env:PORT = "3101"
npm run dev
```

所有可用变量名和 placeholder 以仓库根目录 `.env.example` 为准。

默认地址：

```text
http://localhost:3000
```

### 同时启动真实 LLM 与 CosyVoice2

完整本地 Demo 使用统一入口：

```bash
npm run demo:start
npm run demo:status
npm run demo:stop
```

`demo:start` 会托管 Alice 与 CosyVoice2、等待 endpoint、真实验证 DeepSeek 回复和有效 WAV，并输出地址、PID 与日志位置。它不会修改 `.env`；即使 `.env` 中 `COSYVOICE_BASE_URL` 为空，也会让本次 Alice 子进程使用托管的 `http://127.0.0.1:50000`。

`demo:status` 每次都会发起一条很短的真实 DeepSeek 请求并执行一次本地 TTS 推理，不适合高频轮询。完整生命周期、状态文件、安全边界和失败处理见 [DEMO_RUNTIME.md](./DEMO_RUNTIME.md)。旧的 `npm run dev` 和 `cosyvoice:*` 仍用于单模块开发或底层排障。

## 检查

```bash
npm run check
npm run check:js
npm run check:config
npm run check:assets
npm run check:legacy-avatar
npm run check:regression
```

本地服务启动后可以运行：

```bash
npm run smoke
```

## 阶段验收回归

当前有两层回归保护：

```text
npm run check:regression
  -> boot -> idle 状态机链路
  -> 动作队列 cooldown / interrupt / duplicate-loop
  -> Alice / Shiro / Wambo registry + manifest 主入口
  -> 关键动作能力存在（显式 slot 或 procedural fallback）
  -> TTS provider / browser fallback 配置完整

npm run smoke
  -> /api/health
  -> /api/avatars
  -> 每个角色 manifest 可通过 HTTP 读取
  -> model / motions / skeleton 静态资源可通过 HTTP 访问
```

`check:regression` 适合每次改动画、角色配置或语音配置后快速执行；`smoke` 需要先启动本地服务，适合在页面联调前后补一遍运行态确认。

## 前端主流程

当前入口链路：

```text
js/script.js
  -> js/app/bootstrap.js
    -> AppController
      -> UIController
      -> SceneRuntime / CharacterManager / MotionManager
      -> DialogueManager / TTSService / EventBus / StateStore
```

新增 UI 面板时优先新增 `js/ui/*Controller.js`，并在 `UIController` 中装配。DOM listener、timeout 和全局事件清理优先使用 `DisposableRegistry`，不要在子模块里留下无法清理的长生命周期监听。

## 后端主流程

当前后端结构：

```text
backend/server.js
backend/middleware/
backend/routes/
backend/services/
backend/utils/
backend/config/serverConfig.js
```

新增 API 时：

1. 在 `backend/routes/` 添加 HTTP 层。
2. 在 `backend/services/` 放业务逻辑。
3. 在 `backend/routes/router.js` 挂载路径。
4. 返回结构优先使用 `backend/utils/response.js`，但迁移旧接口时要保留前端兼容。

## 静态资源加载

- JSON 配置统一使用 `loadJson()`，内部已经接入 `ResourceResolver`、`ApiClient`、`AppError` 和 logger。
- 角色模型与动画文件通过 `StaticAssetLoader` 解析路径和包装错误。
- 二进制模型/动画仍由 Three.js loader 加载，不要为了“统一”强行改成重复 `fetch + blob`，否则会影响 glTF 的相对依赖解析。

## API 响应兼容层

前端 `ApiClient` 会自动处理：

```json
[{ "id": "legacy" }]
```

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": { "code": "ERR", "message": "..." } }
```

旧接口可以继续返回旧结构，新接口优先返回 `{ ok, data, error }`。

TTS 当前推荐返回统一 Audio Result：

- Web 请求仍通过 `ApiClient.response()` 共享 timeout 与 AppError。
- `responseFormat=json` 时，播放阶段从 `audioBase64 / audioUrl` 创建音频。
- 旧二进制响应仍兼容为 `Blob -> Audio`。

## 常见问题

### 页面没声音

默认 TTS 是浏览器本机语音。确认浏览器允许音频播放，并点击页面触发一次用户手势。

### OpenAI / MiniMax TTS 失败

前端不会保存 API Key。请按上面的环境变量注入规则启动，例如：

```bash
OPENAI_API_KEY=... MINIMAX_API_KEY=... npm run dev
```

失败时会自动回退浏览器语音。

### 角色列表缺少 Shiro/Wambo

运行：

```bash
npm run check:config
npm run check:assets
```

确认 `public/avatars/registry.json` 和对应 `manifest.json` 路径正确；只有旧角色才会 fallback 到 `meta.json`。

`npm run check:legacy-avatar` 会使用测试 fixture 验证 legacy `meta.json` fallback 仍然可用；它不是生产角色扫描器，而是兼容链路回归测试。

### 动作不播放

先看 [ANIMATION_ARCHITECTURE.md](../architecture/ANIMATION_ARCHITECTURE.md) 的排查步骤。

下一轮如果继续拆动画系统，优先把 `MotionManager` 与 `AnimationController` 的状态联动继续收口到 `AnimationStateMachine` / `AnimationQueue`，不要从 UI 直接调用底层 action。

当前点击动作入口应保持为：

```text
InteractionManager -> MotionSlot -> MotionManager.requestSlot()
```

不要在 UI 控制器里直接调用底层 Three.js action。

### 上传角色失败

当前只支持：

```text
.vrm
.glb
.gltf
```

`.vrm/.glb` 必须是 GLB 容器，`.gltf` 必须是合法 JSON，并且当前只适合自包含资源。

## 后续接入 n8n / RAG

当前前端已有 `N8nClient` 和 `RagClient` 占位。正式接入时建议先建后端接口：

```text
POST /api/workflows/n8n
POST /api/rag/query
POST /api/rag/documents
```

不要在前端直接保存 n8n webhook 密钥或向量数据库密钥。

## 部署安全

本项目后端当前默认是本地开发服务。公网部署前先看 [DEPLOYMENT_SECURITY.md](../security/DEPLOYMENT_SECURITY.md)，至少补齐 CORS 白名单、接口鉴权、上传限流和文件安全扫描。
