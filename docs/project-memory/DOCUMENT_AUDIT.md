# Document Audit

最后更新：2026-07-03

本次审计范围：`README*`、`docs/`、`docs/contracts/`、`docs/guides/`、`docs/architecture/`、`package.json`、`.env.example`、`backend/`、`js/`、`public/`、`assets/`、`scripts/` 的结构和关键入口。`docs/mobile-handoff/` 作为已有资料保留，但本轮不展开移动端治理。

## 保留为当前权威

| 文档 | 职责 |
| --- | --- |
| `README.md` / `README.zh-CN.md` | 项目展示、快速启动、总体路线 |
| `docs/project-memory/README.md` | 新 Agent 长期记忆导航入口 |
| `docs/project-memory/CURRENT_STATUS.md` | 当前状态单一摘要 |
| `docs/contracts/DIALOGUE_CONTRACT.md` | `/api/dialogue` Web 表现层语义契约 |
| `docs/api/API_CONTRACT.md` | 后端 API 合约总入口 |
| `docs/guides/LOCAL_TTS.md` | Mock / CosyVoice2 TTS 主线 |
| `docs/guides/COSYVOICE_RUNTIME.md` | CosyVoice2 官方 FastAPI runtime 运行方式 |
| `docs/architecture/VRM_RENDERER_MVP.md` | Web VRMRenderer 当前边界 |
| `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md` | Avatar 表现层分层边界 |

## 保留为阶段性历史 / 参考

这些文档仍有价值，但不应替代当前状态入口：

| 文档 | 使用方式 |
| --- | --- |
| `docs/product/MVP_BASELINE.md` | Phase 2 历史 baseline |
| `docs/product/PHASE3_BASELINE.md` | Phase 3 智能能力 baseline |
| `docs/product/PHASE3_ACCEPTANCE.md` | Phase 3 验收历史 |
| `docs/process/NEXT_PHASE_PLAN.md` | 阶段路线历史和规划参考 |
| `docs/refactor/REFACTOR_NOTES.md` | 长期重构记录，查历史用 |
| `docs/reports/PROJECT_REVIEW_REPORT.md` | 早期审查报告，查问题来源用 |
| `docs/refactor/CHANGESET_BOUNDARIES.md` | 历史 changeset 分组参考 |

## 本次更新 / 修正

| 项目 | 处理 |
| --- | --- |
| 根目录缺少 `AGENTS.md` | 新增根目录 Agent 第一入口 |
| 缺少统一 project memory 入口 | 新增 `docs/project-memory/` |
| `docs/README.md` 缺少 project memory | 已新增入口 |
| `docs/README.md` 引用不存在的 `docs/process/AGENTS.md` | 改为根目录 `AGENTS.md` |
| `docs/README.md` 引用不存在的 `docs/product/PRD.md` / `DESIGN.md` | 从活跃链接中移除，避免误导 |
| `docs/README.md` 引用不存在的 `docs/refactor/ARCHITECTURE_REFACTOR_PLAN.md` | 从活跃链接中移除，避免误导 |
| `docs/mobile-handoff/` 不是本轮重点 | 保留现状，不在本轮继续修改移动端方案 |

## 待验证 / 待人工决定

| 项目 | 状态 |
| --- | --- |
| 是否需要把早期历史文档移入 `archive/` | 暂不移动，避免破坏已有链接；先在 project memory 中标注历史参考 |
| 是否恢复或重建 `docs/product/PRD.md` / `DESIGN.md` | 当前仓库未发现对应 Markdown，仅保留 docx 产品资料；是否重建需用户决定 |
| 是否给每个阶段文档添加顶部“历史参考”标记 | 可作为后续文档治理小任务 |
| 是否整理移动端 handoff | 用户已明确“移动端先不管”；后续需要时再单独处理 |
