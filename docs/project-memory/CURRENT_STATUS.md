# Current Status

最后更新：2026-08-11

## 当前阶段

Alice 当前处在“工程闭环完整的本地可测试 MVP + 消费级产品价值验证前”阶段。Dialogue、Memory、DeepSeek、CosyVoice2 和 VRM 表现链路已有重复验收；下一主线不是扩功能，而是收敛单一测试入口并验证目标用户的 10 分钟体验与 7 天实际复访。

已经确认的主线：

- Web 端可运行本地 Avatar / Dialogue / Memory / TTS / Debug 体验。
- 后端是所有 LLM、Memory、RAG、n8n、TTS provider 和 secret 的边界。
- `/api/dialogue` 是主对话入口，并已提供 `dialogue.v1` 语义字段供 Web 表现层消费。
- LLM 已支持后端 OpenAI-compatible `openai` / `qwen` / `deepseek` / `custom`；真实 provider 失败时，`/api/dialogue` 默认安全降级到完整 `dialogue.v1` stub 回复。
- 本地 `npm run dev` 使用 Node 原生 `--env-file-if-exists=.env`：存在本地忽略配置时自动加载，不存在时仍可用 stub + 默认本地 CosyVoice2 启动；Cosy runtime 不可用时 Web 最终使用系统语音兜底。
- 完整本地 Demo 已提供 `demo:start/status/stop`：Node supervisor 统一托管 Alice 与 CosyVoice2，并以真实 DeepSeek 回复和有效 WAV 作为 ready 标准。
- 正式 Web Demo 会在 UI 初始化前读取 provider readiness；DeepSeek / CosyVoice2 ready 时每次加载都采用真实 provider 和后端默认 model，历史 localStorage 不再让正式入口静默回到 Stub / Mock。
- P1A 已收口 Prompt/Persona 基础正确性：后端控制不可覆盖规则和 Persona，Web `systemPrompt` 只作为低优先级回复偏好，短期历史保持原始 `user` / `assistant` role。
- P1B 已收口 Memory 确定性问题：偏好保留否定极性，写入指令与召回问句分离，短期消息按 `sessionId + avatarId` 隔离，敏感用户轮次及 assistant 同轮回复不进入 SQLite。
- P1C 已将 LLM 回复上限配置化为 `LLM_MAX_TOKENS`（默认 `320`），内部保留安全 finish reason / token usage 诊断，并收口舞台提示、emoji 和记忆确认表达边界。
- P1D 已收口波浪号与记忆确认措辞，并提供默认关闭、production 强制关闭的五字段安全评测诊断；4 轮 DeepSeek 抽样全部 `llm_only`、无截断、无 fallback，P1 对话质量阶段可以正式结束。
- 2026-07-27 对话行为微调已收口：后端明确“当前轮要求 > 会话偏好 > Persona 默认主动性 > 建议/追问”，新增即时策略解析、最终草稿行为检查和最多两次受控重写；12 轮真实 DeepSeek 固定集全部 `llm_only`、无 fallback、无最终违规。
- P3 已收口 Dialogue 可观测链路：`meta.trace` 贯通 `X-Request-ID`、编排耗时和 LLM 耗时；成功、fallback、未降级失败都有固定字段脱敏日志，Web Debug 面板显示 provider/model/mode/requestId/耗时/fallback/errorCode。
- TTS 已正式按 `local / remote / selfHosted` descriptor/adapter 收口：Settings 可选默认 `cosyvoice`、云端 `qwen3_tts` / `fish_audio`、通用 `self_hosted`，`mock` 仅作隐藏测试。remote / selfHosted 使用 Test → Save → Switch，配置由后端 AES-256-GCM runtime store 保存，Key 不进入 localStorage，也不会由配置 GET 回传。它们与本地 provider 共用统一 Audio Result 和既有 TTSService / AudioManager / LipSync / Presentation。
- Qwen3-TTS 使用官方 DashScope API，Fish 使用原生 `/v1/tts`；两者代码、Settings、capability/metadata 与故障归一已接入。当前没有可证明有效的两个云 Provider 凭据，真实中文音频和远程延迟仍未通过。上一版 SiliconFlow/CosyVoice2 远程目标属于范围偏差，已移除。
- remote / selfHosted 合成失败时，后端先回退默认本地 `cosyvoice` 并在 `metadata.fallback` 记录原因；本地仍失败才进入 Web 既有系统语音 fallback。配置 Test 明确禁用该 fallback，避免假阳性。
- 2026-08-10 对 Open-LLM-VTuber 当前主分支复核确认其 TTS factory 同时容纳本地与云端：CosyVoice2 使用本地 `client_url`，Fish API 使用云 Key；当前没有 Qwen3-TTS adapter。Alice 当前 `qwen3_tts` / `fish_audio` 也分别代表 DashScope/Fish 云服务，不代表开源模型的本地部署。未来 Qwen3/Fish self-hosted 服务不需要厂商 Key，应作为独立 provider identity 接本地 URL，继续复用统一 Audio Result。
- 2026-08-10 用户决定本阶段不再执行真实远程 TTS 对照，当前 changeset 按架构/adapter 代码收口：CosyVoice2 本地 live 已通过，Qwen3/Fish remote live、连续两轮、听感和本地延迟差值明确后置。该范围决定不改变两者“待真实验收”状态，也不授权新增第三个候选。
- P5 CosyVoice2 连续播放已收口：继续复用 `/api/tts` 完整 WAV/Base64 Audio Result，不引入 PCM streaming。`24` 字以内保持单段；`25–84` 字使用 balanced、`85` 字以上使用 extended 分段档；所有分段回复立即 2 路预取，`25` 字以上在首段 ready 后等待第二段 ready 或最多 `5000ms`。Node 真实 `/api/tts` 探针在 16 / 26 / 54 / 95 字中最大 gap 为 `0 / 3 / 5 / 4ms`；真实浏览器 16 / 54 / 95 字为 `0 / 24 / 236ms`，相对正式 Demo `6271ms` 基线下降约 `96.2%`。代价是 54 字 Node 首次播放 p50 约 `12.5s`。官方 FastAPI 不提供模型级 true streaming；Direct Python 虽能提前首 PCM，但当前 CPU chunk 最大 gap 仍超过 `2s`，因此不采用新流式协议。
- 2026-07-31 TTS 复核确认首音而非连续性仍是主要瓶颈：54 字三次首播 p50 / p90 `12.010 / 15.337s`，最大 gap `6ms`。延后第二段、ready 预测和 CPU 线程限制均因 gap 回归或长文本长尾被拒绝，不改 P5 播放策略。确定性修复是将单服务与完整 Demo 冷启动默认等待统一提升到约 5 分钟，覆盖首次 wetext 缓存补齐。OpenAI / MiniMax / Higgs 因无有效 live 凭据或必需 URL，仍留在实验层。
- 2026-08-03 项目全面审核确认：Alice 已是可重复验收的本地 MVP 和有价值的作品集工程，但尚无陌生用户、相对基线或 7 天复访证据，不能称为已成立的消费级产品。完整判断和一个月门槛见 `docs/reports/ALICE_PROJECT_AUDIT_20260803.md`。
- 2026-08-03 普通用户单一入口已收口：首次进入只显示 Alice 欢迎卡、默认关闭的记忆同意、声音和文字对话；开发设置、Debug、上传及进阶按钮只在显式 `?debug=1` / QA 入口出现。系统/机甲文案已改为日常 Persona，用户可从普通入口随时开关或清除本次会话记忆。
- VRMRenderer 已进入 Web MVP：业务层输出 `AvatarDirective`，Renderer 负责表达、眨眼、基础 lip-sync；P2 已完成真实 CosyVoice2 浏览器验收，含 99.48 秒真实音频、连续两轮、快速替换、静音取消与上游中断恢复。口型按近景反馈收敛为 U/O 轻量开合，硬上限 `0.22`，常见 warm/curious 不再叠加露齿 happy 表情。
- 2026-08-10 VRM 文件动作已从“原始 FBX 全身播放变形 / 常规状态落到僵硬程序化动作”收口为本地校准链路：`intro / idle / listening / thinking / speaking / chat / wave` 均由现有 FBX 文件驱动，retarget 后只保留上半身轨道，hips/root/腿/脚保持稳定基准。原始资产仍为 `debugOnly / pending verification`，正式分发前不能跳过授权。
- 普通 Demo、debug 与刷新入口的默认 `alice` 已统一指向 `assets/avatars/test-vrm/girl.vrm` 并强制使用 `VRMRenderer`；历史 `avatar_id` 不再改变正式默认，显式 `?avatar=` 仍可用于 QA 覆盖。

