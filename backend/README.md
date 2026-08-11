# Backend

当前后端提供本地开发静态服务和模型代理接口，避免在浏览器中保存 API Key。

## 启动

```bash
npm run dev
```

仓库不使用 `dotenv`；`npm run dev` 通过 Node 原生 `--env-file-if-exists=.env` 加载根目录本地配置。存在 `.env` 时自动加载，不存在时继续以默认 `stub` LLM / `cosyvoice` TTS 启动；CosyVoice2 runtime 未运行时 Web 使用系统语音兜底。`.env` 必须保持 Git ignore 且禁止提交，完整说明见 [`docs/guides/DEVELOPMENT_GUIDE.md`](../docs/guides/DEVELOPMENT_GUIDE.md#环境变量注入)。

默认前端 LLM provider 为 `stub`，本地演示不需要 API Key。真实 provider 仍通过后端环境变量配置，例如：

```bash
OPENAI_API_KEY=replace_with_your_key MINIMAX_API_KEY=replace_with_your_key npm run dev
```

本地 TTS provider 默认是 `cosyvoice`，不需要厂商云 Key，但需要 Alice 机器上的 CosyVoice2 runtime。Web Settings 展示产品化的`默认语音`、`云端语音`和`自建语音服务`；remote / selfHosted 必须 Test → Save → Switch。`mock` 只保留为隐藏测试 provider。

Provider 配置状态可通过 `GET /api/providers` 查看。该接口只返回安全状态、descriptor、默认 model/voice、`local/remote/selfHosted` 类型和 capability metadata，不返回任何真实 Key、service URL 或 secret。TTS readiness 公开 `mock` / `cosyvoice` / `qwen3_tts` / `fish_audio` / `self_hosted`，其中 Mock `selectable=false`；Higgs / OpenAI / MiniMax 历史实验 adapter 仍不暴露。

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
- `DIALOGUE_FALLBACK_TO_STUB`：真实 LLM 在 `/api/dialogue` 中失败时是否降级到完整 stub 回复，默认 `true`；不影响旧 `/api/chat`
- `OPENAI_API_KEY`：OpenAI Chat/TTS
- `MINIMAX_API_KEY`：MiniMax TTS
- `QWEN3_TTS_API_KEY` / `DASHSCOPE_API_KEY`：Qwen3-TTS DashScope Key，只在后端读取；同 region 的现有 `QWEN_API_KEY` 可作为最后 fallback，placeholder 会被拒绝
- `FISH_AUDIO_API_KEY`：Fish Audio Key，只在后端读取
- `COSYVOICE_API_KEY`：可选 CosyVoice2 服务鉴权 Key
- `HIGGS_API_KEY`：可选 Higgs Audio v3 服务鉴权 Key
- `QWEN_API_KEY`：通义千问 OpenAI-compatible 接口
- `DEEPSEEK_API_KEY`：DeepSeek OpenAI-compatible 接口
- `DEEPSEEK_MODEL`：DeepSeek 默认模型，默认 `deepseek-v4-flash`；请求显式传入 model 时仍以请求值为准
- `CUSTOM_API_KEY`：自定义 OpenAI-compatible 接口
- `CUSTOM_API_KEY_OPTIONAL`：是否允许 `custom` 在无 Key 时调用，默认 `false`；只对受控无鉴权端点开启
- `LLM_API_KEY`：通用兜底 Key
- `OPENAI_BASE_URL`：OpenAI 兼容代理地址
- `MINIMAX_BASE_URL`：MiniMax TTS 代理地址，未配置时使用 `https://api.minimax.io/v1`
- `QWEN_BASE_URL`：通义千问兼容接口地址，未配置时使用默认值
- `DEEPSEEK_BASE_URL`：DeepSeek 兼容接口地址，未配置时使用默认值
- `CUSTOM_BASE_URL`：自定义 OpenAI-compatible 接口地址
- `OPENAI_TTS_MODEL`：OpenAI TTS 模型，默认 `gpt-4o-mini-tts`
- `MINIMAX_TTS_MODEL`：MiniMax TTS 模型，默认 `speech-2.8-hd`
- `TTS_PROVIDER`：后端默认 TTS provider，默认 `cosyvoice`；只有可选择的 local descriptor 可成为产品默认，remote / 隐藏 Mock 会收敛回 CosyVoice2
- `TTS_LOCAL_FALLBACK_PROVIDER`：remote / selfHosted 失败后的本地 fallback provider，默认 `cosyvoice`
- `TTS_CONFIG_STORE_DIR`：后端加密 TTS 配置目录，默认 Git ignore 的 `runtime/tts/provider-config`
- `TTS_CONFIG_ENCRYPTION_KEY`：生产建议由 Secret Manager 注入的配置加密密钥；本地缺省时生成权限 `0600` 的机器 key 文件
- `TTS_OUTPUT_FORMAT`：后端 TTS 输出格式，默认 `mp3`
- `QWEN3_TTS_BASE_URL` / `QWEN3_TTS_PATH`：DashScope region base URL 与原生生成 path
- `QWEN3_TTS_MODEL` / `QWEN3_TTS_VOICE`：后端固定 Qwen3 model / voice；客户端不能覆盖
- `QWEN3_TTS_LANGUAGE_TYPE` / `QWEN3_TTS_OUTPUT_FORMAT` / `QWEN3_TTS_SAMPLE_RATE`：Qwen3 语言与完整音频 metadata
- `FISH_AUDIO_TTS_BASE_URL` / `FISH_AUDIO_TTS_PATH`：Fish Audio 原生 TTS endpoint
- `FISH_AUDIO_TTS_MODEL` / `FISH_AUDIO_TTS_VOICE`：原生 `model` header 与 `reference_id`
- `FISH_AUDIO_TTS_OUTPUT_FORMAT` / `FISH_AUDIO_TTS_SAMPLE_RATE` / `FISH_AUDIO_TTS_LATENCY`：Fish 完整音频与延迟档位
- `SELF_HOSTED_TTS_BASE_URL` / `SELF_HOSTED_TTS_PATH`：自建 OpenAI-compatible TTS 服务与 speech path
- `SELF_HOSTED_TTS_MODEL` / `SELF_HOSTED_TTS_VOICE`：自建服务暴露的 model / voice
- `SELF_HOSTED_TTS_API_KEY`：自建服务可选鉴权 Key
- `SELF_HOSTED_TTS_OUTPUT_FORMAT` / `SELF_HOSTED_TTS_SAMPLE_RATE`：自建服务音频格式和采样率 metadata
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
- `UPSTREAM_TIMEOUT_MS`：后端访问 LLM 等通用上游的超时时间，默认 `45000`
- `LLM_MAX_TOKENS`：OpenAI-compatible LLM 单次回复 token 上限，默认 `320`；只在后端环境配置，不增加 `/api/dialogue` 请求字段
- `DIALOGUE_DEBUG_LLM_DIAGNOSTICS`：默认 `false`；仅非 production 的受控 Debug/评测可在兼容 `meta.llmDiagnostics` 查看 finish reason、截断标记和 token usage，production 强制关闭
- `TTS_UPSTREAM_TIMEOUT_MS`：后端访问 TTS 上游的独立超时时间，默认 `90000`；用于 CosyVoice2 长语音等生成耗时可能高于 45 秒的本地场景
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
- `GET /api/tts/providers/:id/config`：读取 remote / selfHosted 安全配置状态，不返回 secret 明文
- `POST /api/tts/providers/:id/test`：用未保存配置测试目标 adapter，不启用本地 fallback
- `PUT /api/tts/providers/:id/config`：加密保存配置并刷新 Registry
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
- `GET /api/tts/providers/:id/config`
- `POST /api/tts/providers/:id/test`
- `PUT /api/tts/providers/:id/config`
- `POST /api/avatars`

`GET /api/health`、`GET /api/providers` 和静态资源仍可公开读取；TTS 配置 GET 由于会暴露配置状态和非敏感值，也属于受保护接口。

## TTS Provider 架构

`POST /api/tts` 已收口到后端 `TTSOrchestrator -> TTSProviderRegistry -> provider adapter`。Web 和后续 iOS 只调用 Alice 后端，不直接知道本地或远程 TTS 的地址、模型、voice、端口、内部请求参数或密钥。所有 adapter 都返回同一个 Audio Result，再进入既有 `TTSService -> AudioManager -> LipSync / Presentation`。

当前 Web Settings provider：

- `cosyvoice`：`默认语音`，CosyVoice2 开源本地主线 adapter，默认按官方 FastAPI `/inference_sft` 契约调用服务。
- `qwen3_tts`：调用 Alibaba Cloud Model Studio / DashScope 官方原生接口；签名音频 URL 由后端下载并转成统一 Audio Result。
- `fish_audio`：调用 Fish Audio 官方原生 `/v1/tts`，使用 `model` header 与 `reference_id`；本轮仍返回完整音频。
- `self_hosted`：`自建语音服务`，通用 OpenAI-compatible adapter；要求 URL / model / voice，Key 可选。

`mock` 返回本地静音 WAV，只用于 smoke / contract，不在 Settings 中选择。旧实验 adapter 也不会出现在当前 Web Settings 或公开 TTS readiness 中。

remote / selfHosted 选择本身不会切换当前 provider。Settings 先调用目标 adapter Test；成功才允许 Save，加密保存后再 Switch。Key 不写入 localStorage，后端 GET 只返回 secret 是否已配置。后续要启用新 provider，主要新增 adapter + descriptor + contract/live 验收，不修改播放链路。

默认 provider：

```bash
TTS_PROVIDER=cosyvoice
TTS_LOCAL_FALLBACK_PROVIDER=cosyvoice
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

Qwen3-TTS：

```bash
QWEN3_TTS_API_KEY=replace_with_your_key
QWEN3_TTS_BASE_URL=https://dashscope-intl.aliyuncs.com/api/v1
QWEN3_TTS_PATH=/services/aigc/multimodal-generation/generation
QWEN3_TTS_MODEL=qwen3-tts-flash
QWEN3_TTS_VOICE=Cherry
QWEN3_TTS_LANGUAGE_TYPE=Chinese
QWEN3_TTS_OUTPUT_FORMAT=wav
QWEN3_TTS_SAMPLE_RATE=24000
```

Fish Audio：

```bash
FISH_AUDIO_API_KEY=replace_with_your_key
FISH_AUDIO_TTS_BASE_URL=https://api.fish.audio
FISH_AUDIO_TTS_PATH=/v1/tts
FISH_AUDIO_TTS_MODEL=s2.1-pro-free
FISH_AUDIO_TTS_VOICE=replace_with_voice_model_id
FISH_AUDIO_TTS_OUTPUT_FORMAT=mp3
FISH_AUDIO_TTS_SAMPLE_RATE=44100
FISH_AUDIO_TTS_LATENCY=balanced
```

真实 provider 可用性可以用可选命令验证：

```bash
npm run check:tts-live
npm run check:cosyvoice-live
npm run check:qwen3-tts-live
npm run check:fish-audio-live
npm run check:tts-compare-live
```

缺少指定 provider 的必需配置时，固定 provider 的 live 命令会失败并返回安全状态；不影响默认 `npm run check`。命令只输出 provider/model/voice、格式、采样率、音频长度和 latency，不打印 API Key、服务地址或完整音频内容。

`check:tts-compare-live` 严格要求本地 CosyVoice2、Qwen3-TTS 与 Fish Audio 同时 ready/configured，以同一中文文本各执行两轮并计算 p50 与各 remote 减 local 的差值。也可用 `check:tts-compare-qwen3-live` / `check:tts-compare-fish-live` 单独比较。若 `.env` 没有本地 runtime URL，可在命令前设置 `COSYVOICE_BASE_URL=http://127.0.0.1:50000`；`TTS_LIVE_JSON_OUT=runtime/tts/live-comparison.json` 可保存不含 URL、Key、请求正文和音频 Base64 的安全报告。

CosyVoice2 官方 runtime 的复现流程：

```bash
npm run cosyvoice:init-speaker
npm run check:cosyvoice-runtime
npm run cosyvoice:start
COSYVOICE_BASE_URL=http://127.0.0.1:50000 npm run check:cosyvoice-live
npm run cosyvoice:stop
```

`npm run cosyvoice:start` 会先检查模型、speaker 和采样率，然后等待 `/inference_sft` endpoint 可用，并用一次短语音合成完成预热。这样命令返回时服务已经 ready，不会把“后台进程仍存活”误判为可用，也不会让首个用户请求承担 endpoint 冷启动成本。

完整回归可使用：

```bash
npm run cosyvoice:verify
```

CosyVoice 官方 FastAPI 的上游响应是 raw PCM 流，但 Alice 后端会先完整接收并包装为 WAV/Base64，再返回客户端；因此客户端 Audio Result 的 `streaming=false`。如果结果中出现 `upstreamStreaming=true`，只表示上游 HTTP 响应是流式来源，不表示 Web/iOS 可以边收边播。是否真的在完整音频完成前收到有效多 chunk，需要查看 `metadata.timings.upstreamTrueStreamingEvidence`。

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

如果 remote / selfHosted 未配置、超时或上游异常，后端先尝试 `TTS_LOCAL_FALLBACK_PROVIDER`。本地成功时返回实际本地 Audio Result 并附 `metadata.fallback`；本地也失败时接口返回稳定 `tts_status=unavailable/failed`，前端再按既有 audio fallback 走浏览器本机语音，不影响 `/api/dialogue` 文本回复。

`GET /api/providers` 会返回 TTS provider 的安全 readiness：

- `configured` / `status`：说明后端配置是否足够，不返回环境变量值。
- `health`：轻量健康摘要；Mock 始终 ready，CosyVoice2 会做短超时 live probe；Qwen3-TTS / Fish Audio / self-hosted 只做非计费配置检查，真实可用性必须执行 Test 或 live check。
- `capabilities`：声明 `supportsStreaming`、`supportsVoiceClone`、`supportsEmotion` 等能力。
- `metadata`：统一返回安全的 provider/model/voice/capability/sampleRate；readiness 阶段 `latency=null`。

真实 CosyVoice2 连通性请用 `COSYVOICE_BASE_URL=http://127.0.0.1:50000 npm run check:cosyvoice-live` 验证。
真实 Qwen3-TTS / Fish Audio 连通性请在本地 `.env` 配置后分别用 `npm run check:qwen3-tts-live` / `npm run check:fish-audio-live` 验证；adapter 已接入不等于 live 已通过。

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
