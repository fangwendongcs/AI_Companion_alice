# API Contract

当前后端是本地开发代理服务，入口是 `backend/server.js`，具体接口已拆到 `backend/routes/*`。

## 当前接口

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

### POST /api/chat

旧兼容对话入口。当前前端默认不再调用该接口，但后端仍保留它，并复用 `LLMService` 通过环境变量代理 LLM 请求。成功返回：

```json
{ "reply": "..." }
```

### POST /api/dialogue

当前前端主对话入口。已支持本地 `stub`、LLM-only 编排、后端短期 Memory、本地知识检索 RAG 和可选 n8n workflow 工具调用。n8n 不作为主对话编排器。

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
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

如果 `options.useMemory=true`，当前会启用后端进程内短期 Memory，并按 `sessionId` 记录最近 N 轮 user/assistant 消息。该 Memory 不落盘，服务重启后丢失。

如果 `options.useRag=true`，当前会调用后端本地 `RagService`，读取 `data/knowledge/` 并返回 `rag.passages` 与顶层 `sources`。当前不调用 Qdrant、不做 embedding、不访问外部网络。

如果 `options.useWorkflow=true`，当前会通过后端 `N8nWorkflowService` 检查 `N8N_WEBHOOK_URL`。未配置时返回 `workflow.status=not_configured`，不会让 `/api/dialogue` 失败；配置后由后端调用 n8n webhook，并将安全包装后的结果放入 `workflow.result`。

无密钥本地演示和 smoke 可使用 `provider: "stub"`，当前前端默认也使用该 provider。此时返回：

```json
{
  "ok": true,
  "data": {
    "reply": "我现在处于本地演示模式，还没有连接真实模型，但对话链路已经跑通了。",
    "meta": {
      "mode": "llm_stub",
      "provider": "stub"
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

返回音频二进制。

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
