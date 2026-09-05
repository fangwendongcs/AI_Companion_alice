# Next Phase Plan

> 历史阶段路线。2026-09-05 起，近期执行顺序以 [工程路线 E1–E4](./ENGINEERING_ROADMAP_20260905.md) 和 [当前状态](../project-memory/CURRENT_STATUS.md) 为准。下方 Phase 标题记录阶段拆分，不能直接作为未完成任务清单或完成证据。

## Phase 2.1：MVP 验收文档与 Debug 状态面板

**目标**

- 固化阶段 2 的验收标准。
- 为后续排障建立可观察的开发态入口。

**任务清单**

- 维护 `MVP_ACCEPTANCE.md`。
- 新增开发模式 Debug Panel，展示关键状态快照与最近事件。
- 明确哪些状态只用于调试，哪些状态会参与产品交互。

**涉及文件**

- `docs/product/MVP_ACCEPTANCE.md`
- `docs/process/CODEX_EXECUTION_STANDARD.md`
- `docs/process/NEXT_PHASE_PLAN.md`
- 未来可能涉及 `js/ui/`、`js/state/CompanionStateStore.js`、`js/core/events/`

**验收标准**

- 文档可独立说明 MVP 边界。
- Debug Panel 至少可展示 `app.ready / currentAvatarId / currentState / currentAnimation / isThinking / isSpeaking / ttsEngine / lastInteraction / lastError`。
- `npm run check` 通过。

**不做事项**

- 不接真实 RAG。
- 不迁移前端框架。
- 不把 Debug Panel 做成正式用户功能。

**风险**

- 如果调试 UI 与业务 UI 混在一起，后续会增加维护成本。

**测试命令**

```bash
npm run check
```

## Phase 2.2：对话 / 语音 / 动作状态闭环

**目标**

- 把“用户输入 -> thinking -> speaking -> idle”做成稳定演示链路。

**任务清单**

- 复核 `DialogueManager -> AudioManager -> MotionManager` 事件流。
- 补齐失败场景的状态回收。
- 明确 `dialogue:*`、`audio:*`、`animation:*` 事件的消费边界。

**涉及文件**

- `js/app/AppController.js`
- `js/dialogue/DialogueManager.js`
- `js/audio/AudioManager.js`
- `js/voice/TTSService.js`
- `docs/architecture/EVENT_FLOW.md`
- `docs/architecture/STATE_MODEL.md`

**验收标准**

- 对话成功和失败都能回到可交互状态。
- 语音 fallback 不会卡住动画状态。
- `npm run check`、`npm run check:regression`、`npm run smoke` 通过。

**不做事项**

- 不接真实长期记忆。
- 不做口型同步。

**风险**

- 对话、音频、动画状态如果再次互相直连，会让主流程回到高耦合。

**测试命令**

```bash
npm run check
npm run check:regression
npm run dev
npm run smoke
```

## Phase 2.3：角色切换与上传稳定性

**目标**

- 保证默认三角色与上传角色都能沿同一套 manifest 主流程工作。

**任务清单**

- 复核 avatar switch 串行化和旧资源释放。
- 保持上传角色只生成 `manifest.json`。
- 检查旧 `meta.json` fallback 的退场节奏。

**涉及文件**

- `js/avatar/`
- `backend/services/AvatarService.js`
- `public/avatars/`
- `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md`

**验收标准**

- Alice / Shiro / Wambo 可连续切换。
- 切换后只有当前角色留在场景中。
- 新角色 registry 不新增 `meta` 字段。
- 上传失败时有明确错误。

**不做事项**

- 不新增大批角色资产。
- 不提前删除 legacy fallback。

**风险**

- 上传角色的骨骼兼容性天然参差，需要继续把“能加载”和“能完整动起来”分开验收。

**测试命令**

```bash
npm run check
npm run check:regression
npm run dev
npm run smoke
```

## Phase 2.4：自动化回归补强

**目标**

