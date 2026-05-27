## Backend API

## 公网前鉴权边界

本地开发默认 `REQUIRE_API_AUTH=false`。公网或半公网私有演示前，以下接口必须启用鉴权或接入正式用户认证：

- `POST /api/dialogue`
- `POST /api/chat`
- `POST /api/tts`
- `POST /api/avatars`

Phase 4.5 收口为单 token API 鉴权边界。启用 `REQUIRE_API_AUTH=true` 后，请求需要携带 `Authorization: Bearer <token>` 或 `X-API-Token: <token>`。`GET /api/health`、`GET /api/providers`、`GET /api/avatars` 和静态资源可公开读取；`GET /api/providers` 不得返回 secret。

鉴权错误使用 `{ ok:false, error:{ code, message } }`：

- `API_AUTH_REQUIRED`：敏感接口缺少 token。
- `API_AUTH_INVALID`：token 不正确。
- `API_AUTH_MISCONFIGURED`：后端要求鉴权但 token 未正确配置。

非明确公开的 `POST / PUT / PATCH / DELETE` API 默认需要鉴权。当前只是单 token API 鉴权基线，不包含用户注册 / 登录、OAuth、RBAC、多用户 session、refresh token、前端登录态、管理后台、多租户隔离或审计后台。

## 公网前请求边界

Phase 4.2 增加了公网部署前的最小请求边界：

- 运行模式：`DEPLOYMENT_MODE` 支持 `local / demo / production`；`production` 必须配置正式 `ALLOWED_ORIGINS`、API auth、rate limit 和明确上传 / 公开资源目录。
- CORS 白名单：`ALLOWED_ORIGINS` 支持逗号分隔；本地可通过 `CORS_ALLOW_LOCALHOST=true` 继续允许 localhost / 127.0.0.1。
- JSON 请求体限制：`JSON_BODY_LIMIT`，覆盖 `POST /api/dialogue`、`POST /api/chat`、`POST /api/tts`。
- 上传请求体限制：`UPLOAD_BODY_LIMIT` / `AVATAR_UPLOAD_MAX_MB`，覆盖 `POST /api/avatars`。
- 上传隔离：原始文件先进入 `UPLOAD_STORAGE_DIR`，验证后才发布到 `AVATAR_ASSET_DIR`。
- 轻量 rate limit：`RATE_LIMIT_ENABLED`、`RATE_LIMIT_WINDOW_MS`、`RATE_LIMIT_MAX_REQUESTS`、`RATE_LIMIT_SENSITIVE_MAX_REQUESTS`。
- 日志脱敏：后端 logger 不应打印 token、secret、cookie、Authorization 或完整 request body。
- 请求追踪：响应头返回 `X-Request-ID`，请求日志和错误日志使用同一个 requestId。
- 部署前检查：`npm run check:deployment-readiness` 会检查 production / demo 配置是否缺少 CORS、auth、rate limit 或日志边界。
- Secret 管理：provider key、TTS key、n8n webhook URL/secret、未来向量库凭证和 `API_AUTH_TOKEN` 只能通过后端环境变量或部署平台 Secret Manager 配置，不能进入前端、文档真实值或公开资源。

没有 `Origin` 的非浏览器请求，例如 curl、smoke 或平台 health check，可以通过 CORS 层；敏感写接口仍由鉴权和限流保护。以上能力是私有演示 / 单实例公网前基线，不是完整登录系统、WAF 或多实例生产级风控。

### POST /api/chat

浏览器只提交对话参数，API Key 和上游 Base URL 均由后端环境变量读取。

请求：

```json
{
  "message": "你好",
  "sessionId": "local-session",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": "你是 Alice..."
}
```

响应：

```json
{
  "reply": "你好呀！"
}
```

### POST /api/dialogue

统一对话编排入口，用于承载 Memory、RAG、n8n workflow 与 Agent orchestration。当前前端主链路已调用该接口，并支持本地 `stub`、LLM-only 编排、SQLite-backed Memory、保守长期 `memory_items`、本地知识检索 RAG 和可选 n8n workflow 工具调用。

请求：

```json
{
  "message": "你好",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": "你是 Alice...",
  "options": {
    "useMemory": false,
    "useRag": false,
    "useWorkflow": false
  }
}
```

真实 provider 配置完整时响应：

