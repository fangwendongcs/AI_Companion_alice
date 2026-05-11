# My Project

## 目录结构

- index.html
- css/style.css
- js/script.js
- assets/
- models/
  - characters/
  - objects/
  - environments/
  - animations/
- backend/
- public/avatars/
  - registry.json
  - alice/
  - osa_shiro/
  - osa_wambo/
  - {avatarId}/meta.json
  - {avatarId}/motions.json
  - {avatarId}/skeleton.mixamo.json

## 架构文档

- `docs/AVATAR_ARCHITECTURE.md`：可替换人物模型架构
- `docs/LOCAL_TTS.md`：本地免费 TTS 方案

## 本地运行

Three.js 通过网络请求加载模型与动画文件，请使用本地静态服务器运行：

```bash
npx serve .
```

或：

```bash
python -m http.server
```

如果需要使用 AI 对话、OpenAI TTS 或 MiniMax TTS，请通过后端代理启动，API Key 不再保存在浏览器中：

```bash
OPENAI_API_KEY=sk-... MINIMAX_API_KEY=... npm run dev
```

前端上传/替换人物模型也需要使用 `npm run dev`，因为它依赖后端 `POST /api/avatars` 写入 `public/avatars/{avatarId}`。

默认访问：

```text
http://localhost:3000
```