- 把更多真实用户链路沉淀成可重复检查。

**任务清单**

- 继续维护 `check:regression`。
- 评估是否引入轻量浏览器级 E2E。
- 对关键事件流增加更贴近用户行为的断言。

**涉及文件**

- `scripts/`
- 未来可能涉及 `tests/`

**验收标准**

- 关键主流程有自动化保护。
- 新回归检查能在不依赖真实密钥时运行。
- 自动化覆盖不会反过来绑死架构演进。

**不做事项**

- 不为了测试引入重型全家桶。

**风险**

- 过早把实现细节写死进测试，会降低后续重构自由度。

**测试命令**

```bash
npm run check
npm run check:regression
npm run smoke
```

## Phase 2.5：准备接入 RAG / n8n 的后端边界

**目标**

- 为未来 AI 能力增强预留正确位置，而不是把实验代码塞进前端。

**任务清单**

- 明确未来 `/api/dialogue`、RAG、memory、workflow 的后端职责。
- 建立 `DialogueOrchestrationService / MemoryService / RagService / N8nWorkflowService` 后端边界 stub。
- 历史执行顺序：先保持当前 MVP 前端继续使用 `/api/chat`，完成 `/api/dialogue` 后端边界后再单独切换主链路。
- 增加集成边界检查，防止前端直接处理 Qdrant、n8n webhook 或 API Key。

**涉及文件**

- `docs/architecture/`
- `docs/refactor/`
- `backend/routes/dialogueRoutes.js`
- `backend/services/`
- `scripts/check-integration-boundaries.mjs`

**验收标准**

- 能清楚回答未来 RAG / n8n 应接在哪里。
- 当前 UI 不需要为了未来能力重写。
- 前端不新增 secret 处理逻辑。
- `/api/dialogue` 返回稳定 `{ ok, data }`，并可逐步从 boundary stub 演进为 LLM-only 编排。
- `npm run check` 与 `npm run smoke` 通过。

**不做事项**

- 不直接上线真实向量库。
- 不把 workflow secret 暴露到浏览器。

**风险**

- 如果阶段 2 还没闭环就抢跑阶段 3，会重新把项目拖回“边做边拆”的状态。

**测试命令**

```bash
npm run check
```

## Phase 2.6-2.8：统一对话入口与本地 stub 演示

**目标**

- 将 `/api/dialogue` 从后端边界推进为当前前端主对话入口，并让无 API Key 的本地环境也能完成演示闭环。

**已完成事项**

- `/api/dialogue` 支持 LLM-only 编排、SQLite-backed Memory 和本地 RAG；Workflow 未配置时保持 `disabled / not_configured`。
- 前端主链路已从 `/api/chat` 切换到 `/api/dialogue`，`/api/chat` 保留兼容。
- 默认 LLM provider 改为 `stub`，开发环境无需 API Key 即可获得本地演示回复。
- 真实 provider 仍保留明确错误链路，不吞掉配置错误或上游错误。

**验收标准**

- `npm run check` 通过。
- `npm run smoke` 通过。
- 无 Key 场景不会让前端卡在 thinking / speaking。
- 浏览器手动验收仍按 `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md` 执行。

## Phase 2.9：MVP 基线封版与阶段 2 收口

**目标**

- 固化阶段 2 的稳定基线，避免后续阶段误伤已经验证过的主链路。

**已完成事项**

- `/api/dialogue` 是前端主入口，`/api/chat` 保留兼容。
- 默认本地演示 provider 是 `stub`。
- Alice / Shiro / Wambo 三角色切换通过。
- 点击交互通过。
- stub 对话通过。
- TTS fallback 通过。
- 最终状态可回到 `idle`。
- 控制台无新增 `error / warn`。

**封版文档**

- `docs/product/MVP_BASELINE.md`

**下一阶段**

- Phase 3 才进入真实 RAG / Memory / n8n / Agent。

## Phase 3.9：智能能力基线封版

