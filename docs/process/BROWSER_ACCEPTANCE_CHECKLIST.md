# Browser Acceptance Checklist

## 适用范围

这份清单用于补足当前无法稳定自动化的浏览器级验收，尤其是角色快速切换、真实点击模型、Debug Panel 状态观察和控制台检查。

自动化脚本已经覆盖大部分静态与逻辑回归，但浏览器内 WebGL、语音、点击命中和真实 UI 操作仍需要人工确认。

## 自动化覆盖矩阵

| 命令 | 覆盖范围 | 是否需要本地服务 |
| --- | --- | --- |
| `npm run check:js` | JavaScript 语法与模块可解析性 | 否 |
| `npm run check:config` | 运行时配置、avatar registry、manifest 基础约束 | 否 |
| `npm run check:assets` | manifest / motions / skeleton / animation 静态资源存在性 | 否 |
| `npm run check:legacy-avatar` | `meta.json` legacy fallback 兼容窗口 | 否 |
| `npm run check:regression` | 动画状态机、动作队列、三角色、TTS provider 基础回归 | 否 |
| `npm run check:mvp-flow` | 对话、音频、fallback、错误事件链路 | 否 |
| `npm run check:avatar-flow` | registry / manifest / motions / runtime path 合约 | 否 |
| `npm run check:runtime-contracts` | EventBus、StateStore、Debug Panel、AppController 收口合约 | 否 |
| `npm run check:experience-entry` | 单一 Alice 普通入口、首次记忆同意、开发工具隔离和文案一致性 | 否 |
| `npm run check:provider-config` | Provider readiness、默认 stub 与前端 secret 边界 | 否 |
| `npm run check:memory-flow` | 后端短期 Memory、sessionId、maxTurns 裁剪 | 否 |
| `npm run check:knowledge-flow` | 本地知识源读取与简单检索边界 | 否 |
| `npm run check:rag-flow` | 本地 RAG、sources 与 PromptBuilder 注入 | 否 |
| `npm run check:workflow-flow` | n8n workflow disabled / not_configured / timeout / success 边界 | 否 |
| `npm run check:agent-flow` | Agent pipeline 顺序、独立开关与可选能力降级 | 否 |
| `npm run smoke` | 本地服务、API、三角色资源、非法上传拒绝、短期 Memory API | 是 |
| `npm run check:browser-capability` | 可选检测本地是否已有 Playwright，不联网安装 | 否 |

## 启动方式

1. 运行：

```bash
npm run dev
```

2. 普通用户验收打开：

```text
http://localhost:3000/
```

3. 开发与 QA 验收打开：

```text
http://localhost:3000?debug=1
```

4. 只有显式 `?debug=1` / `?localVrm=1` 入口显示开发设置和 Debug Panel。

## 0. 普通用户 60 秒首次进入

操作步骤：

- 使用新的浏览器上下文打开 `http://localhost:3000/`。
- 等待 Alice 出现，不提供任何开发者讲解。
- 根据需要勾选“允许 Alice 记住这次聊天”，点击“开始聊聊”。
- 输入一句自然中文并发送。

预期 UI：

- 首屏只有 Alice、一次点击即可完成的欢迎卡、声音开关和对话输入；不显示 Provider、Stub、Mock、上传、Debug、服装、亲密度、录制或分享入口。
- 记忆默认关闭；用户选择后，右上角“记忆与隐私”可以再次开关并清除本次会话记忆。
- 完整服务未 ready 时只显示“对话/声音还在准备”的用户提示，不显示 Key、URL 或 Provider 术语。
- 点击“开始聊聊”后输入框立即获得焦点；用户应能在 60 秒内发送第一句话。
- 普通本地入口不显示 Debug Panel；`?debug=1` 仍能恢复完整开发工具。

## 1. 默认 Alice 加载

操作步骤：

- 打开 `http://localhost:3000?debug=1`。
- 等待 loading 消失。

预期 Debug Panel：

- `app.ready = true`
- `currentAvatarId = alice`
- `avatar.loaded = true`
- `currentState = idle`
- `currentAnimation = -`

预期 UI：

- 页面显示 Alice。
- 状态徽章回到“在这里”。

失败优先检查：

- `public/avatars/registry.json`
- `public/avatars/alice/manifest.json`
- `js/avatar/CharacterManager.js`
- `js/animation/MotionManager.js`

## 2. 普通角色切换

操作步骤：

- 在角色下拉框选择 Shiro。
- 等待状态回到 idle。
- 再选择 Wambo。
- 再切回 Alice。

预期 Debug Panel：

- `avatar.loading` 在切换期间短暂为 `true`。
- `currentAvatarId` 与最终选择一致。
- `avatar.loaded = true`
- `lastEvent` 出现 `avatar:switch:complete` 或后续动画事件。
- 最终 `currentState = idle`
- 最终 `currentAnimation = -`

