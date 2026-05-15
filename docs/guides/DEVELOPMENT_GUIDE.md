# Development Guide

## 启动

```bash
npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 检查

```bash
npm run check
npm run check:js
npm run check:config
npm run check:assets
npm run check:legacy-avatar
```

本地服务启动后可以运行：

```bash
npm run smoke
```

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

TTS 是二进制响应例外：

- 请求仍通过 `ApiClient.response()` 共享 timeout 与 AppError。
- 播放阶段继续使用 `Blob -> Audio`，不走 JSON 解包。

## 常见问题

### 页面没声音

默认 TTS 是浏览器本机语音。确认浏览器允许音频播放，并点击页面触发一次用户手势。

### OpenAI / MiniMax TTS 失败

前端不会保存 API Key。请用环境变量启动：

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