**目标**

- 固化 Phase 3 的智能能力接入基线，避免后续真实部署、向量库或产品体验增强误伤已经完成的主链路。

**已完成事项**

- `/api/dialogue` 是统一智能编排入口。
- `/api/chat` 保留兼容入口。
- 默认 provider 仍是 `stub`，无 Key 可演示。
- `GET /api/providers` 提供安全 provider readiness。
- SQLite-backed Memory 可按 `sessionId` 保存最近 N 轮，并以保守方式保存显式长期 `memory_items`。
- 本地 RAG 可读取 `data/knowledge/` 并返回 `sources`。
- n8n workflow 作为后端可选工具调用边界，未配置时稳定返回 `not_configured`。
- Agent pipeline 已固定为 Memory -> RAG -> optional Workflow -> PromptBuilder -> LLM/stub -> append Memory -> response。

**封版文档**

- `docs/product/PHASE3_BASELINE.md`
- `docs/product/PHASE3_ACCEPTANCE.md`
- `docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md`
- `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md`

**Phase 4 实际方向**

- Phase 4 实际收口为安全部署 / 自托管安全基线。
- Qdrant / embedding / 真实知识库没有进入 Phase 4，也不作为 Phase 5 近期主线。
- SQLite、短期记忆持久化和保守长期 `memory_items` 已进入 Phase 5 主线；Qdrant / embedding 仍不作为近期主线。
- 产品体验增强继续保留，但核心先回到记忆、人格和陪伴连续性。

**不做事项**

- Phase 3.9 不新增业务功能。
- 不声称已完成 Qdrant、embedding、长期记忆数据库、多 Agent 或生产级鉴权。

**测试命令**

```bash
npm run check
npm run smoke
git diff --check
```

## Phase 4：安全部署基线收口

**目标**

- 为后续私有演示或公网部署候选建立最低限度的安全部署护栏。
- 完成后停止继续安全化，避免项目路线偏离 AI Companion 主线。

**已完成事项**

- Phase 4.1：轻量 API 鉴权边界，保护高风险写接口。
- Phase 4.2：CORS 白名单、JSON / upload body size limit、轻量 rate limit、日志脱敏。
- Phase 4.3：`DEPLOYMENT_MODE`、production readiness、`X-Request-ID`、结构化请求日志。
- Phase 4.4：上传隔离、上传文件名安全、模型文件基础内容校验、上传配额。
- Phase 4.5：单 token API 鉴权边界，支持 `Authorization: Bearer` 和 `X-API-Token`。
- Phase 4.6：local / demo / production 配置说明、Secret 管理和部署检查清单。
- Phase 4.7：Phase 4 基线封版，路线切回 Phase 5 AI 能力主线。

**当前未包含**

- 完整登录系统、OAuth / RBAC、多用户权限。
- 对象存储、CDN 隔离、WAF。
- 病毒扫描、沙箱解析、正式内容审核流。
- OpenTelemetry / Sentry、多实例 rate limit、审计后台。

**短期可做**

- 针对某一个真实部署平台补充变量映射和启动说明。
- 补浏览器验收证据、截图和项目展示材料。

**中期增强**

- 正式身份系统方案。
- 上传审核发布流。
- 平台日志检索和 requestId 排障流程。

**生产级后续项**

- 对象存储隔离桶。
- 内容安全扫描。
- WAF / 平台层防护。
- 多实例限流和正式审计后台。

**测试命令**

```bash
npm run check
npm run smoke
npm run check:deployment-readiness
git diff --check
```

## Phase 5：Companion Memory / Persona / Experience 主线

Phase 5 的核心不是把项目做成企业知识库问答系统，而是强化 AI 数字伙伴体验：记忆、人格、陪伴连续性、语音动作反馈和中文对话稳定性。

