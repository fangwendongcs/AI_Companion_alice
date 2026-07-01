# API Contract

当前后端是本地开发代理服务，入口是 `backend/server.js`，具体接口已拆到 `backend/routes/*`。

## 当前接口

## 鉴权兼容期

本地开发默认不启用 API token，保持现有 smoke 和 stub 演示兼容。

公网或私有演示前必须启用 `REQUIRE_API_AUTH=true`，并通过后端环境变量设置 `API_AUTH_TOKEN`。启用后，以下写接口需要 `Authorization: Bearer <token>` 或 `X-API-Token: <token>`：

- `POST /api/dialogue`
- `GET /api/memory`
- `DELETE /api/memory`
- `POST /api/chat`
- `POST /api/tts`
- `POST /api/avatars`
- 非明确公开的 `POST / PUT / PATCH / DELETE` API

公开读取接口：

- `GET /api/health`
- `GET /api/providers`，只能返回安全 readiness 状态
- `GET /api/avatars`
- 静态资源

鉴权失败时返回 `{ ok:false, error:{ code, message } }`：

```json
{
  "ok": false,
  "error": {
    "code": "API_AUTH_REQUIRED",
    "message": "API authentication is required."
  }
}
```

稳定错误码：

- `API_AUTH_REQUIRED`
- `API_AUTH_INVALID`
- `API_AUTH_MISCONFIGURED`

当前只是单 token API 鉴权基线，不是完整登录系统，不包含 OAuth、RBAC、多用户 session、refresh token、前端登录态、管理后台、多租户权限隔离或审计后台。

## 请求边界兼容期

Phase 4.2 已增加公网部署前请求边界，当前约定如下：

- CORS 由 `ALLOWED_ORIGINS` 控制，未命中白名单的浏览器请求返回 `403` 与 `CORS_ORIGIN_DENIED`。
- 没有 `Origin` 的非浏览器请求可以通过 CORS 层，便于 smoke、curl、health check 和后端间调用。
- JSON 请求体超限返回 `413`，错误码 `REQUEST_BODY_TOO_LARGE`。
- API 速率超限返回 `429`，错误码 `RATE_LIMIT_EXCEEDED`，并带 `Retry-After`。
- `GET /api/health` 不做严格限流；敏感写接口使用更低阈值。
- 日志不得包含 Authorization、cookie、API Key、token、secret、password 或完整 request body。
- 每个响应都会带 `X-Request-ID`；客户端报错时可以把 requestId 带回，后端日志用同一 ID 排查。
- 生产启动前可以运行 `npm run check:deployment-readiness` 检查配置是否适合 demo / production。
- `DEPLOYMENT_MODE=local` 保持本地默认值；`demo` 面向受控私有演示；`production` 必须使用非 localhost-only origin、启用 API auth、启用 rate limit，并显式配置上传隔离目录和公开资源目录。
- `.env.example` 只能包含 placeholder；真实 provider key、TTS key、n8n webhook、API token、未来向量库凭证只允许在后端环境变量或部署平台 Secret Manager 中配置。

这些边界保持本地开发兼容，但公网部署前仍需要正式域名白名单、HTTPS、平台 secret 管理、上传隔离与更完整审计。

### GET /api/health

```json
{ "ok": true }
```

### GET /api/avatars

当前返回 registry 原始结构：

```json
{
  "defaultAvatarId": "alice",
  "avatars": [
    {
      "id": "alice",
      "name": "Alice",
      "manifest": "public/avatars/alice/manifest.json"
    }
  ]
}
```

说明：

- 新角色条目只使用 `manifest` 字段。
- 旧条目如果仍只有 `meta`，前端会继续兼容读取，但新流程不会再新增 `meta`。

### POST /api/avatars

上传角色资源，成功返回：

```json
{
  "avatar": {
    "id": "avatar_id",
    "name": "Avatar Name",
    "manifest": "public/avatars/avatar_id/manifest.json"
  },
  "registry": {}
}
```

Phase 4.4 上传边界：

