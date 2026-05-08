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

默认访问：

```text
http://localhost:3000
```
