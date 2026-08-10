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

当前前端主对话入口。已支持本地 `stub`、OpenAI-compatible LLM-only 编排、SQLite-backed Memory、保守长期 `memory_items`、角色 persona、规则化 affect、本地知识检索 RAG 和可选 n8n workflow 工具调用。n8n 不作为主对话编排器。

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

`systemPrompt` 保留为兼容字段，但后端只把它解释为低优先级的“补充回复偏好”，适合表达语言、长度、格式和语气偏好。它不是可信的 system 权限，不能重新定义后端 Persona 核心身份、角色关系、安全边界或真实能力；发生冲突时以后端规则与 Persona 为准。Web 不在前端复制 Persona Prompt。

真实 LLM messages 的内部结构为：一个由后端规则、Persona、低优先级偏好、长期记忆和可选背景资料组成的 `system` message；随后是保持原始 `user` / `assistant` role 和顺序的最近短期上下文；当前用户输入始终是最后一个且只出现一次的 `user` message。历史用户文本不会被拼入 system message。该内部调整不改变 `/api/dialogue` 请求字段或 `dialogue.v1` 响应字段。

`model` 可以省略。LLM 模型解析遵循统一规则：

1. 请求显式提供非空 `model` 时，保留客户端指定值。
2. 未提供或传入空 `model` 时，使用 `providerDefaultModels[provider]`。
3. `deepseek` 默认读取后端 `DEEPSEEK_MODEL`，未配置时为 `deepseek-v4-flash`。
4. `qwen` 使用自己的 `qwen-plus` 默认值；`custom` 没有默认模型时返回安全配置错误。DeepSeek、Qwen、custom 都不会回退到 `gpt-4o-mini`。

真实调用成功后，`meta.provider` 和 `meta.model` 来自 `LLMService` 的最终 resolved request，必须与本次实际发送到上游的 provider / model 一致。`GET /api/providers` 的 `defaultModel` 使用同一份 `providerDefaultModels` 配置。

回复生成上限由后端环境变量 `LLM_MAX_TOKENS` 控制，默认 `320`；该配置不会增加或改变 `/api/dialogue` 请求字段。`temperature` 当前仍使用后端内部默认值 `0.8`。

`LLMService.chatDetailed()` 会在内部诊断结果中保留规范化的 `finish_reason`、是否因 `length` 截断，以及上游提供的 prompt / completion / total token usage。诊断结果不包含原始 Prompt、用户正文、Authorization、API Key、provider URL 或原始上游响应。