## 已完成能力

| 能力 | 状态 | 权威入口 |
| --- | --- | --- |
| Web 本地运行 | 可用 | `README.md`、`docs/guides/DEVELOPMENT_GUIDE.md` |
| 完整 Demo 一键启停 | 可用；支持幂等 start、真实 status、进程所有权停服、日志及 Web 旧 provider 默认自愈 | `docs/guides/DEMO_RUNTIME.md`、`scripts/demo/demo-manager.mjs` |
| Avatar registry / manifest | 可用 | `public/avatars/registry.json`、`docs/architecture/AVATAR_ARCHITECTURE.md` |
| Alice / Shiro / Wambo | 可用 | `public/avatars/*/manifest.json` |
| `/api/dialogue` 主链路 | 可用 | `docs/contracts/DIALOGUE_CONTRACT.md` |
| LLM Provider MVP | 可用；DeepSeek `deepseek-v4-flash` 已通过项目内 live 验证 | `backend/services/LLMService.js`、`docs/api/API_CONTRACT.md` |
| `dialogue.v1` 语义契约 | 可用 | `backend/contracts/dialogueContract.js` |
| SQLite-backed Memory | 可用；P1B 极性、召回问句拦截、短期 avatar 隔离与敏感写入防线已收口 | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` |
| Persona / Affect | 可用 | `backend/config/avatarPersonas.js`、`backend/services/CompanionAffectService.js` |
| 对话质量与即时行为基线 | 可用；P1A–P1D 基础及 2026-07-27 的 12 轮即时行为固定集已通过 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`scripts/check-dialogue-quality-logic.mjs`、`scripts/check-dialogue-behavior.mjs` |
| P3 Dialogue 可观测性 | 可用；requestId、LLM/编排耗时、fallback/error 日志与 Web Debug 已贯通 | `scripts/check-dialogue-observability.mjs`、`docs/api/API_CONTRACT.md` |
| Local RAG | 可用 | `docs/guides/KNOWLEDGE_GUIDE.md` |
| n8n Workflow 边界 | 可选 | `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md` |
| TTS Audio Result | 可用 | `docs/guides/LOCAL_TTS.md` |
| Mock TTS | 可用；隐藏测试 provider，不是产品默认 | `backend/services/tts/providers/MockTTSProvider.js` |
| CosyVoice2 adapter | 默认本地 provider；已接入，真实服务需本地 runtime | `docs/guides/COSYVOICE_RUNTIME.md` |
| Qwen3-TTS / Fish Audio remote adapters | 已接入公开 Settings 和统一 Audio Result；当前无可证明有效凭据，remote live 未通过 | `docs/reports/REMOTE_TTS_PROVIDER_AUDIT_20260810.md` |
| Self-hosted TTS adapter | 已接入通用 OpenAI-compatible adapter、descriptor 与 Settings；未配置真实服务，live 未通过 | `docs/reports/TTS_PROVIDER_MODEL_CLOSURE_20260810.md` |
| TTS 配置闭环 | Test → encrypted Save → Switch 已接入；secret 不进前端持久化，remote/selfHosted 失败先回退本地 | `docs/reports/TTS_PROVIDER_MODEL_CLOSURE_20260810.md` |
| VRMRenderer MVP | 可用；TTS 振幅接线、保守口型与 99.48 秒真实 CosyVoice2 视觉 QA 已完成 | `docs/architecture/VRM_RENDERER_MVP.md` |
| VRM 文件动作 | 本地可用；7 个正式 slot 均使用经上半身轨道过滤的 FBX，程序化版仅做加载失败 fallback | `docs/architecture/VRM_MOTION_QUALITY_V1.md` |
| Avatar Presentation 分层 | MVP 接线已收口 | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 部署安全基线 | baseline | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` |

## 进行中 / 下一阶段

| 方向 | 当前下一步 |
| --- | --- |
| 产品验证 P0 | 单一 Alice 测试入口已完成代码与本地浏览器收口；下一步完成 5 名预试用户的 60 秒自行开始验收，再进行 10 名目标用户的 10 分钟会话与 7 天实际复访。 |
| 角色感真实评测 | “先陪伴、别建议”固定集已收口；记录人格一致性、相对文本/通用语音入口的差异感和自然承接，只修真实测试中最高频的问题。 |
| Project Memory | 后续每次阶段性变更维护 `docs/project-memory/*`，避免聊天记录成为唯一上下文。 |
| Demo Runtime | macOS 本机完整启停已验收；后续仅在需要跨平台时补 Windows 进程管理。 |
| TTS | local / remote / selfHosted descriptor、默认本地策略、Test→Save→Switch、加密存储和 remote→local fallback 已完成代码收口；真实远程对照由用户后置。恢复验收时只补 Qwen3/Fish 的真实中文连续两轮、首 chunk/完整耗时、听感和实际账单；未完成前不得把 adapter/readiness 当作可用性，也不继续扩展其他云候选。 |
| VRM | 默认 Alice 的音频/口型与本地文件动作均已收口；下一步只在 Shiro / Wambo、新模型或新动作资产进入时重做模型专用视觉验收，公开分发前完成 motion 授权复核。 |
| Memory / Persona | 基础阶段和即时行为微调已完成；下一步只围绕陌生用户真实会话暴露的人格一致性和会话内关系感做产品体验验证。 |
| Observability | P3 已完成当前单实例闭环；后续真实部署时再评估集中式日志、指标存储与跨服务 tracing。 |
| Security | 公网前仍需正式鉴权、域名、HTTPS、secret manager 和部署平台策略。 |
| LLM Provider | 后续用真实 Key 验证 OpenAI / Qwen；DeepSeek 默认 `deepseek-v4-flash` 已完成项目内 `/api/dialogue` live 验证。 |

## 当前风险摘要