- 原始上传文件先写入 `UPLOAD_STORAGE_DIR` 隔离区。
- 验证通过后，后端生成安全模型文件名并发布到 `AVATAR_ASSET_DIR`。
- 原始文件名只保留为 metadata，不参与真实路径拼接。
- `.vrm/.glb` 必须通过 `glTF` magic header 校验。
- `.gltf` 必须是合法 JSON 且包含 `asset.version`。
- `.html/.htm/.js/.mjs/.svg/.php/.sh/.bat/.cmd/.exe/.dll/.dmg/.pkg/.zip/.rar/.7z` 等类型会被拒绝。
- 隔离目录超过 `UPLOAD_MAX_TOTAL_BYTES` 时返回 `UPLOAD_QUOTA_EXCEEDED`。

上传错误使用 `{ ok:false, error:{ code, message } }`，稳定错误码包括：

- `UPLOAD_PATH_INVALID`
- `UPLOAD_FILE_TYPE_INVALID`
- `UPLOAD_FILE_CONTENT_INVALID`
- `UPLOAD_STORAGE_FAILED`
- `UPLOAD_QUOTA_EXCEEDED`
- `REQUEST_BODY_TOO_LARGE`

### POST /api/chat

旧兼容对话入口。当前前端默认不再调用该接口，但后端仍保留它，并复用 `LLMService` 通过环境变量代理 LLM 请求。成功返回：

```json
{ "reply": "..." }
```

### POST /api/dialogue

当前前端主对话入口。已支持本地 `stub`、LLM-only 编排、SQLite-backed Memory、保守长期 `memory_items`、角色 persona、规则化 affect、本地知识检索 RAG 和可选 n8n workflow 工具调用。n8n 不作为主对话编排器。

Phase 5.10 起，该接口返回 `dialogue.v1` 跨端语义契约字段。Web 与后续 iOS 应优先消费这些 renderer-agnostic 字段；现有 `reply / affect / memory / meta` 继续保留为 Web 兼容字段。

最小 Agent 编排顺序固定为：

```text
validate input -> memory context -> rag context -> optional workflow -> PromptBuilder -> LLM/stub -> append memory -> response
```

请求：

```json
{
  "message": "hello",
  "sessionId": "local-session",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": "optional",
  "options": {
    "useMemory": false,
    "useRag": false,
    "useWorkflow": false
  }
}
```

当前成功返回：