普通公开响应默认不暴露这些诊断。仅在非 production 环境显式设置后端 `DIALOGUE_DEBUG_LLM_DIAGNOSTICS=true` 时，兼容层 `meta.llmDiagnostics` 才会出现，并且只包含 `finishReason`、`truncated`、`promptTokens`、`completionTokens`、`totalTokens` 五个规范化字段；未知的原始 finish reason 收敛为 `unknown`。production 会强制关闭该能力。它没有对应的客户端请求字段，不改变 `dialogue.v1`，也不能作为日志或第二套可观测系统使用。

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
      "model": "gpt-4o-mini",
      "trace": {
        "requestId": "93be8640-163f-425d-896d-70c4bbb5c27a",
        "orchestrationMs": 1180,
        "llmMs": 1025
      }
    }
  }
}
```

如果 `options.useMemory=true`，当前会启用 SQLite-backed Memory，并按 `(sessionId, avatarId)` 记录最近 N 轮 user/assistant 消息。短期上下文的读取、裁剪和清理都使用这一组合范围：同一 session 下的不同角色不会读取或删除彼此消息，不同 session 下的同一角色也保持隔离。

用户显式表达“记住这个 / 以后你要记得 / 我喜欢 / 我的目标是”等稳定信息时，会保守写入 `memory_items`，并通过 `memory.longTerm` 与 `memory.longTermWrite` 返回轻量状态。稳定偏好会保留完整谓词和极性，例如“我喜欢”“我不喜欢”“我讨厌”“我不想”不会只保存后面的对象文本。普通闲聊不会自动进入长期记忆；同时包含记忆召回语义与问句线索的“还记得……吗 / 让我记住了什么”等查询只用于召回，不会新增 `memory_items`。

API Key、密码、token、secret、银行卡、身份证等敏感原文可以参与当前轮回复，但不会进入 `messages` 或 `memory_items`。当用户输入被识别为敏感时，同轮 assistant 回复也不持久化，避免模型复述原文后落入 SQLite；Repository 还有直接写入防线。日志和可选上下文错误正文使用同一敏感检测进行脱敏。该策略不改变本轮正常回复、`dialogue.v1`、TTS pending 或 AvatarDirective 语义。

如果 `options.useRag=true`，当前会调用后端本地 `RagService`，读取 `data/knowledge/` 并返回 `rag.passages` 与顶层 `sources`。当前不调用 Qdrant、不做 embedding、不访问外部网络。

如果 `options.useWorkflow=true`，当前会通过后端 `N8nWorkflowService` 检查 `N8N_WEBHOOK_URL`。未配置时返回 `workflow.status=not_configured`，不会让 `/api/dialogue` 失败；配置后由后端调用 n8n webhook，并将安全包装后的结果放入 `workflow.result`。

`meta.persona` 只返回角色 ID、persona ID、tone、voice style、motion style 和 memory strategy 等非敏感摘要。`affect` 只代表当前轮情绪 / 语气 / 语音 / 动作提示，不默认写入长期记忆。

`meta.trace` 是 Web 兼容层的安全可观测字段，不改变 `dialogue.v1`：

- `requestId` 与 HTTP 响应头 `X-Request-ID` 一致。
- `orchestrationMs` 是本次后端 Dialogue 编排耗时。
- `llmMs` 是真实 LLM 调用耗时；真实调用失败后降级时仍保留失败调用耗时，显式 `stub` 请求为 `null`。
- 后端专项日志使用同一 requestId，并只记录 provider、model、mode、fallbackReason、errorCode 和耗时；不会记录 Prompt、用户正文、Key、provider URL 或原始上游响应。
- Web Debug 面板将 `llm_fallback_stub` 显示为“请求 provider/model → stub”，避免把 `meta.provider` 误解为最终回复来源。
- HTTP 错误时，Web 从响应头读取 requestId；超时或网络断开没有响应头时 requestId 为空。

`reply_text / companion_state / emotion / tone / avatar_directive / memory_event / tts / contract` 是跨端消费字段，不允许包含 `animationFile`、`fbxPath`、`riveInput`、`vrmExpressionPreset`、`boneName` 或硬编码动画路径。Renderer 只能把 `avatar_directive` 映射到本地表现层。

#### LLM fallback（`/api/dialogue` 专用）

`DIALOGUE_FALLBACK_TO_STUB=true` 是默认值。用户选择 `openai`、`qwen`、`deepseek` 或 `custom` 时，如果后端发现缺少必需配置、上游超时/非成功响应、响应 JSON 或结构非法、或模型 content 为空，`/api/dialogue` 会继续返回完整 `dialogue.v1`，并改用现有本地 stub 文案。

- 用户显式选择 `stub`（以及兼容的 `local` / `boundary`）时，仍保持原有 `meta.mode="llm_stub"` 行为，不经过 fallback 判断。
- 真实 provider 正常成功时，`meta.mode="llm_only"`。
- 降级成功时，`meta.mode="llm_fallback_stub"`，`meta.fallback` 只返回安全的 `{ "applied": true, "reason": "..." }`。`reason` 仅可能为 `not_configured`、`timeout`、`upstream_error`、`invalid_response` 或 `empty_response`；不会包含 API Key、base URL 或上游正文。
- `meta.provider` / `meta.model` 保留用户请求的真实 provider / model，便于前端展示与调试；它们不表示最终回复来自真实模型。
- 将 `DIALOGUE_FALLBACK_TO_STUB=false` 后，接口会返回安全错误码，例如 `LLM_NOT_CONFIGURED`、`LLM_UPSTREAM_TIMEOUT`、`LLM_UPSTREAM_ERROR`、`LLM_INVALID_RESPONSE` 或 `LLM_EMPTY_RESPONSE`。
- `POST /api/chat` 是旧兼容入口，不启用此 fallback，仍直接复用 `LLMService` 的成功或安全错误结果。

`custom` 是通用 OpenAI-compatible adapter，不是 Ollama adapter。默认 `CUSTOM_API_KEY_OPTIONAL=false`，因此仍需 `CUSTOM_API_KEY`。仅在后端明确受控且端点不需要认证时，才可设置 `CUSTOM_API_KEY_OPTIONAL=true`，此时 `CUSTOM_BASE_URL` 可指向兼容 `/v1` 的服务，例如本机 Ollama 的 `http://localhost:11434/v1`；前端不接触该 URL 或任何 Key。

