# Phase 3 Intelligence Architecture

## 当前阶段结论

阶段 2 和 Phase 3 均已封版。当前项目有稳定的本地 MVP 基线，也有可继续扩展的智能能力基线：

- `/api/dialogue` 是前端主对话入口。
- `/api/chat` 保留旧兼容入口。
- 默认 LLM provider 是 `stub`，无需 API Key 也能演示。
- 三角色切换、点击交互、TTS fallback、最终 `idle` 已完成验收。
- Provider readiness、短期 Memory、本地 RAG、n8n 工具调用边界和 Agent pipeline 已完成 Phase 3 基线。

Phase 3 的目标不是把所有智能能力一次性塞进去，而是在不破坏阶段 2 基线的前提下，让真实 LLM 配置边界、Memory、RAG、n8n workflow 和 Agent orchestration 进入后端边界。该目标已形成基线，后续 Phase 4 再选择真实部署、安全鉴权、Qdrant / embedding、长期记忆或产品体验增强。

## 推荐总架构

```text
Frontend
  -> DialogueManager
  -> LLMClient
  -> POST /api/dialogue

Backend
  -> dialogueRoutes
  -> DialogueOrchestrationService
    -> MemoryService
    -> RagService
    -> N8nWorkflowService
    -> PromptBuilder (Phase 3.3+)
    -> LLMService
  -> unified response

Frontend
  -> AudioManager / TTSService
  -> MotionManager speaking / idle
```

关键原则：

- 前端继续只调用 `/api/dialogue`，不直接知道 Qdrant、n8n webhook、provider secret。
- `DialogueOrchestrationService` 是 Phase 3 的智能编排中心。
- `LLMService` 只处理 provider 调用，不持有 Memory/RAG/workflow 业务逻辑。
- Memory / RAG / n8n 先做最小闭环，再做持久化和外部系统集成。
- `stub` 必须长期保留为本地演示和回归测试模式。

## `/api/dialogue` 的长期职责

`/api/dialogue` 是唯一推荐的新对话入口，负责接收前端非密钥参数：

- `message`
- `provider`
- `model`
- `systemPrompt`
- `options.useMemory`
- `options.useRag`
- `options.useWorkflow`

长期响应结构保持：

```json
{
  "ok": true,
  "data": {
    "reply": "...",
    "sources": [],
    "memory": {},
    "rag": {},
    "workflow": {},
    "meta": {}
  }
}
```

失败仍返回：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## `DialogueOrchestrationService` 的职责

当前职责：

- 校验 message。
- 调用 Memory / RAG / workflow stub。
- 根据 provider 走 `llm_stub` 或 `llm_only`。
- 返回统一 `reply / sources / memory / rag / workflow / meta`。

Phase 3 基线职责：

1. 读取开关和 provider 配置。
2. 取得 Memory 上下文。
3. 取得 RAG passages。
4. 按需调用 workflow 工具。
5. 组装后端 prompt。
6. 调用 `LLMService`。
7. 写入短期 memory 事件。
8. 返回统一响应。

Phase 3.9 当前实现：

- `options.useMemory=true` 时，`MemoryService` 按 `sessionId` 读取和写入后端内存短期消息。
- `options.useMemory=false` 时，Memory 保持 disabled，不读不写。
- `options.useRag=true` 时，`RagService` 读取 `data/knowledge/` 并执行本地关键词检索。
- `options.useWorkflow=true` 时，`N8nWorkflowService` 只作为后端工具调用层；未配置 n8n 时返回 `not_configured`，配置后由后端调用 webhook。
- `PromptBuilder` 统一组装 systemPrompt、Memory、RAG 和 workflow context。
- 响应包含 `meta.orchestration = "agent_pipeline"` 与 `meta.steps`。

不应该承担：

- DOM 或 UI 状态处理。
- 语音播放。
- 动画控制。
- 直接写死外部系统 secret。

## `LLMService` 的职责

`LLMService` 应保持窄职责：

- 支持 OpenAI-compatible provider。
- 从后端环境变量读取 base URL 和 API Key。
- 做 provider 白名单、缺 key、上游错误、JSON 格式错误处理。
- 为 `/api/chat` 和 `/api/dialogue` 复用同一套 provider 调用能力。

推荐 Phase 3.2 先做：

