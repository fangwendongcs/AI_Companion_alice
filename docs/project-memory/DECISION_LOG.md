# Decision Log

最后更新：2026-07-22

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
| 2026-07-14 | P1B Memory 确定性策略使用现有 `messages.avatar_id` 形成 `(session_id, avatar_id)` 短期范围；偏好保存完整极性；敏感用户轮次整轮不持久化，并由 Repository 做二次防线。 | 避免跨角色历史污染、否定偏好翻转，以及用户或 assistant 复述的 secret 落入 SQLite；保持现有 schema、`dialogue.v1` 和结构化 LLM messages 不变。 | `MemoryService`、`MemoryRepository`、Memory routes、日志脱敏、零费用检查 | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md`、`scripts/check-memory-flow.mjs` |
| 2026-07-14 | P1C 将 LLM 回复上限改为后端 `LLM_MAX_TOKENS` 配置，默认 `320`；`finish_reason` 与 token usage 仅保留为安全内部诊断，Prompt 增加克制表达和准确记忆确认规则。 | 首次 10 轮 DeepSeek 基线出现多次可见截断、舞台提示与记忆确认扩写，需要先收口回复完整性和可诊断性，同时保持公开契约稳定。 | `serverConfig`、`LLMService`、`PromptBuilder`、零费用质量检查 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`backend/services/LLMService.js`、`backend/services/PromptBuilder.js` |
| 2026-07-22 | P1D 保持 `LLM_MAX_TOKENS=320` 与 Persona/Memory 逻辑不变，在 Prompt 中克制波浪号并限定记忆确认措辞；非 production 可用默认关闭的 `DIALOGUE_DEBUG_LLM_DIAGNOSTICS` 读取五个白名单诊断字段。 | P1C 对照复测已消除截断，但仍需收口个性标点和过度记忆承诺，并让隔离评测在不扩大公开契约及敏感暴露面的前提下确认截断和 token usage。 | `PromptBuilder`、Dialogue 兼容 `meta`、后端环境配置、零费用质量检查 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`backend/services/DialogueOrchestrationService.js`、`docs/api/API_CONTRACT.md` |
| 2026-07-22 | CosyVoice2 首音优化先采用中文语义分段、同一 utterance session 和受控预取，不引入 WebSocket / AudioWorklet / PCM streaming。 | 官方 FastAPI 当前返回完整 raw PCM，Node 包装和浏览器解码只占毫秒级；主要瓶颈是本机 CosyVoice2 生成。分段能让长回复不再等待完整音频，同时保留现有取消、静音、fallback 和 lip-sync 生命周期。 | `TTSService`、`TTSTextSegmenter`、`AudioManager`、Presentation lifecycle、TTS 文档 | `docs/guides/LOCAL_TTS.md`、`js/voice/TTSService.js`、`js/voice/TTSTextSegmenter.js` |
| 2026-07-14 | 完整本地 Demo 使用 detached Node supervisor 统一托管 Alice 与 CosyVoice2，状态以进程所有权、endpoint、真实 DeepSeek 回复和有效 WAV 四层证据为准。 | 单独 `npm run dev` 与 `cosyvoice:start` 无法解决受控环境子进程存活、空 CosyVoice URL、幂等启停和真实 readiness；停服又必须避免按端口误杀未知进程。 | 本地 Demo 启停、PID/state/log、安全边界、真实 provider 验收 | `scripts/demo/demo-manager.mjs`、`docs/guides/DEMO_RUNTIME.md` |

## 新增决策模板

```text
| YYYY-MM-DD | 决策内容 | 为什么这样做 | 影响哪些模块 | 链接到代码/文档 |
```