- 当前没有陌生目标用户、相对基线或实际复访证据；本地真实链路验收不能替代产品价值验证。
- 普通入口的开发者文案、机甲台词和占位控件已隐藏或收口；远程测试前仍需解决 `girl.vrm` 授权/分发，以及后端单 token 鉴权与最终用户入口之间的闭环。
- CosyVoice2 live 依赖外部模型/运行时，不能被普通 `npm run check` 完全覆盖。
- Qwen3-TTS 与 Fish Audio 当前仅通过 adapter contract、配置流程和故障归一；没有可证明有效的凭据，remote live、连续两轮和本地对照延迟都未完成。
- 加密 runtime store 解决了 Key 不进入仓库/前端明文存储的问题，但本地自动生成的加密 key 文件不等于生产 Secret Manager；公网部署前还需正式管理员访问控制和外部密钥注入。
- 默认 Alice 的真实 CosyVoice2 长音频和视觉同步已通过 99.48 秒浏览器验收；其他 Avatar 仍不能只靠自动化证明口型观感。
- VRM motion / FBX retarget 质量不能只靠自动脚本证明，需要视觉 QA。
- 当前 FBX 文件动作只批准用于本机 Demo；浏览器 QA 通过不代表授权或原文件再分发权已确认。
- `docs/mobile-handoff/` 是已有移动端交接资料，本轮不是重点；Web 项目当前权威以 `docs/project-memory/`、`docs/contracts/`、`docs/architecture/` 为准。
- 单 token API auth 是部署前 baseline，不是完整公开产品鉴权方案。
- Alice 自有模型/素材的商业授权仍需在正式分发前复核。
- OpenAI / Qwen 的真实返回细节仍需在各自真实 Key 环境中验证；DeepSeek `deepseek-v4-pro` 目前只有 fake endpoint 覆盖，尚未产生额外 live 费用。
- 首次 10 轮 DeepSeek 基线的截断已在 P1C 同集复测中降为 0；P1D 4 轮抽样继续保持 `finishReason=stop`、`truncated=false`，当前无明确回复完整性回归。
- P1B 不自动删除旧 SQLite 中可能已存在的敏感历史行；新写入已阻断，检测到的旧敏感记录不会进入活动上下文，旧库清理应由用户显式执行。
- P2 的 99.48 秒旧基线曾有 17 次 underrun、最大 gap `6.088s`；P5 新策略在真实浏览器 95 字场景最大 gap `236ms`，但内部 `100ms` 阈值仍记录 1 次 underrun，且中长回复首音约 `10–13s`。
- 当前 CPU 下模型层 PCM stream 的生成实时系数仍大于 1，chunk 间存在 `2s+` 空洞；只有 provider 吞吐明显改善后才重新评估流式协议。
- OpenAI / MiniMax / Higgs TTS adapter 当前分别因 secret 无效、Authorization 失败或 base URL 缺失未完成 live；adapter 存在不代表已可公开。
- Demo supervisor 的 PID 指纹与 signal 管理当前以 macOS / Linux 为基线，Windows 尚未实现或验收。
- P3 当前是单实例 requestId + 结构化日志 + Web Debug 基线，不包含集中式日志平台、持久化指标、Sentry/OpenTelemetry 或跨服务 trace。
- DeepSeek 明确边界轮次可能因复杂规则消耗内部生成预算并触发 2～3 次生成；最终 12 轮虽无 fallback，但最慢一轮为 `17.08s`，服从度提升存在可感知延迟代价。

## 最近验证

2026-08-11 TTS 三类产品模型最终收口已执行：

- `npm run check` 全量通过；覆盖默认 local 约束、三类 descriptor、Test/加密 Save/Registry refresh、self-hosted request mapping、remote→CosyVoice fallback、fallback 后同一 AudioManager 生命周期、取消/静音/分段/最终 `audio:end`、secret/auth 边界和既有 VRM/Dialogue 回归。
- 清空真实 Provider 凭据、使用 `PORT=3105` 的隔离服务上，`SMOKE_BASE_URL=http://127.0.0.1:3105 npm run smoke` 通过；TTS smoke 明确使用 Mock，不构成 Remote 或 CosyVoice live。
- 新增并通过两个边界回归：已保存 remote provider 不会在 Settings descriptor 加载前被临时 CosyVoice 选项覆盖；系统 voice 列表为空且浏览器不触发 `voiceschanged` 时，仍会在短等待后调用默认系统声线，不让本地最终 fallback 悬挂。
- 加密 remote 配置文件损坏时 Registry 会隔离该错误，默认 `cosyvoice` 仍可注册和作为 local fallback；配置错误仍保留为 `TTS_CONFIG_STORE_INVALID` 供配置链路排查。
- Playwright `http://127.0.0.1:3000/?debug=1`：Console 0 error、1 个既有 warning；选择器只展示默认 CosyVoice、Qwen3-TTS、Fish Audio、self-hosted，并按默认/云端/自建分组。只选择 Fish 时 `tts_engine` 仍为 `cosyvoice`、Save disabled；临时把已保存选择设为 Fish 后刷新，DOM 与 storage 都恢复为 Fish。请求列表只有安全 config GET，没有 `/test` 或 `/api/tts` POST；验收后已把本地选择恢复为 CosyVoice并关闭浏览器/服务。
- 本轮没有点击 Remote Test，没有执行真实 Qwen3/Fish/self-hosted 合成，没有采集新的 CosyVoice live 或远程延迟；这些状态仍是待验收，不能由上述自动化/浏览器 UI 结果推断为真实可用。

2026-08-10 可插拔远程 TTS 第一阶段已执行：

- 审计确认现有 `TTSOrchestrator -> TTSProviderRegistry -> provider adapter -> Audio Result -> TTSService -> AudioManager -> Presentation/LipSync` 可直接扩展，没有新增第二套播放器或表现链路。
- `mock / cosyvoice / qwen3_tts / fish_audio` Settings 切换与 `/api/providers` 安全 metadata 已贯通；fake endpoints 覆盖 DashScope Qwen3 原生请求/签名音频下载、Fish 原生 model header/reference_id、后端 model/voice 优先、完整音频、capability/latency、故障归一和 secret 不泄漏。
- 2026-08-10 使用当前官方 FastAPI runtime 重新完成 CosyVoice2 两轮真实短中文：均为有效 24kHz WAV；第 1 轮 `174764 bytes`，首 chunk/完整/Audio Result ready `4653/4658/4658ms`；第 2 轮 `228524 bytes`，对应 `6018/6020/6020ms`；p50 `5336/5339/5339ms`。历史浏览器链路首 chunk `3367ms`、完整 `3384ms`、ready `3393ms` 仅保留作旧基线。
- 浏览器播放中点击静音得到 `audio:end(cancelled=true)`，最终 `idle / speaking=false / lipSync.active=false / mouthAmount=0`；静音状态再次触发语音没有 `audio:request`。
- 单段 backend TTS 在音频返回前也会登记现有可取消 session；延迟请求回归确认静音/替换会 abort fetch、发出同一 cancelled `audio:end`，且不会触发晚到播放或 browser fallback。
- 未配置远程 provider 时，既有通用链路会得到 `audio:request -> audio:fallback -> browser audio:start`；后续切回 CosyVoice 仍成功。Qwen3/Fish provider-specific fallback 由失败 contract 覆盖，但本轮未伪造真实浏览器成功语音。
- Qwen3 两轮 live 以北京 region 官方 endpoint/model/voice 发起前，预检识别兼容 `QWEN_API_KEY` 为 placeholder 并返回 `missing_key`；没有发出计费请求。Fish 固定 live 返回 `TTS_NOT_CONFIGURED / missing_base_url_and_key_and_model_and_voice`。远程真实中文、连续两轮和延迟对比未完成，详见 `docs/reports/REMOTE_TTS_PROVIDER_AUDIT_20260810.md`。
- 严格 `check:tts-compare-live` 现在以同一中文文本交替运行 CosyVoice2 / Qwen3-TTS / Fish Audio 各两轮，输出安全 `alice.tts-live-comparison.v2`、三类 latency p50 与各 `remote - local` 差值；任一端未配置时预检失败且不产生半边调用。本地两轮已单独重采，两个 remote 因无有效 Key 未执行，因此没有可报告差值。
- 额外只按非敏感状态检查了已有 MiniMax / OpenAI 配置并各发起一条短中文探测：MiniMax 官方 T2A 端点返回鉴权拒绝，OpenAI 官方 endpoint 在当前环境 TLS 连接失败；两者均无音频，不能作为 remote live，也不因此扩大公开 provider 集合。
- `npm run check` 全量通过；独立 `127.0.0.1:3105` stub/mock 服务上的 `npm run smoke` 通过。浏览器 Console 为 0 error、1 个既有 VRM warning。