预期 UI：

- 场景中只保留当前角色。
- 不出现多个角色重叠。

失败优先检查：

- `js/app/AppController.js`
- `js/avatar/CharacterManager.js`
- `js/avatar/AvatarLoader.js`
- `js/scene/SceneRuntime.js`

## 3. 快速连续切换

操作步骤：

- 快速连续选择 `Alice -> Shiro -> Wambo`。
- 不要等待每一次动画结束。
- 等最后一次切换完成。

预期 Debug Panel：

- 最终 `currentAvatarId = osa_wambo`
- 最终 `avatar.loading = false`
- 最终 `avatar.loaded = true`
- 最终 `currentState = idle`
- 最终 `currentAnimation = -`
- 不应出现旧角色延迟回调造成的错误状态。

预期 UI：

- 只显示 Wambo。
- 不出现旧模型残留或动作错乱。

失败优先检查：

- `AppController.avatarSwitchChain`
- `AppController.avatarSwitchVersion`
- `CharacterManager.switchCharacter()`
- `SceneRuntime.clearAvatarObject()`

## 4. 点击交互

操作步骤：

- 在当前角色上点击头部。
- 点击手臂。
- 点击腿部。
- 点击身体区域。

预期 Debug Panel：

- `lastInteractionAt` 更新。
- `lastEvent` 出现 `interaction:hit` 或对应动画事件。
- `currentAnimation` 短暂出现动作名，然后回到 `-`。
- 最终 `currentState = idle`。

预期 UI：

- 每个部位有动作反馈或定义好的 fallback 反馈。
- 连续点击不会出现动作叠加失控。

失败优先检查：

- `js/interaction/InteractionManager.js`
- `js/interaction/HitTestController.js`
- `public/avatars/{avatarId}/manifest.json`
- `public/avatars/{avatarId}/motions.json`

## 5. 对话与 TTS fallback

操作步骤：

- 输入一句测试文本，例如：`你好，做一次状态测试。`
- 当前前端主链路会调用 `/api/dialogue`。
- 默认 LLM provider 为 `stub`，无真实 LLM Key 时也应返回本地演示回复。
- 如果用户显式切换到真实 provider 但未配置 Key，允许进入明确错误与 fallback 链路。

预期 Debug Panel：

- `lastUserMessage` 更新。
- 请求期间可看到 `isThinking = true`，如果后端立即失败可能只短暂出现。
- 最终 `isThinking = false`。
- 播放期间 `isSpeaking = true`。
- 播放或定时兜底结束后 `isSpeaking = false`。
- 最终 `currentState = idle`。
- `lastAssistantMessage` 有本地 stub 回复、真实 LLM 回复或本地兜底回复。
- 如果 TTS 后端失败，`lastEvent` 可出现 `audio:fallback`。

预期 UI：

- 发送按钮不会永久禁用。
- 页面不会卡在 thinking 或 speaking。

失败优先检查：

- `js/dialogue/DialogueManager.js`
- `js/ai/LLMClient.js`
- `backend/routes/dialogueRoutes.js`
- `backend/services/DialogueOrchestrationService.js`
- `js/audio/AudioManager.js`
- `js/voice/TTSService.js`
- `js/app/AppController.js`

## 5.1 真实 CosyVoice2 长音频与 VRM 口型

前置条件：CosyVoice2 runtime 已启动，Web Settings 选择 `cosyvoice`，使用支持 mouth morph 的 VRM（推荐 `local_girl_vrm_test`）。

操作步骤：

- 发送预计 30–120 秒的中文文本。
- 播放超过原文本估算时长后继续观察模型和 Debug Panel。
- 播放中再发送一句短文本，验证旧音频被替代。
- 再分别验证自然结束、TTS fallback / error、播放中切换角色。

预期 Debug Panel：

- 后端音频期间 `lipSync.mode = audio-driven`。
- `lipSync.audioDriven = true`，`lipSync.amplitude` 和 `lipSync.mouth` 持续变化。
- 长音频未真实结束前不会因文本 timer 提前变成 `idle`。
- 被替代的旧音频不会在新音频期间延迟触发 end。
- 每条结束 / 错误 / 切换路径最终均为 `lipSync.mode = idle`、`isSpeaking = false`、`currentState = idle`。

预期 UI：

- 嘴部随声音强弱变化，无长时间锁死张嘴、数值发散或结束后残留。
- 表情和 speaking / gesture 动作可并行，但音频结束后安全回到 idle。
- 控制台无 AudioContext、media element source、morph target 或未处理 Promise 错误。

失败优先检查：

