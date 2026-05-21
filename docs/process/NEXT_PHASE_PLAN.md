# Next Phase Plan

## Phase 2.1：MVP 验收文档与 Debug 状态面板

**目标**

- 固化阶段 2 的验收标准。
- 为后续排障建立可观察的开发态入口。

**任务清单**

- 维护 `MVP_ACCEPTANCE.md`。
- 新增开发模式 Debug Panel，展示关键状态快照与最近事件。
- 明确哪些状态只用于调试，哪些状态会参与产品交互。

**涉及文件**

- `docs/product/MVP_ACCEPTANCE.md`
- `docs/process/CODEX_EXECUTION_STANDARD.md`
- `docs/process/NEXT_PHASE_PLAN.md`
- 未来可能涉及 `js/ui/`、`js/state/CompanionStateStore.js`、`js/core/events/`

**验收标准**

- 文档可独立说明 MVP 边界。
- Debug Panel 至少可展示 `app.ready / currentAvatarId / currentState / currentAnimation / isThinking / isSpeaking / ttsEngine / lastInteraction / lastError`。
- `npm run check` 通过。

**不做事项**

- 不接真实 RAG。
- 不迁移前端框架。
- 不把 Debug Panel 做成正式用户功能。

**风险**

- 如果调试 UI 与业务 UI 混在一起，后续会增加维护成本。

**测试命令**

```bash
npm run check
```

## Phase 2.2：对话 / 语音 / 动作状态闭环

**目标**

- 把“用户输入 -> thinking -> speaking -> idle”做成稳定演示链路。

**任务清单**

- 复核 `DialogueManager -> AudioManager -> MotionManager` 事件流。
- 补齐失败场景的状态回收。
- 明确 `dialogue:*`、`audio:*`、`animation:*` 事件的消费边界。

**涉及文件**

- `js/app/AppController.js`
- `js/dialogue/DialogueManager.js`
- `js/audio/AudioManager.js`
- `js/voice/TTSService.js`
- `docs/architecture/EVENT_FLOW.md`
- `docs/architecture/STATE_MODEL.md`

**验收标准**

- 对话成功和失败都能回到可交互状态。
- 语音 fallback 不会卡住动画状态。
- `npm run check`、`npm run check:regression`、`npm run smoke` 通过。

**不做事项**

- 不接真实长期记忆。
- 不做口型同步。

**风险**

- 对话、音频、动画状态如果再次互相直连，会让主流程回到高耦合。

**测试命令**

```bash
npm run check
npm run check:regression
npm run dev
npm run smoke
```

## Phase 2.3：角色切换与上传稳定性

**目标**

- 保证默认三角色与上传角色都能沿同一套 manifest 主流程工作。

**任务清单**

- 复核 avatar switch 串行化和旧资源释放。
- 保持上传角色只生成 `manifest.json`。
- 检查旧 `meta.json` fallback 的退场节奏。

**涉及文件**

- `js/avatar/`
- `backend/services/AvatarService.js`
- `public/avatars/`
- `docs/refactor/AVATAR_META_DEPRECATION_PLAN.md`

**验收标准**

- Alice / Shiro / Wambo 可连续切换。
- 切换后只有当前角色留在场景中。
- 新角色 registry 不新增 `meta` 字段。
- 上传失败时有明确错误。

**不做事项**

- 不新增大批角色资产。
- 不提前删除 legacy fallback。

**风险**

- 上传角色的骨骼兼容性天然参差，需要继续把“能加载”和“能完整动起来”分开验收。

**测试命令**

```bash
npm run check
npm run check:regression
npm run dev
npm run smoke
```

## Phase 2.4：自动化回归补强

**目标**

- 把更多真实用户链路沉淀成可重复检查。

**任务清单**

- 继续维护 `check:regression`。
- 评估是否引入轻量浏览器级 E2E。
- 对关键事件流增加更贴近用户行为的断言。