2026-08-10 VRM 文件动作修复已执行：

- `scripts/qa/vrm-file-motion-product-runner.js`：通过；`intro / idle / listening / thinking / speaking / chat / wave` 均为 `source=file / format=fbx / mode=retargeted`，无程序化替身、无 Console/Page/Request 错误。
- 浏览器骨骼采样：原始 retarget 匹配 `21/53` 轨道、20 根目标骨；正式片段保留 11 条轨道，`thinking` 保留 13 条。所有状态的 hips、双腿和双脚位移/旋转与 idle 基准一致。
- 视觉 QA：`output/playwright/vrm-file-motion-product/` 中的截图确认腿部直立稳定，speaking/chat/wave 上半身手势可见，未再出现原始全身 FBX 的交叉脚和 root 漂移。
- `scripts/qa/vrm-motion-lifecycle-runner.js`：通过；greeting 意图、raw QA 动作打断、快速点击队列、模型切换、缺失动作安全失败均能回到文件版 idle。
- `npm run check`：通过。
- `SMOKE_BASE_URL=http://127.0.0.1:3002 npm run smoke`：在清空本地 n8n 示例配置的隔离服务上通过。

2026-07-03 本轮文档整理后已执行：

- `git diff --check`：通过。
- Markdown 相对链接检查：通过。
- `npm run check:dialogue-contract`：通过。
- `npm run check:tts-provider-flow`：通过。
- `npm run check:vrm-renderer-flow`：通过；本地 `local_alice_vrm_test`、`local_boy_vrm_test`、`local_girl_vrm_test` 均可被脚本审计。

未执行 `npm run check` 全量回归，也未启动浏览器手动验收。

2026-07-10 LLM Provider MVP 已执行：

- `git diff --check`：通过。
- `npm run check`：通过，包含 `check:llm-provider-flow`、契约、安全与既有 TTS / VRM 回归。
- `npm run smoke`：通过，使用无真实 Key 的默认 stub 链路。
- DeepSeek 项目内 live：通过 `/api/dialogue` 发起 1 次未显式提供 model 的请求，HTTP 200，实际解析为 `deepseek-v4-flash`，`meta.mode=llm_only`，Memory / TTS pending / AvatarDirective / `dialogue.v1` 均正常，耗时约 1.86 秒，未进入 fallback。
- live 响应当前不透传上游 usage，因此本次项目内 token 数不可获得；日志只记录 requestId、method、path、statusCode、durationMs，未记录 Key 或 Authorization。

2026-07-10 P2 TTS×VRM 表现层收口已执行：

- `npm run check`：通过，包含 JS、MVP、TTS provider、Companion 状态、Dialogue、VRM motion / renderer、安全与其他全量回归。
- `npm run check:cosyvoice-runtime`：通过；本机 CosyVoice2 模型权重、`sampleRate=24000`、speaker `中文女` 前置可用。
- `check:vrm-renderer-flow`：新增对象级断言，确认 `audioSource` 到达当前 renderer-owned `LipSyncController`；模拟 120 秒振幅期间保持 `audio-driven`，结束后 mouth influence 归零。
- 本机既有真实 CosyVoice2 回归 WAV 离线振幅回放：`24000 Hz`、原始时长 `4.2s`、84 个 50ms 窗口，RMS 归一化振幅 `0.0003–1.0`；循环回放模拟 120 秒后仍为 `audio-driven`，结束为 `idle` 且 mouth 全归零。该证据使用真实语音波形，但不等同于 120 秒真实生成或浏览器视觉 QA。
- `check:mvp-flow`：新增旧长音频被新请求替代、陈旧 start/end 抑制、HTMLAudio 取消 Promise 完成和引用清理验证。
- `git diff --check`：通过。
- 未完成真实 CosyVoice2 浏览器视觉验收：沙箱内启动 `0.0.0.0:3000` 报 `EPERM`，端口权限请求因当前 Codex 使用额度限制被自动拒绝；未绕过权限。

2026-07-10 P2 真实浏览器验收补测：部分完成，不能标记为完整通过。

- CosyVoice2 官方 FastAPI 已以前台长会话成功启动，`npm run check:cosyvoice-live` 真实通过：返回 WAV，`audioBase64Bytes=174764`、`streaming=false`、`upstreamStreaming=true`。
- Alice Web 已带真实 CosyVoice 环境启动；`local_girl_vrm_test` 加载成功，Web Settings 显示 `CosyVoice2 / 可用 / 中文女 / 服务已连接`。
- 真实短语音通过：实际媒体时长 `6.64s`，采集 63 个 `audio-driven` 样本；amplitude `0–0.327`、smoothed amplitude `0–0.297`、mouth amount `0.03–0.112`，A/I/U/E/O 五组均出现。
- 短语音期间 `isSpeaking=true`、Avatar state 到 `speaking`，body motion 到 `speaking`；neutral 表情、自动 blink 与口型同时存在，未观察到数值发散、锁死张嘴或高频抖动。
- 短语音结束后 `lipSync.mode=idle`、`audioDriven=false`、mouth amount 和全部 mouth morph influence 均为 `0`、`isSpeaking=false`、Avatar state 为 `idle`。
- 全身视角下口型幅度偏克制，但当前截图不足以证明需要调参；尝试面部近景复验时浏览器控制权限因 Codex 使用额度限制被自动拒绝，因此本轮未修改口型参数。
- 未完成并不得视为通过：30–60 秒真实长语音、连续快速两段、播放中取消/静音、TTS 错误/中断恢复，以及结束后 body motion 延迟收敛到 idle 的持续观察。
- 本轮本地证据位于 `output/playwright/p2-tts-vrm-browser/`；其中 `short-active.png` 为有效播放中截图，`short-peak-closeup.png` 因相机裁掉头部不能作为口型强度证据。

2026-07-10 P1A Prompt / Persona 基础正确性已执行：

- 新增 `check:dialogue-quality-logic` 并纳入 `npm run check`，覆盖三 Persona 身份、Prompt 权限层级、Web 旧默认迁移、真实历史 role、最近消息预算和超长 Prompt。
- `npm run check`：通过，包含 Persona、Memory、RAG、Agent、Provider、Dialogue Contract、TTS / VRM 与新质量逻辑检查。
- `npm run smoke`：通过；另在独立 `PORT=3101` 当前工作树服务上复验通过，所有对话使用 `stub`，TTS 使用 `mock`。
- 本轮没有调用 DeepSeek 或其他真实 LLM provider，没有修改 `maxTokens=200`、`temperature=0.8`、Memory 写入策略、Affect、TTS 或 AvatarDirective 契约。

2026-07-14 P1B Memory 确定性修复已执行：