- `js/avatar/presentation/PresentationOrchestrator.js`
- `js/avatar/presentation/LipSyncController.js`
- `js/avatar/presentation/AudioAmplitudeSampler.js`
- `js/avatar/renderers/VRMRenderer.js`
- `js/voice/TTSService.js`
- `js/app/AppController.js`

### 2026-07-14 P2 实测记录

当前结论：**完整通过本轮要求的 5–10 秒与 30–60 秒场景**。本轮使用真实 Chromium、CosyVoice2 官方 FastAPI、`local_girl_vrm_test`，没有用模拟音频替代以下结论。

| 场景 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| CosyVoice2 runtime / live | 通过 | 官方 FastAPI 前台运行；live 返回 WAV，`streaming=false`、`upstreamStreaming=true`。 |
| `local_girl_vrm_test` + Provider readiness | 通过 | Web Settings 显示 CosyVoice2 可用、voice `中文女`、服务已连接。 |
| 5–10 秒短中文语音 | 通过 | 实际 `6.64s`；63 个 `audio-driven` 样本，amplitude `0–0.327`，mouth `0.03–0.112`，五元音组均出现。 |
| 表情 / 动作 / 口型并行 | 通过 | 短/长音频中均观察到 speaking body motion、neutral expression、blink 与 mouth morph 同时存在。 |
| 短语音自然结束清理 | 通过 | lip-sync 回 idle，mouth amount / mouth morph 全归零，`isSpeaking=false`、Avatar state idle。 |
| 30–60 秒长中文语音 | 通过 | 实际 `37.12s`；359 个 `audio-driven` 样本，amplitude `0–0.308`，mouth `0.03–0.11`，五元音组均出现，结束后 mouth morph 全 0，motion idle 观测延迟约 1ms。 |
| 连续快速两段语音 | 通过 | 旧音频在 1.69s 处暂停；新音频对象不同。修复后合成间隙口型/Avatar/motion 立即 idle，新音频开始后重新 audio-driven，无陈旧 end 干扰。 |
| 播放中取消 / 静音 | 通过 | 点击页面真实“语音开关”；200ms 后旧音频 paused、`currentAudio=false`、lip-sync/mouth 归零，Avatar 与 motion idle。 |
| TTS 错误 / 中断恢复 | 通过 | 停止 CosyVoice2 后观察到 browser fallback 的 `requested → playing → ended` 与 lip-sync `idle → loop → idle`；重启后下一段 `6.4s` 真实音频恢复 audio-driven。 |

现场发现并修复两个非视觉参数问题：

- 真实 30+ 秒音频生成首次耗时 49.6–58.4 秒，原 45 秒通用上游超时会提前 fallback；现已改为 TTS 独立默认 90 秒，前端 TTS 等待 100 秒，不改 LLM 时限。
- 原快速替换/静音会暂停音频但保留旧 audio sampler；现已在取消活动播放时发出 `audio:end(cancelled=true)` 清理表现层。

口型参数保持不变。全身视角下嘴型较克制，但数值变化连续（长音频 mouth 步进均值约 `0.00037`、最大 `0.017`），没有明确过小/过大、高频抖动、锁嘴或可见延迟证据。`short-active.png` 是有效全身播放中证据；`short-peak-closeup.png` 因头部被裁切仍不作为调参依据。

### 2026-07-23 P2 扩展验收与保守口型收口

当前结论：**默认 Alice 的 60–120 秒真实音频、连续两轮和自然结束已通过；根据近景视觉反馈，将口型收敛为“不露齿、只需看出嘴在动”的产品策略。**

| 场景 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| Demo readiness | 通过 | `demo:start` 真实验证 DeepSeek `llm_only` 与 CosyVoice WAV；CosyVoice runtime 为 `24000 Hz`、speaker `中文女`。 |
| 60–120 秒真实 CosyVoice2 | 通过 | 455 字受控对话响应进入真实 `/api/tts`；36 段音频合计 `99.48s`，总链路 `134.75s`，全程口型 audio-driven，最终 `isSpeaking=false / lipSync=idle / mouth=0`。 |
| 保守口型近景 | 通过 | 只出现 `mouthU / mouthO`；真实振幅窗口最大 mouth amount `0.10`，代码硬上限 `0.22`；warm 期间 `happy=0 / relaxed=0`，近景未见露齿张嘴。 |
| 连续两轮 | 通过 | 第一轮 24 字、2 段、音频 `5.56s`；第二轮 26 字、2 段、音频 `6.84s`，实时捕获 66 个 audio-driven 样本，最终均自然回 idle。 |
| Debug / Console | 通过 | 受控对话 requestId 连续覆盖；播放完成无 lastError。Console 无新 error，仅保留 three-vrm-animation 自动创建 LookAt proxy 的既有 warning。 |
| P5 延迟证据 | 待后续决策 | 99.48 秒音频出现 17 次 underrun，最大段间 gap `6.088s`；这是本机 CosyVoice 推理/分段预取瓶颈，不是口型接线失败。 |