- 保留 `stub` 默认演示模式。
- 增加明确的“演示模式 / 真实模式”配置说明。
- 增加 `GET /api/providers` readiness 诊断接口，只返回安全状态，不返回 Key 或上游地址。
- 验证 OpenAI / Qwen / DeepSeek / Custom 的真实 provider 配置链路。
- 真实 provider 失败时返回明确错误，不自动吞掉错误。

不建议：

- 在前端保存 API Key。
- 新增没有验收价值的大量 provider。
- 让真实 provider 失败时静默假装成功。
 - 在 provider readiness 接口返回 secret、token 或真实上游地址。

## Memory 推荐演进

### 方案比较

| 方案 | 复杂度 | MVP 适配 | 验收 | 回滚 | 隐私风险 | 长期升级 |
| --- | --- | --- | --- | --- | --- | --- |
| A. 后端内存短期 memory | 低 | 高 | 易 | 易 | 较低，重启即失效 | 可迁移 |
| B. 本地 JSON 文件 | 中 | 中 | 中 | 中 | 有本机隐私落盘 | 可迁移但需清理策略 |
| C. SQLite | 中 | 高 | 中 | 中 | 可控但需 schema | 好 |
| D. Qdrant / vector memory | 高 | 低 | 难 | 难 | 高，需要权限与索引策略 | 强 |
| E. n8n 管理 memory | 中高 | 低 | 难 | 中 | 取决于 n8n 凭据 | 中 |

### 推荐

Phase 3.3 已按方案 A 实现：后端内存短期 memory。

理由：

- 对当前 MVP 最小改动。
- 不需要新增依赖。
- 不写入敏感数据到磁盘。
- 很容易验收：同一服务进程内连续对话能带上简短上下文，重启后清空。
- 回滚简单：关闭 `options.useMemory` 即可。

当前边界：

- 按 `sessionId` 分组。
- 保留最近 6 轮 user/assistant 消息。
- 单条内容会截断，避免 prompt 和响应无限膨胀。
- 不把对话正文写入浏览器 localStorage；前端只允许保存 Memory 开关偏好和 sessionId。
- 不落盘，不是长期记忆。

Phase 3.7 之后再评估 SQLite。不要直接从阶段 3.3 跳到 Qdrant memory。

## RAG 推荐演进

### 路线比较

| 路线 | 最小改动 | 调试友好 | 扩展能力 | 安全边界 | 性能 | 可观测性 | Codex 实现难度 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. 后端直连 Qdrant | 中 | 中 | 强 | 好，但凭据管理更复杂 | 好 | 中 | 中高 |
| B. n8n 负责 RAG 编排 | 中 | 中低 | 中 | 好，但 workflow secret 要严管 | 取决于 n8n | 好 | 中 |
| C. 本地 markdown / JSON 小型检索 | 低 | 高 | 中 | 好 | 足够 MVP | 高 | 低 |

### 推荐

Phase 3.5-3.6 推荐先走路线 C：后端边界内的本地 markdown / JSON 小型检索。

Phase 3.5 已建立本地知识源边界，Phase 3.6 已把本地检索接入 `/api/dialogue options.useRag=true`：

- `data/knowledge/` 存放后端本地 markdown / JSON 示例知识，不进入 `public/`。
- `KnowledgeSourceService` 负责读取知识源，并只暴露相对 source 路径。
- `SimpleRetrieverService` 负责简单关键词检索，返回 `passages / sources / matchedTerms`。
- `RagService` 支持 `disabled / empty / local` 状态，默认使用本地知识检索。
- `DialogueOrchestrationService` 在 `options.useRag=true` 时调用本地检索，并返回 `rag.passages` 与顶层 `sources`。
- `PromptBuilder` 负责把裁剪后的 Memory / RAG 上下文拼入后端 system prompt，前端不拼 prompt。

理由：

- 最符合当前项目阶段。
- 不需要新增向量数据库依赖。
- 易于 Codex 实现和用户手动检查。
- 可以先验证 `sources`、引用展示、prompt 拼装和失败回退。
- 后续可以把 `RagService.retrieve()` 的内部实现替换成 Qdrant，不改前端。

中期可以升级到路线 A：后端直连 Qdrant。n8n 不建议作为主 RAG 编排器。

## n8n 推荐演进

### 角色比较

