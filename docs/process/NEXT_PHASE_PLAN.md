# Next Phase Plan

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

- `/api/dialogue` 支持 LLM-only 编排、后端短期 Memory 和本地 RAG；Workflow 仍为 `disabled / not_configured`。
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
- 后端短期 Memory 可按 `sessionId` 保存最近 N 轮。
- 本地 RAG 可读取 `data/knowledge/` 并返回 `sources`。
- n8n workflow 作为后端可选工具调用边界，未配置时稳定返回 `not_configured`。
- Agent pipeline 已固定为 Memory -> RAG -> optional Workflow -> PromptBuilder -> LLM/stub -> append Memory -> response。

**封版文档**

- `docs/product/PHASE3_BASELINE.md`
- `docs/product/PHASE3_ACCEPTANCE.md`
- `docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md`
- `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md`

**Phase 4 建议方向**

- 真实部署与安全鉴权：鉴权、CORS 白名单、限流、日志脱敏、上传隔离。
- 真实知识库：Qdrant / embedding / 文档入库 / 检索评估。
- 长期记忆：SQLite 或后端数据库、删除策略、隐私说明和记忆管理。
- 产品体验增强：浏览器级自动化、引用展示、对话体验和 Agent 状态可观测。

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

## Phase 5：AI 能力主线

Phase 5 重新回到 AI Companion 的智能能力，不继续把安全工作无限扩展成完整生产平台。

### Phase 5.1：记忆系统架构设计

**目标**

- 设计从当前短期进程内 Memory 过渡到可控长期记忆的架构。
- 明确会话记忆、用户偏好、角色记忆、摘要和删除策略之间的边界。

**边界**

- 不直接上数据库。
- 不把记忆正文存到前端 localStorage。

### Phase 5.2：本地 RAG / Qdrant 接入

**目标**

- 从当前本地关键词 RAG 过渡到 embedding + vector retrieval 的技术方案或最小实现。
- Qdrant 只应由后端访问。

**边界**

- 前端不直连 Qdrant。
- 不把向量库凭证写入前端或文档真实值。

### Phase 5.3：n8n 工作流接入

**目标**

- 将 n8n 保持为后端工具调用层，用于具体任务，而不是主对话编排器。
- 明确 webhook 超时、错误、审计和高风险动作确认策略。

### Phase 5.4：Agent 行为边界

**目标**

- 收口 AI companion 的行为状态、工具调用边界和失败降级策略。
- 避免无限循环 Agent、多 Agent 过早复杂化。

## Phase 6：前端与数字人体验升级

- 更清晰的对话状态和来源展示。
- 更自然的动作 / 语音联动。
- 角色切换、上传和动作兼容性的用户体验优化。
- 更适合展示的 UI polish 和浏览器验收证据。

## Phase 7：GitHub 展示与作品集包装

- 截图、短 GIF、项目 logo 和演示说明。
- README / PROJECT_SHOWCASE 持续维护。
- 选择性补充在线演示或视频说明。
