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
| `npm run smoke` | 本地服务、API、三角色资源、非法上传拒绝、短期 Memory API | 是 |
| `npm run check:browser-capability` | 可选检测本地是否已有 Playwright，不联网安装 | 否 |

## 启动方式

1. 运行：

```bash
npm run dev
```

2. 打开：

```text
http://localhost:3000?debug=1
```

3. 展开右下或左下的 Debug Panel。

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
- 状态徽章回到 `ONLINE`。

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

## 8. 控制台检查

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
