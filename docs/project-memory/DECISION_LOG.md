# Decision Log

最后更新：2026-07-10

本文件只记录会影响后续开发方向的关键决策。小修复、局部命名、纯样式调整不需要写入。

| 记录日期 | 决策 | 原因 | 影响范围 | 权威来源 |
| --- | --- | --- | --- | --- |
| 2026-07-03 | `/api/dialogue` 是主对话入口，`/api/chat` 只保留旧兼容。 | 避免 Web、Backend、Agent 测试各自形成不同对话链路。 | Web、Backend、测试脚本 | `docs/api/API_CONTRACT.md`、`backend/routes/dialogueRoutes.js` |
| 2026-07-03 | Web 表现层优先消费 `dialogue.v1` 语义字段。 | 保持 Dialogue / Memory / Persona / Emotion 独立于 renderer。 | Web、Backend、VRMRenderer、未来表现层 | `docs/contracts/DIALOGUE_CONTRACT.md`、`backend/contracts/dialogueContract.js` |
| 2026-07-03 | 后端业务层不得返回 renderer-specific 字段。 | 防止业务逻辑绑定 FBX、VRM、Rive、骨骼或模型路径。 | Backend、Avatar presentation | `docs/contracts/DIALOGUE_CONTRACT.md` |
| 2026-07-03 | TTS 公开主线为 `mock` + `cosyvoice`，其他 provider 留在后端实验层。 | 本地开发需要稳定 fallback，真实本地语音主线集中到 CosyVoice2。 | Web Settings、`/api/providers`、`/api/tts` | `docs/guides/LOCAL_TTS.md`、`backend/routes/ttsRoutes.js` |
| 2026-07-03 | CosyVoice2 默认对接官方 FastAPI runtime，不默认假设 OpenAI-compatible proxy。 | 官方契约是 `/inference_sft` 等 endpoint，默认端口 `50000`。 | TTS adapter、运行脚本、环境配置 | `docs/guides/COSYVOICE_RUNTIME.md` |
| 2026-07-03 | Memory 采用保守长期记忆策略：只保存显式、非敏感、稳定信息。 | 陪伴连续性要可控、可解释、可清除，不能自动囤积隐私。 | Backend Memory、PromptBuilder、Web Memory UI | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md`、`backend/services/MemoryService.js` |
| 2026-07-03 | Avatar 表现层通过 renderer adapter 消费 `AvatarDirective`。 | 让 Default / VRM / 未来 Web 表现层共享语义契约。 | `js/avatar/renderers/*`、`js/avatar/presentation/*` | `docs/architecture/VRM_RENDERER_MVP.md`、`docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 2026-07-03 | `assets/avatars/test-vrm/` 和 `assets/motions/` 默认是本地 QA / debug 资源，不自动产品化。 | 测试资产可能缺授权、体积/质量/retarget 未过关。 | VRM QA、资产管理、registry | `docs/architecture/VRM_RENDERER_MVP.md`、`docs/architecture/VRM_MOTION_READINESS.md` |
| 2026-07-10 | `/api/dialogue` 默认在真实 LLM 可恢复失败时降级到现有 stub，并以 `meta.mode=llm_fallback_stub` 标识。 | 无真实 Key 的本地 MVP、短暂上游故障和异常回复都应保留完整 `dialogue.v1` 与 Web 体验；显式 stub 保持原语义。 | `DialogueOrchestrationService`、Web dialogue、自动检查、API 契约 | `backend/services/DialogueOrchestrationService.js`、`docs/api/API_CONTRACT.md` |
| 2026-07-10 | 不实现专用 Ollama adapter；`custom` 保持通用 OpenAI-compatible 路径，并以 `CUSTOM_API_KEY_OPTIONAL=false` 默认要求 Key。 | 避免扩展 provider 适配面；仅允许后端显式开启无 Key 端点，客户端不保存 URL 或 Key。 | `LLMService`、`ProviderStatusService`、环境配置、文档 | `backend/services/LLMService.js`、`.env.example`、`docs/api/API_CONTRACT.md` |
| 2026-07-10 | LLM model 统一按“显式请求值优先，否则 provider default”解析；DeepSeek 默认读取 `DEEPSEEK_MODEL`，默认值为 `deepseek-v4-flash`。 | 保证真实上游请求、`/api/providers.defaultModel` 与 dialogue `meta.model` 一致，并阻止 DeepSeek / Qwen / custom 缺 model 时误用 OpenAI 默认模型。 | `serverConfig`、`LLMService`、Dialogue、Provider readiness、Web Settings | `backend/config/serverConfig.js`、`backend/services/LLMService.js`、`backend/services/DialogueOrchestrationService.js`、`docs/api/API_CONTRACT.md` |
| 2026-07-10 | 表现编排器通过 `CharacterManager` 动态解析当前 renderer-owned expression / lip-sync controller；renderer 只在直接调用时自行执行表现，编排路径避免重复执行。 | 修复默认 noop 接线和 `audioSource` 丢失，同时保证角色切换后不会持有旧 renderer 控制器。 | `PresentationOrchestrator`、`CharacterManager`、`VRMRenderer`、lip-sync debug | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md`、`docs/architecture/VRM_RENDERER_MVP.md` |
| 2026-07-10 | TTS 播放采用 session epoch 隔离陈旧回调，真实 `audio:start` 取消文本时长 watchdog。 | 长 CosyVoice2 音频或连续发言时，旧播放不能延迟触发 end，也不能被文本估算 timer 提前切回 idle。 | `TTSService`、`AudioManager`、`AppController`、VRM 表现生命周期 | `js/voice/TTSService.js`、`js/app/AppController.js`、`docs/guides/LOCAL_TTS.md` |
| 2026-07-10 | `/api/dialogue` 的 Prompt 权限由后端规则与 Persona 主导；兼容字段 `systemPrompt` 只作为低优先级回复偏好，短期上下文保持原始 role，并采用章节/历史字符预算。 | 防止 Web 固定 Alice 身份污染其他 Persona、历史用户指令被提升为 system，以及整体裁剪优先丢失最新上下文。 | `PromptBuilder`、`DialogueOrchestrationService`、`LLMService`、Web LLM Settings、零费用质量检查 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`backend/services/PromptBuilder.js`、`scripts/check-dialogue-quality-logic.mjs` |

## 新增决策模板

```text
| YYYY-MM-DD | 决策内容 | 为什么这样做 | 影响哪些模块 | 链接到代码/文档 |
```