当前已有短期 Memory、本地最小 RAG、n8n workflow 边界和 Agent pipeline，但它们只是智能能力基线。SQLite schema 初始化、最小 repository 边界、短期记忆持久化和保守长期 `memory_items` 最小闭环已经建立；RAG / Qdrant / embedding 暂缓，不作为 Phase 5 近期主线。

### Phase 5.1：记忆系统架构设计

**目标**

- 明确 short-term memory、session memory、long-term memory、avatar memory、user preference memory 的边界。
- 明确哪些数据进入 SQLite，哪些只保留在内存，哪些不应保存。
- 明确记忆开关、清除、隐私、按 session / avatar 隔离策略。

**边界**

- 只做文档和架构。
- 不写 SQLite 代码。
- 不接 Qdrant、不做 embedding、不新增 n8n workflow。

### Phase 5.2：SQLite / 本地持久化最小闭环

**目标**

- 建立 `data/sqlite/alice.db` 作为本地记忆主存储。
- 用 SQLite 建立 `sessions`、`messages`、`memory_items`、`memory_events`、`avatar_personas`、`user_preferences`、`memory_settings`。
- 文件目录只作为辅助：`data/uploads`、`data/knowledge`、`data/exports`、`data/logs`。
- 新增 schema 初始化和最小 repository 读写验证。

**边界**

- 不接 Postgres。
- 不接 Qdrant。
- 不做 embedding。
- 不永久保存所有原始对话。
- 不把现有 `MemoryService` 一次性全面迁移到 SQLite。

### Phase 5.3：短期记忆持久化

**目标**

- 当前 session 最近 N 轮上下文可在服务重启后恢复。
- 支持记忆开关、清除、按 session / avatar 隔离。
- 保持 short-term memory 与 long-term memory 的职责分离。
- 启用 Memory 时，`MemoryService` 通过 SQLite 读写最近上下文。

**边界**

- 不把记忆正文存到前端 localStorage。
- 不把所有对话都提升为长期记忆。
- 不写入自动长期 `memory_items`。

### Phase 5.4：长期 Memory 最小闭环

**目标**

- 基于 SQLite 做保守长期记忆写入和 `memory_items`。
- `memory_items.type` 包括 `preference / fact / goal / relationship / boundary / event / style`。
- 只有用户显式表达“记住这个 / 以后你要记得 / 我喜欢 / 我的目标是”等稳定信息时才进入长期记忆。
- 重复记忆合并更新，而不是无限新增。
- 敏感内容会被拒绝，不进入 `memory_items`。
- PromptBuilder 可注入少量 active long-term memory 作为陪伴连续性上下文。

**边界**

- 不自动永久保存所有原始对话。
- 不做不可删除的用户画像。
- 不保存 API Key、密码、身份证、金融信息或敏感隐私。
- 不做复杂情绪画像、embedding、Qdrant 或记忆管理 UI。

### Phase 5.5：角色人格系统

**目标**

- 已为 Alice / Shiro / Wambo 建立后端 persona 配置。
- 配置内容包括人设、语气、说话边界、默认声音、默认动作、记忆策略。
- `PromptBuilder` 已按角色人格、对话边界、长期记忆、短期上下文、RAG / workflow 的顺序组装 prompt。
- `/api/dialogue` 已返回 `meta.persona`，供 Debug 和后续联动消费。

**边界**

- persona 配置仍由后端 / 配置层管理。
- 不把 provider secret 或 prompt 私密配置暴露到前端。

### Phase 5.6：情绪与语气决策层

**目标**

- 已新增规则化 affect 决策层，把回复上下文映射为 emotion / tone / voice / motion metadata。
- Debug Panel 已显示 persona、emotion、tone、voice style、motion slot 和长期记忆数量。

**边界**

- 不重写动画系统。
- 只做状态联动收口。

### Phase 5.7：语音 / 动作 / 情绪联动

**目标**

