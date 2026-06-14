# Documentation Index

## Architecture

- [ARCHITECTURE.md](./architecture/ARCHITECTURE.md): 系统总览与主流程边界
- [ANIMATION_ARCHITECTURE.md](./architecture/ANIMATION_ARCHITECTURE.md): 动画系统结构、队列、状态机与排查方式
- [AVATAR_ARCHITECTURE.md](./architecture/AVATAR_ARCHITECTURE.md): 可替换角色架构
- [VRM_RENDERER_MVP.md](./architecture/VRM_RENDERER_MVP.md): Web VRMRenderer MVP、AvatarDirective 消费、audio-driven lip-sync、debug 可观测和测试模型规范
- [VRM_MOTION_READINESS.md](./architecture/VRM_MOTION_READINESS.md): VRM 外部 humanoid 动作接入前的配置字段、retarget readiness 与风险清单
- [AVATAR_PRESENTATION_CONTRACT.md](./avatar/AVATAR_PRESENTATION_CONTRACT.md): Web Avatar 表现层边界、Expression / LipSync / Motion / TTS controller 与 lip-sync debug 规划
- [DIALOGUE_BACKEND_BOUNDARY.md](./architecture/DIALOGUE_BACKEND_BOUNDARY.md): RAG / Memory / n8n / Agent 后端边界
- [PHASE3_INTELLIGENCE_ARCHITECTURE.md](./architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md): Phase 3 真实智能能力接入架构
- [PHASE5_MEMORY_ARCHITECTURE.md](./architecture/PHASE5_MEMORY_ARCHITECTURE.md): Phase 5 记忆系统边界与 SQLite 演进方向
- [MODULE_BOUNDARIES.md](./architecture/MODULE_BOUNDARIES.md): 模块边界约定
- [EVENT_FLOW.md](./architecture/EVENT_FLOW.md): 事件流
- [STATE_MODEL.md](./architecture/STATE_MODEL.md): 状态模型

## API

- [API.md](./api/API.md): API 概览
- [API_CONTRACT.md](./api/API_CONTRACT.md): API 合约与兼容策略
- [DIALOGUE_CONTRACT.md](./contracts/DIALOGUE_CONTRACT.md): `/api/dialogue` Web / iOS 共用语义响应契约

## Mobile Handoff

- [PROJECT_CURRENT_STATUS.md](./mobile-handoff/PROJECT_CURRENT_STATUS.md): 当前 Web / Backend 项目进度、模块和下一阶段方向
- [IOS_MIGRATION_SCOPE.md](./mobile-handoff/IOS_MIGRATION_SCOPE.md): 独立 iOS 原生项目迁移范围，明确不是 WebView 或桌面 Web 完整移植
- [PERSONA_SPEC.md](./mobile-handoff/PERSONA_SPEC.md): Alice / Shiro / Wambo 人格、语气、边界和移动端展示建议
- [DIALOGUE_FLOW_SPEC.md](./mobile-handoff/DIALOGUE_FLOW_SPEC.md): 移动端可复用对话流程、输入输出和状态流转
- [EMOTION_STATE_SPEC.md](./mobile-handoff/EMOTION_STATE_SPEC.md): emotion / tone / avatar_state 继承与映射规则
- [MEMORY_SPEC.md](./mobile-handoff/MEMORY_SPEC.md): 移动端记忆接入方式、后端记忆边界和本地缓存建议
- [API_CONTRACT_FOR_IOS.md](./mobile-handoff/API_CONTRACT_FOR_IOS.md): iOS 需要调用的 chat、persona、TTS、memory、avatar-state API 契约
- [AVATAR_STATE_SPEC.md](./mobile-handoff/AVATAR_STATE_SPEC.md): Web 动作状态到 iOS 轻量 Avatar 状态的映射
- [ASSET_INVENTORY.md](./mobile-handoff/ASSET_INVENTORY.md): 当前角色、模型、动画、音频和 UI 资源的 iOS 复用建议

