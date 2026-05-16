# Codex Execution Standard

## 1. 开始前检查

每轮任务开始前必须先运行：

```bash
git status -sb
```

- 如果工作区不干净，先报告已有改动。
- 未经用户明确授权，不得覆盖、回退或删除用户已有改动。
- 修改前必须先阅读相关文件，不允许盲改。

## 2. 禁止命令

除非用户明确要求，否则禁止执行：

```bash
git reset --hard
git checkout --
rm -rf
```

## 3. 默认禁止事项

除非用户明确要求，否则不允许：

- `git push`
- 创建 commit
- 删除文件
- 大规模移动文件
- 增加生产依赖
- 改写 Git 历史
- 为了“看起来更工程化”而做无关重构

## 4. 修改原则

- 保留当前可运行行为。
- 优先沿用现有模块边界。
- 角色、动作、路径、provider、voice、secret 优先配置化。
- UI 不直接处理 Three.js 底层细节。
- 不把 RAG、长期记忆、n8n 或 Agent 假逻辑塞进前端入口。
- 不确定用途的旧文件先标记 TODO，不盲删。

## 5. 验证要求

每轮代码修改后至少运行：

```bash
npm run check
```

如果改动涉及后端、API、角色、manifest、模型路径、动作路径或静态资源，需要在本地服务启动后运行：

```bash
npm run smoke
```

如果改动涉及动画、角色、TTS 或 provider，还需要运行：

```bash
npm run check:regression
```

## 6. 输出格式

每轮任务结束时，中文输出必须包含：

### 已完成
- ...

### 修改文件
- `path/to/file`: ...

### 验证结果
- `npm run check`: 通过 / 未运行，原因
- `npm run check:regression`: 通过 / 未运行，原因
- `npm run smoke`: 通过 / 未运行，原因

### 风险 / 注意事项
- ...

### 建议下一步
- ...

### 建议提交信息
`type: summary`

## 7. 数字伙伴项目特定边界

- 前端永远不出现真实 API Key。
- `.env.*` 不允许提交；`.env.example` 只允许 placeholder。
- 新角色默认使用 `manifest.json`，不得新增 `manifest + meta` 双轨条目。
- 业务层只请求标准动作槽位，不直接引用具体 FBX 文件名。
- 上传模型只允许 `.vrm / .glb / .gltf`，并保留现有基础校验。
- 新运行时代码不得引用 `archive/`。
