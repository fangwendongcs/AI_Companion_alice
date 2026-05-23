# Alice Digital Companion

AI 数字伙伴 / 互动数字人项目。当前支持：

- Alice / Shiro / Wambo 角色切换
- 可配置角色资源与动作槽位
- 点击部位交互
- 浏览器语音兜底与后端 TTS 代理
- 本地 Node 后端代理接口
- `/api/dialogue` 前端主对话入口，支持本地 Stub 演示、后端短期 Memory、本地 RAG 与后端 n8n 工具调用边界

当前项目已完成“阶段 1：架构基座搭建”、“阶段 2：MVP 交互闭环与稳定性验收”和“Phase 3：真实智能能力接入基线”。当前 `/api/dialogue` 是统一智能编排入口，已具备 stub/真实 provider readiness、后端短期 Memory、本地 RAG、n8n 工具调用边界与最小 Agent pipeline。当前 Memory 是后端进程内短期记忆，前端只保存开关偏好和 sessionId，不保存对话正文。

当前明确未包含：Qdrant / embedding、长期记忆数据库、多 Agent、无限循环 Agent、生产级鉴权和公网部署安全加固。

## Quick Start

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

默认 LLM provider 是 `stub`，无需 API Key 也能跑通本地对话演示。切换到 OpenAI / Qwen / DeepSeek / Custom 时，仍需要在后端环境变量中配置对应 Key。

真实 provider 准备状态可通过后端安全诊断接口查看：

```text
GET /api/providers
```

该接口只返回 `configured / mode / requiresKey / defaultModel` 等非敏感状态，不返回 API Key、token 或 secret。

常用检查：

```bash
npm run check
npm run check:regression
npm run check:security-boundaries
npm run smoke
npm run check:browser-capability
```

完整本地验收建议：

```bash
npm run check
npm run dev
npm run smoke
```

然后打开：

```text
http://localhost:3000?debug=1
```

按 [BROWSER_ACCEPTANCE_CHECKLIST.md](./docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md) 完成浏览器手动验收。当前浏览器级快速连切、真实点击命中和控制台观察仍是手动验收项，不应宣称已经全自动覆盖。

## Main Directories

```text
backend/  本地后端服务
css/      前端样式
docs/     架构、指南、产品与重构文档
js/       前端源码
public/   可替换角色资源与运行时静态模型资源
scripts/  检查与 smoke 脚本
archive/  历史配置、旧脚本、原始素材归档
```

更多说明见 [docs/README.md](./docs/README.md)。

阶段 2 入口文档：

- [MVP_ACCEPTANCE.md](./docs/product/MVP_ACCEPTANCE.md)
- [MVP_BASELINE.md](./docs/product/MVP_BASELINE.md)
- [CODEX_EXECUTION_STANDARD.md](./docs/process/CODEX_EXECUTION_STANDARD.md)
- [NEXT_PHASE_PLAN.md](./docs/process/NEXT_PHASE_PLAN.md)
- [BROWSER_ACCEPTANCE_CHECKLIST.md](./docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md)
- [DIALOGUE_BACKEND_BOUNDARY.md](./docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md)

阶段 3 智能能力基线文档：

- [PHASE3_INTELLIGENCE_ARCHITECTURE.md](./docs/architecture/PHASE3_INTELLIGENCE_ARCHITECTURE.md)
- [PHASE3_IMPLEMENTATION_PLAN.md](./docs/process/PHASE3_IMPLEMENTATION_PLAN.md)
- [PHASE3_ACCEPTANCE.md](./docs/product/PHASE3_ACCEPTANCE.md)
- [PHASE3_BASELINE.md](./docs/product/PHASE3_BASELINE.md)

Phase 4 安全基线文档：

- [PHASE4_DEPLOYMENT_SECURITY_BASELINE.md](./docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md)
