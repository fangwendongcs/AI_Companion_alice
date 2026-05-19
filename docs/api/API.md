## Backend API

### POST /api/chat

浏览器只提交对话参数，API Key 和上游 Base URL 均由后端环境变量读取。

请求：

```json
{
  "message": "你好",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "systemPrompt": "你是 Alice..."
}
```

响应：

```json
{
  "reply": "你好呀！"
}
```

### POST /api/dialogue

未来统一对话编排入口，用于承载 Memory、RAG、n8n workflow 与 Agent orchestration。本阶段只建立后端边界，不接真实 RAG / n8n / 长期记忆，也不替换当前前端 `/api/chat` 主链路。

请求：

```json
{
  "message": "你好",
  "provider": "boundary",
  "model": "boundary",
  "systemPrompt": "你是 Alice...",
  "options": {
    "useMemory": false,
    "useRag": false,
    "useWorkflow": false
  }
}
```

当前响应：

```json
{
  "ok": true,
  "data": {
    "reply": "Dialogue backend boundary is ready. Real Memory, RAG, and workflow integrations are not configured in this phase.",
    "sources": [],
    "memory": {
      "used": false,
      "status": "disabled",
      "summary": "",
      "items": []
    },
    "rag": {
      "used": false,
      "status": "disabled",
      "passages": []
    },
    "workflow": {
      "used": false,
      "status": "disabled"
    },
    "meta": {
      "mode": "boundary_stub"
    }
  }
}
```

说明：

- `/api/dialogue` 当前是 `boundary_stub`，只用于固定后端扩展边界和自动化验收。
- 真实 LLM 对话仍由 `/api/chat` 承载。
- 真实 RAG、n8n、长期记忆不得直接放到前端。

### POST /api/tts

TTS 代理接口，支持 `openai` 与 `minimax`，返回音频二进制。

请求：

```json
{
  "text": "你好呀！",
  "provider": "minimax",
  "model": "speech-2.8-hd",
  "voice": "Chinese (Mandarin)_Crisp_Girl",
  "speed": 1.05,
  "pitch": 1.2
}
```

OpenAI 请求可额外传入 `instructions`，后端会使用 `gpt-4o-mini-tts` 作为默认模型。

### GET /api/health

健康检查。

### GET /api/avatars

读取当前可用角色注册表。

响应：

```json
{
  "defaultAvatarId": "alice",
  "avatars": [
    {
      "id": "alice",
      "name": "Alice",
      "manifest": "public/avatars/alice/manifest.json"
    },
    {
      "id": "osa_shiro",
      "name": "Shiro（CC0 动漫风）",
      "manifest": "public/avatars/osa_shiro/manifest.json"
    },
    {
      "id": "osa_wambo",
      "name": "Wambo（CC0 风格化）",
      "manifest": "public/avatars/osa_wambo/manifest.json"
    }
  ]
}
```

### POST /api/avatars

上传或替换人物模型。该接口必须使用后端服务 `npm run dev`，Python 静态服务不支持。

请求类型：`multipart/form-data`

字段：

- `model`：必填，`.vrm` / `.glb` / `.gltf`
- `avatarId`：可选，只允许字母、数字、`_`、`-`，不填时后端会自动生成
- `name`：可选，角色显示名称
- `targetHeight`：可选，默认 `120`
- `motions`：可选，`motions.json`
- `skeleton`：可选，`skeleton.mixamo.json`
- `llmProvider` / `llmModel` / `ttsEngine`：可选，仅写入角色 manifest 的接口关联信息，不修改 API Key

上传成功后，后端会写入：

```text
public/avatars/{avatarId}/model.{vrm|glb|gltf}
public/avatars/{avatarId}/manifest.json
public/avatars/{avatarId}/motions.json
public/avatars/{avatarId}/skeleton.mixamo.json
```
