# Deployment Security Notes

当前 `backend/` 是本地开发服务，不应直接裸露到公网。正式部署前至少需要补齐以下能力。

Phase 3 已完成智能能力基线，但这仍然不是生产部署安全基线。当前 `stub`、短期 Memory、本地 RAG、n8n 工具边界和 Agent pipeline 都默认服务于本地演示与开发验收。

## P0

- 限制 CORS 来源，不要继续使用 `Access-Control-Allow-Origin: *` 面向公网。
- 给 `POST /api/dialogue`、`POST /api/chat`、`POST /api/tts`、`POST /api/avatars` 增加鉴权；Phase 4.1 已提供默认关闭的 `REQUIRE_API_AUTH` / `API_AUTH_TOKEN` 轻量边界，公网前必须启用或替换为正式鉴权。
- `GET /api/health` 可以公开；`GET /api/providers` 可以公开但只能返回安全 readiness 状态；静态资源可以公开。
- 给上传接口增加速率限制、用户级配额、文件数量限制。
- 对上传模型做更严格扫描；当前只做 `.vrm/.glb/.gltf` 基础格式校验。
- 不在前端或公开静态资源中写入任何 API Key。
- `GET /api/providers` 只能返回非敏感 readiness 状态，不得返回 Key、secret、token、Bearer 或真实上游地址。
- `N8N_WEBHOOK_URL` 和 `N8N_WEBHOOK_SECRET` 只能保存在后端环境变量或密钥管理系统中，不得写入前端、文档真实值或公开资源。
- `API_AUTH_TOKEN` 只能保存在后端环境变量或密钥管理系统中，不得写入前端或仓库。

## P1

- 增加结构化请求日志和错误日志，隐藏密钥、token、用户隐私字段。
- 为 LLM/TTS 上游请求增加 provider 级超时、重试和降级策略。
- 为 Memory / RAG / n8n / Agent 增加后端开关、请求体截断和错误脱敏。
- n8n workflow 当前只作为工具调用层；公网部署前需要为 workflow 增加鉴权、超时、调用审计和高风险动作确认。
- Agent 编排只能位于后端 `/api/dialogue` -> `DialogueOrchestrationService`；前端不得参与 Memory / RAG / workflow prompt 拼接，也不得把 workflow 结果直接当最终回复展示。
- `meta.steps`、`memory`、`rag`、`workflow` 等诊断字段只能返回状态、裁剪后的上下文和安全包装结果，不得包含 webhook URL、provider secret、用户隐私原文批量导出或后端绝对路径。
- RAG 文档与 Memory 数据不得放入 `public/`，需要删除策略和访问边界。
- 当前短期 Memory 仅保存在后端进程内；接入持久化前必须设计用户删除、保留期限和隐私说明。
- 将角色上传目录与公开访问目录隔离，审核通过后再发布到 `public/avatars`。
- 给公网服务增加请求体大小限制和反向代理层限制。

## P2

- 接入对象存储、病毒扫描或模型资源审核队列。
- 接入 OpenTelemetry / APM / 请求追踪。
- 对 RAG 文档、向量库凭证、n8n webhook 做后端密钥管理。
- 对 Agent 外部动作建立风险等级、用户确认和审计日志。
