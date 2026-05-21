# MVP Baseline

## Phase 2.9 封版结论

阶段 2“MVP 交互闭环与稳定性验收”已经收口。当前项目可作为 `Alice Digital Companion` 的本地 MVP 基线版本，用于后续继续接真实 LLM、RAG、Memory、n8n 和 Agent 工作流。

本基线的目标不是证明项目已经产品化上线，而是明确：当前 3D 数字人主链路、角色切换、点击交互、stub 对话、TTS fallback 和状态回收已经达到可演示、可回归、可继续迭代的稳定点。

## 当前 MVP 主链路

```text
打开 http://localhost:3000?debug=1
  -> 默认加载角色
  -> 可切换 Alice / Shiro / Wambo
  -> 点击 head / body / arm / leg 触发动作反馈
  -> 用户输入文本
  -> 前端调用 /api/dialogue
  -> 默认 provider=stub 返回本地演示回复
  -> AudioManager 请求 TTS
  -> TTS 失败时触发 fallback
  -> speaking 结束后回到 idle
```

## 已确认能力

- `/api/dialogue` 是当前前端主对话入口。
- `/api/chat` 保留旧兼容入口。
- 默认本地演示 provider 是 `stub`，无需 API Key。
- `Alice / Shiro / Wambo` 三角色可加载和切换。
- 点击头部、身体、手臂、腿部会触发交互反馈。
- stub 对话能返回中文本地演示回复。
- TTS 后端不可用时可以触发 fallback，不会卡住主流程。
- Debug Panel 能显示关键状态：`currentAvatarId / currentState / currentAnimation / isThinking / isSpeaking / lastEvent / lastError`。
- 最终状态可回到 `idle`。
- 浏览器控制台无新增 `error / warn`。

## 自动化验收基线

阶段 2 封版前必须通过：

```bash
npm run check
npm run smoke
```

`npm run check` 覆盖：

- JS 语法与导入检查
- 配置检查
- 静态资源路径检查
- legacy avatar 兼容检查
- 动画 / TTS / 角色回归
- MVP 对话音频状态链路
- avatar manifest / 角色流检查
- runtime contract 检查
- integration boundary 检查

`npm run smoke` 覆盖：

- `/api/health`
- `/api/avatars`
- 三角色 manifest / model / motions / skeleton 可访问性
- `/api/dialogue` stub 成功路径
- `/api/chat` 兼容路径
- 非法上传拒绝与 registry 不污染

## 浏览器手动验收基线

按 [BROWSER_ACCEPTANCE_CHECKLIST.md](../process/BROWSER_ACCEPTANCE_CHECKLIST.md) 执行，并至少确认：

- 页面真实打开 `http://localhost:3000?debug=1`。
- Alice / Shiro / Wambo 均可切换。
- 点击 head / body / arm / leg 有动作反馈。
- 发送一句测试文本后，stub 对话返回本地演示回复。
- TTS 或 fallback 事件出现。
- 最终 `currentState=idle`、`isThinking=false`、`isSpeaking=false`、`currentAnimation=-`。
- 控制台没有新增 `error / warn`。

## 阶段 2 明确不包含

- 不接真实 RAG。
- 不接真实长期记忆数据库。
- 不接真实 n8n workflow。
- 不接真实 Agent 工具调用。
- 不做公网部署。
- 不迁移 React / Vue / TypeScript / Vite。
- 不引入 Playwright / Vitest / Jest 等强制依赖。
- 不把 API Key 或 webhook secret 放进前端。

## 下一阶段入口

阶段 3 才进入真实 AI 能力增强：

1. 后端 PromptBuilder 与角色人格配置。
2. MemoryService 的短期会话摘要和用户偏好存储。
3. RagService 的真实检索边界与文档上传策略。
4. N8nWorkflowService 的后端 webhook proxy 与鉴权。
5. `/api/dialogue` 的真实编排：memory -> rag -> workflow -> llm。

下一阶段仍必须保持：前端不直接连接 Qdrant / n8n / provider secret，所有敏感能力只进入后端边界。
