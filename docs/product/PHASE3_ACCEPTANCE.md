# Phase 3 Acceptance

## Phase 3 总验收目标

Phase 3 的目标是让 `Alice Digital Companion` 从本地 MVP 演示进入真实智能能力接入阶段，同时不破坏阶段 2 基线。

Phase 3.9 封版状态：已完成。当前基线见 [PHASE3_BASELINE.md](./PHASE3_BASELINE.md)。

总链路：

```text
用户输入
  -> /api/dialogue
  -> DialogueOrchestrationService
  -> Memory context
  -> RAG context
  -> optional workflow result
  -> LLMService
  -> reply / sources / meta
  -> frontend TTS / animation
  -> idle
```

## LLM provider 验收

- 状态：已完成 Phase 3.2 基线。
- 默认 provider 仍是 `stub`。
- 无 API Key 场景仍可本地演示。
- 真实 provider 只从后端环境变量读取 API Key。
- OpenAI-compatible provider 缺 key 时返回稳定 `LLM_NOT_CONFIGURED`。
- 真实 provider 上游错误被截断、脱敏并结构化返回。
- `GET /api/providers` 能报告 stub/real provider readiness，且不返回 secret。
- `/api/chat` 兼容入口不回归。

## Memory 验收

- 状态：已完成 Phase 3.3-3.4 基线。
- 当前只验收后端内存短期 memory。
- `options.useMemory=false` 时行为与阶段 2 一致。
- `options.useMemory=true` 时返回 `memory.used=true`、`status=ready` 和当前 `sessionId`。
- 同一服务进程内同一个 `sessionId` 的第二轮对话可以看到上一轮上下文。
- 超过 `maxTurns` 后只保留最近 N 轮。
- Memory 对话正文不写入前端 localStorage；前端只允许保存开关偏好和 sessionId。
- Memory 不落入 `public/`。
- 重启服务后临时 memory 可清空。

## RAG 验收

- 状态：已完成 Phase 3.5-3.6 本地 RAG 基线。
- Phase 3.5 已验收本地 markdown / JSON 小型检索边界。
- `data/knowledge/` 是默认本地知识源目录，知识库文件不放入 `public/`。
- `KnowledgeSourceService` 能读取 markdown / JSON。
- `SimpleRetrieverService` 能基于关键词返回 `passages / sources / matchedTerms`。
- `RagService.retrieve()` 能区分 `disabled / empty / local`。
- `options.useRag=false` 时行为与阶段 2 一致。
- Phase 3.6 起 `options.useRag=true` 返回 `rag.used / rag.passages / sources`。
- RAG 结果由后端 `PromptBuilder` 进入 system prompt，前端不拼 prompt。
- 没有命中时不报错、不阻塞回复。
- RAG 片段有长度上限。
- 前端不直接调用 Qdrant 或外部检索服务。

## n8n workflow 验收

- 状态：已完成 Phase 3.7 工具调用边界基线。
- n8n 只作为后端工具调用层。
- n8n webhook URL 和 secret 只在后端环境变量。
- 前端不出现 n8n webhook URL 或 secret。
- workflow 超时有稳定错误。
- workflow 失败不阻塞基础 LLM 回复。
- 未配置 n8n 时 `workflow.status=not_configured`，`workflow.used=false`，请求仍成功返回 reply。
- n8n 成功时只返回安全包装后的 `workflow.result`，不直接覆盖最终 reply。
- 高风险外部动作必须单独设计确认机制，不能在 Phase 3 默认自动执行。

## Agent orchestration 验收

- 状态：已完成 Phase 3.8 最小 Agent pipeline 基线。
- Phase 3.8 起 `/api/dialogue` 的最小 Agent 编排顺序固定为：validate input -> Memory context -> RAG context -> optional workflow result -> PromptBuilder -> LLMService -> append Memory -> response。
- `DialogueOrchestrationService` 是唯一编排入口；route、前端和 UI 不拼接 Agent prompt。
- `PromptBuilder` 统一组装 systemPrompt、Memory、RAG、workflow context。
- 每个子能力可独立关闭。
- Memory / RAG / Workflow 的 `disabled / not_configured / error` 状态必须结构化返回；这些可选能力失败时不应让基础 reply 崩溃。
- 核心 LLM 调用失败仍按 `/api/dialogue` 标准错误结构返回。
- workflow 结果只作为上下文或 `workflow.result` 元数据，不直接覆盖最终 `reply`。
- 返回结构仍保持 `reply / sources / memory / rag / workflow / meta`。
- `meta.orchestration` 应为 `agent_pipeline`，`meta.steps` 应记录 memory / rag / workflow 的状态。
- stub provider 必须能跑通完整编排验收，不依赖真实 API Key、Qdrant 或 n8n。
- Debug Panel 主状态不回归。
- 动画和 TTS 状态最终回到 `idle`。

## 安全验收

- 前端不暴露 API Key、Bearer token、n8n secret、Qdrant credential。
- `.env.example` 只使用 placeholder。
- `.env.*` 不提交。
- RAG 文档和 Memory 数据不进入公开静态资源。
- 公网部署前必须补鉴权、CORS 白名单、限流、日志脱敏。
- workflow 和 Agent 外部动作必须有风险等级和用户确认策略。

## Phase 3 明确未完成

- 未接入 Qdrant / Supabase / Pinecone 等向量数据库。
- 未实现 embedding、向量索引或语义重排。
- 未实现长期记忆数据库、用户画像数据库或记忆编辑器。
- 未实现多 Agent、无限循环 Agent 或自动长期任务。
- 未完成生产级鉴权、限流、审计日志、CORS 白名单和公网部署安全加固。
- 未允许前端直连 OpenAI、n8n、Qdrant 或任何需要 secret 的外部服务。

## 浏览器验收

每个 Phase 3 子阶段都必须至少确认：

- 页面可打开 `http://localhost:3000?debug=1`。
- 三角色切换不回归。
- 点击交互不回归。
- 对话后能回到 `idle`。
- TTS / fallback 不回归。
- 控制台无新增 `error / warn`。

## 自动化验收

每轮代码改动至少执行：

```bash
npm run check
```

涉及后端、API、provider、RAG、Memory、workflow 时执行：

```bash
npm run dev
npm run smoke
```

提交前执行：

```bash
git diff --check
```

## 回滚标准

出现以下情况必须停止并回滚当前阶段改动：

- 默认 `stub` 演示不可用。
- `/api/dialogue` 主链路卡在 thinking / speaking。
- Alice / Shiro / Wambo 任一角色无法加载。
- 点击交互失效。
- 前端出现 secret 或外部 service URL。
- `npm run check` 失败且不是文档拼写类问题。
- `npm run smoke` 失败且影响阶段 2 基线能力。

回滚策略：

1. 保留阶段 2 基线 commit。
2. 每个 Phase 3 子阶段单独提交。
3. 高风险接入先通过开关关闭，验证通过后再启用。
