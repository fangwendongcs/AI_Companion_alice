# Project Memory

最后更新：2026-07-24

这是 Alice 项目的长期记忆导航页。它不是又一份长 README，而是“单一事实来源”的入口：新 Agent 先从这里找到当前状态、权威文档、历史决策和下一步，不再依赖聊天记录。

## 当前一句话

Alice 是一个 AI digital companion / interactive avatar 原型：当前仓库主线是 Web 端 Three.js / VRM Avatar 体验 + Node Backend。Backend 提供 `/api/dialogue`、Memory、RAG、TTS、provider readiness 和安全边界；Web 负责 Avatar 展示、交互、调试和设置面板。

## 当前状态入口

- 当前状态与下一步：[CURRENT_STATUS.md](./CURRENT_STATUS.md)
- 重大决策记录：[DECISION_LOG.md](./DECISION_LOG.md)
- 风险与待验证项：[RISKS_AND_TODO.md](./RISKS_AND_TODO.md)
- Agent 交接与验证清单：[AGENT_HANDOFF_CHECKLIST.md](./AGENT_HANDOFF_CHECKLIST.md)
- 本轮文档审计：[DOCUMENT_AUDIT.md](./DOCUMENT_AUDIT.md)

## 权威来源地图

| 主题 | 最新权威来源 | 辅助来源 |
| --- | --- | --- |
| 项目愿景与产品定位 | `README.md`、`docs/product/PROJECT_SHOWCASE.md` | `docs/product/PHASE5_COMPANION_EXPERIENCE.md` |
| 当前状态 | `docs/project-memory/CURRENT_STATUS.md` | `README.md` |
| 总体架构 | `docs/architecture/ARCHITECTURE.md` | `docs/architecture/MODULE_BOUNDARIES.md` |
| Dialogue 语义契约 | `docs/contracts/DIALOGUE_CONTRACT.md` | `backend/contracts/dialogueContract.js`、`docs/api/API_CONTRACT.md` |
| API 总契约 | `docs/api/API_CONTRACT.md` | `docs/api/API.md` |
| Memory | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` | `backend/services/MemoryService.js`、`backend/db/schema.sql` |
| Persona / Affect | `backend/config/avatarPersonas.js`、`backend/services/CompanionAffectService.js` | `docs/product/PHASE5_COMPANION_EXPERIENCE.md` |
| TTS Runtime | `docs/guides/LOCAL_TTS.md` | `docs/guides/COSYVOICE_RUNTIME.md`、`backend/services/tts/*` |
| Avatar / VRM | `docs/architecture/VRM_RENDERER_MVP.md` | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` |
| VRM Motion | `docs/architecture/VRM_MOTION_READINESS.md` | `docs/architecture/VRM_MOTION_QUALITY_V1.md` |
| Mobile Handoff 历史资料 | `docs/mobile-handoff/IOS_MIGRATION_SCOPE.md` | 当前不是 Web 项目整理重点 |
| 本地开发 | `docs/guides/DEVELOPMENT_GUIDE.md`、`docs/guides/DEMO_RUNTIME.md` | `package.json`、`scripts/demo/demo-manager.mjs` |
| 配置与 Secret | `.env.example`、`docs/deployment/ENVIRONMENT_MODES.md` | `backend/config/serverConfig.js` |
| 安全边界 | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` | `docs/deployment/DEPLOYMENT_CHECKLIST.md` |

## 既有长期文档资产地图

本节索引本轮之前已经积累的长期记忆资料。原则：原文件保持原位置，`project-memory` 只做导航、状态判断和阅读指引。历史文档用于理解背景，不能覆盖当前代码、当前契约和上方“权威来源地图”。

状态说明：

- `当前权威`：可作为当前事实入口，但仍以源码和自动检查结果为最终验证。
- `历史参考`：记录某阶段结论、验收或曾经的方案，不能直接当成当前实现。
- `待确认`：内容有价值，但可能与当前实现存在时间差，使用前必须回查当前源码/权威文档。

### 当前权威文档

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `README.md` / `README.zh-CN.md` | 项目定位、快速启动、当前 highlights 和关键文档入口 | 当前权威 | 第一次进入仓库、写项目介绍、确认启动方式 | 中；展示性内容可能滞后于细节实现 |
| `AGENTS.md` | Coding Agent 第一入口、边界、验证命令、更新规则 | 当前权威 | 任何改动前 | 低；本文件应随项目记忆维护 |
| `docs/project-memory/CURRENT_STATUS.md` | 当前阶段、已完成能力、风险、最近验证 | 当前权威 | 判断项目做到哪里、下一步从哪开始 | 低；阶段结束后必须更新 |
| `docs/contracts/DIALOGUE_CONTRACT.md` | `/api/dialogue` 语义响应契约、`dialogue.v1` 字段边界 | 当前权威 | 修改 dialogue、AvatarDirective、Web 表现层前 | 低；同时回查 `backend/contracts/dialogueContract.js` |
| `docs/api/API_CONTRACT.md` | 后端 API、鉴权、TTS、Memory、providers 合约总入口 | 当前权威 | 改 API、前端 client、smoke、鉴权前 | 中；实现以 `backend/routes/*` 为准 |
| `docs/architecture/ARCHITECTURE.md` | 系统结构、运行时主流程、模块职责 | 当前权威 | 大范围架构调整前 | 中；部分阶段描述可能早于 VRM/TTS 后续演进 |
| `docs/architecture/MODULE_BOUNDARIES.md` | 模块边界约定 | 当前权威 | 拆模块、判断职责归属前 | 中；需结合当前源码 |
| `docs/architecture/EVENT_FLOW.md` | EventBus / 状态事件流 | 当前权威 | 改 dialogue/audio/animation 状态联动前 | 中；需结合 `js/core/events/eventNames.js` |
| `docs/architecture/STATE_MODEL.md` | CompanionStateStore 分层状态模型 | 当前权威 | 改 Debug Panel、StateStore、状态 patch 前 | 中；需结合 `js/state/CompanionStateStore.js` |
| `docs/guides/DEVELOPMENT_GUIDE.md` | 本地开发、前后端主流程、常见问题 | 当前权威 | 新 Agent 判断项目是否可运行 | 中；脚本以 `package.json` 为准 |
| `docs/guides/CONFIG_GUIDE.md` | 前端配置、角色配置、新增角色流程 | 当前权威 | 改 manifest、配置、角色加载前 | 中；需结合 manifest schema 与 loader |
| `docs/guides/KNOWLEDGE_GUIDE.md` | 本地知识源和 RAG 边界 | 当前权威 | 改 `data/knowledge/`、RAG 检索前 | 低 |

### API、Backend、Memory 与智能链路

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `docs/api/API.md` | API 概览 | 当前权威 | 快速了解接口列表 | 中；细节以 `API_CONTRACT.md` 为准 |
| `docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md` | RAG / Memory / n8n / Agent 后端边界 | 当前权威 | 改智能编排、避免前端直连 secret 前 | 中；以 `DialogueOrchestrationService` 为准 |
| `docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md` | Phase 3 智能能力架构方案 | 历史参考 | 理解为何 `/api/dialogue` 成为主入口 | 中；当前事实看 `API_CONTRACT.md` 与源码 |
| `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md` | SQLite Memory、长期记忆、隐私策略 | 当前权威 | 改 MemoryService、Memory UI、PromptBuilder 前 | 低；实现以 `backend/services/MemoryService.js` 和 `backend/db/schema.sql` 为准 |
| `docs/product/PHASE5_COMPANION_EXPERIENCE.md` | 记忆、人格、连续性体验方向 | 当前权威 | 做陪伴体验、persona、affect 前 | 中；偏产品方向，不能替代 API/源码 |
| `docs/guides/KNOWLEDGE_GUIDE.md` | 本地知识源格式和当前 RAG 能力 | 当前权威 | 加知识文件、调 RAG flow 前 | 低 |

### TTS 与本地语音运行时

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `docs/guides/LOCAL_TTS.md` | Mock / CosyVoice2 provider 策略、Audio Result、验证方式 | 当前权威 | 改 `/api/tts`、Web Settings、TTS provider 前 | 低；实现以 `backend/services/tts/*` 为准 |
| `docs/guides/COSYVOICE_RUNTIME.md` | CosyVoice2 官方 FastAPI 本地运行、模型、speaker、live 验证 | 当前权威 | 启动真实本地 TTS、排查 CosyVoice2 前 | 中；外部 runtime 和模型状态因机器而异 |
| `docs/assets/licenses/MOTION_ASSET_LICENSES.md` | 动作素材授权证据与许可记录 | 当前权威 | 把 motion 资产产品化或公开分发前 | 中；新增素材必须补证据 |

### Avatar、VRM、动作和表现层

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `docs/architecture/AVATAR_ARCHITECTURE.md` | 可替换角色、manifest、动作槽位、新增角色步骤 | 当前权威 | 改 avatar registry / manifest / upload 前 | 中；需结合 `public/avatars/*` |
| `docs/architecture/ANIMATION_ARCHITECTURE.md` | 动画系统、队列、状态机、排查方式 | 当前权威 | 改 MotionManager / AnimationController 前 | 中；需结合当前 `js/animation/*` |
| `docs/architecture/VRM_RENDERER_MVP.md` | VRMRenderer adapter、AvatarDirective 消费、local test model gate | 当前权威 | 改 VRMRenderer、renderer factory、expression/lip-sync 前 | 低 |
| `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` | 表现层边界、Expression/LipSync/Motion/TTS controller 职责 | 当前权威 | 抽表现层、改 lip-sync、audio-driven motion 前 | 低 |
| `docs/architecture/VRM_MOTION_READINESS.md` | 外部 humanoid motion / VRMA / FBX retarget 前置条件和风险 | 当前权威 | 接入外部动作、调 QA mode 前 | 低 |
| `docs/architecture/VRM_MOTION_QUALITY_V1.md` | VRM motion asset gate、QA-only / approved / rejected 边界 | 当前权威 | 判断 motion 是否可产品化前 | 低；视觉结果仍需实测 |
| `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md` | `meta.json` legacy fallback 废弃窗口 | 当前权威 | 改 registry、manifest loader、legacy 兼容前 | 中；日期敏感，2026-08-16 后需复核是否执行移除 |

### 部署、安全和运行边界

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md` | Phase 4 公网前安全基线、已做/未做安全能力 | 当前权威 | 改鉴权、CORS、上传、安全检查前 | 中；安全策略需结合部署环境 |
| `docs/security/DEPLOYMENT_SECURITY.md` | 部署前安全清单 | 当前权威 | 准备 demo / public 部署前 | 中；以 Phase 4 baseline 和 `.env.example` 为准 |
| `docs/deployment/ENVIRONMENT_MODES.md` | local / demo / production 模式和 secret 管理 | 当前权威 | 改环境变量、部署模式前 | 低 |
| `docs/deployment/DEPLOYMENT_CHECKLIST.md` | 部署检查步骤 | 当前权威 | 部署或私有演示前 | 中；未覆盖完整生产系统 |

### 阶段计划、验收和历史基线

这些文档记录“当时做到哪里”和“当时下一步是什么”。它们是理解历史的重要资料，但不能覆盖 `CURRENT_STATUS.md`、当前源码和当前契约。

| 文件路径 | 记录阶段 / 问题 | 状态 | 推荐阅读场景 | 为什么不能直接当当前事实 / 替代入口 |
| --- | --- | --- | --- | --- |
| `docs/product/MVP_ACCEPTANCE.md` | Phase 2 MVP 用户链路验收标准 | 历史参考 | 回查最早 MVP 验收口径 | 后续 Phase 3/5/TTS/VRM 已演进；当前看 `CURRENT_STATUS.md` |
| `docs/product/MVP_BASELINE.md` | Phase 2.9 本地 MVP 封版结论 | 历史参考 | 理解 3D 数字人基本回归链路 | 不含后续 SQLite Memory、dialogue.v1、CosyVoice2、VRMRenderer |
| `docs/reports/DEMO_EXPERIENCE_ACCEPTANCE_20260724.md` | 当前正式 Demo 的 10 轮真实 DeepSeek × CosyVoice2 × girl.vrm 验收 | 当前权威 | 判断入口、角色感、记忆、表达联动、fallback 和延迟实况 | 当前机器实测；不代表公开用户留存或其他 Avatar |
| `docs/product/PHASE3_ACCEPTANCE.md` | Phase 3 智能能力验收标准 | 历史参考 | 回查 Provider/Memory/RAG/n8n/Agent 验收 | 后续接口和 TTS 已变化；当前看 `API_CONTRACT.md` |
| `docs/product/PHASE3_BASELINE.md` | Phase 3.9 智能能力基线封版 | 历史参考 | 理解智能编排为何集中到后端 | 不含后续长期 Memory、dialogue.v1、TTS provider 重构 |
| `docs/process/PHASE3_IMPLEMENTATION_PLAN.md` | Phase 3 分阶段实施计划 | 历史参考 | 查当时实现顺序和取舍 | 计划不是当前事实；当前看对应 baseline / API /源码 |
| `docs/process/NEXT_PHASE_PLAN.md` | Phase 2 到 Phase 7 的滚动路线 | 历史参考 | 理解长期路线和阶段命名 | 旧计划可能已完成或改向；当前下一步看 `CURRENT_STATUS.md` |
| `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md` | 浏览器手动验收清单 | 当前权威 | 做 Web 手动验收、回归点击/TTS/状态链路 | 中；新增 VRM/TTS 项需结合最新专题文档 |
| `docs/process/CODEX_EXECUTION_STANDARD.md` | 早期 Codex 执行标准和输出格式 | 历史参考 | 理解用户偏好的执行/汇报格式 | 根入口已迁到 `AGENTS.md`，以 `AGENTS.md` 为准 |

### 审查、重构和历史决策记录

| 文件路径 | 记录阶段 / 问题 | 状态 | 推荐阅读场景 | 为什么不能直接当当前事实 / 替代入口 |
| --- | --- | --- | --- | --- |
| `docs/reports/PROJECT_REVIEW_REPORT.md` | 2026-05-14/16 项目审查、问题清单、早期结构 | 历史参考 | 查早期问题来源、为什么要拆模块 | 结构和问题状态已变化；当前架构看 `ARCHITECTURE.md` |
| `docs/refactor/REFACTOR_NOTES.md` | 长期实际重构记录和阶段流水 | 历史参考 | 查某次重构为什么发生、改了哪些边界 | 内容长且含旧表述；当前事实看专题权威文档和源码 |
| `docs/refactor/CHANGESET_BOUNDARIES.md` | 历史 changeset 分组与建议提交顺序 | 历史参考 | 查曾经如何拆提交/边界 | 不代表当前未提交 diff；当前先看 `git status` |
| `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md` | `meta.json` legacy fallback 废弃计划 | 当前权威 | 改 manifest/legacy 兼容前 | 日期敏感，需按当前日期和源码复核 |

### 背景资料和待确认资料

| 文件路径 | 文档用途 | 状态 | 推荐阅读场景 | 时间差风险 |
| --- | --- | --- | --- | --- |
| `docs/product/PROJECT_SHOWCASE.md` | 对外展示型项目介绍 | 当前权威 | 写简历/GitHub 展示/项目说明 | 中；展示内容可能滞后于最新技术细节 |
| `docs/product/产品需求文档.docx` | 原始产品需求资料 | 待确认 | 查早期产品设想 | 非 Markdown，可能早于当前实现 |
| `docs/product/思路和计划文档.docx` | 早期思路和计划 | 待确认 | 查背景想法 | 非当前权威 |
| `docs/product/竞品与可行性分析报告.docx` | 竞品和可行性背景 | 待确认 | 查产品背景 | 非当前架构事实 |
| `docs/mobile-handoff/*` | iOS 迁移交接资料 | 历史参考 / 本轮不处理 | 只有当任务明确回到移动端时阅读 | 不能覆盖当前 Web 项目事实；当前 Web 权威看 `project-memory`、`contracts`、`architecture` |

## 按任务查历史上下文

| 任务类型 | 当前权威优先读 | 再查历史 / 背景 |
| --- | --- | --- |
| 改 `/api/dialogue` | `docs/contracts/DIALOGUE_CONTRACT.md`、`docs/api/API_CONTRACT.md` | `docs/product/PHASE3_BASELINE.md`、`docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md` |
| 改 Memory / Persona / Affect | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md`、`docs/product/PHASE5_COMPANION_EXPERIENCE.md` | `docs/process/NEXT_PHASE_PLAN.md` Phase 5 部分 |
| 改 TTS / CosyVoice2 | `docs/guides/LOCAL_TTS.md`、`docs/guides/COSYVOICE_RUNTIME.md` | `docs/refactor/REFACTOR_NOTES.md` 中 TTS 相关记录 |
| 改 Avatar / VRM / motion | `docs/architecture/VRM_RENDERER_MVP.md`、`docs/avatar/AVATAR_PRESENTATION_CONTRACT.md`、`docs/architecture/VRM_MOTION_READINESS.md` | `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md`、`docs/architecture/ANIMATION_ARCHITECTURE.md` |
| 改部署 / 安全 | `docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md`、`docs/deployment/ENVIRONMENT_MODES.md` | `docs/product/PHASE3_BASELINE.md` 当前未包含安全项 |
| 做浏览器验收 | `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md` | `docs/product/MVP_BASELINE.md` |
| 查历史决策原因 | `docs/project-memory/DECISION_LOG.md` | `docs/refactor/REFACTOR_NOTES.md`、`docs/reports/PROJECT_REVIEW_REPORT.md` |

## 模块责任边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| Web App | UI、Avatar 展示、用户交互、调试面板、调用后端 | provider secret、Memory/RAG/n8n 编排、后端 provider 决策 |
| Backend | Dialogue、Memory、RAG、TTS provider、provider readiness、上传/安全边界 | DOM、Three.js 渲染、Web UI 事件 |
| TTS | 统一 Audio Result，当前公开 `mock` / `cosyvoice` | 前端暴露服务地址/密钥、把 provider 私有字段传到业务层 |
| Avatar Renderer | 把 `AvatarDirective` 映射为 Default / VRM 表现 | 决定 persona、memory、emotion、LLM provider |
| MotionManager | Web body motion slot、队列、状态机、fallback | Dialogue policy、TTS provider、renderer-specific expression |
| Docs | 记录当前事实、契约、边界、风险和历史决策 | 替代自动化测试或伪造未验证事实 |

## 运行环境与关键依赖

- Node backend：`npm run dev` 启动 `backend/server.js`，默认端口 `3000`。
- 本地默认 LLM：`stub`，无 Key 可跑主对话链路。
- 本地默认 TTS：`mock`，无外部服务可跑 Audio Result 合约。
- CosyVoice2：可选真实本地 TTS runtime，默认官方 FastAPI 端口 `50000`。
- SQLite：`data/sqlite/alice.db` 是本地 runtime 数据，不应提交。
- Web：通过浏览器打开 `http://localhost:3000`，debug 可用 `?debug=1`。

## 项目记忆更新规则

每个有实际影响的阶段完成后，至少更新：

1. `CURRENT_STATUS.md`：当前状态、已完成、未完成、风险、下一步。
2. 对应权威文档：API、TTS、VRM、Memory、Web 表现层等发生变化时同步更新对应文档。
3. `DECISION_LOG.md`：新增重大技术决策时记录日期、内容、原因、影响范围。
4. `RISKS_AND_TODO.md`：新增未验证、外部依赖、兼容风险时记录。

不要求每个小修复都写长文档，但不能让核心契约和运行方式落后于代码。

## 最近变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-07-03 | 建立根目录 `AGENTS.md` 与 `docs/project-memory/` 项目记忆体系；修正文档索引入口；把当前 Web / Backend / `dialogue.v1`、Mock/CosyVoice2、VRMRenderer 边界纳入权威导航。 |
| 2026-07-24 | 记录正式 Demo 入口收口、10 轮真实 DeepSeek × CosyVoice2 × girl.vrm 验收、保守不露齿表现、受控 fallback 和下一阶段角色感/延迟优先级。 |
