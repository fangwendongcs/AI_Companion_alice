# Phase 3 Implementation Plan

## Phase 3.1：路线决策与架构方案

**目标**

- 明确真实 LLM、Memory、RAG、n8n workflow 和 Agent orchestration 的接入路线。
- 只产出方案、边界和验收标准，不实现外部集成。

**修改范围**

- `docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md`
- `docs/process/PHASE3_IMPLEMENTATION_PLAN.md`
- `docs/product/PHASE3_ACCEPTANCE.md`
- 相关 README、API、安全和重构记录文档。

**不做事项**

- 不接真实 Qdrant。
- 不接真实 n8n。
- 不实现真实 Memory 数据库。
- 不新增依赖。

**验收标准**

- 架构方案清楚。
- 阶段计划清楚。
- 安全边界清楚。
- `npm run check`、`npm run smoke`、`git diff --check` 通过。

**测试命令**

```bash
npm run check
npm run smoke
git diff --check
```

**风险**

- 如果方案文档写得太像实现承诺，后续会误导任务边界；必须明确哪些只是计划。

## Phase 3.2：真实 provider 配置与演示模式切换

**目标**

- 保留 `stub` 默认演示模式。
- 增加真实 provider 配置验收，让 OpenAI / Qwen / DeepSeek / Custom 能通过后端环境变量安全调用。
- 明确“演示模式 / 真实模式”的 UI 和文档语义。
- 增加安全 provider readiness 诊断，供前端设置面板和 smoke 使用。

**修改范围**

- `backend/services/LLMService.js`
- `backend/services/ProviderStatusService.js`
- `backend/routes/providerRoutes.js`
- `backend/config/serverConfig.js`
- `js/config/providers.js`
- `js/ui/LLMSettingsController.js`
- `scripts/check-mvp-flow.mjs`
- `scripts/smoke-test.mjs`
- `.env.example`
- API 文档。

**不做事项**

- 不新增真实 API Key。
- 不默认启用真实 provider。
- 不把 key 放进前端。

**验收标准**

- 默认 `stub` 不回归。
- 无 Key 场景仍可本地演示。
- 显式真实 provider 缺 key 时有稳定错误。
- `GET /api/providers` 可用且不返回 secret。
- 配置真实 key 的本地环境可手动验证真实 reply。

**测试命令**

```bash
npm run check
npm run smoke
```

**风险**

- 真实 provider 的错误信息可能暴露上游细节，需要截断和脱敏。

## Phase 3.3：Memory 最小闭环

**目标**

- 已实现后端内存短期 memory，不落盘。
- 同一服务进程内的最近对话可按 `sessionId` 参与 prompt。

**修改范围**

- `backend/services/MemoryService.js`
- `backend/services/DialogueOrchestrationService.js`
- `scripts/check-memory-flow.mjs`
- `scripts/smoke-test.mjs`
- API 文档。

**不做事项**

- 不接 SQLite。
- 不接 Qdrant。
- 不保存长期隐私数据。

**验收标准**

- `options.useMemory=true` 时返回 `memory.used=true`。
- 同一进程内第二轮对话可以看到上一轮简短上下文。
- 重启服务后 memory 清空。
- 关闭 `useMemory` 时行为与阶段 2 一致。
- 超过 `maxTurns` 会裁剪，只保留最近 N 轮。

**测试命令**

```bash
npm run check
npm run smoke
```

**风险**

- 内存 memory 不是产品级长期记忆，必须在 UI 和文档中标注为临时能力。

## Phase 3.4：Memory 前端开关与 Debug 可观测

### 目标

- 让用户可以在 LLM 设置区开启 / 关闭后端短期 Memory。
- 让前端请求 `/api/dialogue` 时携带 `sessionId` 与 `options.useMemory`。
- 让 Debug Panel 显示 `memory.enabled / memory.used / memory.turnCount / memory.sessionId`。

### 修改范围

- `index.html`
- `css/style.css`
- `js/app/AppController.js`
- `js/ai/LLMClient.js`
- `js/dialogue/DialogueManager.js`
- `js/storage/LocalConfigStore.js`
- `js/ui/LLMSettingsController.js`
- `js/ui/DebugPanelController.js`
- `scripts/check-mvp-flow.mjs`
- `scripts/check-runtime-contracts.mjs`

### 不做事项

- 不做长期记忆管理 UI。
- 不做记忆编辑器。
- 不在前端保存对话正文或 assistant 回复。
- 不接 RAG / n8n。

### 验收标准

- Memory 开关偏好可保存，但前端不保存对话正文。
- `LLMClient` 请求 `/api/dialogue` 时可传递 `sessionId` 与 `options.useMemory`。
- `DialogueManager` 能把后端返回的 memory 元数据同步到事件。
- Debug Panel 能显示 Memory enabled / used / turnCount / sessionId。
- `npm run check`、`npm run smoke`、`git diff --check` 通过。

### 测试命令