```json
{
  "ok": true,
  "data": {
    "reply": "...",
    "reply_text": "...",
    "companion_state": "speaking",
    "emotion": {
      "name": "warm",
      "intensity": 0.48
    },
    "tone": "gentle",
    "avatar_directive": {
      "state": "speaking",
      "emotion": "warm",
      "gesture": "soft_nod",
      "gaze": "user",
      "lip_sync": "auto",
      "intensity": 0.48
    },
    "memory_event": {
      "short_context_updated": false,
      "long_term_memory_changed": false,
      "badge": "off",
      "status": "disabled",
      "session_id": null,
      "avatar_id": null
    },
    "tts": {
      "status": "pending",
      "audio_url": null
    },
    "contract": {
      "version": "dialogue.v1",
      "renderer_agnostic": true,
      "consumer": "web_ios_shared_backend"
    },
    "sources": [],
    "memory": {
      "used": false,
      "status": "disabled",
      "sessionId": null,
      "turnCount": 0,
      "maxTurns": 6,
      "context": [],
      "longTerm": {
        "used": false,
        "status": "disabled",
        "count": 0,
        "items": []
      }
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
    "affect": {
      "emotion": "warm",
      "intensity": 0.48,
      "tone": "gentle",
      "reason": "default_warm",
      "voice": {
        "style": "gentle",
        "rate": 1.02,
        "pitch": 1.1
      },
      "motion": {
        "slot": "speaking",
        "intensity": 0.45
      }
    },
    "meta": {
      "mode": "llm_only",
      "orchestration": "agent_pipeline",
      "steps": {
        "memory": "disabled",
        "rag": "disabled",
        "workflow": "disabled"
      },
      "persona": {
        "avatarId": "alice",
        "personaId": "alice_default",
        "tone": "warm_playful"
      },
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

如果 `options.useMemory=true`，当前会启用 SQLite-backed Memory，并按 `sessionId` 记录最近 N 轮 user/assistant 消息。用户显式表达“记住这个 / 以后你要记得 / 我喜欢 / 我的目标是”等稳定信息时，会保守写入 `memory_items`，并通过 `memory.longTerm` 与 `memory.longTermWrite` 返回轻量状态。普通闲聊不会自动进入长期记忆，敏感信息会被拒绝。

如果 `options.useRag=true`，当前会调用后端本地 `RagService`，读取 `data/knowledge/` 并返回 `rag.passages` 与顶层 `sources`。当前不调用 Qdrant、不做 embedding、不访问外部网络。

如果 `options.useWorkflow=true`，当前会通过后端 `N8nWorkflowService` 检查 `N8N_WEBHOOK_URL`。未配置时返回 `workflow.status=not_configured`，不会让 `/api/dialogue` 失败；配置后由后端调用 n8n webhook，并将安全包装后的结果放入 `workflow.result`。

`meta.persona` 只返回角色 ID、persona ID、tone、voice style、motion style 和 memory strategy 等非敏感摘要。`affect` 只代表当前轮情绪 / 语气 / 语音 / 动作提示，不默认写入长期记忆。

`reply_text / companion_state / emotion / tone / avatar_directive / memory_event / tts / contract` 是跨端消费字段，不允许包含 `animationFile`、`fbxPath`、`riveInput`、`vrmExpressionPreset`、`boneName` 或硬编码动画路径。Renderer 只能把 `avatar_directive` 映射到本地表现层。

### GET /api/memory / DELETE /api/memory

`GET /api/memory` 返回当前 session / avatar 的精简长期记忆摘要，不返回完整原始 messages。

`DELETE /api/memory` 支持 `scope=context`、`scope=session` 或 `scope=avatar`。`scope=context` 只清除当前 session 的短期 messages，用于“清空上下文”，不会删除显式保存的长期 `memory_items`；`scope=session` / `scope=avatar` 用于清除当前会话或当前角色的长期记忆摘要。该接口属于敏感 API；`REQUIRE_API_AUTH=true` 或 production 模式下必须提供 API token。

无密钥本地演示和 smoke 可使用 `provider: "stub"`，当前前端默认也使用该 provider。此时返回：

```json
{
  "ok": true,
  "data": {
    "reply": "我现在处于本地演示模式，还没有连接真实模型，但对话链路已经跑通了。",
    "sources": [],
    "memory": {
      "used": false,
      "status": "disabled",
      "sessionId": null,
      "turnCount": 0,
      "maxTurns": 6,
      "context": [],
      "longTerm": {
        "used": false,
        "status": "disabled",
        "count": 0,
        "items": []
      }
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
      "mode": "llm_stub",
      "orchestration": "agent_pipeline",
      "steps": {
        "memory": "disabled",
        "rag": "disabled",
        "workflow": "disabled"
      },
      "provider": "stub",
      "model": "stub"
    }
  }
}
```

空消息错误：

```json
{
  "ok": false,
  "error": {
    "code": "DIALOGUE_MESSAGE_REQUIRED",
    "message": "Missing dialogue message."
  }
}
```

缺少真实 provider API Key 时：

```json
{
  "ok": false,
  "error": {
    "code": "LLM_NOT_CONFIGURED",
    "message": "Missing API key..."
  }
}
```

Memory enabled 成功时：

```json
{
  "ok": true,
  "data": {
    "memory": {
      "used": true,
      "status": "ready",
      "sessionId": "local-session",
      "turnCount": 1,
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
    }
  }
}
```

RAG enabled 命中时：

```json
{
  "ok": true,
  "data": {
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
}
```

Workflow 未配置时：

```json
{
  "ok": true,
  "data": {
    "workflow": {
      "used": false,
      "status": "not_configured",
      "reason": "not_configured",
      "result": null
    }
  }
}
```

Workflow 成功时：

```json
{
  "ok": true,
  "data": {
    "workflow": {
      "used": true,
      "status": "success",
      "result": {
        "summary": "workflow result"
      }
    }
  }
}
```

### POST /api/tts

后端统一 TTS provider 入口。推荐 Web / iOS 发送 `responseFormat=json`，消费统一 Audio Result；旧二进制响应仍保留为兼容路径。

请求：

```json
{
  "text": "你好，我是 Alice。",
  "provider": "mock",
  "voiceId": "alice",
  "locale": "zh-CN",
  "emotion": "warm",
  "tone": "gentle",
  "prosody": {
    "rate": 1.05,
    "pitch": 1.1,
    "volume": 1
  },
  "stream": false,
  "responseFormat": "json"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "tts_status": "ok",
    "provider": "mock",
    "format": "wav",
    "audioUrl": null,
    "audioBase64": "...",
    "durationMs": 260,
    "sampleRate": 16000,
    "streaming": false,
    "contentType": "audio/wav"
  }
}
```

不可用 / 失败响应仍保持 HTTP 200 + 可观测状态，便于客户端保留文本回复并降级到本机语音：

```json
{
  "ok": true,
  "data": {
    "tts_status": "unavailable",
    "provider": "cosyvoice",
    "format": null,
    "audioUrl": null,
    "audioBase64": "",
    "streaming": false,
    "error": {
      "code": "TTS_NOT_CONFIGURED",
      "message": "missing_base_url"
    }
  }
}
```

Provider：

- `mock`：默认本地演示，不需要外部服务。
- `cosyvoice`：CosyVoice2 adapter，默认通过官方 FastAPI runtime 配置；OpenAI-compatible proxy 必须显式设置 `COSYVOICE_API_STYLE=openai_compatible`。
- `higgs`：Higgs Audio v3 实验 adapter，通过 `HIGGS_BASE_URL` 配置兼容 `/v1/audio/speech` endpoint。
- `openai` / `minimax`：旧兼容 provider。

合约要求：

- 前端和 iOS 不接触 TTS service URL、模型部署地址或 API Key。
- `emotion / tone / prosody` 是 Alice 统一语义，provider-specific prompt、instruction 或 inline token 只在后端 adapter 内生成。
- `GET /api/providers` 只返回 provider readiness 和 capability，不返回 base URL、secret、token 或 Bearer。

### GET /api/providers

安全 provider readiness 诊断接口。成功返回：

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
    ],
    "tts": [
      {
        "provider": "mock",
        "configured": true,
        "mode": "demo",
        "requiresKey": false,
        "status": "ready",
        "health": {
          "healthy": true,
          "status": "ready",
          "live": false,
          "reason": "mock_provider"
        },
        "capabilities": {
          "supportsStreaming": false,
          "supportsVoiceClone": false,
          "supportsEmotion": true
        }
      },
      {
        "provider": "cosyvoice",
        "configured": false,
        "mode": "real",
        "requiresKey": false,
        "status": "missing_base_url",
        "apiStyle": "official_fastapi",
        "apiMode": "sft",
        "sampleRate": 22050,
        "health": {
          "healthy": false,
          "status": "missing_base_url",
          "live": false,
          "reason": "missing_base_url"
        },
        "capabilities": {
          "supportsStreaming": false,
          "supportsVoiceClone": true,
          "supportsEmotion": true
        }
      }
    ]
  }
}
```

