# Development Guide

## 启动

```bash
npm run dev
```

默认地址：

```text
http://localhost:3000
```

## 检查

```bash
npm run check
npm run check:js
npm run check:config
npm run check:assets
```

本地服务启动后可以运行：

```bash
npm run smoke
```

## 常见问题

### 页面没声音

默认 TTS 是浏览器本机语音。确认浏览器允许音频播放，并点击页面触发一次用户手势。

### OpenAI / MiniMax TTS 失败

前端不会保存 API Key。请用环境变量启动：

```bash
OPENAI_API_KEY=... MINIMAX_API_KEY=... npm run dev
```

失败时会自动回退浏览器语音。

### 角色列表缺少 Shiro/Wambo

运行：

```bash
npm run check:config
npm run check:assets
```

确认 `public/avatars/registry.json` 和对应 `meta.json` 路径正确。

### 动作不播放

先看 [ANIMATION_ARCHITECTURE.md](../ANIMATION_ARCHITECTURE.md) 的排查步骤。

### 上传角色失败

当前只支持：

```text
.vrm
.glb
.gltf
```

`.vrm/.glb` 必须是 GLB 容器，`.gltf` 必须是合法 JSON，并且当前只适合自包含资源。

## 后续接入 n8n / RAG

当前前端已有 `N8nClient` 和 `RagClient` 占位。正式接入时建议先建后端接口：

```text
POST /api/workflows/n8n
POST /api/rag/query
POST /api/rag/documents
```

不要在前端直接保存 n8n webhook 密钥或向量数据库密钥。