```json
{
  "ok": true,
  "data": {
    "reply": "你好呀！",
    "sources": [],
    "memory": {
      "used": false,
      "status": "disabled",
      "sessionId": null,
      "turnCount": 0,
      "maxTurns": 6,
      "context": []
    },
    "rag": {
      "used": false,
      "status": "disabled",
      "passages": []
    },
    "workflow": {
      "used": false,
      "status": "disabled",
      "result": null
    },
    "meta": {
      "mode": "llm_only",
      "orchestration": "agent_pipeline",
      "steps": {
        "memory": "disabled",
        "rag": "disabled",
        "workflow": "disabled"
      },
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

说明：

- `/api/dialogue` 使用 `LLMService` 复用现有 OpenAI-compatible provider 能力。
- `/api/dialogue` 的后端最小 Agent 编排顺序为：输入校验 -> Memory -> RAG -> optional Workflow -> PromptBuilder -> LLM/stub -> append Memory -> response。
- `sessionId` 用于后端 Memory；不传时使用 `default`。
- `options.useMemory=true` 时，后端会用 SQLite 记录最近 N 轮 user/assistant 消息，并在用户显式要求记住稳定信息时保守写入 `memory_items`。
- `options.useMemory=false` 时，不读取、不写入 Memory。
- `options.useRag=true` 时，后端会读取 `data/knowledge/` 并使用简单关键词检索返回 `rag.passages` 与顶层 `sources`；当前不接 Qdrant、不做 embedding。
- `options.useRag=false` 时，不读取本地知识源。
- `options.useWorkflow=true` 时，后端会尝试调用 `N8N_WEBHOOK_URL`；未配置时返回 `workflow.status=not_configured`，不会让 `/api/dialogue` 失败。
- n8n 只作为工具调用层，不作为主对话编排器；workflow 结果只进入 `workflow.result` 元数据，不会直接覆盖最终 `reply`。
- 成功响应中的 `meta.orchestration` 为 `agent_pipeline`，`meta.steps` 记录 Memory / RAG / Workflow 的状态。
- 如果 provider 未配置或缺少 API Key，会返回 `{ "ok": false, "error": { "code": "LLM_NOT_CONFIGURED", "message": "..." } }`。
- `provider` 为 `stub`、`local` 或 `boundary` 时，会返回本地 `llm_stub`，用于无 Key 本地开发演示、smoke 和边界检查，不代表生产 LLM。
- 前端默认 provider 为 `stub`，因此新环境无需 API Key 也能跑通 thinking -> speaking -> idle 的演示链路。
- `/api/chat` 仍保留为旧兼容入口，返回旧格式 `{ "reply": "..." }`。
- 向量 RAG、n8n、长期记忆不得直接放到前端；当前本地 RAG 也只在后端执行。

本地 stub 示例：

```json
{
  "message": "你好",
  "sessionId": "demo-session",
  "provider": "stub",
  "model": "stub",
  "options": {
    "useMemory": true,
    "useRag": true,
    "useWorkflow": true
  }
}
```

成功响应会保持统一结构：`reply / sources / memory / rag / workflow / meta`。其中 `meta.orchestration` 固定为 `agent_pipeline`，`meta.steps` 记录 Memory / RAG / Workflow 的状态。

Memory 示例：

```json
{
  "message": "继续刚才的话题",
  "sessionId": "demo-session",
  "provider": "stub",
  "model": "stub",
  "options": {
    "useMemory": true,
    "useRag": false,
    "useWorkflow": false
  }
}
```

响应中的 `memory`：

```json
{
  "used": true,
  "status": "ready",
  "sessionId": "demo-session",
  "turnCount": 2,
  "maxTurns": 6,
  "longTerm": {
    "used": true,
    "status": "ready",
    "count": 1,
    "items": [
      {
        "id": 1,
        "type": "preference",
        "scope": "session",
        "content": "我喜欢简短自然的中文陪伴回复"
      }
    ]
  },
  "longTermWrite": {
    "stored": true,
    "status": "ready",
    "reason": "explicit_memory",
    "type": "preference"
  },
  "context": [
    {
      "role": "user",
      "content": "上一轮用户消息",
      "at": "2026-05-23T00:00:00.000Z"
    }
  ]
}
```

说明：当前 Memory 使用后端 SQLite。最近 N 轮 user/assistant 消息用于短期上下文；长期记忆采用保守 `memory_items`，只有用户明确表达“记住这个 / 以后你要记得 / 我喜欢 / 我的目标是”等稳定信息时才写入。普通闲聊不会自动变成长期记忆，敏感内容会被拒绝。

本地 RAG 示例：

```json
{
  "message": "Alice RAG Memory 项目支持什么？",
  "sessionId": "demo-session",
  "provider": "stub",
  "model": "stub",
  "options": {
    "useMemory": false,
    "useRag": true,
    "useWorkflow": false
  }
}
```

响应中的 `rag` 与 `sources`：

```json
{
  "sources": [
    {
      "id": "alice_project.md",
      "title": "Alice Digital Companion",
      "source": "alice_project.md",
      "score": 4
    }
  ],
  "rag": {
    "used": true,
    "status": "local",
    "passages": [
      {
        "id": "alice_project.md",
        "title": "Alice Digital Companion",
        "content": "Alice Digital Companion 是一个 AI 数字伙伴项目...",
        "source": "alice_project.md",
        "score": 4,
        "matchedTerms": ["alice", "rag"]
      }
    ]
  }
}
```

说明：当前 RAG 是后端本地关键词检索，不是向量检索；知识源位于 `data/knowledge/`，不在 `public/`。

n8n workflow 示例：

```json
{
  "message": "帮我检查外部工具状态",
  "sessionId": "demo-session",
  "provider": "stub",
  "model": "stub",
  "options": {
    "useMemory": false,
    "useRag": false,
    "useWorkflow": true
  }
}
```

未配置 n8n 时响应中的 `workflow`：

```json
{
  "used": false,
  "status": "not_configured",
  "reason": "not_configured",
  "result": null
}
```

配置 n8n 且调用成功时响应中的 `workflow`：

```json
{
  "used": true,
  "status": "success",
  "result": {
    "summary": "workflow result"
  }
}
```

说明：`N8N_WEBHOOK_URL`、`N8N_WEBHOOK_SECRET` 只允许配置在后端环境变量中，前端不会看到 webhook 地址或 secret。

### POST /api/tts

TTS 代理接口，支持 `openai` 与 `minimax`，返回音频二进制。

请求：

```json
{
  "text": "你好呀！",
  "provider": "minimax",
  "model": "speech-2.8-hd",
  "voice": "Chinese (Mandarin)_Crisp_Girl",
  "speed": 1.05,
  "pitch": 1.2
}
```

OpenAI 请求可额外传入 `instructions`，后端会使用 `gpt-4o-mini-tts` 作为默认模型。

### GET /api/providers

安全 provider 状态诊断接口，用于区分本地演示模式和真实 provider 配置状态。

响应：

```json
{
  "ok": true,
  "data": {
    "llm": [
      {
        "provider": "stub",
        "configured": true,
        "defaultModel": "stub",
        "mode": "demo",
        "requiresKey": false,
        "status": "ready"
      },
      {
        "provider": "openai",
        "configured": false,
        "defaultModel": "gpt-4o-mini",
        "mode": "real",
        "requiresKey": true,
        "status": "missing_key"
      }
    ]
  }
}
```

说明：

- 该接口不返回 API Key、token、secret、Bearer header 或完整环境变量值。
- `stub` 必须始终可用，用于本地演示和 smoke。
- 真实 provider 的 `configured` 只代表后端环境变量具备调用所需的非空配置，不代表上游一定可用。

### GET /api/health

健康检查。

### GET /api/avatars

读取当前可用角色注册表。

响应：

```json
{
  "defaultAvatarId": "alice",
  "avatars": [
    {
      "id": "alice",
      "name": "Alice",
      "manifest": "public/avatars/alice/manifest.json"
    },
    {
      "id": "osa_shiro",
      "name": "Shiro（CC0 动漫风）",
      "manifest": "public/avatars/osa_shiro/manifest.json"
    },
    {
      "id": "osa_wambo",
      "name": "Wambo（CC0 风格化）",
      "manifest": "public/avatars/osa_wambo/manifest.json"
    }
  ]
}
```

### POST /api/avatars

上传或替换人物模型。该接口必须使用后端服务 `npm run dev`，Python 静态服务不支持。

请求类型：`multipart/form-data`

字段：

- `model`：必填，`.vrm` / `.glb` / `.gltf`
- `avatarId`：可选，只允许字母、数字、`_`、`-`，不填时后端会自动生成
- `name`：可选，角色显示名称
- `targetHeight`：可选，默认 `120`
- `motions`：可选，`motions.json`
- `skeleton`：可选，`skeleton.mixamo.json`
- `llmProvider` / `llmModel` / `ttsEngine`：可选，仅写入角色 manifest 的接口关联信息，不修改 API Key

上传成功后，后端会写入：

```text
data/uploads/quarantine/{generated-file-name}
public/avatars/{avatarId}/{generated-model-file-name}.{vrm|glb|gltf}
public/avatars/{avatarId}/manifest.json
public/avatars/{avatarId}/motions.json
public/avatars/{avatarId}/skeleton.mixamo.json
```

上传安全边界：

- 原始文件名只作为 metadata，不参与真实存储路径。
- 公开模型文件名由后端生成，不使用用户上传文件名。
- 拒绝路径穿越、绝对路径、空字节、异常分隔符。
- 只接受 `.vrm` / `.glb` / `.gltf`。
- `.vrm/.glb` 检查 GLB magic header：`glTF`。
- `.gltf` 必须是 JSON 且包含 `asset.version`。
- `.vrm` 当前只做 GLB 容器基础校验，暂不做完整 VRM schema 校验。
- 明确拒绝 `.html/.js/.mjs/.svg/.php/.sh/.exe/.zip` 等危险或当前不需要的类型。
- 隔离目录超过 `UPLOAD_MAX_TOTAL_BYTES` 时返回 `UPLOAD_QUOTA_EXCEEDED`。

稳定错误码：

- `UPLOAD_PATH_INVALID`
- `UPLOAD_FILE_TYPE_INVALID`
- `UPLOAD_FILE_CONTENT_INVALID`
- `UPLOAD_STORAGE_FAILED`
- `UPLOAD_QUOTA_EXCEEDED`
- `REQUEST_BODY_TOO_LARGE`
