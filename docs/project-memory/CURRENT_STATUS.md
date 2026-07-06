# Current Status

最后更新：2026-07-03

## 当前阶段

Alice 当前处在“网页端本地 MVP + 后端契约收口 + Web VRMRenderer / TTS Runtime 演进”阶段。

已经确认的主线：

- Web 端可运行本地 Avatar / Dialogue / Memory / TTS / Debug 体验。
- 后端是所有 LLM、Memory、RAG、n8n、TTS provider 和 secret 的边界。
- `/api/dialogue` 是主对话入口，并已提供 `dialogue.v1` 语义字段供 Web 表现层消费。
- TTS 当前公开主线是 `mock` 和 `cosyvoice`；其他 provider adapter 可留在后端实验层，但不进入 Web Settings 公开选择。
- VRMRenderer 已进入 Web MVP：业务层输出 `AvatarDirective`，Renderer 负责表达、眨眼、基础 lip-sync 和安全 no-op。

## 已完成能力

| 能力 | 状态 | 权威入口 |
| --- | --- | --- |
| Web 本地运行 | 可用 | `README.md`、`docs/guides/DEVELOPMENT_GUIDE.md` |
| Avatar registry / manifest | 可用 | `public/avatars/registry.json`、`docs/architecture/AVATAR_ARCHITECTURE.md` |
| Alice / Shiro / Wambo | 可用 | `public/avatars/*/manifest.json` |
| `/api/dialogue` 主链路 | 可用 | `docs/contracts/DIALOGUE_CONTRACT.md` |
| `dialogue.v1` 语义契约 | 可用 | `backend/contracts/dialogueContract.js` |
| SQLite-backed Memory | 可用 | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` |
| Persona / Affect | 可用 | `backend/config/avatarPersonas.js`、`backend/services/CompanionAffectService.js` |
| Local RAG | 可用 | `docs/guides/KNOWLEDGE_GUIDE.md` |
| n8n Workflow 边界 | 可选 | `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md` |
| TTS Audio Result | 可用 | `docs/guides/LOCAL_TTS.md` |
| Mock TTS | 可用 | `backend/services/tts/providers/MockTTSProvider.js` |
| CosyVoice2 adapter | 已接入，真实服务需本地 runtime | `docs/guides/COSYVOICE_RUNTIME.md` |
| VRMRenderer MVP | 可用，视觉 QA 仍需手动 | `docs/architecture/VRM_RENDERER_MVP.md` |
| Avatar Presentation 分层 | 部分完成 | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 部署安全基线 | baseline | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` |

## 进行中 / 下一阶段

| 方向 | 当前下一步 |
| --- | --- |
| Project Memory | 后续每次阶段性变更维护 `docs/project-memory/*`，避免聊天记录成为唯一上下文。 |
| TTS | 保持 Mock 稳定；CosyVoice2 真实听感/延迟需要本地 runtime 验证。 |
| VRM | 手动浏览器 QA Shiro / Wambo / local girl test；外部动作只走 QA gate，不直接产品化。 |
| Memory / Persona | 继续打磨中文陪伴连续性、长期记忆可解释和清理体验。 |
| Security | 公网前仍需正式鉴权、域名、HTTPS、secret manager 和部署平台策略。 |

## 当前风险摘要

- CosyVoice2 live 依赖外部模型/运行时，不能被普通 `npm run check` 完全覆盖。
- VRM motion / FBX retarget 质量不能只靠自动脚本证明，需要视觉 QA。
- `docs/mobile-handoff/` 是已有移动端交接资料，本轮不是重点；Web 项目当前权威以 `docs/project-memory/`、`docs/contracts/`、`docs/architecture/` 为准。
- 单 token API auth 是部署前 baseline，不是完整公开产品鉴权方案。
- Alice 自有模型/素材的商业授权仍需在正式分发前复核。

## 最近验证

2026-07-03 本轮文档整理后已执行：

- `git diff --check`：通过。
- Markdown 相对链接检查：通过。
- `npm run check:dialogue-contract`：通过。
- `npm run check:tts-provider-flow`：通过。
- `npm run check:vrm-renderer-flow`：通过；本地 `local_alice_vrm_test`、`local_boy_vrm_test`、`local_girl_vrm_test` 均可被脚本审计。

未执行 `npm run check` 全量回归，也未启动浏览器手动验收。

## 本次项目记忆更新记录

| 日期 | 更新内容 |
| --- | --- |
| 2026-07-03 | 新增项目记忆体系；明确当前状态、权威文档、更新规则、风险与交接验证路径。 |
