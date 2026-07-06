# AGENTS.md

最后更新：2026-07-03

这是所有 Coding Agent 进入 Alice 项目后的第一阅读入口。目标是在 10 分钟内理解项目是什么、当前做到哪里、怎么运行、哪些边界不能破坏、下一步从哪里开始。

## 项目定位

Alice 是一个 AI digital companion / interactive avatar 项目，不是普通聊天框。当前主线是本地 MVP + 可演进架构：

- Web 端：HTML / CSS / Vanilla JS + Three.js，提供 3D/VRM Avatar、交互、调试和设置面板。
- Backend：Node HTTP 服务，统一承接 Dialogue、Memory、RAG、TTS、provider readiness、安全边界。
- TTS：当前公开主线是 `mock` + `cosyvoice`，真实服务由后端接 CosyVoice2 官方 FastAPI runtime。
- VRM：Web 已有 renderer adapter 边界，业务层只消费 `AvatarDirective` 语义，不绑定 VRM/FBX 细节。

## 仓库结构速览

```text
index.html                  # Web 入口
css/                        # Web 样式
js/                         # Web 应用、Avatar、动画、对话、TTS、UI、状态
backend/                    # Node 后端、API routes、services、SQLite、TTS providers
public/avatars/             # 正式 Avatar registry / manifest / VRM 资源
public/models/              # 正式 Web 模型、动画、环境资源
assets/                     # 本地/测试 Avatar 与 motion 资源，部分仅 debug/QA 用
data/knowledge/             # 本地 RAG 知识源
scripts/                    # 自动检查、smoke、CosyVoice、VRM QA 脚本
docs/                       # 权威文档、架构、契约、handoff、项目记忆
archive/                    # 历史配置/脚本，不应被新代码直接引用
```

## 第一阅读顺序

1. `AGENTS.md`
2. `docs/project-memory/README.md`
3. `docs/project-memory/CURRENT_STATUS.md`
4. `docs/contracts/DIALOGUE_CONTRACT.md`
5. 按任务选择：
   - Web / 架构：`docs/architecture/ARCHITECTURE.md`
   - API：`docs/api/API_CONTRACT.md`
   - Avatar / VRM：`docs/architecture/VRM_RENDERER_MVP.md`
   - 表现层：`docs/avatar/AVATAR_PRESENTATION_CONTRACT.md`
   - TTS：`docs/guides/LOCAL_TTS.md`
   - CosyVoice2：`docs/guides/COSYVOICE_RUNTIME.md`
6. 改代码前再读对应源码目录和 `docs/project-memory/AGENT_HANDOFF_CHECKLIST.md`。

较大改动前还必须在 `docs/project-memory/README.md` 的“既有长期文档资产地图”中检查相关历史决策、阶段记录、重构说明和风险说明。历史文档只能帮助理解背景，不能覆盖当前源码、当前 API 契约和当前权威文档。

## 运行与验证

常用命令：

```bash
npm run dev
npm run check
npm run smoke
npm run check:dialogue-contract
npm run check:tts-provider-flow
npm run check:vrm-renderer-flow
```

CosyVoice2 真实服务是可选外部运行时：

```bash
npm run check:cosyvoice-runtime
npm run cosyvoice:start
npm run check:cosyvoice-live
npm run cosyvoice:stop
```

没有本地模型、Python 环境或 `COSYVOICE_BASE_URL` 时，CosyVoice live 检查可能跳过或失败；这通常是环境问题，不等于 Alice 主链路坏了。

## 关键边界

- 不在前端、manifest 或文档示例中提交真实 API Key、token、webhook secret、账号、证书或私有部署信息。
- `/api/dialogue` 是主对话入口，`/api/chat` 只是旧兼容入口。
- Web 表现层优先消费 `dialogue.v1` 语义：`reply_text`、`companion_state`、`emotion`、`tone`、`avatar_directive`、`memory_event`、`tts`。
- 后端业务层不得返回 `fbxPath`、`animationFile`、`vrmExpressionPreset`、`boneName`、Rive input 等 renderer-specific 字段。
- 业务层不得绑定具体模型格式。GLB、VRM、FBX、VRMA、Rive 等只能在表现层/renderer adapter 中处理。
- Memory / RAG / n8n / provider secret 只在后端边界内；前端只传非敏感选项。
- `assets/avatars/test-vrm/` 和 `assets/motions/` 是 debug/QA 资源，不能自动加入正式 registry 或产品动作映射。
- `archive/` 是历史参考，新代码不得依赖。
- `docs/mobile-handoff/` 是已有移动端交接资料，本轮不是重点；不要为了 Web 项目整理去改移动端方案。

## 修改模块时同步更新

| 修改内容 | 必须同步检查/更新 |
| --- | --- |
| 项目状态、阶段、下一步 | `docs/project-memory/CURRENT_STATUS.md` |
| 架构边界、目录职责 | `docs/project-memory/README.md`、相关 `docs/architecture/*` |
| `/api/dialogue` 字段 | `docs/contracts/DIALOGUE_CONTRACT.md`、`docs/api/API_CONTRACT.md` |
| TTS provider / Audio Result | `docs/guides/LOCAL_TTS.md`、`docs/api/API_CONTRACT.md` |
| CosyVoice2 runtime | `docs/guides/COSYVOICE_RUNTIME.md` |
| Avatar / VRM / motion | `docs/architecture/VRM_RENDERER_MVP.md`、`docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| 重大技术选择 | `docs/project-memory/DECISION_LOG.md` |
| 新风险、待验证项 | `docs/project-memory/RISKS_AND_TODO.md` |

小修复不需要写长篇文档，但不能让核心状态、契约、运行方式长期落后于代码。

## 当前最高优先级

1. 保持当前 Web / Backend / Dialogue / TTS / VRM 契约一致。
2. 继续强化 Alice Core：记忆、人格、情绪、语音和 Avatar 表现联动。
3. 对 CosyVoice2 和 VRM motion 做可重复验证，区分环境问题和代码问题。
4. 维护项目记忆，避免后续 Agent 依赖聊天上下文或误读历史文档。

## 已知风险

- CosyVoice2 live 验证依赖本地 Python runtime、模型权重、speaker 和端口配置。
- VRM 外部动作和 Mixamo/FBX retarget 不能默认认为兼容，需要视觉 QA。
- 当前 API auth 是单 token 基线，不是完整用户登录系统。
- 部分早期文档是阶段性历史记录，应通过 `docs/project-memory/README.md` 找最新权威来源。
- 旧规划、旧验收和旧重构说明不能直接当作已完成能力；先查 `CURRENT_STATUS.md`、当前源码和对应权威文档。
