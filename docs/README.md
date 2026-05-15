# Documentation Index

## Architecture

- [ARCHITECTURE.md](./architecture/ARCHITECTURE.md): 系统总览与主流程边界
- [ANIMATION_ARCHITECTURE.md](./architecture/ANIMATION_ARCHITECTURE.md): 动画系统结构、队列、状态机与排查方式
- [AVATAR_ARCHITECTURE.md](./architecture/AVATAR_ARCHITECTURE.md): 可替换角色架构
- [MODULE_BOUNDARIES.md](./architecture/MODULE_BOUNDARIES.md): 模块边界约定
- [EVENT_FLOW.md](./architecture/EVENT_FLOW.md): 事件流
- [STATE_MODEL.md](./architecture/STATE_MODEL.md): 状态模型

## API

- [API.md](./api/API.md): API 概览
- [API_CONTRACT.md](./api/API_CONTRACT.md): API 合约与兼容策略

## Guides

- [DEVELOPMENT_GUIDE.md](./guides/DEVELOPMENT_GUIDE.md): 本地开发与排查
- [CONFIG_GUIDE.md](./guides/CONFIG_GUIDE.md): 配置说明
- [LOCAL_TTS.md](./guides/LOCAL_TTS.md): 本地 TTS 方案

## Product

- [PRD.md](./product/PRD.md): 产品需求
- [DESIGN.md](./product/DESIGN.md): 设计说明
- `产品需求文档.docx`
- `思路和计划文档.docx`
- `竞品与可行性分析报告.docx`

## Review And Refactor

- [PROJECT_REVIEW_REPORT.md](./reports/PROJECT_REVIEW_REPORT.md): 项目审查报告
- [ARCHITECTURE_REFACTOR_PLAN.md](./refactor/ARCHITECTURE_REFACTOR_PLAN.md): 架构重构方案
- [REFACTOR_NOTES.md](./refactor/REFACTOR_NOTES.md): 实际重构记录
- [CHANGESET_BOUNDARIES.md](./refactor/CHANGESET_BOUNDARIES.md): 当前综合 diff 的逻辑边界与建议提交顺序

## Process And Security

- [AGENTS.md](./process/AGENTS.md): Codex 协作约定
- [DEPLOYMENT_SECURITY.md](./security/DEPLOYMENT_SECURITY.md): 部署前安全清单

## Runtime Paths

这些目录是当前运行时真正依赖的路径：

```text
index.html
css/
js/
models/
public/
backend/
scripts/
```

`archive/` 只用于保留旧配置、原始素材和历史脚本，不应被新代码直接引用。