- 前端已消费 `/api/dialogue` 返回的 `affect`。
- `AudioManager` 会使用 `affect.voice.rate / pitch` 调整浏览器 fallback 语音参数。
- `AppController` 会把 `affect.motion.slot` 映射到现有 motion slot，不重写动画系统。
- 错误 fallback 使用 apologetic affect，避免状态卡死。

**边界**

- 不接真实情绪模型。
- 不把情绪写入长期记忆。
- 不改 TTS provider secret 边界。

### Phase 5.8：记忆管理与陪伴连续性

**目标**

- 已新增轻量 Memory 面板，可查看精简长期记忆摘要，并清除当前 session 或当前 avatar 的长期记忆。
- 已新增 `/api/memory` 读 / 清接口；接口不返回完整原始 messages。
- 记忆能力继续保持可解释、可清除、按 session / avatar 隔离。

### Phase 5.9：对话体验打磨

**目标**

- 中文陪伴链路已具备 persona + memory + affect 基线。
- 底部对话栏补充重新生成和清空当前上下文入口。
- 清空当前上下文只清短期消息，不删除用户明确保存的长期记忆。
- 本地 stub 对“你还记得吗 / 忘记这个”提供更自然的记忆追问与清除指引。
- 后续仍可继续打磨回复长度控制、重新生成策略和中文陪伴节奏。

### Phase 5 可选增强：RAG / Qdrant / n8n 评估

**目标**

- RAG 保留为可选增强能力。
- Qdrant / embedding 放到后续评估，不作为当前主线。
- n8n 继续作为工具调用层，不作为主对话编排器。

### Phase 5.10：统一后端契约收口

**目标**

- `/api/dialogue` 增加 `dialogue.v1` renderer-agnostic 响应字段，供 Web 与后续 iOS 共用。
- 新契约包含 `reply_text / companion_state / emotion / tone / avatar_directive / memory_event / tts / contract`。
- 后端继续只输出语义状态，不输出 FBX / VRM / Rive、骨骼名、动画文件或 renderer 专属字段。
- Web 继续兼容旧 `reply / affect / memory` 字段，现有 TTS / motion 链路不回退。

**边界**

- 不拆分独立后端仓库。
- 不做 iOS 项目修改。
- 不接真实 VRM，不移除当前 FBXRenderer。
- Renderer 只负责把 `avatar_directive` 映射到本地表现层，不参与 Dialogue / Memory / Persona / Emotion 决策。

### Phase 5.11：Web VRMRenderer MVP

目标：在不替换现有 FBX / GLB 路径的前提下，让 Web 端新增 VRM renderer adapter，并验证 VRM 可以消费统一 `AvatarDirective`。

范围：

- 复用现有 `CharacterManager`、avatar manifest 和 `MotionManager`，不新增第二套业务渲染系统。
- 新增 `DefaultAvatarRenderer` / `VRMRenderer` / `AvatarRendererFactory`。
- VRMRenderer 只处理表现层 expression / basic lip-sync hint，不参与 Dialogue、Memory、Persona、Emotion 决策。
- Shiro / Wambo manifest 声明 `renderer.type = "vrm"` 与 `capabilities`。
- 本地测试 VRM 文件放在 `assets/avatars/test-vrm/`，授权确认前不提交。

不做：

- 不接商业角色模型。
- 不做高级面捕、精细口型或 WebGPU。
- 不把 VRM expression preset、骨骼名、动画文件或模型路径写进后端业务契约。

## Phase 6：人格样本沉淀与微调可行性评估

- 收集高质量中文对话样本。
- 定义 Alice 人格规范、好回答 / 坏回答、拒答边界、陪伴语气样本。
- 优先通过 prompt + persona + memory 优化体验。
- 只有当样本足够、收益明确时，再评估 SFT / LoRA 微调。

## Phase 7：前端与数字人体验升级

- 更清晰的对话状态和来源展示。
- 更自然的动作 / 语音联动。
- 角色切换、上传和动作兼容性的用户体验优化。
- 更适合展示的 UI polish、截图、短 GIF 和浏览器验收证据。
