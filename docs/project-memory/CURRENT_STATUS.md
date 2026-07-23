# Current Status

最后更新：2026-07-23

## 当前阶段

Alice 当前处在“网页端本地 MVP + 后端契约收口 + Web VRMRenderer / TTS Runtime 演进”阶段。

已经确认的主线：

- Web 端可运行本地 Avatar / Dialogue / Memory / TTS / Debug 体验。
- 后端是所有 LLM、Memory、RAG、n8n、TTS provider 和 secret 的边界。
- `/api/dialogue` 是主对话入口，并已提供 `dialogue.v1` 语义字段供 Web 表现层消费。
- LLM 已支持后端 OpenAI-compatible `openai` / `qwen` / `deepseek` / `custom`；真实 provider 失败时，`/api/dialogue` 默认安全降级到完整 `dialogue.v1` stub 回复。
- 本地 `npm run dev` 使用 Node 原生 `--env-file-if-exists=.env`：存在本地忽略配置时自动加载，不存在时仍可用 stub/mock 启动。
- 完整本地 Demo 已提供 `demo:start/status/stop`：Node supervisor 统一托管 Alice 与 CosyVoice2，并以真实 DeepSeek 回复和有效 WAV 作为 ready 标准。
- Web 会在后端 DeepSeek / CosyVoice 真实 ready 时一次性迁移历史 `stub` / `mock` 默认，并在页面显示当前 Alice 回复；用户之后的明确 provider 选择继续保留。
- P1A 已收口 Prompt/Persona 基础正确性：后端控制不可覆盖规则和 Persona，Web `systemPrompt` 只作为低优先级回复偏好，短期历史保持原始 `user` / `assistant` role。
- P1B 已收口 Memory 确定性问题：偏好保留否定极性，写入指令与召回问句分离，短期消息按 `sessionId + avatarId` 隔离，敏感用户轮次及 assistant 同轮回复不进入 SQLite。
- P1C 已将 LLM 回复上限配置化为 `LLM_MAX_TOKENS`（默认 `320`），内部保留安全 finish reason / token usage 诊断，并收口舞台提示、emoji 和记忆确认表达边界。
- P1D 已收口波浪号与记忆确认措辞，并提供默认关闭、production 强制关闭的五字段安全评测诊断；4 轮 DeepSeek 抽样全部 `llm_only`、无截断、无 fallback，P1 对话质量阶段可以正式结束。
- P3 已收口 Dialogue 可观测链路：`meta.trace` 贯通 `X-Request-ID`、编排耗时和 LLM 耗时；成功、fallback、未降级失败都有固定字段脱敏日志，Web Debug 面板显示 provider/model/mode/requestId/耗时/fallback/errorCode。
- TTS 当前公开主线是 `mock` 和 `cosyvoice`；其他 provider adapter 可留在后端实验层，但不进入 Web Settings 公开选择。
- CosyVoice2 已在 Web `TTSService` 内启用首段优先分段调度：仍复用 `/api/tts` 完整 WAV/Base64 Audio Result，不是 PCM streaming；中间段不会触发 idle 收敛。2026-07-22 当前策略为：12 字以内单段；13–24 字短回复允许自然首段或约 `8–10` 字语义首段；25 字以上优先 8–14 字自然首段或 `想听` / `陪我` / `然后` 等中文 cue，避免切断“声音”“心情”等常见词；初始预取采用 adaptive，短两段 `first-ready`，三段以上第二段立即进入 2 路受控预取，后续按播放时长窗口补齐。真实 Alice `/api/tts` objective 探针显示：16 字无自然停顿短句为 `9+7`，首音约 `1.68s`、最大 gap 约 `1.76s`；26 字中句为 `6+8+12`，首音约 `3.27s`、最大 gap 约 `1.13s`；74 / 95 字长句首音约 `4.31s / 4.02s`，最大 gap 约 `1.49s / 2.08s`。额外验证显示：短两段强制并发可把 gap 压到 `2ms`，但首音会退到 `3.15–3.76s`；全局 12 字细分可压低 26 字 gap，但 74 / 95 字会因段数过多和本机推理抖动出现更大空洞。结论：分段调度已能避免“长回复等完整音频”，但当前 macOS 本地 CosyVoice2 FastAPI/WAV/Base64 链路仍不能稳定保证全部段间空洞低于 `300–500ms`。`cosyvoice:start` 会等待 endpoint ready 并完成一次短合成预热，避免首个用户请求承担 runtime 冷启动。
- VRMRenderer 已进入 Web MVP：业务层输出 `AvatarDirective`，Renderer 负责表达、眨眼、基础 lip-sync；P2 已完成真实 CosyVoice2 浏览器验收，含 99.48 秒真实音频、连续两轮、快速替换、静音取消与上游中断恢复。口型按近景反馈收敛为 U/O 轻量开合，硬上限 `0.22`，常见 warm/curious 不再叠加露齿 happy 表情。
- 普通 Demo 与 debug 页的默认 `alice` 已统一指向历史 TTS×VRM 验证模型 `assets/avatars/test-vrm/girl.vrm`，保留 `alice` 身份与 localStorage 兼容，并强制使用 `VRMRenderer`。

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
| P1A–P1D 对话质量基线 | 可用；自动检查零真实费用，P1D 真实抽样已通过 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`scripts/check-dialogue-quality-logic.mjs` |
| P3 Dialogue 可观测性 | 可用；requestId、LLM/编排耗时、fallback/error 日志与 Web Debug 已贯通 | `scripts/check-dialogue-observability.mjs`、`docs/api/API_CONTRACT.md` |
| Local RAG | 可用 | `docs/guides/KNOWLEDGE_GUIDE.md` |
| n8n Workflow 边界 | 可选 | `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md` |
| TTS Audio Result | 可用 | `docs/guides/LOCAL_TTS.md` |
| Mock TTS | 可用 | `backend/services/tts/providers/MockTTSProvider.js` |
| CosyVoice2 adapter | 已接入，真实服务需本地 runtime | `docs/guides/COSYVOICE_RUNTIME.md` |
| VRMRenderer MVP | 可用；TTS 振幅接线、保守口型与 99.48 秒真实 CosyVoice2 视觉 QA 已完成 | `docs/architecture/VRM_RENDERER_MVP.md` |
| Avatar Presentation 分层 | MVP 接线已收口 | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 部署安全基线 | baseline | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` |

## 进行中 / 下一阶段

| 方向 | 当前下一步 |
| --- | --- |
| Project Memory | 后续每次阶段性变更维护 `docs/project-memory/*`，避免聊天记录成为唯一上下文。 |
| Demo Runtime | macOS 本机完整启停已验收；后续仅在需要跨平台时补 Windows 进程管理。 |
| TTS | 保持 Mock 稳定；CosyVoice2 已通过 99.48 秒真实浏览器播放和连续两轮，长回复启用首段优先分段调度，TTS 独立上游超时默认 90 秒；17 次 underrun / 最大 6.088 秒 gap 留给 P5 决策。 |
| VRM | 默认 Alice 已完成 99.48 秒真实音频、连续两轮、替换/取消/恢复和保守口型近景 QA；Shiro / Wambo 及未来模型替换仍需单独视觉验收。 |
| Memory / Persona | P1A–P1D 已完成：Prompt/Persona、Memory 确定性、回复完整性和最终表达边界均已自动回归并通过真实抽样。 |
| Observability | P3 已完成当前单实例闭环；后续真实部署时再评估集中式日志、指标存储与跨服务 tracing。 |
| Security | 公网前仍需正式鉴权、域名、HTTPS、secret manager 和部署平台策略。 |
| LLM Provider | 后续用真实 Key 验证 OpenAI / Qwen；DeepSeek 默认 `deepseek-v4-flash` 已完成项目内 `/api/dialogue` live 验证。 |

## 当前风险摘要

- CosyVoice2 live 依赖外部模型/运行时，不能被普通 `npm run check` 完全覆盖。
- 默认 Alice 的真实 CosyVoice2 长音频和视觉同步已通过 99.48 秒浏览器验收；其他 Avatar 仍不能只靠自动化证明口型观感。
- VRM motion / FBX retarget 质量不能只靠自动脚本证明，需要视觉 QA。
- `docs/mobile-handoff/` 是已有移动端交接资料，本轮不是重点；Web 项目当前权威以 `docs/project-memory/`、`docs/contracts/`、`docs/architecture/` 为准。
- 单 token API auth 是部署前 baseline，不是完整公开产品鉴权方案。
- Alice 自有模型/素材的商业授权仍需在正式分发前复核。
- OpenAI / Qwen 的真实返回细节仍需在各自真实 Key 环境中验证；DeepSeek `deepseek-v4-pro` 目前只有 fake endpoint 覆盖，尚未产生额外 live 费用。
- 首次 10 轮 DeepSeek 基线的截断已在 P1C 同集复测中降为 0；P1D 4 轮抽样继续保持 `finishReason=stop`、`truncated=false`，当前无明确回复完整性回归。
- P1B 不自动删除旧 SQLite 中可能已存在的敏感历史行；新写入已阻断，检测到的旧敏感记录不会进入活动上下文，旧库清理应由用户显式执行。
- P2 已补齐 99.48 秒真实音频与连续两轮；受控长音频的 36 段生成出现 17 次 underrun，最大 gap `6.088s`，说明 P5 应优先评估本机推理吞吐、分段策略或真正的 PCM streaming，而不是继续增加口型复杂度。
- 新的 adaptive 分段调度已用自动化、真实 Alice `/api/tts` 探针和浏览器补充验证；Node probe 仍用于稳定复查首音、`segmentGapMs` 和预取策略，99.48 秒浏览器结果则作为真实视觉/生命周期证据。
- Demo supervisor 的 PID 指纹与 signal 管理当前以 macOS / Linux 为基线，Windows 尚未实现或验收。
- P3 当前是单实例 requestId + 结构化日志 + Web Debug 基线，不包含集中式日志平台、持久化指标、Sentry/OpenTelemetry 或跨服务 trace。

## 最近验证

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
