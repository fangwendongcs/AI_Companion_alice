# Phase 4 Deployment Security Baseline

## 结论

Phase 4.1 建立公网部署前的 API 鉴权基线；Phase 4.2 继续收口 CORS 白名单、请求大小限制、轻量速率限制和日志脱敏基线；Phase 4.3 增加部署配置校验、请求 ID、结构化日志和生产启动前检查；Phase 4.4 增加上传隔离与文件安全边界。本阶段不做真实部署、不接新 provider、不接 Qdrant、不新增 n8n workflow。

当前后端仍默认服务本地开发。公网或半公网私有演示前，必须至少开启 API 鉴权、配置正式域名白名单、限制请求体和上传体积、保护上传接口、确认 secret 只在后端环境变量中。

## Phase 4.3 配置分层与可观测性

### 部署模式

当前 `DEPLOYMENT_MODE` 支持：

- `local`：本地开发，允许 localhost，默认不要求 API token。
- `demo`：私有演示，建议启用 `REQUIRE_API_AUTH=true`，适合给少量人预览。
- `production`：公网部署前模式，启动前必须满足更严格校验。

`DEPLOYMENT_MODE=production` 时：

- 必须显式配置 `ALLOWED_ORIGINS`。
- `ALLOWED_ORIGINS` 不能只有 localhost / 127.0.0.1。
- 必须启用 `REQUIRE_API_AUTH=true`。
- 必须配置非占位 `API_AUTH_TOKEN`。
- `RATE_LIMIT_ENABLED` 不应关闭。
- JSON / 上传 body limit 必须保持有效。

校验失败时服务会在启动前失败，并输出缺少的配置项，不打印真实 secret。

### 请求 ID

每个请求都会分配 `X-Request-ID`：

- 如果请求头已有 `X-Request-ID`，后端会规范化后复用。
- 如果没有，后端生成新的 UUID。
- 响应头返回同一个 `X-Request-ID`。
- 请求日志和错误日志都带 `requestId`，方便排查单次链路。

### 结构化日志

当前 `serverLogger` 会输出结构化字段：

- `timestamp`
- `level`
- `message`
- `requestId`
- `method`
- `path`
- `statusCode`
- `durationMs`
- `errorCode`

日志仍经过 `redact` 脱敏，不完整打印 request body，不打印 Authorization、Cookie、API token、provider key 或 webhook secret。`production` 模式下日志更偏 JSON line，便于后续接入平台日志。

### 部署前检查

可以运行：

```bash
npm run check:deployment-readiness
```

该脚本会检查：

- `demo` / `production` 模式是否配置了 CORS 白名单。
- 是否仍使用 localhost-only 配置。
- 是否启用 API auth 并配置非占位 token。
- rate limit 是否被错误关闭。
- CORS / rate limit / requestId / request logger / redact 文件是否存在。
- 是否存在 `console.log(req.body)` 或 `console.log(process.env)` 等高风险日志模式。

## 接口分级

### 可以公开读取

- `GET /api/health`
- `GET /api/providers`
- 静态资源

`GET /api/providers` 只能返回 `configured / requiresKey / mode / defaultModel` 等非敏感 readiness 状态，不得返回 Key、token、secret、Bearer、真实 webhook URL 或真实上游地址。

### 公网前必须鉴权

- `POST /api/dialogue`
- `POST /api/chat`
- `POST /api/tts`
- `POST /api/avatars`

这些接口可能消耗上游额度、触发 TTS、写入角色 registry、调用 n8n workflow 或处理用户输入。Phase 4.1 已增加默认关闭的轻量 API 鉴权边界：

```bash
REQUIRE_API_AUTH=true
API_AUTH_TOKEN=replace_with_private_token
```

启用后，客户端需要通过以下任一方式发送 token：

```text
Authorization: Bearer <token>
X-API-Token: <token>
```

本地开发默认 `REQUIRE_API_AUTH=false`，因此 `npm run smoke` 不需要 token。

## Phase 4.2 请求边界

### CORS 白名单

当前后端支持：

```bash
DEPLOYMENT_MODE=local
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ALLOW_LOCALHOST=true
```

规则：

- 本地开发允许 `localhost` / `127.0.0.1`。
- `DEPLOYMENT_MODE=production` 或 `REQUIRE_API_AUTH=true` 时，不应依赖公网 `*`。
- 未命中白名单的浏览器 Origin 会返回 `CORS_ORIGIN_DENIED`。
- 没有 `Origin` 的非浏览器请求，例如 curl、后端 smoke、平台 health check，可以放行；敏感接口仍受鉴权和限流保护。

### 请求体和上传限制

当前后端支持：

```bash
JSON_BODY_LIMIT=1mb
UPLOAD_BODY_LIMIT=80mb
AVATAR_UPLOAD_MAX_MB=80
```

- `POST /api/dialogue`、`POST /api/chat`、`POST /api/tts` 使用 JSON 请求体限制。
- `POST /api/avatars` 使用上传请求体限制。
- 超限返回 `REQUEST_BODY_TOO_LARGE` / 413，不暴露内部堆栈。

### 轻量限流

当前后端支持单进程内存限流：

```bash
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=240
RATE_LIMIT_SENSITIVE_MAX_REQUESTS=60
```

敏感写接口会使用更严格限制：

- `POST /api/dialogue`
- `POST /api/chat`
- `POST /api/tts`
- `POST /api/avatars`