## Guides

- [DEVELOPMENT_GUIDE.md](./guides/DEVELOPMENT_GUIDE.md): 本地开发与排查
- [CONFIG_GUIDE.md](./guides/CONFIG_GUIDE.md): 配置说明
- [KNOWLEDGE_GUIDE.md](./guides/KNOWLEDGE_GUIDE.md): Phase 3 本地知识源与简单检索边界
- [LOCAL_TTS.md](./guides/LOCAL_TTS.md): 本地 TTS 方案

## Product

- [PRD.md](./product/PRD.md): 产品需求
- [DESIGN.md](./product/DESIGN.md): 设计说明
- [PROJECT_SHOWCASE.md](./product/PROJECT_SHOWCASE.md): GitHub 展示型项目介绍
- [MVP_ACCEPTANCE.md](./product/MVP_ACCEPTANCE.md): 阶段 2 MVP 用户链路与验收标准
- [MVP_BASELINE.md](./product/MVP_BASELINE.md): 阶段 2 封版基线与下一阶段边界
- [PHASE3_ACCEPTANCE.md](./product/PHASE3_ACCEPTANCE.md): Phase 3 智能能力验收标准
- [PHASE3_BASELINE.md](./product/PHASE3_BASELINE.md): Phase 3 智能能力基线封版结论
- [PHASE5_COMPANION_EXPERIENCE.md](./product/PHASE5_COMPANION_EXPERIENCE.md): Phase 5 记忆、人格和陪伴连续性体验方向
- `产品需求文档.docx`
- `思路和计划文档.docx`
- `竞品与可行性分析报告.docx`

## Review And Refactor

- [PROJECT_REVIEW_REPORT.md](./reports/PROJECT_REVIEW_REPORT.md): 项目审查报告
- [ARCHITECTURE_REFACTOR_PLAN.md](./refactor/ARCHITECTURE_REFACTOR_PLAN.md): 架构重构方案
- [REFACTOR_NOTES.md](./refactor/REFACTOR_NOTES.md): 实际重构记录
- [CHANGESET_BOUNDARIES.md](./refactor/CHANGESET_BOUNDARIES.md): 当前综合 diff 的逻辑边界与建议提交顺序
- [AVATAR_META_DEPRECATION_PLAN.md](./refactor/AVATAR_META_DEPRECATION_PLAN.md): `meta.json` 兼容窗口与删除计划

## Process And Security

- [AGENTS.md](./process/AGENTS.md): Codex 协作约定
- [CODEX_EXECUTION_STANDARD.md](./process/CODEX_EXECUTION_STANDARD.md): 每轮任务执行标准
- [NEXT_PHASE_PLAN.md](./process/NEXT_PHASE_PLAN.md): 阶段 2 分期计划
- [PHASE3_IMPLEMENTATION_PLAN.md](./process/PHASE3_IMPLEMENTATION_PLAN.md): Phase 3 分阶段实施计划
- [BROWSER_ACCEPTANCE_CHECKLIST.md](./process/BROWSER_ACCEPTANCE_CHECKLIST.md): 浏览器手动验收清单与自动化覆盖矩阵
- [DEPLOYMENT_SECURITY.md](./security/DEPLOYMENT_SECURITY.md): 部署前安全清单
- [PHASE4_DEPLOYMENT_SECURITY_BASELINE.md](./security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md): Phase 4 公网前安全基线
- [ENVIRONMENT_MODES.md](./deployment/ENVIRONMENT_MODES.md): local / demo / production 配置边界与 Secret 管理
- [DEPLOYMENT_CHECKLIST.md](./deployment/DEPLOYMENT_CHECKLIST.md): 私有演示 / 公网前部署检查清单

## Runtime Paths

这些目录是当前运行时真正依赖的路径：

```text
index.html
css/
js/
public/avatars/
public/models/
backend/
data/knowledge/
scripts/
```

`archive/` 只用于保留旧配置、原始素材和历史脚本，不应被新代码直接引用。
