# Deployment Security Notes

当前 `backend/` 是本地开发服务，不应直接裸露到公网。正式部署前至少需要补齐以下能力。

## P0

- 限制 CORS 来源，不要继续使用 `Access-Control-Allow-Origin: *`。
- 给 `/api/dialogue`、`/api/chat`、`/api/tts`、`/api/avatars` 增加鉴权。
- 给上传接口增加速率限制、用户级配额、文件数量限制。
- 对上传模型做更严格扫描；当前只做 `.vrm/.glb/.gltf` 基础格式校验。
- 不在前端或公开静态资源中写入任何 API Key。
- `GET /api/providers` 只能返回非敏感 readiness 状态，不得返回 Key、secret、token、Bearer 或真实上游地址。

## P1

- 增加结构化请求日志和错误日志，隐藏密钥、token、用户隐私字段。
- 为 LLM/TTS 上游请求增加 provider 级超时、重试和降级策略。
- 为 Memory / RAG / n8n / Agent 增加后端开关、请求体截断和错误脱敏。
- RAG 文档与 Memory 数据不得放入 `public/`，需要删除策略和访问边界。
- 当前短期 Memory 仅保存在后端进程内；接入持久化前必须设计用户删除、保留期限和隐私说明。
- 将角色上传目录与公开访问目录隔离，审核通过后再发布到 `public/avatars`。
- 给公网服务增加请求体大小限制和反向代理层限制。

## P2

- 接入对象存储、病毒扫描或模型资源审核队列。
- 接入 OpenTelemetry / APM / 请求追踪。
- 对 RAG 文档、向量库凭证、n8n webhook 做后端密钥管理。
- 对 Agent 外部动作建立风险等级、用户确认和审计日志。
