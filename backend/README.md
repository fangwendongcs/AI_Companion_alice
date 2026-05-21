# Backend

当前后端提供本地开发静态服务和模型代理接口，避免在浏览器中保存 API Key。

## 启动

```bash
npm run dev
```

默认前端 LLM provider 为 `stub`，本地演示不需要 API Key。真实 provider 仍通过后端环境变量配置，例如：

```bash
OPENAI_API_KEY=replace_with_your_key MINIMAX_API_KEY=replace_with_your_key npm run dev
```

Provider 配置状态可通过 `GET /api/providers` 查看。该接口只返回安全状态，例如 provider 是否 configured、是否需要 Key、默认 model 和 demo/real mode，不返回任何真实 Key 或 secret。

默认地址：

```text
http://localhost:3000
```

## 环境变量

- `PORT`：服务端口，默认 `3000`
- `OPENAI_API_KEY`：OpenAI Chat/TTS
- `MINIMAX_API_KEY`：MiniMax TTS
- `QWEN_API_KEY`：通义千问 OpenAI-compatible 接口
- `DEEPSEEK_API_KEY`：DeepSeek OpenAI-compatible 接口
- `CUSTOM_API_KEY`：自定义 OpenAI-compatible 接口
- `LLM_API_KEY`：通用兜底 Key
- `OPENAI_BASE_URL`：OpenAI 兼容代理地址
- `MINIMAX_BASE_URL`：MiniMax TTS 代理地址，未配置时使用 `https://api.minimax.io/v1`
- `QWEN_BASE_URL`：通义千问兼容接口地址，未配置时使用默认值
- `DEEPSEEK_BASE_URL`：DeepSeek 兼容接口地址，未配置时使用默认值
- `CUSTOM_BASE_URL`：自定义 OpenAI-compatible 接口地址
- `OPENAI_TTS_MODEL`：OpenAI TTS 模型，默认 `gpt-4o-mini-tts`
- `MINIMAX_TTS_MODEL`：MiniMax TTS 模型，默认 `speech-2.8-hd`
- `UPSTREAM_TIMEOUT_MS`：后端访问 LLM/TTS 上游的超时时间，默认 `45000`

## 接口

- `POST /api/chat`
- `POST /api/dialogue`：当前前端主对话入口，支持本地 `stub` 与 LLM-only 编排；Memory / RAG / Workflow 仍未启用
- `GET /api/providers`：安全读取 LLM provider 配置状态，不返回 secret
- `POST /api/tts`
- `GET /api/avatars`
- `POST /api/avatars`
- `GET /api/health`

## 角色上传限制

`POST /api/avatars` 当前面向本地开发使用，支持 `.vrm`、`.glb`、`.gltf`。后端会做基础校验：

- `.vrm/.glb` 必须是 GLB 容器，文件头为 `glTF`
- `.gltf` 必须是合法 JSON，并包含 `asset.version`
- 单次上传体积上限为 80MB

如果后续部署公网，需要在该接口前增加鉴权、来源限制和更严格的文件扫描。

## 部署安全

当前服务默认面向本地开发，不建议直接暴露公网。部署前请先完成：

- CORS 白名单
- 接口鉴权
- 上传限流和文件安全扫描
- 日志脱敏
- API Key 只保留在后端环境变量或密钥管理系统中

详细清单见 [docs/security/DEPLOYMENT_SECURITY.md](../docs/security/DEPLOYMENT_SECURITY.md)。
