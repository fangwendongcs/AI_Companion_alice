# Backend

当前后端提供本地开发静态服务和模型代理接口，避免在浏览器中保存 API Key。

## 启动

```bash
npm run dev
```

默认前端 LLM provider 为 `stub`，本地演示不需要 API Key。真实 provider 仍通过后端环境变量配置，例如：

```bash
OPENAI_API_KEY=replace_with_your_key MINIMAX_API_KEY=replace_with_your_key npm run dev
```

Provider 配置状态可通过 `GET /api/providers` 查看。该接口只返回安全状态，例如 provider 是否 configured、是否需要 Key、默认 model 和 demo/real mode，不返回任何真实 Key 或 secret。

默认地址：

```text
http://localhost:3000
```

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `DEPLOYMENT_MODE`：部署模式标记，允许 `local` / `demo` / `production`，默认 `local`
- `ALLOWED_ORIGINS`：CORS 白名单，逗号分隔；公网前必须配置正式域名
- `CORS_ALLOW_LOCALHOST`：是否额外允许 localhost / 127.0.0.1，默认本地允许
- `REQUIRE_API_AUTH`：是否保护敏感写接口，默认 `false`
- `API_AUTH_TOKEN`：`REQUIRE_API_AUTH=true` 时的后端私有演示 token
- `JSON_BODY_LIMIT`：JSON 请求体上限，默认 `1mb`
- `UPLOAD_BODY_LIMIT`：上传请求体上限，默认跟随 `AVATAR_UPLOAD_MAX_MB`
- `AVATAR_UPLOAD_MAX_MB`：角色上传体积上限，默认 `80`
- `UPLOAD_STORAGE_DIR`：上传隔离目录，默认 `data/uploads/quarantine`
- `UPLOAD_TMP_DIR`：上传临时目录，默认 `data/uploads/tmp`
- `PUBLIC_ASSET_DIR`：公开资源根目录，默认 `public`
- `AVATAR_ASSET_DIR`：审核后发布的 avatar 资源目录，默认 `public/avatars`
- `UPLOAD_MAX_TOTAL_BYTES`：上传隔离目录总配额，默认 `500mb`
- `UPLOAD_MAX_FILES`：上传隔离目录文件数量规划值，默认 `200`
- `RATE_LIMIT_ENABLED`：是否启用轻量内存限流，默认 `true`
- `RATE_LIMIT_WINDOW_MS`：限流窗口，默认 `60000`
- `RATE_LIMIT_MAX_REQUESTS`：普通 API 窗口内最大请求数，默认 `240`
- `RATE_LIMIT_SENSITIVE_MAX_REQUESTS`：敏感写接口窗口内最大请求数，默认 `60`
- `OPENAI_API_KEY`：OpenAI Chat/TTS
- `MINIMAX_API_KEY`：MiniMax TTS
- `QWEN_API_KEY`：通义千问 OpenAI-compatible 接口
- `DEEPSEEK_API_KEY`：DeepSeek OpenAI-compatible 接口
- `CUSTOM_API_KEY`：自定义 OpenAI-compatible 接口
- `LLM_API_KEY`：通用兜底 Key
- `OPENAI_BASE_URL`：OpenAI 兼容代理地址
- `MINIMAX_BASE_URL`：MiniMax TTS 代理地址，未配置时使用 `https://api.minimax.io/v1`
- `QWEN_BASE_URL`：通义千问兼容接口地址，未配置时使用默认值
- `DEEPSEEK_BASE_URL`：DeepSeek 兼容接口地址，未配置时使用默认值
- `CUSTOM_BASE_URL`：自定义 OpenAI-compatible 接口地址
- `OPENAI_TTS_MODEL`：OpenAI TTS 模型，默认 `gpt-4o-mini-tts`
- `MINIMAX_TTS_MODEL`：MiniMax TTS 模型，默认 `speech-2.8-hd`
- `UPSTREAM_TIMEOUT_MS`：后端访问 LLM/TTS 上游的超时时间，默认 `45000`
- `N8N_WEBHOOK_URL`：可选 n8n webhook 地址，只允许后端读取
- `N8N_WEBHOOK_SECRET`：可选 n8n webhook secret，只通过后端 header 发送
- `N8N_TIMEOUT_MS`：n8n workflow 调用超时，默认 `8000`

### local / demo / production

- `local`：本地开发模式，允许 localhost / 127.0.0.1，默认不要求 API token，适合 `stub` provider 和 smoke 验证。
- `demo`：受控私有演示模式，需要设置正式 `ALLOWED_ORIGINS`，建议启用 `REQUIRE_API_AUTH=true` 和非占位 `API_AUTH_TOKEN`。
- `production`：公网部署候选模式，启动前强制校验 CORS、API auth、rate limit、上传隔离目录和公开资源目录。

`production` 模式下，`UPLOAD_STORAGE_DIR`、`PUBLIC_ASSET_DIR`、`AVATAR_ASSET_DIR` 必须显式配置，且上传隔离目录不能和公开资源目录相同。

真实 secret 只应进入本地忽略文件或部署平台 Environment Variables / Secret Manager，不要写入仓库、文档正文示例、前端代码或公开资源。

## 接口

