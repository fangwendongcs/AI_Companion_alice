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

本地 TTS provider 默认是 `mock`，不需要外部服务。当前 Web Settings 只展示 `Mock` 与 `CosyVoice2`；要测试真实本地语音，先启动 CosyVoice2 runtime，再用 `COSYVOICE_BASE_URL=http://localhost:50000 npm run dev` 启动 Alice。

Provider 配置状态可通过 `GET /api/providers` 查看。该接口只返回安全状态，例如 provider 是否 configured、是否可用、默认 model/voice 和 demo/real/local mode，不返回任何真实 Key、service URL 或 secret。TTS readiness 当前只公开 `mock` / `cosyvoice`，避免把未进入当前 Web Settings 的实验 provider 暴露给前端。

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
- `COSYVOICE_API_KEY`：可选 CosyVoice2 服务鉴权 Key
- `HIGGS_API_KEY`：可选 Higgs Audio v3 服务鉴权 Key
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
- `TTS_PROVIDER`：后端默认 TTS provider，当前 Web Settings 支持 `mock` / `cosyvoice`，默认 `mock`
- `TTS_OUTPUT_FORMAT`：后端 TTS 输出格式，默认 `mp3`
- `COSYVOICE_BASE_URL`：CosyVoice2 兼容服务地址，未配置时 provider 报 `missing_base_url`
- `COSYVOICE_API_STYLE`：`official_fastapi` 或 `openai_compatible`，默认 `official_fastapi`
- `COSYVOICE_API_MODE`：官方 FastAPI mode，默认 `sft`
- `COSYVOICE_SPEECH_PATH`：可选覆盖 path；官方 mode 默认自动映射到 `/inference_${COSYVOICE_API_MODE}`
- `COSYVOICE_MODEL`：CosyVoice2 后端模型名，默认 `iic/CosyVoice2-0.5B`
- `COSYVOICE_VOICE_ID`：CosyVoice2 默认 voiceId/spk_id，默认 `中文女`
- `COSYVOICE_SAMPLE_RATE`：官方 FastAPI raw PCM 采样率，默认 `24000`
- `COSYVOICE_PROMPT_TEXT` / `COSYVOICE_PROMPT_WAV` / `COSYVOICE_INSTRUCT_TEXT`：zero-shot / instruct2 等模式需要
- `HIGGS_BASE_URL`：Higgs Audio v3 兼容服务地址，未配置时 provider 报 `missing_base_url`
- `HIGGS_SPEECH_PATH`：Higgs speech endpoint，默认 `/v1/audio/speech`
- `HIGGS_MODEL`：Higgs 后端模型名，默认 `higgs-audio-v3`
- `HIGGS_VOICE_ID`：Higgs 默认 voiceId，默认 `alice`
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

## TTS Provider 架构

`POST /api/tts` 已收口到后端 `TTSOrchestrator -> TTSProviderRegistry -> provider adapter`。Web 和后续 iOS 只调用 Alice 后端，不直接知道 CosyVoice2 runtime 地址、模型路径、端口、内部请求参数或密钥。

当前 Web Settings provider：

- `mock`：默认演示 provider，返回本地静音 WAV，用于无 Key / 无外部服务的链路验证。
- `cosyvoice`：CosyVoice2 开源主线 adapter，默认按官方 FastAPI `/inference_sft` 契约调用服务；如明确部署了 OpenAI-compatible proxy，可设置 `COSYVOICE_API_STYLE=openai_compatible`。

旧实验 adapter 不会出现在当前 Web Settings 或公开 TTS readiness 中；后续要启用新 provider，需要单独做 provider contract、Settings 状态和 smoke 验收。

默认 provider：

```bash
TTS_PROVIDER=mock
TTS_OUTPUT_FORMAT=mp3
```

CosyVoice2：

```bash
COSYVOICE_BASE_URL=http://localhost:50000
COSYVOICE_API_STYLE=official_fastapi
COSYVOICE_API_MODE=sft
COSYVOICE_SPEECH_PATH=
COSYVOICE_MODEL=iic/CosyVoice2-0.5B
COSYVOICE_VOICE_ID=中文女
COSYVOICE_SAMPLE_RATE=24000
COSYVOICE_API_KEY=replace_with_optional_key
```

真实 provider 可用性可以用可选命令验证：

```bash
npm run check:tts-live
# or
npm run check:cosyvoice-live
```

没有配置 `COSYVOICE_BASE_URL` 时该命令会跳过，不影响默认 `npm run check`。命令只输出 provider、格式和音频长度，不打印 API Key、服务地址密钥或完整音频内容。

CosyVoice2 官方 runtime 的复现流程：

```bash
npm run cosyvoice:init-speaker
npm run check:cosyvoice-runtime
npm run cosyvoice:start
COSYVOICE_BASE_URL=http://127.0.0.1:50000 npm run check:cosyvoice-live
npm run cosyvoice:stop
```

完整回归可使用：

```bash
npm run cosyvoice:verify
```

CosyVoice 官方 FastAPI 的上游响应是 raw PCM 流，但 Alice 后端会先完整接收并包装为 WAV/Base64，再返回客户端；因此客户端 Audio Result 的 `streaming=false`。如果结果中出现 `upstreamStreaming=true`，只表示上游 HTTP 响应是流式来源，不表示 Web/iOS 可以边收边播。

`/api/tts` 支持统一 JSON Audio Result：

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
    "upstreamStreaming": false
  }
}
```

如果 provider 未配置、超时或上游异常，接口返回稳定 `tts_status=unavailable/failed`，前端仍会按现有 audio fallback 走浏览器本机语音，不影响 `/api/dialogue` 文本回复。

`GET /api/providers` 会返回 TTS provider 的安全 readiness：

- `configured` / `status`：说明后端配置是否足够，不返回环境变量值。
- `health`：轻量健康摘要；Mock 始终 ready，CosyVoice2 在配置 `COSYVOICE_BASE_URL` 后会做短超时 live probe，服务未启动时返回 `local_service_not_running`。
- `capabilities`：声明 `supportsStreaming`、`supportsVoiceClone`、`supportsEmotion` 等能力。

真实 CosyVoice2 连通性请用 `COSYVOICE_BASE_URL=http://127.0.0.1:50000 npm run check:cosyvoice-live` 验证。

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