| 角色 | 说明 | 当前适配 |
| --- | --- | --- |
| A. 主对话编排器 | n8n 决定 Memory/RAG/LLM 全流程 | 不推荐，调试和状态回收会变重 |
| B. 工具调用层 | 后端在需要时调用特定 workflow | 推荐 |
| C. 异步任务和外部系统集成 | 邮件、表格、CRM、通知等 | 推荐 |
| D. 暂不接，只保留边界 | Phase 3 早期可接受 | 已用于 3.1-3.6 |

推荐结论：

- Phase 3.7 已将 n8n 接入为后端可选工具调用层，而不是主对话编排器。
- n8n webhook URL 和 secret 只保存在后端环境变量。
- 前端不应该知道 n8n 的存在，只能通过 `/api/dialogue` 或未来后端 `/api/workflows/*` 间接使用。

后端调用策略：

- 超时默认短于 LLM 超时，当前默认 `N8N_TIMEOUT_MS=8000`。
- 失败返回 `workflow.used=false` 或 `workflow.status=error`，不阻塞基本回复。
- workflow 结果会截断、脱敏、结构化，只放入 `workflow.result` 元数据，不直接覆盖最终 reply。
- 所有 workflow 调用需要日志脱敏和未来鉴权。

## Agent orchestration 最小闭环

Phase 3 的 Agent 不等于“把所有东西塞进 n8n”。推荐最小闭环：

```text
用户输入
  -> /api/dialogue
  -> DialogueOrchestrationService
  -> MemoryService.getContext()
  -> RagService.retrieve()
  -> N8nWorkflowService.invokeWorkflow() optional
  -> PromptBuilder.compose()
  -> LLMService.chat()
  -> MemoryService.appendEvent()
  -> reply / sources / meta
  -> frontend TTS / animation
```

Phase 3.8 已将该链路收口为 `/api/dialogue` 的 `agent_pipeline`：

- `DialogueOrchestrationService` 是唯一编排入口。
- Memory / RAG / Workflow 通过独立开关启用。
- 可选能力失败会收敛为 `status=error` 元数据，不阻塞 stub 或 LLM 主回复。
- `PromptBuilder` 统一组装 system prompt、Memory、RAG 和 workflow context。
- 响应固定包含 `reply / sources / memory / rag / workflow / meta`，其中 `meta.steps` 记录每个子能力状态。

后端 orchestration 负责：

- 状态和上下文编排。
- prompt 拼装。
- provider 调用。
- 工具调用的超时、重试、错误收敛。
- 日志和安全边界。

n8n workflow 负责：

- 外部系统动作。
- 异步任务。
- 用户明确授权后的工具能力。

前端负责：

- 输入与展示。
- Debug Panel。
- 语音播放。
- 动画和状态反馈。

暂时不做：

- 多步自主 Agent。
- 自动执行高风险外部动作。
- 长期个人隐私数据库。
- 前端直连 n8n / Qdrant。

## 前端边界

前端继续只消费：

- `/api/dialogue`
- `/api/tts`
- `/api/avatars`
- 后端 `/api/` 下的未来安全接口

前端不做：

- 拼接 RAG prompt。
- 存储 provider secret。
- 直接调用 Qdrant。
- 直接调用 n8n webhook。
- 保存私有文档或 embedding。

## 安全边界

- API Key 只在后端环境变量。
- n8n webhook secret 只在后端环境变量。
- Qdrant credential 只在后端环境变量。
- `.env.example` 只保留 placeholder。
- 公网部署前必须补鉴权、CORS 白名单、速率限制、上传隔离、日志脱敏。
- RAG 文档与 Memory 数据必须有删除策略和用户可见边界。

## 不推荐路线及原因

- 不推荐立刻接 Qdrant：当前还没验证本地检索、sources、prompt 拼装和 UI 呈现。
- 不推荐 n8n 做主对话编排器：会削弱前端 Debug Panel 和后端状态收口的一致性。
- 不推荐把 Memory 对话正文存到浏览器 localStorage：隐私边界差，且不利于后端编排。Phase 3.4 只允许前端保存开关偏好和 sessionId。
- 不推荐把 RAG prompt 拼到 AppController：会让阶段 2 刚收口的主流程重新膨胀。
- 不推荐移除 `stub`：它是本地演示、smoke 和无密钥开发的安全基线。