返回 429 时使用 `RATE_LIMIT_EXCEEDED`。该能力适合私有演示和单实例部署前基线，不是多实例生产级 WAF，也不替代平台层限流。

### 日志脱敏

当前 `serverLogger` 已接入基础脱敏，覆盖：

- `authorization`
- `cookie`
- API key / token / secret / password
- `API_AUTH_TOKEN`
- provider key
- webhook secret

后端不应完整打印 request body，用户输入正文也不应进入长期日志。

## 上传安全基线

当前上传接口只允许：

- `.vrm`
- `.glb`
- `.gltf`

当前已有基础保护：

- 请求体上限：`UPLOAD_BODY_LIMIT` / `AVATAR_UPLOAD_MAX_MB`
- 原始上传文件先写入 `UPLOAD_STORAGE_DIR` 隔离区
- 验证通过后才发布到 `AVATAR_ASSET_DIR`
- 公开模型文件名由后端生成，不使用用户原始文件名
- 原始文件名只作为 metadata
- 拒绝路径穿越、绝对路径、空字节、异常分隔符
- `.vrm/.glb` GLB magic 校验
- `.gltf` JSON 与 `asset.version` 校验
- `.vrm` 当前按 GLB 容器做基础校验，不做完整 VRM schema 校验
- 危险扩展名显式拒绝：`.html/.htm/.js/.mjs/.svg/.php/.sh/.bat/.cmd/.exe/.dll/.dmg/.pkg/.zip/.rar/.7z`
- 上传隔离目录配额：`UPLOAD_MAX_TOTAL_BYTES`
- avatarId 清洗
- multipart filename 清洗
- avatar 目录逃逸检查
- 上传新角色只生成 `manifest.json`，不生成 legacy `meta.json`
- 上传失败不能污染 registry

稳定错误码：

- `UPLOAD_PATH_INVALID`
- `UPLOAD_FILE_TYPE_INVALID`
- `UPLOAD_FILE_CONTENT_INVALID`
- `UPLOAD_STORAGE_FAILED`
- `UPLOAD_QUOTA_EXCEEDED`
- `REQUEST_BODY_TOO_LARGE`

公网前仍必须补充：

- 用户级鉴权与配额
- 文件数量限制
- 资源审核或隔离目录
- 病毒扫描或对象存储扫描
- 发布前审核机制，而不是直接写入公开 `public/avatars`
- CDN 隔离、沙箱解析、多租户隔离、完整 VRM schema 校验和内容审核

## Secret 边界

以下内容只能存在于后端环境变量或密钥管理系统：

- provider API Key
- TTS API Key
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- 未来 Qdrant credential
- `API_AUTH_TOKEN`

前端不得出现：

- API Key
- webhook URL
- webhook secret
- Qdrant credential
- Bearer token 拼接逻辑

`.env.example` 只能保留 placeholder，不得写真实值。

## 日志安全

公网前日志必须继续遵守：

- 不打印 API Key、Bearer token、webhook secret。
- 不打印完整用户隐私内容。
- 上游错误只返回裁剪后的摘要。
- n8n workflow 结果只返回安全包装字段。
- Debug Panel 只能展示状态，不展示 secret。

当前日志脱敏是基线能力；生产前仍需要结构化日志、请求 ID、采集策略和脱敏抽样验证。

## 自动化检查

Phase 4.1 新增：

```bash
npm run check:security-boundaries
```

它会检查：

- 敏感写接口存在可配置 API 鉴权边界。
- `.env.example` 只有 placeholder。
- 前端不出现后端 secret / webhook / token 处理逻辑。
- Provider status 不返回 secret-shaped 字段。
- 上传链路包含基础文件类型、magic、路径清洗和 registry 保护。
- 部署安全文档包含公网前必须启用的边界。

Phase 4.2 扩展检查：

- CORS 不再硬编码公网 `*`。
- 存在 `ALLOWED_ORIGINS` / `CORS_ALLOW_LOCALHOST` 配置。
- 存在 JSON / 上传请求体限制配置。
- 存在轻量 rate limit 中间件。
- 存在日志脱敏工具并接入 `serverLogger`。
- 后端不直接打印 `req.body` 或 `authorization`。

Phase 4.3 扩展检查：

- 存在 `validateServerConfig`，并在服务启动前执行。
- 存在 `requestIdMiddleware` 和 `requestLogMiddleware`。
- `serverLogger` 输出结构化字段并继续脱敏。
- 存在 `check:deployment-readiness`。

Phase 4.4 扩展检查：

- 存在 `check:upload-boundaries`。
- 路径穿越输入会被拒绝。
- 危险扩展名会被拒绝。
- 伪装扩展但内容非法会被拒绝。
- `.glb/.gltf/.vrm` 基础合法样本能通过。
- 上传隔离目录默认不在 `public/` 下。
- 配额超限返回 `UPLOAD_QUOTA_EXCEEDED`。

## Phase 4 不包含

- 不上线真实部署平台。
- 不实现完整用户登录系统。
- 不接 Qdrant 或 embedding。
- 不实现长期记忆数据库。
- 不新增真实 n8n workflow。
- 不改变默认 stub 演示能力。
- 不实现完整用户登录系统。
- 不提供多实例生产级风控或 WAF。
- 不提供上传内容安全扫描。
- 不配置 HTTPS 证书。
- 不接外部日志平台、Sentry 或 OpenTelemetry。
- 不提供对象存储隔离桶、CDN 隔离、病毒扫描、沙箱解析、用户级鉴权配额、多租户隔离、内容审核或文件异步审核发布流。
