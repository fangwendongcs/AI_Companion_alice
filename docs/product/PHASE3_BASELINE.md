# Phase 3 Intelligence Baseline

## Phase 3.9 封版结论

Phase 3“真实智能能力接入基线”已经收口。当前项目不再只是本地数字人 MVP，而是具备了一个可回归、可演示、可继续扩展的后端智能编排基座。

本基线的目标不是宣称项目已经具备生产级 Agent、长期记忆或向量数据库能力，而是明确：`/api/dialogue` 已成为统一智能编排入口，能够在默认 `stub` 演示模式下跑通 Provider readiness、短期 Memory、本地 RAG、n8n 工具调用边界与最小 Agent pipeline。

## 当前统一智能链路

```text
Frontend
  -> DialogueManager
  -> LLMClient
  -> POST /api/dialogue
  -> DialogueOrchestrationService
  -> MemoryService
  -> RagService
  -> N8nWorkflowService optional
  -> PromptBuilder
  -> LLMService
  -> reply / sources / memory / rag / workflow / meta
  -> frontend TTS / animation
  -> idle
```

## 已完成能力

- `/api/dialogue` 是当前前端主对话入口。
- `/api/chat` 保留旧兼容入口。
- 默认 LLM provider 是 `stub`，无 API Key 可本地演示。
- `GET /api/providers` 可返回 provider readiness，且不暴露 Key、secret、token 或真实上游地址。
- 后端短期 Memory 已按 `sessionId` 保存最近 N 轮 user/assistant 消息，服务重启后清空。
- 前端 Memory 开关与 Debug Panel 可观察 `memory.enabled / memory.used / memory.turnCount / memory.sessionId`。
- `data/knowledge/` 已作为后端本地知识源目录。
- 本地 RAG 已支持 markdown / JSON 简单关键词检索，返回 `rag.passages` 与顶层 `sources`。
- n8n 已作为后端可选工具调用边界；未配置时返回 `workflow.status=not_configured`，不会阻塞基础回复。
- Agent pipeline 已收口为 `validate input -> Memory -> RAG -> optional Workflow -> PromptBuilder -> LLM/stub -> append Memory -> response`。
- `/api/dialogue` 成功响应包含 `reply / sources / memory / rag / workflow / meta`，其中 `meta.orchestration = "agent_pipeline"`，`meta.steps` 记录子能力状态。
- `npm run check` 已覆盖 provider、memory、knowledge、rag、workflow、agent flow 等回归脚本。
- `npm run smoke` 已覆盖默认 stub、三角色资源、兼容接口、非法上传、Memory / RAG / workflow not_configured 与组合请求稳定性。

## 当前未包含

- 不包含 Qdrant / Supabase / Pinecone 等向量数据库。
- 不包含 embedding 生成、向量索引或语义重排。
- 不包含长期记忆数据库、用户画像数据库或记忆编辑器。
- 不包含多 Agent 协作、无限循环 Agent、自主长期任务。
- 不包含生产级鉴权、CORS 白名单、速率限制、审计日志和权限系统。
- 不包含前端直连 OpenAI、n8n、Qdrant 或任何带 secret 的第三方接口。
- 不包含公网部署安全加固。

## 自动化验收基线

Phase 3 封版前必须通过：

```bash
npm run check
npm run smoke
git diff --check
```

`npm run check` 当前应覆盖：

- JavaScript / 配置 / 资源 / legacy avatar 兼容。
- 动画、TTS、角色、MVP flow、runtime contract。
- integration boundaries 与 provider config。
- Memory flow、knowledge flow、RAG flow、workflow flow、agent flow。

`npm run smoke` 当前应覆盖：

- `/api/health`
- `/api/providers`
- `/api/avatars`
- `/api/chat` 兼容入口
- `/api/dialogue` stub 成功、空消息错误、unsupported provider 错误
- `/api/dialogue` Memory / RAG / Workflow / Agent pipeline 组合请求
- 三角色 manifest / model / motions / skeleton 可访问性
- 非法上传拒绝且 registry 不污染

## 浏览器复验基线

浏览器手动复验按 [BROWSER_ACCEPTANCE_CHECKLIST.md](../process/BROWSER_ACCEPTANCE_CHECKLIST.md) 执行，并至少确认：

- 打开 `http://localhost:3000?debug=1`。
- Alice / Shiro / Wambo 可切换。
- 点击 head / body / arm / leg 有反馈。
- 默认 stub 对话可返回本地演示回复。
- Memory 开关可切换，Debug Panel 能显示 memory 状态。
- RAG 开关启用后请求不崩溃，Debug Panel / API 能看到相关状态。
- Workflow 未配置时返回 `not_configured`，不阻塞基础回复。
- TTS / fallback 可用。
- 最终 `currentState=idle`、`isThinking=false`、`isSpeaking=false`、`currentAnimation=-`。
- 控制台无新增 `error / warn`。

## 下一阶段边界

Phase 4 可以选择以下方向之一推进，但不应一次性混做：

1. 真实部署与安全鉴权：鉴权、CORS 白名单、限流、日志脱敏、上传隔离。
2. 真实知识库：Qdrant / embedding / 文档入库 / 检索评估。
3. 长期记忆：SQLite 或后端数据库、删除策略、隐私说明和记忆管理。
4. 产品体验增强：浏览器级自动化、对话 UI、引用展示、Agent 状态可观测。

任何 Phase 4 方向都必须保持：前端不接触 secret，默认 `stub` 演示不破坏，`/api/dialogue` 主入口不回退。
