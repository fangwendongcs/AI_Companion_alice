# Dialogue Backend Boundary

## 目标

Phase 3 的目标是在阶段 2 基线稳定后，让真实 LLM、Memory、RAG、n8n workflow 和 Agent orchestration 逐步进入后端边界。阶段 3 仍保留本地 `stub` provider，保证无 API Key 的开发环境可以完整演示对话闭环。

```text
Frontend DialogueManager
  -> backend /api/dialogue      当前前端主对话入口
  -> backend /api/chat          旧兼容入口
      -> DialogueOrchestrationService
        -> MemoryService
        -> RagService
        -> N8nWorkflowService
        -> LLMService
```

前端只负责提交用户输入、可见 provider/model 选项和非密钥开关。RAG 检索、长期记忆、workflow secret、向量库凭据、prompt 编排都应该留在后端。

## 为什么 RAG / Memory / n8n 不进入前端

- 浏览器代码和 `public/` 资源天然可被用户查看，不能保存 API Key、n8n webhook secret、Qdrant credential 或私有文档。
- RAG 需要文档上传、索引、检索、重排和权限控制，这些属于后端职责。
- 长期记忆会涉及用户画像、会话摘要和隐私数据，不能写入公开静态资源。
- n8n webhook 通常带有 secret 或内部工作流 URL，前端直连会泄露工作流入口。
- Agent 编排需要日志、超时、重试、限流、鉴权和审计，应该在后端统一处理。

## `/api/chat` 与 `/api/dialogue`

### `/api/chat`

旧兼容对话入口。后端仍保留该接口，并继续复用 `LLMService` 返回旧格式 `{ reply }`。

保持原则：

- 不破坏旧调用方。
- 不作为当前前端默认入口。
- API Key 仍只从后端环境变量读取。

### `/api/dialogue`

统一对话编排入口。当前已经支持 LLM-only 编排，并已成为前端默认对话入口。

当前行为：

- 返回 `{ ok: true, data }`。
- 真实 provider 配置完整时，`data.meta.mode = "llm_only"`。
- `provider = "stub" / "local" / "boundary"` 时，返回本地 `llm_stub`，用于无 Key 本地开发演示、smoke 和边界检查。
- 前端默认 provider 为 `stub`；显式选择 OpenAI / Qwen / DeepSeek / Custom 时，仍保留真实 provider 的配置错误与上游错误链路。
- `memory.used = false`。
- `rag.used = false`。
- `workflow.used = false`。
- 不连接 Qdrant。
- 不请求 n8n webhook。
- 不读取 RAG / n8n / memory secret。
- 只有真实 LLM provider 配置完整时才访问上游 LLM。

未来接入时，优先在 `DialogueOrchestrationService` 内逐步接入真实服务，而不是把逻辑塞进 `AppController`、UI Controller 或前端 `DialogueManager`。

## 后端 service 职责

### `DialogueOrchestrationService`

- 接收 `message / provider / model / systemPrompt / options`。
- 编排 memory、RAG、workflow 与 LLM。
- 返回统一响应：`reply / sources / memory / rag / workflow / meta`。
- 当前阶段支持 `llm_only`，但 Memory / RAG / Workflow 仍返回 `disabled / not_configured`。

### `LLMService`

- 复用 `/api/chat` 的 OpenAI-compatible provider 调用能力。
- 从后端环境变量读取 API Key 和 Base URL。
- 统一处理 unsupported provider、missing key、invalid key、upstream error 和 invalid response。
- 不被前端直接调用。

### `MemoryService`

- 预留 `getContext()` 与 `appendEvent()`。
- 当前返回空上下文和 `disabled / not_configured` 状态。
- 未来可接入会话摘要、用户画像、长期记忆数据库。

### `RagService`

- 预留 `retrieve()`。
- 当前返回空 `passages`。
- 未来可接入 Qdrant、Supabase、Pinecone 或本地向量库。

### `N8nWorkflowService`

- 预留 `invokeWorkflow()`。
- 当前返回 `disabled / not_configured` 状态。
- 未来通过后端环境变量读取 n8n URL 和 secret。

## 前端 client 边界

- `js/memory/RagClient.js` 只允许调用本项目后端 `/api/` 路径。
- `js/workflows/N8nClient.js` 只允许调用本项目后端 `/api/` 路径。
- 前端不允许直接保存或拼接 Qdrant URL、n8n webhook URL、API Key、Bearer token。
- `DialogueManager` 只维护用户输入和事件，不拼接复杂 RAG prompt。
- `AppController` 不接触 RAG、workflow 或长期记忆实现细节。

## 安全边界

- API Key 只在后端环境变量。
- n8n webhook secret 只在后端环境变量。
- Qdrant credential 只在后端环境变量。
- `.env.example` 只保留 placeholder。
- 前端只发送非密钥选项，例如 provider、model、voice、text 和是否启用某能力。
- 本地 `stub` provider 不需要也不会读取真实 API Key。
- 公网部署前必须为 `/api/dialogue`、上传接口、未来 workflow 接口增加鉴权、限流和日志脱敏。

## 当前阶段不做

- 不实现真实 RAG 检索。
- 不实现长期记忆数据库。
- 不接真实 n8n webhook。
- 不新增向量数据库依赖。
- 不新增 LLM provider。
- 不把复杂 prompt 编排塞进前端。

## Phase 3 推荐接入顺序

1. 保持 `/api/chat` 兼容入口稳定。
2. 保留 `stub` 默认演示模式。
3. 验证真实 provider 配置链路。
4. 为 `/api/dialogue` 增加后端 PromptBuilder，不改 UI Controller。
5. 接入 MemoryService 的后端内存短期上下文。
6. 接入 RagService 的本地 markdown / JSON 小型检索，返回 `sources`。
7. 将 N8nWorkflowService 作为工具调用层接入，而不是主对话编排器。
8. 增加鉴权、限流、审计日志和可观测性。

完整 Phase 3 方案见 [PHASE3_INTELLIGENCE_ARCHITECTURE.md](./PHASE3_INTELLIGENCE_ARCHITECTURE.md)。