DeepSeek 当前 Web 默认模型为 `deepseek-v4-flash`，同时允许用户显式选择 `deepseek-v4-pro`。切换到 DeepSeek provider 时，Web 使用 `/api/providers` 返回的 `defaultModel` 替换不兼容的其他 provider 模型；用户已经显式选择 `deepseek-v4-pro` 时不会被默认值覆盖。

### GET /api/memory / DELETE /api/memory

`GET /api/memory` 返回当前 session / avatar 的精简长期记忆摘要，不返回完整原始 messages。

`DELETE /api/memory` 支持 `scope=context`、`scope=session` 或 `scope=avatar`。`scope=context` 只清除当前 `(sessionId, avatarId)` 的短期 messages，用于“清空上下文”，不会删除显式保存的长期 `memory_items`；`scope=session` 清理当前 session + avatar 的长期记忆和短期上下文，不会清理同 session 的其他角色；`scope=avatar` 用于清除当前角色的长期记忆摘要。该接口属于敏感 API；`REQUIRE_API_AUTH=true` 或 production 模式下必须提供 API token。

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

当 `DIALOGUE_FALLBACK_TO_STUB=false` 且缺少真实 provider API Key 时：

```json
{
  "ok": false,
  "error": {
    "code": "LLM_NOT_CONFIGURED",
    "message": "Missing API key..."
  }
}
```

