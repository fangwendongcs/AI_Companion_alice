# Current Status

最后更新：2026-07-10

## 当前阶段

Alice 当前处在“网页端本地 MVP + 后端契约收口 + Web VRMRenderer / TTS Runtime 演进”阶段。

已经确认的主线：

- Web 端可运行本地 Avatar / Dialogue / Memory / TTS / Debug 体验。
- 后端是所有 LLM、Memory、RAG、n8n、TTS provider 和 secret 的边界。
- `/api/dialogue` 是主对话入口，并已提供 `dialogue.v1` 语义字段供 Web 表现层消费。
- LLM 已支持后端 OpenAI-compatible `openai` / `qwen` / `deepseek` / `custom`；真实 provider 失败时，`/api/dialogue` 默认安全降级到完整 `dialogue.v1` stub 回复。
- P1A 已收口 Prompt/Persona 基础正确性：后端控制不可覆盖规则和 Persona，Web `systemPrompt` 只作为低优先级回复偏好，短期历史保持原始 `user` / `assistant` role。
- TTS 当前公开主线是 `mock` 和 `cosyvoice`；其他 provider adapter 可留在后端实验层，但不进入 Web Settings 公开选择。
- VRMRenderer 已进入 Web MVP：业务层输出 `AvatarDirective`，Renderer 负责表达、眨眼、基础 lip-sync；P2 已修复表现编排器 noop 接线并让后端音频振幅真正进入当前 VRM controller。

## 已完成能力

| 能力 | 状态 | 权威入口 |
| --- | --- | --- |
| Web 本地运行 | 可用 | `README.md`、`docs/guides/DEVELOPMENT_GUIDE.md` |
| Avatar registry / manifest | 可用 | `public/avatars/registry.json`、`docs/architecture/AVATAR_ARCHITECTURE.md` |
| Alice / Shiro / Wambo | 可用 | `public/avatars/*/manifest.json` |
| `/api/dialogue` 主链路 | 可用 | `docs/contracts/DIALOGUE_CONTRACT.md` |
| LLM Provider MVP | 可用；DeepSeek `deepseek-v4-flash` 已通过项目内 live 验证 | `backend/services/LLMService.js`、`docs/api/API_CONTRACT.md` |
| `dialogue.v1` 语义契约 | 可用 | `backend/contracts/dialogueContract.js` |
| SQLite-backed Memory | 可用 | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` |
| Persona / Affect | 可用 | `backend/config/avatarPersonas.js`、`backend/services/CompanionAffectService.js` |
| P1A 对话质量逻辑基线 | 可用；零真实费用 | `docs/product/DIALOGUE_QUALITY_BASELINE.md`、`scripts/check-dialogue-quality-logic.mjs` |
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
| TTS | 保持 Mock 稳定；CosyVoice2 runtime 前置已通过，真实听感/延迟与 30–120 秒浏览器播放仍需验证。 |
| VRM | 手动浏览器 QA Shiro / Wambo / local girl test，重点观察真实长音频口型、表情和动作结束清理；外部动作只走 QA gate。 |
| Memory / Persona | P1A Prompt/Persona 基础正确性已完成；下一步进入 P1B Memory 否定极性、修正/遗忘、avatar 隔离和敏感短期持久化策略。 |
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
- P1A 只证明 Prompt 权限、message role、预算裁剪和契约生命周期正确；真实中文自然度、共情、模板化和多轮 Persona 稳定性仍需后续受控 live 评测。

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

## 本次项目记忆更新记录

| 日期 | 更新内容 |
| --- | --- |
| 2026-07-03 | 新增项目记忆体系；明确当前状态、权威文档、更新规则、风险与交接验证路径。 |
| 2026-07-10 | 实现 LLM Provider MVP fallback：真实 provider 缺配置、超时、上游错误、非法/空回复时 `/api/dialogue` 默认降级为完整 `dialogue.v1` stub；新增 fake endpoint 自动检查。 |
| 2026-07-10 | 统一 LLM resolved model：显式 model 优先，否则使用 provider default；DeepSeek 默认改为 `deepseek-v4-flash` 并完成 1 次项目内真实 `/api/dialogue` 验证。 |
| 2026-07-10 | 完成 P2 TTS×VRM 表现层接线：动态桥接 active renderer expression/lip-sync controller，传递真实 audioSource，修复长音频 timer 提前结束与旧播放回调竞争，并补 120 秒模拟回归。 |
| 2026-07-10 | P2 真实浏览器补测完成短语音场景并确认 audio-driven、五元音变化、表情/动作并行和结束归零；其余长音频/替换/取消/错误场景因浏览器控制额度阻塞，保持待验收且未调参。 |
| 2026-07-10 | 完成 P1A 零费用评测与 Prompt/Persona 基础正确性：客户端 systemPrompt 降为低优先级回复偏好，历史消息恢复真实 role，并以章节/历史预算替代整体字符串裁剪。 |