合约要求：

- 不返回真实 API Key、secret、token、Bearer 或 webhook。
- 不返回 provider base URL 的真实值。
- `stub.configured` 必须为 `true`。
- 真实 provider 未配置时只返回稳定状态，不触发外部网络请求。

## 目标返回格式

后续建议逐步迁移为：

成功：

```json
{
  "ok": true,
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## 兼容迁移期

前端已有代码依赖 `/api/avatars` 和上传接口的当前响应结构。为了不破坏现有功能，当前处于兼容迁移期：

- 后端保留旧响应结构，例如 `/api/avatars` 仍返回 registry 原始对象。
- `backend/utils/response.js` 已提供 `sendOk()` / `sendError()`，后续新接口可以直接返回 `{ ok, data, error }`。
- 前端 `ApiClient.normalizeApiResponse()` 同时兼容三类结构：
  - 旧格式：数组或普通对象会原样返回。
  - 新成功格式：`{ ok: true, data }` 会解包成 `data`。
  - 新失败格式：`{ ok: false, error }` 会转换成 `AppError`。

因此后续可以逐个接口迁移，不需要一次性重写所有调用点。

TODO：

- 新接口优先使用 `{ ok, data, error }`。
- `/api/dialogue` 已使用 `{ ok, data, error }`，可作为后续新接口样板。
- 旧接口迁移时先确认前端调用方已经通过 `ApiClient` 访问。
- `/api/avatars` 可在后续版本增加 `{ ok, data }` 包装，同时保留兼容读取逻辑。
- 文件上传接口如果部署公网，需要增加鉴权、速率限制、大小限制策略和安全扫描。