**涉及文件**

- `scripts/`
- 未来可能涉及 `tests/`

**验收标准**

- 关键主流程有自动化保护。
- 新回归检查能在不依赖真实密钥时运行。
- 自动化覆盖不会反过来绑死架构演进。

**不做事项**

- 不为了测试引入重型全家桶。

**风险**

- 过早把实现细节写死进测试，会降低后续重构自由度。

**测试命令**

```bash
npm run check
npm run check:regression
npm run smoke
```

## Phase 2.5：准备接入 RAG / n8n 的后端边界

**目标**

- 为未来 AI 能力增强预留正确位置，而不是把实验代码塞进前端。

**任务清单**

- 明确未来 `/api/dialogue`、RAG、memory、workflow 的后端职责。
- 建立 `DialogueOrchestrationService / MemoryService / RagService / N8nWorkflowService` 后端边界 stub。
- 历史执行顺序：先保持当前 MVP 前端继续使用 `/api/chat`，完成 `/api/dialogue` 后端边界后再单独切换主链路。
- 增加集成边界检查，防止前端直接处理 Qdrant、n8n webhook 或 API Key。

**涉及文件**

- `docs/architecture/`
- `docs/refactor/`
- `backend/routes/dialogueRoutes.js`
- `backend/services/`
- `scripts/check-integration-boundaries.mjs`

**验收标准**

- 能清楚回答未来 RAG / n8n 应接在哪里。
- 当前 UI 不需要为了未来能力重写。
- 前端不新增 secret 处理逻辑。
- `/api/dialogue` 返回稳定 `{ ok, data }`，并可逐步从 boundary stub 演进为 LLM-only 编排。
- `npm run check` 与 `npm run smoke` 通过。

**不做事项**

- 不直接上线真实向量库。
- 不把 workflow secret 暴露到浏览器。

**风险**

- 如果阶段 2 还没闭环就抢跑阶段 3，会重新把项目拖回“边做边拆”的状态。

**测试命令**

```bash
npm run check
```

## Phase 2.6-2.8：统一对话入口与本地 stub 演示

**目标**

- 将 `/api/dialogue` 从后端边界推进为当前前端主对话入口，并让无 API Key 的本地环境也能完成演示闭环。

**已完成事项**

- `/api/dialogue` 支持 LLM-only 编排，Memory / RAG / Workflow 仍为 `disabled / not_configured`。
- 前端主链路已从 `/api/chat` 切换到 `/api/dialogue`，`/api/chat` 保留兼容。
- 默认 LLM provider 改为 `stub`，开发环境无需 API Key 即可获得本地演示回复。
- 真实 provider 仍保留明确错误链路，不吞掉配置错误或上游错误。

**验收标准**

- `npm run check` 通过。
- `npm run smoke` 通过。
- 无 Key 场景不会让前端卡在 thinking / speaking。
- 浏览器手动验收仍按 `docs/process/BROWSER_ACCEPTANCE_CHECKLIST.md` 执行。

## Phase 2.9：MVP 基线封版与阶段 2 收口

**目标**

- 固化阶段 2 的稳定基线，避免后续阶段误伤已经验证过的主链路。

**已完成事项**

- `/api/dialogue` 是前端主入口，`/api/chat` 保留兼容。
- 默认本地演示 provider 是 `stub`。
- Alice / Shiro / Wambo 三角色切换通过。
- 点击交互通过。
- stub 对话通过。
- TTS fallback 通过。
- 最终状态可回到 `idle`。
- 控制台无新增 `error / warn`。

**封版文档**

- `docs/product/MVP_BASELINE.md`

**下一阶段**

- Phase 3 才进入真实 RAG / Memory / n8n / Agent。
- RAG、Memory、n8n、Agent 只允许从后端边界接入，不进入前端 UI 或 AppController。

**测试命令**

```bash
npm run check
npm run dev
npm run smoke
```
