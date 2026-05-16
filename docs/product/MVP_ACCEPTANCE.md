# MVP Acceptance

## 当前阶段

`Alice Digital Companion` 已完成阶段 1 的架构基座建设。阶段 2 的目标不是继续扩大重构，而是把现有系统收口成一个可稳定演示、可重复验收、可继续迭代的 AI 数字伙伴 MVP。

## MVP 用户链路

```text
打开页面
  -> 默认加载 Alice
  -> 用户可切换 Shiro / Wambo
  -> 点击 head / body / arm / leg 触发交互反馈
  -> 用户输入一句话
  -> 前端经后端 /api/chat 发起对话
  -> 数字人进入 thinking
  -> 回复返回后进入 speaking
  -> TTS 播放或回退到 browser 语音
  -> 播放结束后回到 idle
```

## 功能验收标准

- `npm run dev` 可启动服务，页面可通过 `http://localhost:3000` 打开。
- 默认角色 Alice 可加载。
- Shiro 与 Wambo 可切换成功。
- 点击 head、arm、leg、body 可触发对应动作槽位或已定义 fallback。
- 用户可输入文本并触发对话链路。
- 输入提交后系统能进入 `thinking`，回复产生后进入 `speaking`。
- TTS 成功时可播放音频；后端 TTS 失败时会回退到浏览器语音。
- 播放结束后系统回到 `idle`。
- 失败场景有明确提示，不应卡死在 thinking / speaking。
- 页面无新增的关键 console error。

## 技术验收标准

- `npm run check` 通过。
- `npm run check:regression` 通过。
- 本地服务启动后 `npm run smoke` 通过。
- 无新增生产依赖。
- 无运行时代码引用 `archive/`。
- 无运行时代码引用旧根目录 `models/`。
- 新角色继续以 `manifest.json` 为主入口。
- UI 不直接硬编码 FBX 文件名或模型路径。
- 新增文档路径与 `README.md` / `docs/README.md` 保持一致。

## 安全验收标准

- 前端不暴露 API Key、token、secret 或 password。
- `.env.*` 不提交，`.env.example` 只保留 placeholder。
- 后端继续从环境变量读取敏感配置。
- 角色上传只接受 `.vrm / .glb / .gltf`。
- `.vrm / .glb` 做基础 magic 校验，`.gltf` 做 JSON 与 `asset.version` 校验。
- 未经单独安全设计，不把上传接口直接暴露到公网。

## 手动验收步骤

1. 运行 `npm run dev`。
2. 打开 `http://localhost:3000`。
3. 确认默认加载 Alice，状态最终回到 `IDLE`。
4. 在侧边栏切换到 Shiro，再切换到 Wambo，再切回 Alice。
5. 分别点击 head、arm、leg、body，确认有动作反馈，且动作结束后回到 `IDLE`。
6. 输入一句话并发送，确认系统依次进入 `THINKING`、`SPEAKING`，最后回到 `IDLE`。
7. 选择后端 TTS 时验证正常播放；未配置或失败时确认 browser fallback 可用。
8. 刷新页面，确认已保存的偏好仍然按预期生效。
9. 打开浏览器控制台，确认没有新增的关键错误。

## 自动化验收命令

```bash
npm run check
npm run check:regression
npm run dev
npm run smoke
```

`npm run smoke` 需要先启动本地服务。

## 当前 MVP 明确不做

- 暂不实现真实 RAG。
- 暂不实现长期记忆数据库。
- 暂不接复杂 n8n workflow。
- 暂不做公网部署。
- 暂不迁移 React / Vue / TypeScript / Vite。
- 暂不引入重型依赖。
- 暂不把实验性未来能力直接堆进 UI Controller。
