# Agent Handoff Checklist

最后更新：2026-07-03

这份清单给后续 Codex、Claude Code、Cursor 或其他 Coding Agent 使用。

## 从零判断项目是否可运行

1. 看工作树：

```bash
git status --short
```

2. 看脚本和运行方式：

```bash
npm run check
npm run smoke
```

3. 启动本地 Web / Backend：

```bash
npm run dev
```

打开：

```text
http://localhost:3000
http://localhost:3000?debug=1
```

需要真实 DeepSeek + CosyVoice2 完整 Demo 时优先使用：

```bash
npm run demo:start
npm run demo:status
npm run demo:stop
```

`demo:status` 会产生一次很小的真实 DeepSeek 请求和一次本地 CosyVoice 推理。完整语义见 `docs/guides/DEMO_RUNTIME.md`。

4. 按任务补专项检查：

```bash
npm run check:dialogue-contract
npm run check:tts-provider-flow
npm run check:vrm-renderer-flow
npm run check:cosyvoice-runtime
```

`check:cosyvoice-runtime` 和 `check:cosyvoice-live` 依赖本地外部 runtime，不是所有机器都能默认通过。

## 修改前阅读路径

| 要改的模块 | 先读 |
| --- | --- |
| `/api/dialogue` | `docs/contracts/DIALOGUE_CONTRACT.md`、`backend/contracts/dialogueContract.js`、`backend/services/DialogueOrchestrationService.js` |
| TTS | `docs/guides/LOCAL_TTS.md`、`backend/services/tts/*`、`backend/routes/ttsRoutes.js` |
| CosyVoice2 | `docs/guides/COSYVOICE_RUNTIME.md`、`scripts/cosyvoice/*` |
| Memory | `docs/architecture/PHASE5_MEMORY_ARCHITECTURE.md`、`backend/services/MemoryService.js`、`backend/db/schema.sql` |
| Persona / Emotion | `backend/config/avatarPersonas.js`、`backend/services/CompanionAffectService.js` |
| Avatar registry | `docs/architecture/AVATAR_ARCHITECTURE.md`、`public/avatars/registry.json` |
| VRMRenderer | `docs/architecture/VRM_RENDERER_MVP.md`、`js/avatar/renderers/*` |
| 表现层 / lip-sync | `docs/avatar/AVATAR_PRESENTATION_CONTRACT.md`、`js/avatar/presentation/*` |
| 安全 / env | `.env.example`、`docs/deployment/ENVIRONMENT_MODES.md`、`backend/config/serverConfig.js` |

## 环境问题 vs 代码问题

更可能是环境问题：

- `COSYVOICE_BASE_URL` 未配置导致 CosyVoice2 unavailable。
- `runtime/cosyvoice/` 不存在或模型权重缺失。
- 本地端口 `3000` 或 `50000` 被占用。
- 真实 provider 缺 API Key。
- 本地测试 VRM 文件不存在，且脚本明确允许跳过。

更可能是代码问题：

- `npm run check:dialogue-contract` 失败。
- `npm run check:tts-provider-flow` 暴露 secret、base URL 或 provider 私有字段。
- `/api/dialogue` 返回 renderer-specific 字段。
- `npm run check:vrm-renderer-flow` 发现 local test asset 进入 public registry。
- `npm run smoke` 在默认 stub/mock 环境失败。

## 提交前最低验证

| 修改范围 | 最低验证 |
| --- | --- |
| 文档 | `git diff --check` |
| 通用 JS / config | `npm run check:js`、`npm run check:config` |
| API / dialogue | `npm run check:dialogue-contract`、`npm run smoke` |
| TTS | `npm run check:tts-provider-flow`，必要时 `npm run check:tts-live` |
| VRM / Avatar | `npm run check:vrm-renderer-flow`、必要时浏览器 debug 手动验收 |
| Memory | `npm run check:memory-flow`、`npm run check:sqlite-flow` |
| 安全 / env | `npm run check:security-boundaries`、`npm run check:deployment-readiness` |
| 大范围修改 | `npm run check` |

## 交接输出必须包含

- 已完成。
- 修改文件。
- 验证结果。
- 风险 / 注意事项。
- 建议下一步。
- 建议提交信息。

如果无法验证，必须写清楚原因和后续检查路径。