- `npm run check:memory-flow`：通过，覆盖正/负偏好极性、明确写入与召回问句分流、召回前后长期记忆计数不变、同 session 跨 avatar 隔离、同 avatar 跨 session 隔离、独立裁剪/清理、敏感 SQLite 写入拦截、普通持久化和契约生命周期。
- `npm run check:dialogue-quality-logic`、`npm run check:dialogue-contract`、`npm run check`：通过；P1A 结构化 messages 与 `dialogue.v1`、Memory、TTS pending、AvatarDirective 生命周期保持稳定。
- `npm run smoke`：在当前工作树 `PORT=3101` 服务上以 stub/mock 通过；默认端口首次因服务未启动而失败，不涉及实现错误。
- `git diff --check`：通过；没有 schema 变化，没有真实 LLM 请求，没有读取或写入 API Key，没有修改 TTS×VRM 实现。

2026-07-14 P2 真实浏览器验收已完成：

- `local_girl_vrm_test` 真实长音频实际时长 `37.12s`，359 个 `audio-driven` 样本；amplitude `0–0.308`、smoothed amplitude `0–0.292`、mouth amount `0.03–0.11`，A/I/U/E/O、neutral、blink 与 speaking motion 并行。
- 现场发现 45 秒通用上游超时无法覆盖本机长语音生成，已拆分 `TTS_UPSTREAM_TIMEOUT_MS=90000`，前端 TTS 等待 100 秒，不改 LLM 超时。
- 现场发现快速替换/静音只停音频、未清理旧 lip-sync 周期；已让活动播放取消先发出 `audio:end(cancelled=true)`，复验时 150–200ms 内口型、Avatar 与 motion 全部 idle。
- CosyVoice2 停机时页面安全转 browser fallback，结束后全部归零；服务重启后下一段 6.4 秒真实音频恢复 `audio-driven`。
- 口型增益、平滑系数、上限与轮换间隔均未调整；全身视角偏克制，但无明确过小/过大、抖动、锁嘴或延迟证据。

2026-07-14 本地启动配置已收口：

- 本机 Node `v24.15.0` 已确认支持 `--env-file-if-exists`，缺少 env file 时会继续执行。
- `npm run dev` 已能自动加载 Git ignore 的根目录 `.env`；通过安全 provider readiness 只确认 DeepSeek `configured=true`，未发起真实 LLM 请求。
- 默认 `npm run check` 与 `npm run smoke` 继续使用 fake endpoint / `stub`，不会因本地 `.env` 存在而访问真实 DeepSeek。

2026-07-14 P1C 回复完整性与自然表达已执行：

- `LLM_MAX_TOKENS` 缺省解析为 `320`，后端环境变量可覆盖；`/api/dialogue` 请求字段不变。
- `LLMService.chatDetailed()` 内部保留规范化 finish reason、`length` 截断标识和安全 token usage，不保留 Prompt、Authorization、Key 或 base URL，也不透传公开响应。
- Prompt 增加括号舞台提示、emoji、记忆事实扩写和永久保存承诺边界；不修改 Persona 核心身份、Memory、Affect、TTS 或 AvatarDirective。
- 本轮只运行 fake/stub 自动检查与 smoke，没有调用真实 DeepSeek。

2026-07-22 P1D 最终表达收口与真实抽样已执行：

- Prompt 优先使用正常中文标点，波浪号同一回复通常不超过一次但不完全禁止；记忆确认只复述实际保存内容，使用当前记忆状态措辞，不用“小本本”、永久承诺或括号补充。
- `DIALOGUE_DEBUG_LLM_DIAGNOSTICS` 默认关闭且 production 强制关闭；非 production 受控评测只在兼容 `meta.llmDiagnostics` 暴露 finish reason、截断标记和三项 token usage，未知 finish reason 收敛为 `unknown`。
- 专项检查、全量 `npm run check`、隔离 `npm run smoke` 与 `git diff --check` 均通过；默认检查未访问真实 DeepSeek。
- 隔离服务通过标准 `npm run dev` 加载本地 `.env`，使用独立端口、全新 session 和仓库外临时 SQLite；4/4 DeepSeek 请求均 HTTP 200、`llm_only`、`deepseek-v4-flash`、`finishReason=stop`、`truncated=false`，无 fallback。
- 四轮波浪号为 `0 / 0 / 1 / 0`，emoji 为 `1 / 0 / 0 / 0`，括号舞台提示为 0；唯一长期记忆准确保存为“我不喜欢香菜，吃饭时希望避开它”，未推断其他口味或作永久承诺。
- 服务日志只包含请求 ID、方法、路径、状态和耗时；未记录 Prompt、用户正文、Key、Authorization、Base URL 或原始上游响应。评测后隔离服务已关闭，正式数据库未修改。

2026-07-14 本地全服务启动现场验证：

- Alice Web / Backend 在 `3000` 端口可用；真实 DeepSeek `deepseek-v4-flash` 通过 `/api/dialogue` 返回预期短回复，未进入 stub fallback。
- CosyVoice2 官方 FastAPI 在 `50000` 端口可用；`GET /api/providers` 显示 `configured=true / available=true / health.live=true`，`check:cosyvoice-live` 返回有效 WAV（`audioBase64Bytes=174764`）。
- 现场暴露受控环境端口权限、detached 子进程存活、固定 guard 早报成功、空 `COSYVOICE_BASE_URL`、npm/node 残留进程与端口竞态问题；已记录到 `RISKS_AND_TODO.md`，后续建议独立实现 `dev:full + status + stop/restart`。
- 首次运行 `npm run smoke` 因本地示例 n8n URL 被误判为已配置而失败；仅在本次临时运行覆盖中清空未使用的 n8n 示例项后，`npm run smoke` 通过。该问题已列入 placeholder 配置校验优化项。
- 本轮为完成测试只使用 `/tmp` 下不含 secret 的运行覆盖文件，没有修改或提交本地 `.env`，没有输出 API Key。

2026-07-14 Demo 一键启停能力已完成真实验收：

- 完全停止旧手工进程后，`demo:status` 显示 `3000/50000` 均为 free；首次 `demo:start` 成功启动 supervisor / Alice / CosyVoice（PID `67086 / 67090 / 67089`）。
- 网页 `http://localhost:3000` 返回 HTTP 200；DeepSeek 返回 `meta.mode=llm_only`、model `deepseek-v4-flash`，没有进入 mock/fallback。
- CosyVoice 通过 Alice `/api/tts` 返回有效 RIFF/WAVE；首次冷启动验证 `audioBytes=149804`，后续幂等/status 验证 `audioBytes=144044`。
- 重复 `demo:start` 输出 `already running`，三个 PID 保持 `67086 / 67090 / 67089`，没有重复进程。
- `demo:status` 显示 Alice / DeepSeek / CosyVoice 全部 ready，两个端口均 ready。
- `demo:stop` 后状态文件删除，`3000/50000` 端口释放；再次 `demo:stop` 安全返回 `already stopped`。
- 再次冷启动成功；最终最新代码实例为 supervisor / Alice / CosyVoice PID `69935 / 69939 / 69938`，DeepSeek `llm_only`，CosyVoice 有效 WAV `149804` bytes。
- `npm run check`、`npm run smoke`、`check:demo-lifecycle`、`check:security-boundaries`、`git diff --check` 均通过。
- `.env` 与真实 API Key 未被修改或打印；状态文件不保存 env/Prompt/音频，CosyVoice 子进程不继承 credential-shaped 环境变量。

2026-07-14 Demo 页面“无回复、无声音”端到端排查与修复：