```bash
npm run check
npm run smoke
git diff --check
```

### 风险

- 当前 sessionId 可保存在 localStorage，但对话正文不进入前端持久化。
- 后端 Memory 仍是进程内临时能力，刷新页面后 sessionId 保持，重启服务后上下文清空。

## Phase 3.5：RAG 数据源与检索方案

**目标**

- 先确定 RAG 数据源格式和本地检索边界。
- 采用后端本地 markdown / JSON 小型检索，不上 Qdrant。

**修改范围**

- `data/knowledge/`
- `backend/services/KnowledgeSourceService.js`
- `backend/services/SimpleRetrieverService.js`
- `backend/services/RagService.js`
- `scripts/check-knowledge-flow.mjs`
- `docs/guides/KNOWLEDGE_GUIDE.md`

**不做事项**

- 不做向量化。
- 不上传私有文档到 public。
- 不接 Qdrant。

**验收标准**

- 有明确知识库目录。
- 知识库不放在 `public/`。
- `RagService.retrieve()` 可在 disabled / empty / local 三种状态间清晰切换。
- 默认 `/api/dialogue options.useRag=true` 仍保持 `not_configured`，Phase 3.6 才接入真实回复链路。

**测试命令**

```bash
npm run check
npm run smoke
git diff --check
```

**风险**

- 本地关键词检索效果有限，但足够验证 sources、prompt 拼装和安全边界。

## Phase 3.6：RAG 最小闭环

**目标**

- 完成后端本地检索 -> sources -> prompt -> reply 的最小闭环。

**修改范围**

- `backend/services/RagService.js`
- `backend/services/PromptBuilder.js`
- `backend/services/DialogueOrchestrationService.js`
- `scripts/check-mvp-flow.mjs`
- `scripts/check-integration-boundaries.mjs`
- API 文档。

**不做事项**

- 不做复杂 embedding。
- 不接外部向量库。
- 不在前端拼 prompt。

**验收标准**

- `options.useRag=true` 时可返回 `rag.used=true` 和 `sources`。
- 没命中时能正常回复，不报错。
- RAG 内容长度有上限。
- 前端 Debug Panel 不需要知道 RAG 实现细节。

**测试命令**

```bash
npm run check
npm run smoke
```

**风险**

- RAG 片段进入 prompt 前必须截断，否则会影响响应稳定性。

## Phase 3.7：n8n workflow 工具调用最小闭环

**目标**

- 将 n8n 作为后端工具调用层，而不是主对话编排器。

**修改范围**

- `backend/services/N8nWorkflowService.js`
- `backend/config/serverConfig.js`
- `.env.example`
- `scripts/check-integration-boundaries.mjs`
- 安全文档。

**不做事项**

- 不让前端直连 n8n。
- 不让 n8n 决定完整对话流程。
- 不自动执行高风险动作。

**验收标准**

- n8n URL 和 secret 只在后端环境变量。
- workflow 超时有稳定错误。
- workflow 失败不阻塞基础 reply。
- 返回结构化 `workflow` 元数据。

**测试命令**

```bash
npm run check
npm run smoke
```

**风险**

- n8n webhook 如果无鉴权或泄露，会成为外部攻击入口。

## Phase 3.8：Agent orchestration 收口

**目标**

- 将 Memory / RAG / workflow / LLM 的顺序和错误策略收口成稳定 Agent 编排。

**修改范围**

- `DialogueOrchestrationService`
- `PromptBuilder`
- `MemoryService`
- `RagService`
- `N8nWorkflowService`
- API 文档与回归脚本。

**不做事项**

- 不做自主多步执行。
- 不做未授权外部动作。
- 不把 Agent 状态散落到前端。

**验收标准**

- Agent 编排链路可开关。
- 每个子能力失败都有降级策略。
- `reply / sources / memory / rag / workflow / meta` 结构稳定。
- 阶段 2 基线能力不回归。

**测试命令**

```bash
npm run check
npm run smoke
```

**风险**

- Agent 编排容易膨胀，必须坚持最小闭环和可回滚开关。

## Phase 3.9：Phase 3 智能能力基线封版

**目标**

- 不加新功能，只收口文档、验收、浏览器测试和自动化基线。

**修改范围**

- `README.md`
- `docs/product/PHASE3_ACCEPTANCE.md`
- `docs/process/NEXT_PHASE_PLAN.md`
- `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md`
- `docs/refactor/REFACTOR_NOTES.md`

**不做事项**

- 不新增智能能力。
- 不改模型、角色、动画、TTS 主逻辑。

**验收标准**

- Phase 3 已完成能力和仍未完成能力边界清楚。
- 自动化验收与浏览器验收清单同步。
- `npm run check`、`npm run smoke`、`git diff --check` 通过。

**测试命令**

```bash
npm run check
npm run smoke
git diff --check
```

**风险**

- 封版文档不能夸大能力；必须明确哪些能力是本地 stub、短期 Memory、本地 RAG 或 n8n 边界。