补充说明：

- 首次尝试真实 DeepSeek 长回复时，provider 在 `5.685s` 后产生 `empty_response`，P3 Debug 正确显示 `deepseek → stub`；该 42 字 fallback 仅生成 `8.68s` 音频，不计入长音频验收。
- 为隔离 LLM 不稳定性，99.48 秒场景只在浏览器内受控替换 `/api/dialogue` 响应；`/api/tts`、CosyVoice2 runtime、分段播放、AudioManager、事件总线、VRMRenderer 与 amplitude sampler 均为真实链路。
- 本轮视觉证据位于 `output/playwright/p2-conservative-mouth-closeup.png`、`p2-long-natural-end.png` 和 `p2-consecutive-final-idle.png`。

## 6. 短期 Memory 开关

操作步骤：

- 打开 LLM 设置区。
- 勾选“启用当前会话短期记忆”。
- 点击“保存偏好”或直接发送两句连续测试文本。
- 第一轮输入：`请记住我喜欢蓝色。`
- 第二轮输入：`我刚刚说我喜欢什么？`

预期 Debug Panel：

- `memory.enabled = true`
- 第一轮后 `memory.used = true`
- `memory.sessionId` 有稳定值。
- 第二轮后 `memory.turnCount` 增加。
- 最终 `isThinking = false`
- 最终 `currentState = idle`

预期 UI：

- 设置区显示当前 Session。
- 页面不会把对话正文保存到前端存储。
- 关闭开关后，新请求应带 `useMemory=false`，Debug Panel 显示 `memory.enabled = false`。

失败优先检查：

- `js/ui/LLMSettingsController.js`
- `js/storage/LocalConfigStore.js`
- `js/ai/LLMClient.js`
- `js/dialogue/DialogueManager.js`
- `backend/services/MemoryService.js`
- `backend/services/DialogueOrchestrationService.js`

## 7. 非法上传

操作步骤：

- 在角色上传区域选择一个非 `.vrm/.glb/.gltf` 文件。
- 点击上传。

预期 Debug Panel：

- 当前角色不应变化。
- `currentAvatarId` 保持原角色。

预期 UI：

- 前端显示上传失败。
- 页面不崩溃。
- 角色下拉框不新增非法角色。

失败优先检查：

- `js/ui/AvatarSelectorController.js`
- `backend/services/UploadValidationService.js`
- `backend/services/AvatarService.js`
- `scripts/smoke-test.mjs`

## 8. Phase 3 智能能力复验

操作步骤：

- 确认默认 provider 为 `stub`。
- 发送一句普通测试文本，确认 stub 对话能返回。
- 打开短期 Memory 开关，连续发送两句相关文本。
- 打开 RAG 开关，发送包含 `Alice RAG Memory` 的测试文本。
- 如果 UI 没有 workflow 开关，可用 API 或 smoke 验证 `options.useWorkflow=true`；无 n8n 配置时应看到 `not_configured`。

预期 Debug Panel / API 状态：

- `isThinking` 最终回到 `false`。
- `isSpeaking` 最终回到 `false`。
- `currentState` 最终回到 `idle`。
- `memory.enabled` 与设置区一致。
- Memory 开启后 `memory.used = true`，`memory.turnCount` 增加。
- RAG 开启时 API 返回 `rag.status = local`，且可包含 `sources`。
- Workflow 未配置时 API 返回 `workflow.status = not_configured`，不阻塞基础 reply。
- `/api/dialogue` 响应 `meta.orchestration = agent_pipeline`，`meta.steps` 包含 memory / rag / workflow 状态。

预期 UI：

- 发送按钮不会永久禁用。
- TTS / fallback 不会卡住 speaking。
- 页面不会出现 secret、webhook URL 或 provider Key。

失败优先检查：

- `backend/services/DialogueOrchestrationService.js`
- `backend/services/PromptBuilder.js`
- `backend/services/MemoryService.js`
- `backend/services/RagService.js`
- `backend/services/N8nWorkflowService.js`
- `scripts/check-agent-flow.mjs`
- `scripts/smoke-test.mjs`

## 9. 控制台检查

操作步骤：

- 打开浏览器 DevTools Console。
- 完成上述验收。

预期：

- 首屏加载没有新增 `error / warn`。
- 故意触发 LLM/TTS 缺 key 时，可以出现预期错误提示，但不应出现未捕获异常。

失败优先检查：

- `js/core/errors/errorHandler.js`
- `js/services/api/ApiClient.js`
- `js/app/AppController.js`

## 完成标记

手动验收完成后，建议记录：

- 验收日期
- 当前 commit hash
- 浏览器名称与版本
- 是否配置真实 LLM/TTS key
- 失败项与截图
