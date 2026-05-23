# Phase 4.1 Deployment Security Baseline

## 结论

Phase 4.1 只建立公网部署前的安全基线，不做真实部署、不接新 provider、不接 Qdrant、不新增 n8n workflow。

当前后端仍默认服务本地开发。公网或半公网私有演示前，必须至少开启 API 鉴权、限制 CORS、保护上传接口、确认 secret 只在后端环境变量中。

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

## 上传安全基线

当前上传接口只允许：

- `.vrm`
- `.glb`
- `.gltf`

当前已有基础保护：

- 请求体上限：`maxUploadBodyBytes`
- `.vrm/.glb` GLB magic 校验
- `.gltf` JSON 与 `asset.version` 校验
- avatarId 清洗
- multipart filename 清洗
- avatar 目录逃逸检查
- 上传新角色只生成 `manifest.json`，不生成 legacy `meta.json`
- 上传失败不能污染 registry

公网前仍必须补充：

- 用户级鉴权与配额
- 文件数量限制
- 资源审核或隔离目录
- 病毒扫描或对象存储扫描
- 发布前审核机制，而不是直接写入公开 `public/avatars`

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

公网前日志必须遵守：

- 不打印 API Key、Bearer token、webhook secret。
- 不打印完整用户隐私内容。
- 上游错误只返回裁剪后的摘要。
- n8n workflow 结果只返回安全包装字段。
- Debug Panel 只能展示状态，不展示 secret。

当前 `serverLogger` 仍是本地开发级别，生产前需要结构化日志、字段脱敏和请求 ID。

## CORS 边界

当前本地服务仍允许 `Access-Control-Allow-Origin: *`，方便开发。

公网前必须改为白名单，例如：

```text
CORS_ORIGINS=https://your-domain.example
```

Phase 4.1 只记录该要求，不新增完整部署平台配置。

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

## Phase 4.1 不包含

- 不上线真实部署平台。
- 不实现完整用户登录系统。
- 不接 Qdrant 或 embedding。
- 不实现长期记忆数据库。
- 不新增真实 n8n workflow。
- 不改变默认 stub 演示能力。