- 真实浏览器复现时页面发出了 `/api/dialogue` 和 `/api/tts`，但请求体分别为 `provider=stub/model=stub` 与 `provider=mock`；响应仅需 `3ms/2ms`，Dialogue 明确标记 `meta.mode=llm_stub`，CosyVoice 日志没有收到该文本。
- 同一页面的 `/api/providers` 已显示 DeepSeek `configured=true/status=ready/defaultModel=deepseek-v4-flash`，CosyVoice `available=true/health.live=true`；安全检查确认 `.env` 中 DeepSeek Key 已配置，未读取或打印 Key 内容。
- 根因是 Web 历史默认与 localStorage 迁移停留在 `stub/mock`，同时 `index.html` 明确不显示回复文字；服务端口和独立 live 检查正常无法发现这个浏览器配置问题。
- 修复后用同一个浏览器恢复旧 `stub/mock` 状态并 reload，localStorage 自动迁移为 `deepseek/deepseek-v4-flash/cosyvoice`，无需清空全部浏览器数据。
- 连续两轮页面发送均通过：Dialogue HTTP 200，分别 `1333ms/2307ms`，均为 `provider=deepseek/model=deepseek-v4-flash/mode=llm_only`；TTS HTTP 200，分别 `3812ms/7393ms`，请求均为 `provider=cosyvoice`。
- 页面显示真实回复；第二轮 `HTMLAudioElement` 为 `paused=false/muted=false/volume=1`，`currentTime` 从 `0.03s` 推进到 `0.47s`，媒体时长 `5.12s`。Console 无 Dialogue/TTS/播放错误，原有 `boot.fbx` 与 favicon 404 仍单独保留。

2026-07-14 Avatar 默认模型错误修复与浏览器验收：

- 根因是 registry 默认 `alice` 的 manifest 仍指向 `public/models/characters/avatar_v2.glb` 且声明 default renderer；`girl.vrm` 只作为 debug 本地测试项注入，历史 `localStorage.avatar_id=alice` 又持续选择旧 manifest。
- 保留稳定角色 id `alice`，将其 manifest 的模型、VRM renderer、expression map、五元音 mouth map、transform 和 motion 配置对齐到截图中的 `local_girl_vrm_test`；不改 Dialogue/TTS 契约。
- 普通 `/`、debug `/?debug=1` 与普通页刷新后均实际 `GET /assets/avatars/test-vrm/girl.vrm` HTTP 200；运行态为 `VRMRenderer`，VRM runtime / humanoid / expression manager / lookAt / spring bone 均为 true，Console 无 VRM 加载错误。
- 连续两轮网页消息均返回真实 DeepSeek `provider=deepseek/model=deepseek-v4-flash/mode=llm_only`；CosyVoice 生命周期完成且 `fallback=false`。播放采样确认同一 `alice/girl.vrm` 上 `lipSync.mode=audio-driven`，E/A/U/O/I 五组口型随振幅变化并在结束后归零。
- `girl.vrm` 当前仍是 `.gitignore` 排除的 local-only 大文件；本机 Demo 可用，但正式分发前需确认授权并迁移到可发布资产路径。

2026-07-23 P3 Dialogue 可观测性已执行：

- `npm run check`、`npm run smoke`、`npm run check:deployment-readiness`、`git diff --check`：通过；新增 `check:dialogue-observability` 已进入全量检查。
- 自动检查覆盖 fake LLM 成功、显式 stub、timeout fallback、关闭 fallback 的失败、HTTP 错误 requestId、连续状态替换和日志敏感内容边界。
- 浏览器 `?debug=1` 验证显式 stub：Debug 显示 `provider/model=stub`、`mode=llm_stub`、独立 requestId、`llmMs=-` 和编排耗时。
- 浏览器受控 OpenAI 上游失败验证：Debug 显示 `openai/gpt-4o-mini → stub`、`mode=llm_fallback_stub`、`fallback=upstream_error`、`llmMs=4ms`、`orchestrationMs=5ms`；后端专项日志使用同一 requestId。
- 现场发现 UUID 偶尔被通用敏感数字规则误脱敏；已让脱敏器只保留安全 UUID/规范化 requestId，同时继续拦截 secret-shaped requestId。
- 使用固定 `X-Request-ID=p3-live-deepseek-20260723` 完成一次真实 `deepseek-v4-flash` 短请求：HTTP 200、`mode=llm_only`、无 fallback，回复“链路正常。”，`orchestrationMs=2500`、`llmMs=2500`；没有触发 TTS。
- 浏览器 Console 没有 P3 新错误；只观察到既存 favicon 404。

2026-07-23 P2 扩展验收与保守口型已执行：

- `npm run check:cosyvoice-runtime`、`check:vrm-renderer-flow`、`check:companion-state-flow`、`git diff --check`：通过；全量回归在本轮末尾执行。
- 默认 Alice 使用真实 CosyVoice2 完成 455 字、36 段、合计 `99.48s` 音频；总链路 `134.75s`，自然结束后 `isSpeaking=false`、`lipSync=idle`、mouth influence 归零。
- 根据面部近景反馈，口型从 A/I/U/E/O 写实轮换改为只用 U/O 轻量开合，audio-driven influence 上限 `0.22`；实测最大 `0.10`。`warm/curious` 使用轻微 neutral，不再叠加容易露齿的 happy/relaxed。
- 连续两轮 24/26 字真实 CosyVoice2 均完成；第二轮实时捕获 66 个 audio-driven 样本，仅有 U/O，最大 mouth `0.089`，最终 idle，无 lastError。
- 真实 DeepSeek 长回复尝试出现一次 `empty_response`，P3 正确显示 `deepseek → stub`、`llmMs=5685`；因 fallback 音频仅 `8.68s`，长音频验收改用受控 dialogue response 隔离 LLM，TTS/VRM 保持真实。
- 99.48 秒场景记录 17 次 underrun、最大 gap `6.088s`；归入 P5 延迟/流式决策，不阻塞 P2 表现层收口。

2026-07-24 正式 Demo 真实体验链路收口：

- `demo:start` 使用独立 SQLite 验收库成功启动，ready 输出同时确认 `alice/girl.vrm`、DeepSeek `deepseek-v4-flash/llm_only` 和有效 CosyVoice2 WAV；普通、debug、刷新和历史 `avatar_id=osa_shiro + llm=stub + tts=mock` 均恢复到正式默认，显式 `?avatar=osa_shiro` 仍可作为单次 QA 覆盖。
- 固定 10 轮浏览器真实对话全部为 DeepSeek `llm_only` + CosyVoice2 `ended`，无自然 fallback；LLM 平均 `3212ms`（`2333–3985ms`），文字出现到首音平均 `5717ms`（`3533–7423ms`）。
- 第 4 轮明确保存“不喜欢香菜、咖啡偏爱拿铁”一条长期记忆；第 5、9、10 轮均自然引用，第 6 轮准确复述项目评审和“只想缓一缓、不需要建议”的短期上下文。
- 10/10 轮有真实音频振幅驱动，口型只使用 U/O，happy morph 最大值为 `0`；10/10 轮自然结束后 `idle + lipSync idle + mouth=0`。开心语义继续由声音、轻微 neutral、眨眼和动作表达，不启用可能露齿的 happy morph。
- 修复真实验收发现的两个阻碍项：用户“很累/有点空/担心”等 distress 语义优先于回复感叹号和 memory，避免误判 `happy`；`intensity=0` 不再被默认值覆盖，结束态表情可真正归零。
- 受控无效 DeepSeek model 触发 `llm_fallback_stub/upstream_error`，失败调用 `4313ms`；Web Debug 显示 `deepseek/invalid-model → stub`，响应、Debug 和后端专项日志使用同一 requestId。
- 未通过的体验项：第 3 轮用户明确“先别给建议”后，回复仍主动抛出“要不要聊窗外”；10 轮中 5 轮段间 gap 超过 `1s`，最大 `6271ms`。前者进入下一阶段角色感微调，后者继续作为 P5 的首要输入。
- 逐轮原始回复、requestId 和指标见 `docs/reports/DEMO_EXPERIENCE_ACCEPTANCE_20260724.md`；本轮不涉及 iOS、RAG、Agent、新 Provider 或新协议。