`LLM_UPSTREAM_ERROR` 等 LLM 错误的 message 是固定安全文案；后端不会把上游响应正文、API Key 或 provider base URL 回传或写入结构化错误日志。

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
    "upstreamStreaming": false,
    "contentType": "audio/wav",
    "metadata": {
      "provider": "mock",
      "model": "mock-silence",
      "voice": "mock-silence",
      "supportsStreaming": false,
      "supportsVoiceClone": false,
      "supportsEmotion": true,
      "sampleRate": 16000,
      "latency": {
        "synthesisMs": 0,
        "upstreamFirstChunkMs": null,
        "fullGenerationMs": 0,
        "audioResultReadyMs": 0
      },
      "timings": {
        "upstreamFirstChunkMs": 0,
        "upstreamReadMs": 0,
        "upstreamChunkCount": 1,
        "upstreamChunkBytes": [48000],
        "upstreamChunkIntervalsMs": [],
        "upstreamTrueStreamingEvidence": false,
        "wavWrapMs": 0,
        "base64Ms": 0
      }
    }
  }
}
```

`streaming` 表示客户端是否能按当前响应边收边播。若后端返回 `audioBase64`，即使上游 provider 使用 HTTP streaming，客户端也应看到 `streaming=false`。`upstreamStreaming=true` 仅表示后端 adapter 从上游收到的是流式响应，例如 CosyVoice 官方 FastAPI raw PCM。

`metadata` 在所有已注册 provider 的成功/不可用/失败结果上统一包含实际 `provider / model / voice / supportsStreaming / supportsVoiceClone / supportsEmotion / sampleRate / latency`。`latency` 至少区分 adapter 总合成、上游首 chunk、完整生成和 Audio Result ready；失败时没有意义的字段为 `null`。

`metadata.timings` 是可选诊断字段，只能包含非敏感耗时和字节数。CosyVoice2 当前会记录上游首个 PCM chunk、raw PCM 总读取、chunk 数量/字节、WAV 包装和 Base64 编码耗时；远程二进制 provider 会记录 headers、首 chunk、完整读取、chunk evidence、音频字节和 Base64 耗时。Qwen3-TTS 还记录生成响应返回临时音频 URL 的耗时，但不返回该 URL。Web 端分段播放会把 metadata 合并到 `TTSService.getLastMetrics()`，用于定位首音延迟和每段 provider timing。`upstreamTrueStreamingEvidence=true` 才表示后端在完整音频完成前观测到有效的多 chunk 间隔；不能仅凭 capability 或 HTTP `StreamingResponse` 判定为当前客户端可消费流式。

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
- `qwen3_tts`：使用 Alibaba Cloud Model Studio / DashScope 官方原生 multimodal-generation HTTP API；非流式签名 URL 由后端下载为 Base64，不下发客户端。
- `fish_audio`：使用 Fish Audio 官方原生 `/v1/tts`，在 adapter 内生成 `model` header 与 `reference_id` voice。

当前 Web Settings 与公开 `/api/providers` TTS readiness 只暴露 `mock` / `cosyvoice` / `qwen3_tts` / `fish_audio`。Higgs / OpenAI / MiniMax 历史实验 provider 不进入当前前端切换面板，也不作为公开状态返回。

合约要求：

- 前端和 iOS 不接触 TTS service URL、模型部署地址或 API Key。
- 客户端传入的远程 model / voice 不能覆盖后端配置；前端只选择公开 provider id。
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
        "label": "Mock",
        "configured": true,
        "available": true,
        "mode": "demo",
        "requiresKey": false,
        "status": "ready",
        "defaultModel": "mock-silence",
        "defaultVoice": "mock-silence",
        "sampleRate": 16000,
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
        },
        "metadata": {
          "provider": "mock",
          "model": "mock-silence",
          "voice": "mock-silence",
          "supportsStreaming": false,
          "supportsVoiceClone": false,
          "supportsEmotion": true,
          "sampleRate": 16000,
          "latency": null
        }
      },
      {
        "provider": "cosyvoice",
        "label": "CosyVoice2 Local",
        "configured": false,
        "available": false,
        "mode": "local",
        "requiresKey": false,
        "status": "local_service_not_running",
        "defaultModel": "iic/CosyVoice2-0.5B",
        "defaultVoice": "中文女",
        "sampleRate": 24000,
        "health": {
          "healthy": false,
          "status": "local_service_not_running",
          "live": false,
          "reason": "missing_base_url"
        },
        "capabilities": {
          "supportsStreaming": true,
          "supportsVoiceClone": false,
          "supportsEmotion": true
        }
      },
      {
        "provider": "qwen3_tts",
        "label": "Qwen3-TTS Remote",
        "configured": false,
        "available": false,
        "mode": "remote",
        "requiresKey": true,
        "status": "missing_base_url_and_key_and_model_and_voice",
        "defaultModel": null,
        "defaultVoice": null,
        "sampleRate": 24000,
        "health": {
          "healthy": false,
          "status": "missing_base_url_and_key_and_model_and_voice",
          "live": false,
          "reason": "missing_base_url_and_key_and_model_and_voice"
        },
        "capabilities": {
          "supportsStreaming": true,
          "supportsVoiceClone": false,
          "supportsEmotion": false
        },
        "metadata": {
          "provider": "qwen3_tts",
          "model": null,
          "voice": null,
          "supportsStreaming": true,
          "supportsVoiceClone": false,
          "supportsEmotion": false,
          "sampleRate": 24000,
          "latency": null
        }
      },
      {
        "provider": "fish_audio",
        "label": "Fish Audio Remote",
        "configured": false,
        "available": false,
        "mode": "remote",
        "requiresKey": true,
        "status": "missing_base_url_and_key_and_model_and_voice",
        "defaultModel": null,
        "defaultVoice": null,
        "sampleRate": 44100,
        "health": {
          "healthy": false,
          "status": "missing_base_url_and_key_and_model_and_voice",
          "live": false,
          "reason": "missing_base_url_and_key_and_model_and_voice"
        },
        "capabilities": {
          "supportsStreaming": true,
          "supportsVoiceClone": true,
          "supportsEmotion": false
        },
        "metadata": {
          "provider": "fish_audio",
          "model": null,
          "voice": null,
          "supportsStreaming": true,
          "supportsVoiceClone": true,
          "supportsEmotion": false,
          "sampleRate": 44100,
          "latency": null
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
- 远程 provider 的 `available=true` 只表示配置足够发起请求，不代表已经执行计费 live probe；真实可用性以显式 live check 为准。

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