- `POST /api/chat`
- `POST /api/dialogue`：当前前端主对话入口，支持本地 `stub`、LLM-only 编排、短期 Memory、本地 RAG 和可选 n8n workflow 工具调用
- `GET /api/providers`：安全读取 LLM provider 配置状态，不返回 secret
- `POST /api/tts`
- `GET /api/avatars`
- `POST /api/avatars`
- `GET /api/health`

## API 鉴权边界

本地开发默认不启用 API token，保证 `npm run smoke` 和默认 stub 演示可以直接运行。

公网或半公网私有演示前，至少启用：

```bash
REQUIRE_API_AUTH=true
API_AUTH_TOKEN=replace_with_private_token
```

启用后，以下敏感写接口需要 `Authorization: Bearer <token>` 或 `X-API-Token: <token>`：

- `POST /api/dialogue`
- `POST /api/chat`
- `POST /api/tts`
- `POST /api/avatars`

`GET /api/health`、`GET /api/providers` 和静态资源仍可公开读取；`GET /api/providers` 只能返回安全 readiness 状态。

鉴权错误使用稳定错误码：

- `API_AUTH_REQUIRED`
- `API_AUTH_INVALID`
- `API_AUTH_MISCONFIGURED`

未知的非公开 `POST / PUT / PATCH / DELETE` API 默认按敏感写接口处理，避免后续新增接口时忘记保护。当前能力是单 token API 鉴权基线，不是完整用户登录系统，不包含 OAuth、RBAC、多用户 session、refresh token、前端登录态、管理后台、多租户权限隔离或审计后台。

## 角色上传限制

`POST /api/avatars` 当前面向本地开发使用，支持 `.vrm`、`.glb`、`.gltf`。后端会做基础校验：

- `.vrm/.glb` 必须是 GLB 容器，文件头为 `glTF`
- `.gltf` 必须是合法 JSON，并包含 `asset.version`
- 单次上传体积上限为 80MB
- 原始上传文件先进入 `UPLOAD_STORAGE_DIR` 隔离区
- 公开资源使用后端生成的安全文件名，不使用用户原始文件名
- 拒绝路径穿越、绝对路径、空字节和危险扩展名
- 超过 `UPLOAD_MAX_TOTAL_BYTES` 时拒绝新上传

当前成功上传后仍会把验证后的 avatar 资源发布到 `AVATAR_ASSET_DIR`，供前端通过 `public/avatars/{avatarId}/manifest.json` 加载。生产环境应把上传隔离区和公开资源区分开，经过后台审核 / 安全扫描后再发布。

如果后续部署公网，需要在该接口前增加正式鉴权、来源限制、对象存储隔离、文件扫描和内容审核。

## 部署安全

当前服务默认面向本地开发，不建议直接暴露公网。部署前请先完成：

- CORS 白名单：`ALLOWED_ORIGINS=https://your-domain.example`
- 接口鉴权：`REQUIRE_API_AUTH=true`
- 请求体限制：`JSON_BODY_LIMIT`、`UPLOAD_BODY_LIMIT`、`AVATAR_UPLOAD_MAX_MB`
- 轻量限流：`RATE_LIMIT_ENABLED=true`
- 上传隔离和文件安全扫描
- 日志脱敏和请求正文最小化记录
- API Key 只保留在后端环境变量或密钥管理系统中
- n8n webhook URL / secret 只保留在后端环境变量中，前端不能直连 n8n

当前内置的 CORS、请求大小限制、内存限流、单 token API 鉴权、日志脱敏和上传隔离是私有演示 / 单实例部署前的基线，不是完整登录系统、WAF、多实例风控、病毒扫描、沙箱解析、CDN 隔离、多租户隔离或内容审核。

Phase 4 已作为“公网前安全部署基线”阶段收口。后续除非进入明确部署平台适配，否则不继续扩展安全能力；项目主线会回到 Memory、RAG、workflow 和 Agent 行为边界等 AI 能力。

## 部署前配置检查与请求追踪

服务启动前会执行轻量配置校验：

- `local`：保留本地开发友好默认值。
- `demo`：允许私有演示，但建议启用 `REQUIRE_API_AUTH=true`。
- `production`：必须配置 `ALLOWED_ORIGINS`，不能只使用 localhost，必须启用 `REQUIRE_API_AUTH=true`，并使用非占位 `API_AUTH_TOKEN`。

可以在部署前单独运行：

```bash
npm run check:deployment-readiness
```

每个请求都会带 `X-Request-ID` 响应头。后端请求日志会记录 `requestId / method / path / statusCode / durationMs`，错误日志会记录 `requestId / errorCode`，并继续通过 `redact` 脱敏 token、cookie、secret 和 provider key。

详细清单见 [DEPLOYMENT_SECURITY.md](../docs/security/DEPLOYMENT_SECURITY.md) 与 [PHASE4_DEPLOYMENT_SECURITY_BASELINE.md](../docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md)。

部署模式与检查步骤见 [ENVIRONMENT_MODES.md](../docs/deployment/ENVIRONMENT_MODES.md) 与 [DEPLOYMENT_CHECKLIST.md](../docs/deployment/DEPLOYMENT_CHECKLIST.md)。