2026-07-27 Alice 对话行为微调：

- 新增 `DialogueBehaviorPolicy`，只在后端从当前用户输入和最近四条用户消息解析建议、追问、话题、安慰、修正、连续性和低能量约束；当前轮明确要求优先，策略不进入长期 Memory。
- Prompt 增加统一行为优先级和当前轮策略，近期 role history 继续保持原生角色；短期历史召回不得误称为已保存长期记忆。
- 首次草稿违规或为空时，最多两次以“原用户消息 → 草稿 → 重写指令”临时 role 序列重写；只保存最终交换，不改变 `dialogue.v1`。
- `check:dialogue-behavior` 的 12 个固定用例、同义表达、防误判、Affect、Memory、Provider、Observability 和 Contract 专项检查通过。
- 最终真实 DeepSeek 12/12 为 `deepseek-v4-flash / llm_only`，0 fallback、0 最终行为违规；第 1 轮前两次均为 `finishReason=length / completionTokens=480`，第三次重写成功，总耗时 `17.08s`。
- 全量 `npm run check`、隔离环境 `npm run smoke` 和 `git diff --check` 通过；smoke 使用临时 SQLite 并清空本机可选 n8n 配置，不修改正式数据库或 `.env`。
- 逐轮实际回复和验收标准见 `docs/reports/DIALOGUE_BEHAVIOR_TUNING_20260727.md`；本轮未改 TTS、VRM、RAG、Agent、iOS 或 Provider 列表。

2026-07-28 P5 CosyVoice2 连续播放收口：

- 官方 FastAPI 三次重复无 true streaming evidence；Direct Python 证明模型层 `stream=True` 可提前首 PCM，但 26 字 CPU chunk 最大 gap p50 仍为 `2662ms`，MPS 对照更慢且有数值告警，因此不新建 PCM 流式协议。
- 最终采用 `24` 字以内单段、balanced / extended 长度分档、第二段即时 2 路预取和 `5000ms` 有界首段连续性等待；保留显式 `first-ready`、取消、fallback 和同一 utterance 生命周期。
- Node 真实 `/api/tts`：16 字两次最大 gap `0ms`；26 / 54 / 95 字各三次最大 gap `3 / 5 / 4ms`，均为 0 underrun。
- 真实浏览器：16 / 54 / 95 字最大 gap `0 / 24 / 236ms`；每个分段开始均为 `isSpeaking=true + lipSync audio-driven`，最后一次 `audio:end` 后统一回 idle，无 fallback/error。相对 `6271ms` 基线下降约 `96.2%`。
- `npm run cosyvoice:verify` 通过：官方 runtime ready/prewarm、Alice live WAV `4.32s / 207404 bytes`、停机降级均正常。
- `check:mvp-flow`、`check:tts-provider-flow`、`check:companion-state-flow`、`check:vrm-renderer-flow`、全量 `npm run check`、隔离 Stub/Mock 的 `npm run smoke`、`npm run check:deployment-readiness` 和 `git diff --check` 全部通过。
- 完整决策与首音代价见 `docs/reports/P5_CONTINUOUS_TTS_DECISION_20260728.md`；本轮未修改 `/api/tts`、`dialogue.v1`、LLM、Prompt、Memory、iOS、RAG、Agent 或 Provider 列表。

2026-07-31 TTS 后续审计：

- 当前 P5 策略的 54 字三次复测为首播 p50 / p90 `12010 / 15337ms`、首段 ready p50 `7299ms`、最大 gap `6ms`、0 underrun。
- 为换取较快首音的延后预取 / 立即播放带回最大 `5367ms` gap；ready 预测带回 `1382–1818ms` gap；CPU 线程限制在 95 字上出现 `16871–25119ms` 首音长尾。三类实验均不进入正式代码。
- 缓存不完整时首次 wetext 资源补齐超过原等待窗口；`cosyvoice:start` 默认改为 `60 × 5s`，`demo:start` 默认改为 `300s`，并有自动检查锁定。
- OpenAI 本地值未通过 secret 格式检查，MiniMax 返回 Authorization 失败，Higgs 缺 base URL；未成功产生付费音频，不扩大正式 provider 列表。
- `npm run cosyvoice:verify` 通过：热缓存下第 3 次 polling 完成 ready / prewarm，Alice live 生成 `4.32s / 207404 bytes / 24000Hz` 有效 WAV，停机降级正常。全量 `npm run check`、独立 `3102` Stub/Mock + 临时 SQLite 的 `npm run smoke`、`check:deployment-readiness` 和 `git diff --check` 均通过。
- 完整数据和新 provider 门槛见 `docs/reports/TTS_FOLLOWUP_AUDIT_20260731.md`。

2026-08-10 普通入口启动故障收口：

- 根因一是用户从 Finder 直接打开 `index.html`，而原 `file://` 提示位于 ES Module 内；Module 在执行提示前已被浏览器拦截，页面因此永久停在加载层。检测现已移到首屏 classic inline guard，直接打开文件会显示 `demo:start` 和正确 URL，Module 即使被特殊配置放行也不会继续初始化。
- 根因二是 macOS 系统解析缓存把 `api.deepseek.com` 指向无法完成 TLS 的旧地址；DeepSeek 模型、Base URL、Key 配置与 CosyVoice2 runtime 均未发现代码问题。强制使用当前 DNS 地址时 HTTPS 正常，重载 mDNSResponder 后系统 HTTPS 恢复。
- DNS 恢复后重新执行 `npm run demo:start`：`alice/girl.vrm` ready；真实 DeepSeek `deepseek-v4-flash/llm_only`，耗时 `2859ms`；真实 CosyVoice2 返回 `149804` bytes WAV，耗时 `4718ms`。没有用 Stub、Mock、放宽 readiness 或硬编码上游 IP 绕过故障。
- `npm run check`、独立 `3109` Stub/Mock + 临时 SQLite 的 `npm run smoke`、`git diff --check` 通过；入口专项检查新增 file 协议不可达诊断回归。

## 本次项目记忆更新记录

