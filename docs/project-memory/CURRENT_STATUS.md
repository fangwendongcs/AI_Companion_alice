# Current Status

最后更新：2026-07-14

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
- TTS 当前公开主线是 `mock` 和 `cosyvoice`；其他 provider adapter 可留在后端实验层，但不进入 Web Settings 公开选择。
- VRMRenderer 已进入 Web MVP：业务层输出 `AvatarDirective`，Renderer 负责表达、眨眼、基础 lip-sync；P2 已完成真实 CosyVoice2 浏览器验收，含 37.12 秒长音频、快速替换、静音取消与上游中断恢复。

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
| P1A/P1C 对话质量逻辑基线 | 可用；零真实费用 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`scripts/check-dialogue-quality-logic.mjs` |
| Local RAG | 可用 | `docs/guides/KNOWLEDGE_GUIDE.md` |
| n8n Workflow 边界 | 可选 | `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md` |
| TTS Audio Result | 可用 | `docs/guides/LOCAL_TTS.md` |
| Mock TTS | 可用 | `backend/services/tts/providers/MockTTSProvider.js` |
| CosyVoice2 adapter | 已接入，真实服务需本地 runtime | `docs/guides/COSYVOICE_RUNTIME.md` |
| VRMRenderer MVP | 可用；TTS 振幅接线已修复，真实 CosyVoice2 视觉 QA 仍需手动 | `docs/architecture/VRM_RENDERER_MVP.md` |
| Avatar Presentation 分层 | MVP 接线已收口 | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 部署安全基线 | baseline | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` |

## 进行中 / 下一阶段

| 方向 | 当前下一步 |
| --- | --- |
| Project Memory | 后续每次阶段性变更维护 `docs/project-memory/*`，避免聊天记录成为唯一上下文。 |
| Demo Runtime | macOS 本机完整启停已验收；后续仅在需要跨平台时补 Windows 进程管理。 |
| TTS | 保持 Mock 稳定；CosyVoice2 已通过 6.64 秒与 37.12 秒真实浏览器播放，TTS 独立上游超时默认 90 秒。 |
| VRM | `local_girl_vrm_test` 已完成真实长/短音频、快速替换、静音取消和中断恢复 QA；Shiro / Wambo 及 60–120 秒更长音频仍是后续扩展验收。 |
| Memory / Persona | P1B 确定性修复与首次 10 轮真实基线已完成；P1C 先收口回复完整性和表达边界，后续需用同一评测集受控复测。 |
| Security | 公网前仍需正式鉴权、域名、HTTPS、secret manager 和部署平台策略。 |
| LLM Provider | 后续用真实 Key 验证 OpenAI / Qwen；DeepSeek 默认 `deepseek-v4-flash` 已完成项目内 `/api/dialogue` live 验证。 |

## 当前风险摘要

- CosyVoice2 live 依赖外部模型/运行时，不能被普通 `npm run check` 完全覆盖。
- 真实 CosyVoice2 长音频的振幅分布和视觉同步仍需浏览器验收；自动化只证明接线、数值稳定与生命周期清理。
- VRM motion / FBX retarget 质量不能只靠自动脚本证明，需要视觉 QA。
- `docs/mobile-handoff/` 是已有移动端交接资料，本轮不是重点；Web 项目当前权威以 `docs/project-memory/`、`docs/contracts/`、`docs/architecture/` 为准。
- 单 token API auth 是部署前 baseline，不是完整公开产品鉴权方案。
- Alice 自有模型/素材的商业授权仍需在正式分发前复核。
- OpenAI / Qwen 的真实返回细节仍需在各自真实 Key 环境中验证；DeepSeek `deepseek-v4-pro` 目前只有 fake endpoint 覆盖，尚未产生额外 live 费用。
- 首次 10 轮 DeepSeek 基线出现 3 次明确截断和 1 次疑似截断；P1C 已把默认上限从 `200` 提高到 `320` 并补内部诊断，但真实改善幅度仍需后续同集复测。
- P1B 不自动删除旧 SQLite 中可能已存在的敏感历史行；新写入已阻断，检测到的旧敏感记录不会进入活动上下文，旧库清理应由用户显式执行。
- P2 本轮的真实长音频是 37.12 秒；60–120 秒真实生成及长时间视觉同步仍未覆盖，且本机生成首帧等待可达 58.4 秒。
- Demo supervisor 的 PID 指纹与 signal 管理当前以 macOS / Linux 为基线，Windows 尚未实现或验收。

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