| 日期 | 更新内容 |
| --- | --- |
| 2026-07-03 | 新增项目记忆体系；明确当前状态、权威文档、更新规则、风险与交接验证路径。 |
| 2026-07-10 | 实现 LLM Provider MVP fallback：真实 provider 缺配置、超时、上游错误、非法/空回复时 `/api/dialogue` 默认降级为完整 `dialogue.v1` stub；新增 fake endpoint 自动检查。 |
| 2026-07-10 | 统一 LLM resolved model：显式 model 优先，否则使用 provider default；DeepSeek 默认改为 `deepseek-v4-flash` 并完成 1 次项目内真实 `/api/dialogue` 验证。 |
| 2026-07-10 | 完成 P2 TTS×VRM 表现层接线：动态桥接 active renderer expression/lip-sync controller，传递真实 audioSource，修复长音频 timer 提前结束与旧播放回调竞争，并补 120 秒模拟回归。 |
| 2026-07-10 | P2 真实浏览器补测完成短语音场景并确认 audio-driven、五元音变化、表情/动作并行和结束归零；其余长音频/替换/取消/错误场景因浏览器控制额度阻塞，保持待验收且未调参。 |
| 2026-07-10 | 完成 P1A 零费用评测与 Prompt/Persona 基础正确性：客户端 systemPrompt 降为低优先级回复偏好，历史消息恢复真实 role，并以章节/历史预算替代整体字符串裁剪。 |
| 2026-07-14 | 完成 P1B Memory 确定性修复：偏好保留正负谓词，短期消息读取/裁剪/清理按 session + avatar 组合隔离，敏感用户与同轮 assistant 原文不持久化；不改 schema 和 `dialogue.v1`。 |
| 2026-07-14 | 完成 P2 真实 CosyVoice2 浏览器验收：37.12 秒长音频、快速替换、静音取消、上游中断/恢复均通过；现场修复 TTS 独立超时与取消时表现层清理，未调口型参数。 |
| 2026-07-14 | 本地 `npm run dev` 改用 Node 原生 `--env-file-if-exists=.env`；有本地配置时自动加载，无文件时保持 stub/mock 可启动，不引入 dotenv。 |
| 2026-07-14 | 完成 P1C 回复完整性与自然表达收口：默认 max tokens 提升并配置化为 `320`，内部保留安全截断/usage 诊断，Prompt 限制舞台提示、emoji、记忆扩写和永久承诺；公开契约不变。 |
| 2026-07-14 | 记录本地全服务启动现场问题：端口权限、detached CosyVoice 存活、readiness、运行 env、残留父子进程与端口竞态；明确后续 `dev:full + status + stop/restart` 优化方向。 |
| 2026-07-14 | 完成 `demo:start/status/stop`：detached Node supervisor 统一托管 Alice 与 CosyVoice2，真实验证 DeepSeek/WAV，支持幂等启动、PID 指纹停服、状态/日志和再次冷启动。 |
| 2026-07-14 | 修复 Demo 页面历史 `stub/mock` 配置导致的假可用：根据 `/api/providers` 一次性迁移到 ready 的 DeepSeek/CosyVoice，恢复可见回复，并完成连续两轮浏览器 LLM + TTS + 自动播放验收。 |
| 2026-07-14 | 修复默认 Avatar 选择：保留 `alice` id 并绑定截图中的 `girl.vrm + VRMRenderer`，普通/debug/刷新和两轮 DeepSeek×CosyVoice×五元音口型已完成真实浏览器验收。 |
| 2026-07-15 | 新增 CosyVoice2 首音延迟优化：Web TTSService 对 CosyVoice 回复做首段优先分段调度，24 字以内短回复保持单段，25 字以上优先 8–14 字自然首段、无自然停顿时回退 8 字级快速首段；后续段按序预取并保留同一 utterance session；新增 `segmentGapMs`、播放时长感知预取和短首段播放前等待指标；provider 返回 WAV/Base64 timing 和上游首 chunk timing；`cosyvoice:start` 默认等待 endpoint ready 并短合成预热；真实浏览器 16 字短句首音约 `1.97s`，53 字中回复首音约 `5.28s`、完整音频 ready 约 `12.75s`，最终回 idle；Node 探针显示 74 / 95 字分段首音约 `4.9s / 4.4s`；取消、连续替换、静音和 runtime 停止 fallback 已复测；尚未引入 PCM streaming。 |
| 2026-07-22 | 修正 CosyVoice2 分段策略：12 字以内保持单段，13–24 字短回复允许自然首段 / `8–10` 字语义首段，25 字以上支持 `想听` / `陪我` / `然后` 等中文 cue，避免把“声音”“心情”等常见词切断；初始预取为 adaptive，短两段 `first-ready`，三段以上第二段立即 2 路受控预取。真实 Alice `/api/tts` 探针显示 16 字无停顿短句 `9+7` 首音约 `1.68s`、最大 gap 约 `1.76s`，26 字中句 `6+8+12` 首音约 `3.27s`、最大 gap约 `1.13s`，74 / 95 字长句首音约 `4.31s / 4.02s`、最大 gap 约 `1.49s / 2.08s`；短两段并发会牺牲首音，全局 12 字细分会让长回复过碎，因此均未作为默认。剩余瓶颈是本机 CosyVoice2 推理速度与 FastAPI 非真实可消费 streaming，非浏览器解码或 WAV/Base64 包装。 |
| 2026-07-22 | 完成 P1D 最终表达收口：克制波浪号，记忆确认只说明实际当前记忆；新增默认关闭、production 禁用的五字段安全评测诊断。4 轮 DeepSeek 抽样全部 `llm_only`、`finishReason=stop`、无截断/fallback，P1 可以结束。 |
| 2026-07-23 | 完成 P3 Dialogue 可观测性收口：兼容 `meta.trace` 增加 requestId、编排耗时与 LLM 耗时；专项脱敏日志覆盖成功/fallback/失败，HTTP 错误 requestId 进入 `AppError`，Web Debug 明确展示真实 provider 或“provider/model → stub”；不改变 `dialogue.v1`。 |
| 2026-07-23 | 完成 P2 扩展验收：默认 Alice 通过 99.48 秒真实 CosyVoice2、连续两轮和自然结束；按视觉反馈改为 U/O 保守口型、最大 influence 0.22，warm/curious 不再叠加露齿笑；段间 gap 数据转入 P5。 |
| 2026-07-24 | 完成正式 Demo 入口与 10 轮真实体验验收：girl.vrm / DeepSeek / CosyVoice2 在正常入口强制采用 ready 默认；收口 distress 情绪误判、结束态表情残留和露齿 happy morph；记录长期记忆、连续性、表达联动、受控 fallback 与 TTS gap 证据。 |
| 2026-07-27 | 完成 Alice 即时对话行为微调：当前轮要求高于 Persona 主动性，固定禁止建议/追问/转题/过度安慰、历史承接和建议恢复；12 轮真实 DeepSeek 全部 `llm_only`，公开契约不变。 |
| 2026-07-28 | 完成 P5 CosyVoice2 连续播放收口：证实官方 FastAPI 非模型级 true streaming，拒绝当前吞吐不足的 PCM 方案；采用平衡分段、2 路预取和 5 秒有界缓冲，真实浏览器最大 gap 从 `6271ms` 降至 `236ms`。 |
| 2026-07-31 | 复核 TTS 首音、CPU 调度与其他 provider：拒绝会带回 gap / 长尾的调参，将 CosyVoice 单服务和 Demo 冷启动默认等待提升到约 5 分钟；OpenAI / MiniMax / Higgs 继续留在实验层。 |
| 2026-08-03 | 完成产品与技术全面审核：项目阶段调整为“本地可测试 MVP、产品价值验证前”；下一优先级收敛单一入口、完成 10 人测试和 7 天实际复访，不再扩张 Provider、Agent、RAG、动作或移动端。 |
| 2026-08-03 | 完成普通用户单一 Alice 入口：首次记忆同意默认关闭，一次点击进入对话，普通入口隐藏开发设置和进阶控件，保留显式 Debug/QA 入口；点击、加载、错误和状态文案统一为日常 Persona。 |
| 2026-08-10 | 收口普通入口无法打开问题：修复 ES Module 内 `file://` 提示永远不可达的设计缺陷，并定位/清除 macOS DeepSeek 旧 DNS 缓存；完整 Demo 重新通过 girl.vrm、真实 DeepSeek 和真实 CosyVoice2 readiness。 |
